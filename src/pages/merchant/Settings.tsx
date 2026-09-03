import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { merchantApi } from "@/lib/api/merchant";
import { useQuery } from "@tanstack/react-query";
import { Upload, X, RefreshCw, AlertCircle, CheckCircle2, Bell, Volume2, ShieldAlert, Smartphone, Trash2, Send } from "lucide-react";
import {
  canMerchantManageSettings,
  canMerchantManageGlobalPushPolicy,
  canMerchantManageStoreDevices,
  isMerchantStaff,
} from "@/lib/merchant-role-authority";
import {
  subscribeMerchantPush,
  getPwaInstallInstructions,
  setMerchantSoundEnabledLocally,
  getOrCreateMerchantDeviceId,
} from "@/lib/merchant-push";

interface SettingsFormState {
  contact_phone: string;
  whatsapp_phone: string;
  support_email: string;
  city: string;
  address: string;
  delivery_notes: string;
  logo_url: string;
  push_enabled: boolean;
  sound_enabled: boolean;
  sound_repeat_interval_seconds: number;
  sound_max_duration_seconds: number;
}

const EMPTY_SETTINGS_FORM: SettingsFormState = {
  contact_phone: "",
  whatsapp_phone: "",
  support_email: "",
  city: "",
  address: "",
  delivery_notes: "",
  logo_url: "",
  push_enabled: true,
  sound_enabled: true,
  sound_repeat_interval_seconds: 15,
  sound_max_duration_seconds: 300,
};

type PushDevice = {
  id: string;
  device_label: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  is_own: boolean;
};

const MerchantSettings = () => {
  const { data: rawMembership, isLoading } = useCurrentMerchant();
  const membership = rawMembership as any;
  const merchantId = membership?.merchant_id ?? null;
  const role = membership?.role ?? null;

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl p-4 animate-pulse" data-testid="merchant-settings-loading">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!merchantId) {
    return (
      <div className="p-6 text-muted-foreground" data-testid="merchant-settings-unattached">
        لا يوجد متجر مرتبط بحسابك حالياً.
      </div>
    );
  }

  return (
    <MerchantSettingsWorkspace
      key={merchantId}
      merchantId={merchantId}
      role={role}
      storeName={(membership?.merchants as any)?.display_name ?? "متجر"}
      storeStatus={(membership?.merchants as any)?.status ?? "غير معروف"}
    />
  );
};

interface WorkspaceProps {
  merchantId: string;
  role: string | null;
  storeName: string;
  storeStatus: string;
}

