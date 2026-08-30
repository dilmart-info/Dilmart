import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";

const EMPTY_SETTINGS_FORM = {
  contact_phone: "",
  whatsapp_phone: "",
  support_email: "",
  city: "",
  address: "",
  delivery_notes: "",
  logo_url: "",
};

const MerchantSettings = () => {
  const { data: rawMembership } = useCurrentMerchant();
  const membership = rawMembership as any;
  const merchantId = membership?.merchant_id ?? null;
  const [loading, setLoading] = useState(false);
  /** True while the SELECTED merchant's settings are being fetched — saving is blocked until then. */
  const [settingsLoading, setSettingsLoading] = useState(false);
  /** A failed GET is NOT an empty store: saving stays blocked so a blank form cannot overwrite real settings. */
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [form, setForm] = useState(EMPTY_SETTINGS_FORM);
  /** Always the currently selected merchant — lets async handlers detect a store switch mid-flight. */
  const merchantIdRef = useRef(merchantId);
  useEffect(() => {
    merchantIdRef.current = merchantId;
  }, [merchantId]);

  const { data: readiness, refetch: refetchReadiness } = useQuery({
    queryKey: ["merchant-readiness", merchantId],
    enabled: !!merchantId,
    queryFn: () => apiClient.getMerchantReadiness(merchantId!),
  });

  useEffect(() => {
    // Store switch safety, both directions:
    //  - the previous merchant's values are cleared IMMEDIATELY, and saving stays disabled until
    //    the new merchant's settings arrive, so a quick save can never write merchant A's fields
    //    under merchant B;
    //  - a response for the previous merchant is discarded instead of populating the new form.
    let cancelled = false;
    setForm(EMPTY_SETTINGS_FORM);
    setSettingsLoadFailed(false);
    if (!merchantId) {
      setSettingsLoading(false);
      return;
    }
    setSettingsLoading(true);
    const load = async () => {
      let data: Awaited<ReturnType<typeof apiClient.getMerchantSettings>> | null = null;
      let failed = false;
      try {
        data = await apiClient.getMerchantSettings(merchantId);
      } catch {
        // A network/authorization failure is not "this store has no settings" — keep saving
        // blocked so a blank form can never overwrite the store's real settings.
        failed = true;
      }
      if (cancelled) return;
      setSettingsLoading(false);
      setSettingsLoadFailed(failed);
      if (failed) {
        toast.error("تعذّر تحميل إعدادات المتجر");
        return;
      }
      if (data) {
        setForm({
          contact_phone: (data.contact_phone as string) ?? "",
          whatsapp_phone: (data.whatsapp_phone as string) ?? "",
          support_email: (data.support_email as string) ?? "",
          city: (data.city as string) ?? "",
          address: (data.address as string) ?? "",
          delivery_notes: (data.delivery_notes as string) ?? "",
          logo_url: (data.logo_url as string) ?? "",
        });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  const handleSave = async () => {
    if (!merchantId) return;
    setLoading(true);
    try {
      await apiClient.upsertMerchantSettings({
        merchant_id: merchantId,
        ...form,
      });
      await refetchReadiness();
      toast.success("تم حفظ إعدادات المتجر");
    } catch (e) {
      console.error(e);
      toast.error("تعذّر حفظ الإعدادات");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-2xl font-bold">إعدادات المتجر</h2>
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="font-medium">{(membership?.merchants as any)?.display_name ?? "متجر"}</p>
        <p className="text-muted-foreground mt-1">الحالة: {(membership?.merchants as any)?.status ?? "غير معروف"}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-medium">جاهزية المتجر</p>
          <p className={readiness?.is_ready ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
            {readiness?.is_ready ? "جاهز" : "غير مكتمل"}
          </p>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${readiness?.score ?? 0}%` }} />
        </div>
        <p className="text-muted-foreground">
          {(readiness?.score ?? 0)}% — مكتمل {(readiness?.passed_checks ?? 0)} من {(readiness?.total_checks ?? 0)}
        </p>
      </div>
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="space-y-2">
          <Label>لوجو المتجر</Label>
          <div className="flex items-center gap-3">
            {form.logo_url ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border">
                <img src={form.logo_url} alt="Store logo" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-white"
                  onClick={() => setForm((p) => ({ ...p, logo_url: "" }))}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                بدون لوجو
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50">
              <Upload size={14} />
              رفع لوجو
              <input
                type="file"
                className="hidden"
                accept="image/*"
                disabled={loading || settingsLoading || !merchantId}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // The store this upload belongs to; compared against the live selection below.
                  const uploadMerchantId = merchantId;
                  try {
                    setLoading(true);
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
                      merchant_id: uploadMerchantId ?? undefined,
                    });
                    // The active store may have changed while the upload was in flight — this
                    // logo belongs to `uploadMerchantId` and must not land in another store's form.
                    if (merchantIdRef.current !== uploadMerchantId) return;
                    setForm((p) => ({ ...p, logo_url: uploaded.public_url }));
                    toast.success("تم رفع اللوجو");
                  } catch (err: any) {
                    toast.error(err?.message || "تعذر رفع اللوجو");
                  } finally {
                    setLoading(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <Label>هاتف التواصل</Label>
          <Input value={form.contact_phone} onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>واتساب</Label>
          <Input value={form.whatsapp_phone} onChange={(e) => setForm((p) => ({ ...p, whatsapp_phone: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>البريد الإلكتروني للدعم</Label>
          <Input value={form.support_email} onChange={(e) => setForm((p) => ({ ...p, support_email: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>المدينة</Label>
          <Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>العنوان</Label>
          <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>ملاحظات التوصيل</Label>
          <Input value={form.delivery_notes} onChange={(e) => setForm((p) => ({ ...p, delivery_notes: e.target.value }))} />
        </div>
        <Button onClick={handleSave} disabled={loading || settingsLoading || settingsLoadFailed || !merchantId}>
          {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </Button>
      </div>

      <MerchantPushAlertsSettings merchantId={merchantId} />
    </div>
  );
};

function MerchantPushAlertsSettings({ merchantId }: { merchantId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; device_label: string | null; status: string; created_at: string }>>([]);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [soundEnabledSetting, setSoundEnabledSetting] = useState(true);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("DilMart_merchant_push_device_id");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!merchantId) return;
    void (async () => {
      try {
        const settings = await apiClient.getMerchantSettings(merchantId);
        if (settings) {
          setPushEnabled(settings.push_enabled !== false);
          setSoundEnabledSetting(settings.sound_enabled !== false);
        }
        const { merchantApi } = await import("@/lib/api/merchant");
        const list = await merchantApi.listPushSubscriptions(merchantId);
        setDevices(list.filter((d) => d.status === "active"));
      } catch {
        // ignore
      }
    })();
  }, [merchantId]);

  const activeCount = devices.length;
  const thisDeviceRegistered = Boolean(
    localDeviceId && devices.some((d) => d.device_label === localDeviceId),
  );

  const enablePush = async () => {
    if (!merchantId) return;
    setBusy(true);
    try {
      const { merchantApi } = await import("@/lib/api/merchant");
      const { subscribeMerchantPush, getPwaInstallInstructions, setMerchantSoundEnabledLocally, getOrCreateMerchantDeviceId } = await import("@/lib/merchant-push");
      const deviceId = getOrCreateMerchantDeviceId();
      setLocalDeviceId(deviceId);
      const { publicKey } = await merchantApi.getPushVapidPublicKey();
      const result = await subscribeMerchantPush({
        vapidPublicKey: publicKey,
        merchantId,
        register: (body) => merchantApi.registerPushSubscription(body),
      });
      if (!result.ok) {
        toast.error(result.error || "تعذر تفعيل الإشعارات");
        return;
      }
      await apiClient.upsertMerchantSettings({
        merchant_id: merchantId,
        push_enabled: true,
        sound_enabled: true,
      });
      setMerchantSoundEnabledLocally(true);
      setPushEnabled(true);
      setSoundEnabledSetting(true);
      const list = await merchantApi.listPushSubscriptions(merchantId);
      setDevices(list.filter((d) => d.status === "active"));
      toast.success("تم تفعيل إشعارات الطلبات على هذا الجهاز");
      toast.message(getPwaInstallInstructions());
    } catch (e: any) {
      toast.error(e?.message || "تعذر تفعيل الإشعارات (تحقق من إعدادات الخادم VAPID)");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!merchantId) return;
    setBusy(true);
    try {
      const { merchantApi } = await import("@/lib/api/merchant");
      const res = await merchantApi.testPushSubscription(merchantId);
      if (res.success) toast.success("تم إرسال الاختبار إلى جميع الأجهزة المسجلة");
      else toast.error("فشل إرسال الإشعار التجريبي");
    } catch (e: any) {
      toast.error(e?.message || "فشل الاختبار");
    } finally {
      setBusy(false);
    }
  };

  if (!merchantId) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">تنبيهات الطلبات الجديدة</h3>
        <p className="text-sm text-muted-foreground mt-1">
          فعّل الإشعارات على هاتفك حتى يصلك تنبيه عند وصول طلب جديد حتى لو كانت اللوحة مغلقة.
        </p>
      </div>
      <div className="text-xs text-muted-foreground rounded-lg border border-dashed border-border p-3 space-y-1">
        <p className="font-medium text-foreground">تثبيت اللوحة على الشاشة الرئيسية</p>
        <p>على أندرويد/الكمبيوتر: من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>
        <p>على آيفون: Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className={`rounded-full px-2 py-1 ${pushEnabled ? "bg-emerald-100 text-emerald-800" : "bg-muted"}`}>
          سياسة Push للتاجر: {pushEnabled ? "مفعّلة" : "معطّلة"}
        </span>
        <span className={`rounded-full px-2 py-1 ${thisDeviceRegistered ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          هذا الجهاز: {thisDeviceRegistered ? "مسجل" : "غير مسجل"}
        </span>
        <span className="rounded-full px-2 py-1 bg-muted">الأجهزة الفعالة: {activeCount}</span>
        <span className={`rounded-full px-2 py-1 ${soundEnabledSetting ? "bg-emerald-100 text-emerald-800" : "bg-muted"}`}>
          صوت المتجر: {soundEnabledSetting ? "مفعّل" : "معطّل"}
        </span>
      </div>
      {!thisDeviceRegistered && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          الإشعارات جاهزة للتفعيل على هذا الجهاز
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={enablePush} disabled={busy}>
          تفعيل إشعارات هذا الجهاز
        </Button>
        <Button type="button" variant="outline" onClick={sendTest} disabled={busy || activeCount === 0}>
          إرسال اختبار إلى جميع الأجهزة المسجلة
        </Button>
      </div>
    </div>
  );
}

export default MerchantSettings;
