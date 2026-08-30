import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { UpdateMerchantRegistrationDetailsPayload } from "@/lib/api/admin-core";
import { ENABLE_LOCAL_FALLBACKS } from "@/lib/runtime-flags";
import type { MerchantStatus } from "@/lib/auth-context-contract";
import {
  assignMerchantCommercialPolicyProfile,
  listCommercialPolicyProfiles,
  resolveMerchantCommercialPolicyProfile,
} from "@/lib/commercial-policy-profiles";

/** Shared between every path that calls updateMerchantStatus, so a new guard error code (like
 *  COMMERCIAL_AGREEMENT_REQUIRED) only ever needs to be mapped to a toast in one place. */
const activationErrorToast = (e: unknown): string => {
  const message = e instanceof Error ? e.message : "";
  if (message.includes("COMMERCIAL_AGREEMENT_REQUIRED")) return "لا يمكن التفعيل بدون اتفاق تجاري صريح لهذا التاجر";
  if (message.includes("MERCHANT_NOT_READY")) return "لا يمكن التفعيل قبل استكمال الجاهزية";
  if (message.includes("MERCHANT_STATUS_CONFLICT")) return "تغيّرت حالة التاجر أثناء الحفظ. يرجى التحقق والمحاولة مجددًا";
  return "تعذر تفعيل التاجر";
};