export function MerchantSettingsWorkspace({ merchantId, role, storeName, storeStatus }: WorkspaceProps) {
  const isMountedRef = useRef(true);
  const liveMerchantIdRef = useRef(merchantId);
  const generationRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    liveMerchantIdRef.current = merchantId;
    return () => {
      isMountedRef.current = false;
      generationRef.current += 1;
    };
  }, [merchantId]);

  const canManage = canMerchantManageSettings(role);
  const canManagePushPolicy = canMerchantManageGlobalPushPolicy(role);
  const canManageDevices = canMerchantManageStoreDevices(role);
  const isStaff = isMerchantStaff(role);

  // Settings State
  const [form, setForm] = useState<SettingsFormState>(EMPTY_SETTINGS_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<"loading" | "error" | "loaded">("loading");
  const [settingsErrorMessage, setSettingsErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Push Devices State
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [pushScope, setPushScope] = useState<"store" | "own">("store");
  const [deviceActionBusy, setDeviceActionBusy] = useState<string | null>(null);

  const [localDeviceId] = useState<string>(() => getOrCreateMerchantDeviceId());

  // Readiness query with fail-closed contract check
  const {
    data: readiness,
    isLoading: readinessLoading,
    isError: readinessError,
    refetch: refetchReadiness,
  } = useQuery({
    queryKey: ["merchant-readiness", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const res = await apiClient.getMerchantReadiness(merchantId);
      if (!res || res.merchant_id !== merchantId) {
        throw new Error("Readiness response merchant_id mismatch");
      }
      return res;
    },
    retry: false,
  });

  // Load Settings Function
  const loadSettings = useCallback(
    async (isManualRetry = false) => {
      const currentGen = generationRef.current;
      const targetMerchantId = merchantId;

      if (!isManualRetry && isDirty) {
        // Background refetch must NOT erase unsaved user edits!
        return;
      }

      setSettingsStatus("loading");
      setSettingsErrorMessage(null);

      try {
        const res = await merchantApi.getMerchantSettings(targetMerchantId);

        if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
          return;
        }

        // Canonical contract verification: merchant_id MUST match targetMerchantId
        if (!res || typeof res !== "object" || res.merchant_id !== targetMerchantId) {
          throw new Error("Settings contract response mismatch or malformed payload.");
        }

        if (res.settings_exists && res.settings) {
          setForm({
            contact_phone: res.settings.contact_phone ?? "",
            whatsapp_phone: res.settings.whatsapp_phone ?? "",
            support_email: res.settings.support_email ?? "",
            city: res.settings.city ?? "",
            address: res.settings.address ?? "",
            delivery_notes: res.settings.delivery_notes ?? "",
            logo_url: res.settings.logo_url ?? "",
            push_enabled: res.settings.push_enabled !== false,
            sound_enabled: res.settings.sound_enabled !== false,
            sound_repeat_interval_seconds: res.settings.sound_repeat_interval_seconds ?? 15,
            sound_max_duration_seconds: res.settings.sound_max_duration_seconds ?? 300,
          });
        } else {
          // Valid state: store has no settings row yet
          setForm(EMPTY_SETTINGS_FORM);
        }

        setIsDirty(false);
        setSettingsStatus("loaded");
      } catch (err: any) {
        if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
          return;
        }
        setSettingsStatus("error");
        setSettingsErrorMessage(err?.message ? `تعذر تحميل إعدادات المتجر: ${err.message}` : "تعذر تحميل إعدادات المتجر");
        if (isManualRetry) {
          toast.error("تعذر تحميل إعدادات المتجر");
        }
      }
    },
    [merchantId, isDirty],
  );

  // Load Devices Function
  const loadDevices = useCallback(
    async (isManualRetry = false) => {
      const currentGen = generationRef.current;
      const targetMerchantId = merchantId;

      setDevicesLoading(true);
      setDevicesError(null);

      try {
        const res = await merchantApi.listPushSubscriptions(targetMerchantId);

        if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
          return;
        }

        if (!res || typeof res !== "object" || res.merchant_id !== targetMerchantId || !Array.isArray(res.devices)) {
          throw new Error("Push devices contract response mismatch or malformed payload.");
        }

        setPushScope(res.scope);
        setDevices(res.devices.filter((d) => d.status === "active"));
        setDevicesLoading(false);
      } catch (err: any) {
        if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
          return;
        }
        setDevicesLoading(false);
        setDevicesError(err?.message || "تعذر تحميل قائمة الأجهزة");
        if (isManualRetry) {
          toast.error("تعذر تحميل قائمة الأجهزة");
        }
      }
    },
    [merchantId],
  );

  // Mount effect
  useEffect(() => {
    void loadSettings();
    void loadDevices();
  }, [loadSettings, loadDevices]);

  // Handle Save
  const handleSave = async () => {
    if (!canManage) {
      toast.error("ليس لديك صلاحية تعديل إعدادات المتجر");
      return;
    }

    const currentGen = generationRef.current;
    const targetMerchantId = merchantId;

    setSaving(true);
    try {
      const res = await merchantApi.patchMerchantSettings(targetMerchantId, {
        contact_phone: form.contact_phone.trim() || undefined,
        whatsapp_phone: form.whatsapp_phone.trim() || undefined,
        support_email: form.support_email.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        delivery_notes: form.delivery_notes.trim() || undefined,
        logo_url: form.logo_url,
        push_enabled: form.push_enabled,
        sound_enabled: form.sound_enabled,
        sound_repeat_interval_seconds: form.sound_repeat_interval_seconds,
        sound_max_duration_seconds: form.sound_max_duration_seconds,
      });

      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }

      if (!res || res.merchant_id !== targetMerchantId) {
        throw new Error("Saved settings response mismatch");
      }

      setIsDirty(false);
      toast.success("تم حفظ إعدادات المتجر بنجاح");
      void refetchReadiness();
    } catch (e: any) {
      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }
      toast.error(e?.message || "تعذّر حفظ الإعدادات");
    } finally {
      if (isMountedRef.current && liveMerchantIdRef.current === targetMerchantId && generationRef.current === currentGen) {
        setSaving(false);
      }
    }
  };

  // Handle Logo Upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage) {
      toast.error("ليس لديك صلاحية تغيير شعار المتجر");
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("يجب اختيار ملف صورة صالح");
      e.target.value = "";
      return;
    }

    const currentGen = generationRef.current;
    const targetMerchantId = merchantId;

    setUploadingLogo(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== "string") return reject(new Error("Failed to read image"));
          const payload = result.split(",")[1];
          if (!payload) return reject(new Error("Invalid image payload"));
          resolve(payload);
        };
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
        reader.readAsDataURL(file);
      });

      const uploaded = await apiClient.uploadProductImage({
        file_name: file.name,
        content_type: file.type || "image/jpeg",
        base64_data: base64Data,
        merchant_id: targetMerchantId,
      });

      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }

      setForm((p) => ({ ...p, logo_url: uploaded.public_url }));
      setIsDirty(true);
      toast.success("تم رفع الشعار. اضغط «حفظ الإعدادات» لتثبيته في المتجر");
    } catch (err: any) {
      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }
      toast.error(err?.message || "تعذر رفع اللوجو");
    } finally {
      if (isMountedRef.current && liveMerchantIdRef.current === targetMerchantId && generationRef.current === currentGen) {
        setUploadingLogo(false);
        e.target.value = "";
      }
    }
  };

  // Enable Push For This Device
  const handleEnablePushForThisDevice = async () => {
    const currentGen = generationRef.current;
    const targetMerchantId = merchantId;

    setDeviceActionBusy("register");
    try {
      const { publicKey } = await merchantApi.getPushVapidPublicKey();

      const result = await subscribeMerchantPush({
        vapidPublicKey: publicKey,
        merchantId: targetMerchantId,
        register: async (body) => {
          return merchantApi.registerPushSubscription({
            merchant_id: targetMerchantId,
            endpoint: body.endpoint,
            keys: body.keys,
            device_label: body.device_label,
            user_agent: body.user_agent,
          });
        },
      });

      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }

      if (!result.ok) {
        toast.error(result.error || "تعذر تفعيل الإشعارات");
        return;
      }

      setMerchantSoundEnabledLocally(true);

      // Only owner/manager can update store-wide push policy if needed
      if (canManagePushPolicy && (!form.push_enabled || !form.sound_enabled)) {
        await merchantApi.patchMerchantSettings(targetMerchantId, {
          push_enabled: true,
          sound_enabled: true,
        });
        setForm((p) => ({ ...p, push_enabled: true, sound_enabled: true }));
      }

      await loadDevices();
      toast.success("تم تفعيل إشعارات الطلبات على هذا الجهاز بنجاح");
      toast.message(getPwaInstallInstructions());
    } catch (e: any) {
      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }
      toast.error(e?.message || "تعذر تفعيل الإشعارات على هذا الجهاز");
    } finally {
      if (isMountedRef.current && liveMerchantIdRef.current === targetMerchantId && generationRef.current === currentGen) {
        setDeviceActionBusy(null);
      }
    }
  };

  // Send Test Notification
  const handleSendTest = async (subscriptionId?: string) => {
    const currentGen = generationRef.current;
    const targetMerchantId = merchantId;

    setDeviceActionBusy(`test-${subscriptionId || "all"}`);
    try {
      const res = await merchantApi.testPushSubscription(targetMerchantId, subscriptionId);

      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }

      if (res.results.some((r) => r.ok)) {
        toast.success(
          subscriptionId
            ? "تم إرسال الإشعار التجريبي للجهاز المحدد"
            : isStaff
              ? "تم إرسال الإشعار التجريبي لجهازك"
              : "تم إرسال الاختبار لجميع الأجهزة النشطة",
        );
      } else {
        toast.error("فشل إرسال الإشعار التجريبي");
      }
    } catch (e: any) {
      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }
      toast.error(e?.message || "فشل إرسال الإشعار التجريبي");
    } finally {
      if (isMountedRef.current && liveMerchantIdRef.current === targetMerchantId && generationRef.current === currentGen) {
        setDeviceActionBusy(null);
      }
    }
  };

  // Delete Subscription
  const handleDeleteDevice = async (subscriptionId: string) => {
    const currentGen = generationRef.current;
    const targetMerchantId = merchantId;

    setDeviceActionBusy(`delete-${subscriptionId}`);
    try {
      const res = await merchantApi.deletePushSubscription(targetMerchantId, subscriptionId);

      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }

      if (res.success) {
        toast.success("تم إزالة الجهاز بنجاح");
        await loadDevices();
      }
    } catch (e: any) {
      if (!isMountedRef.current || liveMerchantIdRef.current !== targetMerchantId || generationRef.current !== currentGen) {
        return;
      }
      toast.error(e?.message || "تعذر إزالة الجهاز");
    } finally {
      if (isMountedRef.current && liveMerchantIdRef.current === targetMerchantId && generationRef.current === currentGen) {
        setDeviceActionBusy(null);
      }
    }
  };

  const isCurrentDeviceRegistered = Boolean(
    localDeviceId && devices.some((d) => d.device_label === localDeviceId),
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header with store info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold">إعدادات المتجر</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة بيانات المتجر، سياسات الإشعارات، والأجهزة المسجلة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {storeName}
          </Badge>
          <Badge
            variant={storeStatus === "active" ? "default" : "destructive"}
            className="text-xs"
          >
            {storeStatus === "active" ? "نشط" : storeStatus}
          </Badge>
          {isStaff && (
            <Badge variant="secondary" className="text-xs">
              موظف (معاينة)
            </Badge>
          )}
        </div>
      </div>

      {/* Staff Read-only Notice */}
      {isStaff && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">صلاحية موظف متجر (Staff View)</p>
            <p className="text-amber-900/90 text-xs mt-0.5">
              يمكنك معاينة بيانات المتجر، وإدارة إشعارات جهازك الشخصي فقط. تعديل بيانات المتجر والسياسة العامة محصور بالمالك والمدير.
            </p>
          </div>
        </div>
      )}

      {/* Readiness Card */}
      <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="font-semibold">جاهزية المتجر</p>
            {readinessLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
          {readinessLoading ? (
            <span className="text-xs text-muted-foreground">جاري التحقق...</span>
          ) : readinessError ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-destructive h-7 px-2"
              onClick={() => void refetchReadiness()}
            >
              <RefreshCw className="w-3 h-3 ml-1" />
              تعذر التحميل، إعادة المحاولة
            </Button>
          ) : (
            <Badge
              variant={readiness?.is_ready ? "default" : "secondary"}
              className={readiness?.is_ready ? "bg-emerald-600 text-white" : "text-amber-700"}
            >
              {readiness?.is_ready ? "جاهز للعمل" : "غير مكتمل"}
            </Badge>
          )}
        </div>

        {readinessLoading ? (
          <div className="h-2 rounded-full bg-muted overflow-hidden animate-pulse" />
        ) : readinessError ? (
          <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
            <AlertCircle className="w-4 h-4" />
            تعذر تحميل مؤشر الجاهزية لهذا المتجر حالياً.
          </div>
        ) : (
          <>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, readiness?.score ?? 0))}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              نسبة الجاهزية {readiness?.score}% — مكتمل {readiness?.passed_checks} من {readiness?.total_checks} متطلبات
            </p>
          </>
        )}
      </div>

      {/* Main Settings Form Card */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-semibold text-lg">بيانات التواصل والمتجر</h3>
          {isDirty && canManage && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">
              تعديلات غير محفوظة
            </Badge>
          )}
        </div>

        {settingsStatus === "loading" ? (
          <div className="space-y-4 animate-pulse py-4">
            <div className="h-10 bg-muted rounded-md" />
            <div className="h-10 bg-muted rounded-md" />
            <div className="h-10 bg-muted rounded-md" />
          </div>
        ) : settingsStatus === "error" ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{settingsErrorMessage || "تعذر تحميل إعدادات المتجر"}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadSettings(true)}>
              <RefreshCw className="w-3.5 h-3.5 ml-1.5" />
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <>
            {/* Logo Section */}
            {canManage && (
              <div className="space-y-2">
                <Label>شعار المتجر (Logo)</Label>
                <div className="flex items-center gap-3">
                  {form.logo_url ? (
                    <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border">
                      <img src={form.logo_url} alt="Store logo" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-white hover:bg-destructive/90"
                        onClick={() => {
                          setForm((p) => ({ ...p, logo_url: "" }));
                          setIsDirty(true);
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                      بدون لوجو
                    </div>
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                    {uploadingLogo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload size={14} />}
                    {uploadingLogo ? "جاري الرفع..." : "رفع لوجو جديد"}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      disabled={uploadingLogo || saving || !canManage}
                      onChange={handleLogoUpload}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  رفع الشعار يجهّز الصورة، ويتم حفظها نهائياً بالمتجر عند الضغط على «حفظ الإعدادات».
                </p>
              </div>
            )}

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_phone">هاتف التواصل</Label>
                <Input
                  id="contact_phone"
                  value={form.contact_phone}
                  disabled={!canManage || saving}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, contact_phone: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder="مثال: 07701234567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp_phone">واتساب</Label>
                <Input
                  id="whatsapp_phone"
                  value={form.whatsapp_phone}
                  disabled={!canManage || saving}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, whatsapp_phone: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder="مثال: 07701234567"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="support_email">البريد الإلكتروني للدعم</Label>
              <Input
                id="support_email"
                type="email"
                value={form.support_email}
                disabled={!canManage || saving}
                onChange={(e) => {
                  setForm((p) => ({ ...p, support_email: e.target.value }));
                  setIsDirty(true);
                }}
                placeholder="support@example.com"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">المدينة</Label>
                <Input
                  id="city"
                  value={form.city}
                  disabled={!canManage || saving}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, city: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder="بغداد، البصرة، ..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">العنوان التفصيلي</Label>
                <Input
                  id="address"
                  value={form.address}
                  disabled={!canManage || saving}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, address: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder="المنطقة، الشارع، النقطة الدالة"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery_notes">ملاحظات التوصيل</Label>
              <Input
                id="delivery_notes"
                value={form.delivery_notes}
                disabled={!canManage || saving}
                onChange={(e) => {
                  setForm((p) => ({ ...p, delivery_notes: e.target.value }));
                  setIsDirty(true);
                }}
                placeholder="تعليمات أو شروط خاصة بالتسليم"
              />
            </div>

            {/* Global Push & Sound Toggles (Owner/Manager Only) */}
            {canManagePushPolicy && (
              <div className="pt-2 border-t space-y-3">
                <p className="text-sm font-semibold">سياسة التنبيهات والصوت العامة للمتجر</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.push_enabled}
                      disabled={saving}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, push_enabled: e.target.checked }));
                        setIsDirty(true);
                      }}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>تفعيل إشعارات الويب لجميع أجهزة المتجر</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.sound_enabled}
                      disabled={saving}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, sound_enabled: e.target.checked }));
                        setIsDirty(true);
                      }}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>تفعيل النغمة الصوتية للطلبات الجديدة</span>
                  </label>
                </div>
              </div>
            )}

            {canManage && (
              <Button
                onClick={handleSave}
                disabled={saving || uploadingLogo || settingsStatus !== "loaded"}
                className="mt-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 ml-2 animate-spin" />
                    جاري الحفظ...
                  </>
                ) : (
                  "حفظ الإعدادات"
                )}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Push Devices Card */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              تنبيهات الطلبات وأجهزة الـ Push
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isStaff
                ? "إدارة إشعار هذا الجهاز لضمان وصول التنبيهات الفورية عند ورود طلب جديد"
                : "إدارة إشعارات الأجهزة المصرح لها باستلام تنبيهات الطلبات الجديدة للمتجر"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadDevices(true)}
            disabled={devicesLoading}
            className="h-8 px-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${devicesLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Device Status Badges */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 flex items-center gap-1 ${form.push_enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
            <Bell className="w-3 h-3" />
            سياسة المتجر: {form.push_enabled ? "مفعّلة" : "معطّلة"}
          </span>
          <span className={`rounded-full px-2.5 py-1 flex items-center gap-1 ${isCurrentDeviceRegistered ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            <Smartphone className="w-3 h-3" />
            هذا الجهاز: {isCurrentDeviceRegistered ? "مسجل ونشط" : "غير مسجل"}
          </span>
          <span className={`rounded-full px-2.5 py-1 flex items-center gap-1 ${form.sound_enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
            <Volume2 className="w-3 h-3" />
            الصوت: {form.sound_enabled ? "مفعّل" : "معطّل"}
          </span>
          <span className="rounded-full px-2.5 py-1 bg-muted text-muted-foreground">
            {pushScope === "own" ? "أجهزتي المسجلة:" : "الأجهزة الفعالة بالمتجر:"} {devicesLoading ? "..." : devices.length}
          </span>
        </div>

        {/* Register CTA Banner */}
        {!isCurrentDeviceRegistered && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="font-semibold">هذا الجهاز غير مسجل لتلقي التنبيهات الفورية</p>
              <p className="text-amber-900/80 mt-0.5">
                فعّل الإشعارات لتصلك نغمة وتنبيه فوري عند وصول أي طلب جديد حتى لو كان المتصفح في الخلفية.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleEnablePushForThisDevice}
              disabled={deviceActionBusy === "register" || devicesLoading}
              className="shrink-0"
            >
              {deviceActionBusy === "register" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 ml-1.5 animate-spin" />
                  جاري التفعيل...
                </>
              ) : (
                "تفعيل إشعارات هذا الجهاز"
              )}
            </Button>
          </div>
        )}

        {/* Devices List Table/List */}
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {isStaff ? "أجهزتي المسجلة" : "الأجهزة المسجلة بالمتجر"}
          </p>

          {devicesLoading ? (
            <div className="h-20 rounded-lg bg-muted animate-pulse" />
          ) : devicesError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-center justify-between">
              <span>{devicesError}</span>
              <Button variant="ghost" size="sm" onClick={() => void loadDevices(true)}>
                إعادة المحاولة
              </Button>
            </div>
          ) : devices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              لا توجد أجهزة مسجلة حالياً.
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => {
                const isThis = localDeviceId && device.device_label === localDeviceId;
                return (
                  <div
                    key={device.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-border bg-card/60 text-xs gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {isThis ? "هذا الجهاز الحالي" : device.device_label ? `جهاز (${device.device_label.slice(0, 8)})` : "جهاز مسجل"}
                        </span>
                        {isThis && (
                          <Badge variant="default" className="text-[10px] h-4 px-1 bg-emerald-600">
                            جهازي
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] h-4 px-1 text-emerald-700">
                          نشط
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate max-w-sm">
                        {device.user_agent || "متصفح ويب"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        disabled={deviceActionBusy === `test-${device.id}`}
                        onClick={() => handleSendTest(device.id)}
                      >
                        {deviceActionBusy === `test-${device.id}` ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Send className="w-3 h-3 ml-1" />
                            اختبار
                          </>
                        )}
                      </Button>

                      {(canManageDevices || device.is_own) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={deviceActionBusy === `delete-${device.id}`}
                          onClick={() => handleDeleteDevice(device.id)}
                        >
                          {deviceActionBusy === `delete-${device.id}` ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Store-wide Test Button for Owners */}
        {canManage && (
          <div className="pt-2 border-t flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={devices.length === 0 || deviceActionBusy !== null}
              onClick={() => handleSendTest()}
            >
              {deviceActionBusy === "test-all" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 ml-1.5 animate-spin" />
                  جاري إرسال الاختبار...
                </>
              ) : (
                "إرسال اختبار إلى جميع الأجهزة المسجلة"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default MerchantSettings;
