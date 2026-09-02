import React, { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ScopedContext } from "@/lib/scoped-queries";
import { deleteScopedCoupon, getScopedCoupons, upsertScopedCoupon } from "@/lib/scoped-queries";
import { apiClient } from "@/lib/api-client";
import { formatPrice } from "@/lib/format";
import { toast } from "sonner";
import { fetchMerchantCommercialPolicyProfileStrict } from "@/lib/commercial-policy-profiles";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function assertCouponsContractMerchantId(
  coupons: Array<{ merchant_id?: string | null }>,
  expectedMerchantId: string,
): void {
  for (const coupon of coupons) {
    if (!coupon.merchant_id || coupon.merchant_id !== expectedMerchantId) {
      throw new Error(
        `Contract violation: coupon belongs to ${coupon.merchant_id ?? "unknown"}, expected ${expectedMerchantId}`,
      );
    }
  }
}

type Props = {
  context: ScopedContext;
  title?: string;
  canManage?: boolean;
  liveMerchantIdRef?: React.RefObject<string | undefined>;
};

export default function CouponsPage({ context, title = "الكوبونات", canManage = true, liveMerchantIdRef }: Props) {
  const queryClient = useQueryClient();
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [form, setForm] = useState({
    code: "",
    discount_type: "fixed" as "fixed" | "percentage",
    value: "",
    min_order_amount: "",
    max_uses: "",
    expires_at: "",
    is_active: true,
    merchant_id: "platform",
  });

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const policyMerchantId = context.scope === "merchant" ? context.merchantId ?? null : form.merchant_id === "platform" ? null : form.merchant_id;
  const {
    data: policyData,
    isLoading: policyLoading,
    isError: policyError,
  } = useQuery({
    queryKey: ["commercial-policy-assignment-coupons", policyMerchantId],
    queryFn: () => fetchMerchantCommercialPolicyProfileStrict(policyMerchantId),
  });
  const policy = policyData ?? null;

  const { data: merchants } = useQuery({
    queryKey: ["scoped-coupons-merchants"],
    enabled: context.scope === "platform",
    queryFn: () => apiClient.getActiveMerchants(),
  });

  const {
    data: coupons,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["scoped-coupons", context.scope, context.merchantId, merchantFilter],
    queryFn: async () => {
      const data = await getScopedCoupons(context, {
        merchantId: context.scope === "platform" && merchantFilter !== "all" ? merchantFilter : undefined,
      });
      if (context.scope === "merchant" && context.merchantId) {
        assertCouponsContractMerchantId(data ?? [], context.merchantId);
      }
      return data;
    },
  });

  useEffect(() => {
    if (context.scope === "merchant") {
      setForm((prev) => ({ ...prev, merchant_id: context.merchantId ?? "platform" }));
    }
  }, [context]);

  const saveCoupon = useMutation({
    mutationFn: () => {
      const expiresIso = form.expires_at ? new Date(form.expires_at).toISOString() : null;
      return upsertScopedCoupon(context, {
        code: form.code,
        discount_type: form.discount_type,
        value: Number(form.value),
        min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        expires_at: expiresIso,
        is_active: form.is_active,
        merchant_id: context.scope === "platform" ? (form.merchant_id === "platform" ? null : form.merchant_id) : context.merchantId,
      });
    },
    onSuccess: () => {
      if (!isMountedRef.current) return;
      if (context.scope === "merchant" && liveMerchantIdRef?.current && liveMerchantIdRef.current !== context.merchantId) {
        return;
      }
      queryClient.invalidateQueries({
        queryKey: ["scoped-coupons", context.scope, context.scope === "merchant" ? context.merchantId : undefined],
      });
      setForm({
        code: "",
        discount_type: "fixed",
        value: "",
        min_order_amount: "",
        max_uses: "",
        expires_at: "",
        is_active: true,
        merchant_id: context.scope === "merchant" ? context.merchantId! : "platform",
      });
      toast.success("تم حفظ الكوبون");
    },
    onError: (err: any) => {
      if (!isMountedRef.current) return;
      if (context.scope === "merchant" && liveMerchantIdRef?.current && liveMerchantIdRef.current !== context.merchantId) {
        return;
      }
      const message = String(err?.message ?? "");
      if (message.includes("COUPON_CODE_EXISTS")) {
        toast.error("كود الكوبون مستخدم مسبقًا. يرجى اختيار كود آخر.");
        return;
      }
      if (message.includes("Percentage coupon value cannot exceed 100")) {
        toast.error("نسبة الخصم لا يمكن أن تتجاوز 100%.");
        return;
      }
      if (message.includes("Coupon expiry date must be in the future")) {
        toast.error("تاريخ انتهاء الكوبون يجب أن يكون في المستقبل.");
        return;
      }
      if (message.includes("Max uses must be greater than zero") || message.includes("positive integer")) {
        toast.error("الحد الأقصى للاستخدام يجب أن يكون عددًا صحيحًا أكبر من صفر.");
        return;
      }
      toast.error(err?.message || "تعذر حفظ الكوبون");
    },
  });

  const handleSaveCoupon = () => {
    if (!canManage) {
      toast.error("ليس لديك صلاحية إدارة الكوبونات.");
      return;
    }
    if (policyError || !policy) {
      toast.error("تعذر التحقق من السياسة التجارية. حفظ الكوبونات معطل مؤقتًا.");
      return;
    }
    if (form.discount_type === "percentage" && Number(form.value || 0) > policy.maxDiscountPercent) {
      toast.error(`سياسة ${policy.label}: الحد الأقصى لخصم النسبة هو ${policy.maxDiscountPercent}%`);
      return;
    }
    if (Number(form.min_order_amount || 0) < policy.minCouponOrderAmount) {
      toast.error(`سياسة ${policy.label}: الحد الأدنى للطلب يجب أن يكون ${policy.minCouponOrderAmount} د.ع أو أكثر`);
      return;
    }
    if (form.max_uses && Number(form.max_uses) > policy.maxCouponUsage) {
      toast.error(`سياسة ${policy.label}: الحد الأقصى للاستخدام لا يتجاوز ${policy.maxCouponUsage}`);
      return;
    }
    saveCoupon.mutate();
  };

  const deleteCoupon = useMutation({
    mutationFn: (couponId: string) => deleteScopedCoupon(context, couponId),
    onSuccess: () => {
      if (!isMountedRef.current) return;
      if (context.scope === "merchant" && liveMerchantIdRef?.current && liveMerchantIdRef.current !== context.merchantId) {
        return;
      }
      queryClient.invalidateQueries({
        queryKey: ["scoped-coupons", context.scope, context.scope === "merchant" ? context.merchantId : undefined],
      });
      toast.success("تم حذف الكوبون");
    },
    onError: (err: any) => {
      if (!isMountedRef.current) return;
      if (context.scope === "merchant" && liveMerchantIdRef?.current && liveMerchantIdRef.current !== context.merchantId) {
        return;
      }
      toast.error(err?.message || "تعذر حذف الكوبون");
    },
  });

  return (
    <div className="space-y-5" data-testid="coupons-page-container">
      <h2 className="text-2xl font-bold">{title}</h2>

      {/* Write section: Only shown if canManage is true */}
      {canManage ? (
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-7" data-testid="coupon-create-form">
          <Input
            placeholder="الكود"
            value={form.code}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.discount_type}
            onChange={(e) => setForm((p) => ({ ...p, discount_type: e.target.value as "fixed" | "percentage" }))}
          >
            <option value="fixed">مبلغ ثابت</option>
            <option value="percentage">نسبة مئوية</option>
          </select>
          <Input
            placeholder="قيمة الخصم"
            type="number"
            value={form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
          />
          <Input
            placeholder="الحد الأدنى للطلب"
            type="number"
            value={form.min_order_amount}
            onChange={(e) => setForm((p) => ({ ...p, min_order_amount: e.target.value }))}
          />
          <Input
            placeholder="الحد الأقصى للاستخدام"
            type="number"
            value={form.max_uses}
            onChange={(e) => setForm((p) => ({ ...p, max_uses: e.target.value }))}
          />
          <Input
            placeholder="تاريخ الانتهاء"
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => setForm((p) => ({ ...p, expires_at: e.target.value }))}
          />
          {context.scope === "platform" ? (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.merchant_id}
              onChange={(e) => setForm((p) => ({ ...p, merchant_id: e.target.value }))}
            >
              <option value="platform">عام</option>
              {(merchants ?? []).map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          ) : (
            <div className="h-10 rounded-md border border-input bg-muted px-3 text-sm flex items-center">كوبون لمتجرك</div>
          )}
          <Button
            disabled={!form.code || !form.value || saveCoupon.isPending || policyLoading || policyError || !policy}
            onClick={handleSaveCoupon}
            data-testid="coupon-save-btn"
          >
            {saveCoupon.isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      ) : (
        <div
          className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 p-4 text-xs text-blue-800 dark:text-blue-300 font-medium"
          data-testid="staff-readonly-banner"
        >
          صلاحية استعراض فقط — رتبتك الحالية (موظف) تتيح الاطلاع على كوبونات المتجر دون إنشاء أو حذف.
        </div>
      )}

      {/* Commercial Policy Summary & Error Banner */}
      {policyError ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2"
          data-testid="policy-error"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>تعذر تحميل السياسة التجارية للمتجر. حفظ الكوبونات معطل مؤقتًا لحماية هوامش الربح.</span>
        </div>
      ) : policy ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300">
          <p className="font-semibold">السياسة التجارية: {policy.label}</p>
          <p className="mt-1">أقصى خصم نسبي مسموح: {policy.maxDiscountPercent}%</p>
          <p className="mt-1">أدنى حد للطلب: {policy.minCouponOrderAmount} د.ع</p>
          <p className="mt-1">أقصى استخدام للكوبون: {policy.maxCouponUsage}</p>
        </div>
      ) : null}

      {context.scope === "platform" && (
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-64"
          value={merchantFilter}
          onChange={(e) => setMerchantFilter(e.target.value)}
        >
          <option value="all">كل التجار</option>
          {(merchants ?? []).map((m: any) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
      )}

      {/* Table & Truthful States */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {isError ? (
          <div className="p-8 text-center space-y-3" data-testid="coupons-error">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">تعذر تحميل بيانات الكوبونات</p>
              <p className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "حدث خطأ غير متوقع أثناء استرجاع القائمة."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs font-bold"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>إعادة المحاولة</span>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الخصم</TableHead>
                {context.scope === "platform" && <TableHead className="text-right">النطاق</TableHead>}
                <TableHead className="text-right">الشروط</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                {canManage && <TableHead className="text-center">إجراءات</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow data-testid="coupons-loading">
                  <TableCell colSpan={context.scope === "platform" ? 6 : canManage ? 5 : 4} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-xs">جاري تحميل الكوبونات...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (coupons ?? []).length === 0 ? (
                <TableRow data-testid="coupons-empty">
                  <TableCell colSpan={context.scope === "platform" ? 6 : canManage ? 5 : 4} className="py-10 text-center text-muted-foreground">
                    لا توجد كوبونات.
                  </TableCell>
                </TableRow>
              ) : (
                (coupons ?? []).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.code}</TableCell>
                    <TableCell>{c.discount_type === "percentage" ? `${c.value}%` : formatPrice(c.value)}</TableCell>
                    {context.scope === "platform" && <TableCell>{(c.merchants as any)?.display_name || "عام"}</TableCell>}
                    <TableCell>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>حد أدنى: {formatPrice(Number(c.min_order_amount ?? 0))}</p>
                        <p>استخدام: {c.max_uses ? `حتى ${c.max_uses}` : "غير محدود"}</p>
                        <p>انتهاء: {c.expires_at ? new Date(c.expires_at).toLocaleString("ar-IQ") : "بدون انتهاء"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "نشط" : "متوقف"}</Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteCoupon.isPending}
                          onClick={() => deleteCoupon.mutate(c.id)}
                          data-testid={`delete-coupon-${c.id}`}
                        >
                          حذف
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