const AdminMerchantDetail = () => {
  const { id } = useParams();
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [form, setForm] = useState<{ display_name: string; status: MerchantStatus }>({
    display_name: "",
    status: "draft",
  });

  // Jenni provisioning state
  const [jenniLinkId, setJenniLinkId] = useState("");
  const [jenniMerchantSyncing, setJenniMerchantSyncing] = useState(false);
  const [jenniSyncing, setJenniSyncing] = useState(false);
  const [jenniLinking, setJenniLinking] = useState(false);

  const {
    data: merchant,
    refetch,
    isLoading: merchantLoading,
    isError: merchantError,
    error: merchantErrorObject,
  } = useQuery({
    queryKey: ["admin-merchant-detail", id],
    enabled: !!id,
    queryFn: () => apiClient.getMerchantById(id!),
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const { data: readiness, refetch: refetchReadiness } = useQuery({
    queryKey: ["admin-merchant-readiness", id],
    enabled: !!id,
    queryFn: () => apiClient.getMerchantReadiness(id!),
  });

  const { data: scorecard, refetch: refetchScorecard } = useQuery({
    queryKey: ["admin-merchant-scorecard", id],
    enabled: !!id,
    queryFn: () => apiClient.getMerchantPerformanceScorecard(id!),
  });

  const { data: jenniStatus, refetch: refetchJenni } = useQuery({
    queryKey: ["admin-jenni-provisioning", id],
    enabled: !!id,
    queryFn: () => apiClient.getJenniProvisioningStatus(id!),
    retry: 1,
  });

  useEffect(() => {
    if (!merchant) return;
    setForm({
      display_name: merchant.display_name ?? "",
      status: merchant.status ?? "draft",
    });
  }, [merchant]);

  const policyProfiles = listCommercialPolicyProfiles();
  const { data: assignedPolicy, refetch: refetchAssignedPolicy } = useQuery({
    queryKey: ["admin-merchant-policy-assignment", id],
    enabled: !!id,
    queryFn: () => resolveMerchantCommercialPolicyProfile(id),
  });

  const saveMerchant = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await apiClient.updateMerchant(id, { display_name: form.display_name });
      // Status changes go through the guarded endpoint only — it enforces readiness and the
      // explicit commercial-agreement requirement on activation. The generic profile update above
      // never carries `status`, so this is the single authoritative path for changing it. No cast
      // needed: form.status and updateMerchantStatus's payload both use the full MerchantStatus
      // union — only "active" triggers the readiness/agreement guard, every other transition
      // (draft/suspended/archived/...) is a plain status write, same as before.
      if (form.status !== merchant?.status) {
        await apiClient.updateMerchantStatus(id, { status: form.status });
      }
      toast.success("تم حفظ التاجر");
      await refetch();
      await refetchReadiness();
      await refetchScorecard();
    } catch (e) {
      console.error(e);
      toast.error(form.status !== merchant?.status ? activationErrorToast(e) : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const activateNow = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await apiClient.updateMerchantStatus(id, { status: "active" });
      toast.success("تم تفعيل التاجر");
      setForm((prev) => ({ ...prev, status: "active" }));
      await refetch();
      await refetchReadiness();
      await refetchScorecard();
    } catch (e) {
      toast.error(activationErrorToast(e));
    } finally {
      setSaving(false);
    }
  };

  const suspendNow = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await apiClient.updateMerchantStatus(id, { status: "suspended" });
      toast.success("تم تعليق التاجر");
      setForm((prev) => ({ ...prev, status: "suspended" }));
      await refetch();
      await refetchReadiness();
      await refetchScorecard();
    } catch {
      toast.error("تعذر تعليق التاجر");
    } finally {
      setSaving(false);
    }
  };

  const assignOwner = async () => {
    if (!id || !ownerUserId) return;
    setAssigning(true);
    try {
      await apiClient.assignMerchantOwner(id, { user_id: ownerUserId });
      toast.success("تم تعيين مالك التاجر");
      setOwnerUserId("");
    } catch (e) {
      console.error(e);
      toast.error("تعذّر تعيين المالك");
    } finally {
      setAssigning(false);
    }
  };

  const handleCreateJenniMerchant = async () => {
    if (!id) return;
    setJenniMerchantSyncing(true);
    try {
      const result = await apiClient.createJenniMerchant(id);
      if (result.was_created) {
        toast.success(`تم إنشاء تاجر في Jenni: ${result.jenni_merchant_id}`);
      } else {
        toast.info(`التاجر موجود مسبقًا: ${result.jenni_merchant_id}`);
      }
      await refetchJenni();
    } catch (e: any) {
      console.error("Jenni merchant provisioning failed:", e);
      let errMsg = "تعذّر إنشاء تاجر Jenni";
      if (e && typeof e.status === "number") {
        const summaryMsg = e.message && e.message.length > 150 ? e.message.slice(0, 150) + "..." : e.message;
        errMsg = `خطأ ${e.status}: ${summaryMsg}`;
        if (e.errorDetails) {
          errMsg += ` (${e.errorDetails})`;
        }
      } else if (e instanceof Error) {
        errMsg = e.message;
      }
      toast.error(errMsg);
    } finally {
      setJenniMerchantSyncing(false);
    }
  };

  const handleCreateJenniStore = async () => {
    if (!id) return;
    setJenniSyncing(true);
    try {
      const result = await apiClient.createJenniStore(id);
      if (result.was_created) {
        toast.success(`تم إنشاء Store في Jenni: ${result.jenni_store_id}`);
      } else {
        toast.info(`Store موجود مسبقًا: ${result.jenni_store_id}`);
      }
      await refetchJenni();
    } catch (e: any) {
      console.error("Jenni store provisioning failed:", e);
      let errMsg = "تعذّر إنشاء متجر Jenni";
      const rawMsg = String(e?.message ?? "");
      const errorDetails = String(e?.errorDetails ?? "");
      if (
        rawMsg.toLowerCase().includes("duplicate") ||
        rawMsg.toLowerCase().includes("reduplicate") ||
        errorDetails.toLowerCase().includes("duplicate") ||
        errorDetails.toLowerCase().includes("reduplicate")
      ) {
        errMsg = "اسم نقطة الاستلام في Jenni مكرر. يرجى استخدام Store ID الموجود وربطه يدويًا أو تعديل اسم نقطة الاستلام.";
      } else if (e && typeof e.status === "number") {
        // Prevent showing full raw logs in UI toast
        const summaryMsg = e.message && e.message.length > 150 ? e.message.slice(0, 150) + "..." : e.message;
        errMsg = `خطأ ${e.status}: ${summaryMsg}`;
        if (e.errorDetails) {
          errMsg += ` (${e.errorDetails})`;
        }
      } else if (e instanceof Error) {
        errMsg = e.message;
      }
      toast.error(errMsg);
    } finally {
      setJenniSyncing(false);
    }
  };

  const handleLinkJenniStore = async () => {
    if (!id || !jenniLinkId) return;
    const storeId = Number(jenniLinkId);
    if (!storeId || storeId <= 0) {
      toast.error("يرجى إدخال رقم Store صحيح");
      return;
    }
    setJenniLinking(true);
    try {
      await apiClient.linkJenniStore(id, storeId);
      toast.success(`تم ربط Store: ${storeId}`);
      setJenniLinkId("");
      await refetchJenni();
    } catch (e: any) {
      toast.error(String(e?.message ?? "تعذّر الربط"));
    } finally {
      setJenniLinking(false);
    }
  };

  const regDetails = merchant?.registration_details;

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name_ar: "",
    name_en: "",
    display_name: "",
    description: "",
    business_type: "",
    city: "",
    address: "",
    contact_phone: "",
    whatsapp_phone: "",
    support_email: "",
    owner_full_name: "",
    owner_phone: "",
  });

  const enterEditMode = () => {
    if (!merchant) return;
    const reg = merchant.registration_details;
    setEditForm({
      name_ar: reg?.store_name_ar || merchant.name_ar || "",
      name_en: reg?.store_name_en || merchant.name_en || "",
      display_name: reg?.display_name || merchant.display_name || "",
      description: reg?.description || merchant.description || "",
      business_type: reg?.business_type || merchant.business_type || "",
      city: reg?.city ?? "",
      address: reg?.address ?? "",
      contact_phone: reg?.contact_phone ?? "",
      whatsapp_phone: reg?.whatsapp_phone ?? "",
      support_email: reg?.support_email ?? "",
      owner_full_name: reg?.owner_full_name ?? "",
      owner_phone: reg?.owner_phone ?? "",
    });
    setIsEditing(true);
  };

  const saveRegistrationDetails = async () => {
    if (!id) return;
    if (!editForm.name_ar.trim() || !editForm.name_en.trim() || !editForm.display_name.trim()) {
      toast.error("الرجاء ملء الحقول الإلزامية للمتجر (الاسم بالعربية، الاسم بالإنجليزية، والاسم المعروض)");
      return;
    }
    setSaving(true);
    try {
      const payload: UpdateMerchantRegistrationDetailsPayload = {
        merchant: {
          name_ar: editForm.name_ar,
          name_en: editForm.name_en,
          display_name: editForm.display_name,
          description: editForm.description,
          business_type: editForm.business_type,
        },
        settings: {
          city: editForm.city,
          address: editForm.address,
          contact_phone: editForm.contact_phone,
          whatsapp_phone: editForm.whatsapp_phone,
          support_email: editForm.support_email,
        },
        owner: {
          full_name: editForm.owner_full_name,
          phone: editForm.owner_phone,
        },
      };

      await apiClient.updateMerchantRegistrationDetails(id, payload);
      toast.success("تم حفظ البيانات بنجاح");
      setIsEditing(false);
      await refetch();
      await refetchReadiness();
      await refetchScorecard();
    } catch (e: any) {
      console.error(e);
      toast.error(String(e?.message ?? "تعذّر حفظ البيانات"));
    } finally {
      setSaving(false);
    }
  };

  const renderValue = (val: string | null | undefined, isLtr = false) => {
    if (val === null || val === undefined || String(val).trim() === "") {
      return <span className="text-muted-foreground">غير متوفر</span>;
    }
    return <span className={isLtr ? "font-mono" : ""} dir={isLtr ? "ltr" : "rtl"}>{val}</span>;
  };

  const formatSubmittedAt = (dateStr?: string | null) => {
    if (dateStr === null || dateStr === undefined || String(dateStr).trim() === "") {
      return <span className="text-muted-foreground">غير متوفر</span>;
    }
    try {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) {
        return <span className="text-muted-foreground">غير متوفر</span>;
      }
      const formatted = date.toLocaleString("ar-IQ", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return <span dir="ltr" className="font-mono">{formatted}</span>;
    } catch {
      return <span className="text-muted-foreground">غير متوفر</span>;
    }
  };

  if (merchantLoading) {
    return <div>جاري التحميل...</div>;
  }

  if (merchantError) {
    return (
      <div className="max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <h3 className="font-bold text-destructive">تعذر تحميل بيانات التاجر</h3>
        <p className="text-sm text-muted-foreground">
          {String((merchantErrorObject as any)?.message ?? "حدث خطأ غير متوقع أثناء تحميل البيانات.")}
        </p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="max-w-xl rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-bold">لم يتم العثور على التاجر</h3>
        <p className="text-sm text-muted-foreground">قد يكون المعرّف غير صحيح أو تم حذف السجل.</p>
      </div>
    );
  }

  const jenniMerchantStatusBadge = (() => {
    if (!jenniStatus) return { label: "غير معروف", color: "text-muted-foreground", bg: "bg-muted" };
    if (jenniStatus.jenni_merchant_sync_error) return { label: "خطأ", color: "text-red-700", bg: "bg-red-100" };
    if (jenniStatus.is_merchant_linked) return { label: "مربوط", color: "text-emerald-700", bg: "bg-emerald-100" };
    return { label: "غير مربوط", color: "text-amber-700", bg: "bg-amber-100" };
  })();

  const jenniStoreStatusBadge = (() => {
    if (!jenniStatus) return { label: "غير معروف", color: "text-muted-foreground", bg: "bg-muted" };
    if (jenniStatus.is_linked) return { label: "مربوط", color: "text-emerald-700", bg: "bg-emerald-100" };
    if (jenniStatus.jenni_sync_error) return { label: "خطأ", color: "text-red-700", bg: "bg-red-100" };
    return { label: "غير مربوط", color: "text-amber-700", bg: "bg-amber-100" };
  })();

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold">تفاصيل التاجر</h2>
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">جاهزية المتجر</h3>
          <span className={`text-sm font-semibold ${readiness?.is_ready ? "text-emerald-600" : "text-amber-600"}`}>
            {readiness?.is_ready ? "جاهز للتشغيل" : "يحتاج استكمال"}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${readiness?.score ?? 0}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">
          {(readiness?.score ?? 0)}% — مكتمل {(readiness?.passed_checks ?? 0)} من {(readiness?.total_checks ?? 0)}
        </p>
        <div className="space-y-1 text-sm">
          {(readiness?.checklist ?? []).map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <span>{item.label}</span>
              <span className={item.passed ? "text-emerald-600" : "text-amber-600"}>{item.passed ? "مكتمل" : "ناقص"}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {form.status !== "active" ? (
              <Button
                type="button"
                onClick={activateNow}
                disabled={!readiness || saving || ((readiness?.checklist ?? []).filter(item => item.key !== "merchant_is_active" && !item.passed).length > 0)}
              >
                {saving ? "جاري التفعيل..." : "تفعيل الآن"}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={suspendNow} disabled={saving}>
                {saving ? "جاري التعليق..." : "تعليق الآن"}
              </Button>
            )}
            <p className={`text-sm font-medium ${form.status === "active" ? "text-emerald-600" : "text-muted-foreground"}`}>
              الحالة الحالية: {form.status}
            </p>
          </div>
          {form.status !== "active" && (
            <div className="text-xs space-y-1 mt-1">
              {(() => {
                const blocking = (readiness?.checklist ?? []).filter(item => item.key !== "merchant_is_active" && !item.passed);
                if (!readiness) {
                  return <p className="text-muted-foreground">جاري تحميل بيانات الجاهزية...</p>;
                }
                if (blocking.length > 0) {
                  return (
                    <p className="text-amber-600 font-medium">
                      المتطلبات المتبقية للتفعيل: {blocking.map(item => item.label).join("، ")}
                    </p>
                  );
                }
                return <p className="text-emerald-600 font-medium">جاهز للتفعيل الآن.</p>;
              })()}
            </div>
          )}
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">الاتفاق التجاري</h3>
          {readiness && !readiness.commercial_agreement_configured && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
              اتفاق تجاري مطلوب
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          عمولة المنصة ورسومها المتفق عليها مع هذا التاجر — بلا الحاجة لمعرفة تفاصيل النظام الداخلية.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to={`/admin/merchants/${id}/commercial-agreement`}>إدارة الاتفاق التجاري</Link>
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Scorecard الأداء</h3>
          <span className="text-indigo-700 font-semibold">{scorecard?.score ?? 0}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${scorecard?.score ?? 0}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-border px-2 py-2">جاهزية المتجر: {scorecard?.kpis?.store_readiness_score ?? 0}%</div>
          <div className="rounded border border-border px-2 py-2">جاهزية المنتجات: {scorecard?.kpis?.product_readiness_coverage ?? 0}%</div>
          <div className="rounded border border-border px-2 py-2">نسبة الكتالوج النشط: {scorecard?.kpis?.active_catalog_ratio ?? 0}%</div>
          <div className="rounded border border-border px-2 py-2">نسبة التأخير: {scorecard?.kpis?.delayed_order_ratio ?? 0}%</div>
    </div>
      </div>

      {/* بيانات طلب التسجيل */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border pb-2 gap-2">
          <h3 className="font-bold text-lg">بيانات طلب التسجيل</h3>
          {!isEditing ? (
            <Button size="sm" type="button" onClick={enterEditMode} disabled={saving}>
              تعديل البيانات
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" type="button" onClick={saveRegistrationDetails} disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>
                إلغاء
              </Button>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground -mt-3">
          يمكن إكمال بيانات التشغيل من هنا، أما جاهزية المنتجات فتُدار من صفحة المنتجات.
        </p>

        {/* 1. بيانات الحساب */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-primary">1. بيانات الحساب</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border/50">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">البريد الإلكتروني</span>
              <span className="text-sm font-medium">{renderValue(regDetails?.email, true)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">معرّف المستخدم</span>
              <span className="text-sm font-medium">{renderValue(regDetails?.applicant_user_id, true)}</span>
            </div>
          </div>
        </div>

        {/* 2. بيانات المالك */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-primary">2. بيانات المالك</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border/50">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">اسم المالك</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.owner_full_name}
                  onChange={(e) => setEditForm(p => ({ ...p, owner_full_name: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.owner_full_name)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">هاتف المالك</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.owner_phone}
                  onChange={(e) => setEditForm(p => ({ ...p, owner_phone: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.owner_phone, true)}</span>
              )}
            </div>
          </div>
        </div>

        {/* 3. بيانات المتجر */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-primary">3. بيانات المتجر</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border/50">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">اسم المتجر بالعربية</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.name_ar}
                  onChange={(e) => setEditForm(p => ({ ...p, name_ar: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.store_name_ar)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">اسم المتجر بالإنجليزية</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.name_en}
                  onChange={(e) => setEditForm(p => ({ ...p, name_en: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.store_name_en)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="display_name" className="text-xs text-muted-foreground">الاسم المعروض</Label>
              {isEditing ? (
                <Input
                  id="display_name"
                  className="h-8 text-xs bg-background"
                  value={editForm.display_name}
                  onChange={(e) => setEditForm(p => ({ ...p, display_name: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.display_name)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">معرّف رابط المتجر</span>
              <span className="text-sm font-medium">{renderValue(regDetails?.slug, true)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">نوع النشاط</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.business_type}
                  onChange={(e) => setEditForm(p => ({ ...p, business_type: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.business_type)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-muted-foreground">وصف المتجر</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.description}
                  onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium break-words whitespace-pre-wrap">{renderValue(regDetails?.description)}</span>
              )}
            </div>
          </div>
        </div>

        {/* 4. العنوان والتواصل */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-primary">4. العنوان والتواصل</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border/50">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">المدينة</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.city}
                  onChange={(e) => setEditForm(p => ({ ...p, city: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.city)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">هاتف التواصل</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.contact_phone}
                  onChange={(e) => setEditForm(p => ({ ...p, contact_phone: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.contact_phone, true)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">هاتف الواتساب</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.whatsapp_phone}
                  onChange={(e) => setEditForm(p => ({ ...p, whatsapp_phone: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.whatsapp_phone, true)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">بريد الدعم</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.support_email}
                  onChange={(e) => setEditForm(p => ({ ...p, support_email: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium">{renderValue(regDetails?.support_email, true)}</span>
              )}
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-muted-foreground">العنوان</span>
              {isEditing ? (
                <Input
                  className="h-8 text-xs bg-background"
                  value={editForm.address}
                  onChange={(e) => setEditForm(p => ({ ...p, address: e.target.value }))}
                />
              ) : (
                <span className="text-sm font-medium break-words whitespace-pre-wrap">{renderValue(regDetails?.address)}</span>
              )}
            </div>
          </div>
        </div>

        {/* 5. معلومات الطلب */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-primary">5. معلومات الطلب</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border/50">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">تاريخ تقديم الطلب</span>
              <span className="text-sm font-medium">{formatSubmittedAt(regDetails?.submitted_at)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">حالة الطلب</span>
              <span className="text-sm font-medium">{renderValue(regDetails?.status)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="space-y-2">
          <Label>الحالة</Label>
          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as MerchantStatus }))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="archived">archived</option>
          </select>
        </div>
        <Button onClick={saveMerchant} disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-bold">Commercial Policy Profile</h3>
        <p className="text-xs text-muted-foreground">تحديد سياسة تجارية موحدة لهذا التاجر (M4.6).</p>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={assignedPolicy?.id ?? "balanced"}
          onChange={async (e) => {
            if (!id) return;
            const nextProfileId = e.target.value as any;
            const result = await assignMerchantCommercialPolicyProfile(id, nextProfileId);
            await refetchAssignedPolicy();
            if (result.ok) {
              toast.success("تم تحديث البروفايل التجاري");
            } else {
              toast.info(result.message ?? (ENABLE_LOCAL_FALLBACKS ? "تم الحفظ محليًا مؤقتًا" : "تعذر الحفظ على الخادم"));
            }
          }}
        >
          {policyProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
        <div className="rounded border border-border p-3 text-xs text-muted-foreground">
          <p>الوصف: {assignedPolicy?.description ?? "—"}</p>
          <p className="mt-1">أقصى خصم مسموح: {assignedPolicy?.maxDiscountPercent ?? 0}%</p>
          <p className="mt-1">أدنى حد كوبون: {assignedPolicy?.minCouponOrderAmount ?? 0} د.ع</p>
          <p className="mt-1">أقصى استخدام للكوبون: {assignedPolicy?.maxCouponUsage ?? 0}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-bold">تعيين مالك التاجر</h3>
        <Input
          placeholder="User ID (auth uid)"
          value={ownerUserId}
          onChange={(e) => setOwnerUserId(e.target.value)}
        />
        <Button onClick={assignOwner} disabled={assigning}>
          {assigning ? "جاري التعيين..." : "تعيين كـ Owner"}
        </Button>
      </div>

      {/* ── Jenni Aggregator & Store Provisioning (Phase 2F) ────────────────── */}
      <div id="jenni-provisioning-section" className="bg-card border border-border rounded-xl p-5 space-y-6">
        {/* Merchant Provisioning Sub-section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="font-bold text-base">إنشاء حساب تاجر Jenni (Aggregator)</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${jenniMerchantStatusBadge.bg} ${jenniMerchantStatusBadge.color}`}>
              {jenniMerchantStatusBadge.label}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jenni Merchant ID</span>
              <span className="font-mono">{jenniStatus?.jenni_merchant_id ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">آخر مزامنة تاجر</span>
              <span className="font-mono text-xs">
                {jenniStatus?.jenni_merchant_synced_at
                  ? new Date(jenniStatus.jenni_merchant_synced_at).toLocaleString("ar-IQ")
                  : "—"}
              </span>
            </div>
            {jenniStatus?.jenni_merchant_sync_error && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                <strong>خطأ:</strong> {jenniStatus.jenni_merchant_sync_error}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              id="btn-jenni-create-merchant"
              size="sm"
              onClick={handleCreateJenniMerchant}
              disabled={jenniMerchantSyncing || !!jenniStatus?.is_merchant_linked}
            >
              {jenniMerchantSyncing ? "جاري الإنشاء..." : "إنشاء تاجر في Jenni"}
            </Button>
          </div>
        </div>

        {/* Store Provisioning Sub-section */}
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="font-bold text-base">ربط Jenni Store (Pickup Point)</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${jenniStoreStatusBadge.bg} ${jenniStoreStatusBadge.color}`}>
              {jenniStoreStatusBadge.label}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jenni Store ID</span>
              <span className="font-mono">{jenniStatus?.jenni_store_id ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">آخر مزامنة فرع</span>
              <span className="font-mono text-xs">
                {jenniStatus?.jenni_synced_at
                  ? new Date(jenniStatus.jenni_synced_at).toLocaleString("ar-IQ")
                  : "—"}
              </span>
            </div>
            {!jenniStatus?.is_linked && jenniStatus?.jenni_sync_error && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                <strong>خطأ:</strong>{" "}
                {jenniStatus.jenni_sync_error.toLowerCase().includes("duplicate") ||
                jenniStatus.jenni_sync_error.toLowerCase().includes("reduplicate")
                  ? "اسم Store مكرر في Jenni. يرجى استخدام Store ID الموجود وربطه يدويًا أو تعديل اسم نقطة الاستلام."
                  : jenniStatus.jenni_sync_error}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              id="btn-jenni-create-sync"
              size="sm"
              variant="secondary"
              onClick={handleCreateJenniStore}
              disabled={jenniSyncing || !jenniStatus?.is_merchant_linked || !!jenniStatus?.is_linked}
            >
              {jenniSyncing ? "جاري الإنشاء..." : "Create / Sync Store"}
            </Button>
            <Button
              id="btn-jenni-refresh"
              size="sm"
              variant="outline"
              onClick={() => void refetchJenni()}
            >
              تحديث الحالة
            </Button>
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs text-muted-foreground">ربط Store يدوي (بدون Jenni API):</p>
            <div className="flex gap-2">
              <Input
                id="input-jenni-link-id"
                placeholder="Jenni Store ID"
                value={jenniLinkId}
                onChange={(e) => setJenniLinkId(e.target.value)}
                className="max-w-[160px] font-mono"
                type="number"
              />
              <Button
                id="btn-jenni-link"
                size="sm"
                variant="outline"
                onClick={handleLinkJenniStore}
                disabled={jenniLinking || !jenniLinkId || !jenniStatus?.is_merchant_linked}
              >
                {jenniLinking ? "جاري الربط..." : "Link Store"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminMerchantDetail;
