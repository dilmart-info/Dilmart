import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-core";
import type { AdminMerchantCommercialAgreementTerm } from "@/lib/api/admin-core";
import { baghdadCalendarDateToInstant, formatBaghdadCalendarDate, instantToBaghdadCalendarDate } from "@/lib/baghdad-time";

// Today's Iraqi commercial calendar day — deliberately NOT the operator's browser-local date and
// NOT the UTC date. An admin in a different timezone must still see/default-to today-in-Baghdad.
const todayDateInput = () => instantToBaghdadCalendarDate(new Date().toISOString());

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return formatBaghdadCalendarDate(iso, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "—";
  }
};

const RULE_TYPE_LABELS: Record<string, string> = {
  commission: "عمولة المنصة",
  assisted_fee: "رسوم الطلب المُساعَد",
  platform_fee: "رسوم منصة إضافية",
  delivery_billing: "احتساب رسوم التوصيل",
};

const DELIVERY_BILLING_LABELS: Record<string, string> = {
  customer_pays: "يدفعها العميل",
  merchant_pays: "يدفعها التاجر",
  mixed: "مشتركة",
};

const INVALID = Symbol("invalid-rate");

const formatTermValue = (term: AdminMerchantCommercialAgreementTerm | null) => {
  if (!term) return "—";
  if (term.rule_type === "delivery_billing") {
    return DELIVERY_BILLING_LABELS[term.delivery_billing_mode ?? ""] ?? term.delivery_billing_mode ?? "—";
  }
  return term.value_type === "fixed" ? `${term.value} د.ع` : `${term.value}%`;
};

const AdminMerchantCommercialAgreement = () => {
  const { id } = useParams();
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [replacePending, setReplacePending] = useState(false);
  const [form, setForm] = useState({
    commission_rate: "",
    effective_from: todayDateInput(),
    assisted_fee_rate: "",
    platform_fee_rate: "",
    delivery_billing_mode: "",
  });

  const {
    data: agreement,
    refetch,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["admin-merchant-commercial-agreement", id],
    enabled: !!id,
    queryFn: () => apiClient.getAdminMerchantCommercialAgreement(id!),
  });

  const submit = async () => {
    if (!id) return;

    // A blank field must never be treated as an explicit 0% — Number("") is 0, so the emptiness
    // check has to happen BEFORE numeric coercion, not after.
    if (form.commission_rate.trim() === "") {
      toast.error("نسبة العمولة مطلوبة");
      return;
    }
    const commissionRate = Number(form.commission_rate);
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      toast.error("نسبة العمولة يجب أن تكون بين 0 و 100");
      return;
    }
    if (!form.effective_from) {
      toast.error("يرجى تحديد تاريخ السريان");
      return;
    }

    // Optional fee rates: undefined means "don't change it" (omitted from the request); anything
    // typed must be a valid 0-100 number. Never let a non-numeric entry silently serialize as
    // `null` (JSON.stringify(NaN) === "null") — that would submit an invisible different value.
    const parseOptionalRate = (raw: string, label: string): number | undefined | typeof INVALID => {
      if (raw.trim() === "") return undefined;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        toast.error(`${label} يجب أن تكون بين 0 و 100`);
        return INVALID;
      }
      return parsed;
    };
    const assistedFeeRate = parseOptionalRate(form.assisted_fee_rate, RULE_TYPE_LABELS.assisted_fee);
    if (assistedFeeRate === INVALID) return;
    const platformFeeRate = parseOptionalRate(form.platform_fee_rate, RULE_TYPE_LABELS.platform_fee);
    if (platformFeeRate === INVALID) return;

    setSaving(true);
    try {
      await apiClient.scheduleAdminMerchantCommercialAgreement(id, {
        commission_rate: commissionRate,
        effective_from: baghdadCalendarDateToInstant(form.effective_from),
        assisted_fee_rate: assistedFeeRate,
        platform_fee_rate: platformFeeRate,
        delivery_billing_mode: (form.delivery_billing_mode || undefined) as "customer_pays" | "merchant_pays" | "mixed" | undefined,
        replace_pending: replacePending,
      });
      toast.success("تم حفظ الاتفاق التجاري");
      setForm((prev) => ({ ...prev, commission_rate: "", assisted_fee_rate: "", platform_fee_rate: "", delivery_billing_mode: "" }));
      setReplacePending(false);
      await refetch();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("يوجد اتفاق مجدول قادم يتعارض مع هذا التاريخ. فعّل خيار الاستبدال أدناه ثم أعد الحفظ.");
      } else {
        toast.error(e instanceof Error ? e.message : "تعذّر حفظ الاتفاق التجاري");
      }
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div>جاري التحميل...</div>;

  if (isError || !agreement) {
    return (
      <div className="max-w-2xl rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <h3 className="font-bold text-destructive">تعذر تحميل الاتفاق التجاري</h3>
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "حدث خطأ غير متوقع."}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  const { current, upcoming, history } = agreement;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">الاتفاق التجاري — {agreement.merchant_name ?? agreement.merchant_id}</h2>
        <Link to={`/admin/merchants/${agreement.merchant_id}`} className="text-sm text-primary hover:underline">
          العودة لملف التاجر
        </Link>
      </div>

      {!agreement.has_explicit_agreement && (
        <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-4 space-y-1">
          <p className="font-bold text-destructive">لا يوجد اتفاق تجاري محدد لهذا التاجر</p>
          {agreement.engine_fallback && (
            <p className="text-xs text-muted-foreground">
              (تشخيصي فقط، ليس اتفاقًا تعاقديًا) نسبة احتياطية من محرك النظام: {agreement.engine_fallback.commission_rate}% — المصدر:{" "}
              {agreement.engine_fallback.source}
            </p>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-bold">الاتفاق الحالي</h3>
        {current.commission ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">عمولة المنصة</span>
              <span className="text-lg font-bold text-emerald-700">{formatTermValue(current.commission)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">ساري منذ</span>
              <span>{formatDate(current.commission.effective_from)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">الحالة</span>
              <span className="text-emerald-600 font-semibold">نشط</span>
            </div>
            <div className="border-t border-border pt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
              <div className="flex justify-between md:flex-col md:gap-1">
                <span className="text-muted-foreground">{RULE_TYPE_LABELS.assisted_fee}</span>
                <span>{formatTermValue(current.assisted_fee)}</span>
              </div>
              <div className="flex justify-between md:flex-col md:gap-1">
                <span className="text-muted-foreground">{RULE_TYPE_LABELS.platform_fee}</span>
                <span>{formatTermValue(current.platform_fee)}</span>
              </div>
              <div className="flex justify-between md:flex-col md:gap-1">
                <span className="text-muted-foreground">{RULE_TYPE_LABELS.delivery_billing}</span>
                <span>{formatTermValue(current.delivery_billing)}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">لا يوجد اتفاق نشط حاليًا.</p>
        )}
      </div>

      {upcoming.commission && (
        <div className="bg-card border border-amber-300 rounded-xl p-5 space-y-2">
          <h3 className="font-bold text-amber-700">الاتفاق القادم المجدول</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">عمولة المنصة الجديدة</span>
            <span className="text-lg font-bold text-amber-700">{formatTermValue(upcoming.commission)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">يسري اعتبارًا من</span>
            <span>{formatDate(upcoming.commission.effective_from)}</span>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-bold">تعديل الاتفاق التجاري</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="commission_rate">نسبة العمولة الجديدة (%)</Label>
            <Input
              id="commission_rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.commission_rate}
              onChange={(e) => setForm((p) => ({ ...p, commission_rate: e.target.value }))}
              placeholder="مثال: 12"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="effective_from">تاريخ السريان</Label>
            <Input
              id="effective_from"
              type="date"
              value={form.effective_from}
              onChange={(e) => setForm((p) => ({ ...p, effective_from: e.target.value }))}
            />
          </div>
        </div>

        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "إخفاء الإعدادات المتقدمة" : "إعدادات متقدمة (رسوم إضافية)"}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border pt-3">
            <div className="space-y-1">
              <Label htmlFor="assisted_fee_rate">{RULE_TYPE_LABELS.assisted_fee} (%)</Label>
              <Input
                id="assisted_fee_rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.assisted_fee_rate}
                onChange={(e) => setForm((p) => ({ ...p, assisted_fee_rate: e.target.value }))}
                placeholder="اتركه فارغًا لعدم التغيير"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="platform_fee_rate">{RULE_TYPE_LABELS.platform_fee} (%)</Label>
              <Input
                id="platform_fee_rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.platform_fee_rate}
                onChange={(e) => setForm((p) => ({ ...p, platform_fee_rate: e.target.value }))}
                placeholder="اتركه فارغًا لعدم التغيير"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="delivery_billing_mode">{RULE_TYPE_LABELS.delivery_billing}</Label>
              <select
                id="delivery_billing_mode"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.delivery_billing_mode}
                onChange={(e) => setForm((p) => ({ ...p, delivery_billing_mode: e.target.value }))}
              >
                <option value="">بدون تغيير</option>
                <option value="customer_pays">{DELIVERY_BILLING_LABELS.customer_pays}</option>
                <option value="merchant_pays">{DELIVERY_BILLING_LABELS.merchant_pays}</option>
                <option value="mixed">{DELIVERY_BILLING_LABELS.mixed}</option>
              </select>
            </div>
          </div>
        )}

        {upcoming.commission && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={replacePending}
              onChange={(e) => setReplacePending(e.target.checked)}
            />
            استبدال الاتفاق القادم المجدول أعلاه بهذا التعديل
          </label>
        )}

        <Button onClick={submit} disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ الاتفاق التجاري"}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-bold">السجل التاريخي</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد سجل سابق.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {history.map((term) => (
              <div key={term.id} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-b-0">
                <div>
                  <span className="font-medium">{RULE_TYPE_LABELS[term.rule_type] ?? term.rule_type}</span>
                  <span className="text-muted-foreground"> — {formatTermValue(term)}</span>
                </div>
                <div className="text-xs text-muted-foreground text-left">
                  <div>{formatDate(term.effective_from)} → {formatDate(term.effective_to)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMerchantCommercialAgreement;
