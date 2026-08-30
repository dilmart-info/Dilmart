import { useEffect, useState } from "react";
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
import { getCommercialPolicyProfile, resolveMerchantCommercialPolicyProfile } from "@/lib/commercial-policy-profiles";

type Props = {
  context: ScopedContext;
  title?: string;
};

export default function CouponsPage({ context, title = "الكوبونات" }: Props) {
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
  const policyMerchantId = context.scope === "merchant" ? context.merchantId ?? null : form.merchant_id === "platform" ? null : form.merchant_id;
  const { data: policyData } = useQuery({
    queryKey: ["commercial-policy-assignment-coupons", policyMerchantId],
    queryFn: () => resolveMerchantCommercialPolicyProfile(policyMerchantId),
  });
  const policy = policyData ?? getCommercialPolicyProfile("balanced");

  const { data: merchants } = useQuery({
    queryKey: ["scoped-coupons-merchants"],
    enabled: context.scope === "platform",
    queryFn: () => apiClient.getActiveMerchants(),
  });

  const { data: coupons, isLoading } = useQuery({
    queryKey: ["scoped-coupons", context.scope, context.merchantId, merchantFilter],
    queryFn: () =>
      getScopedCoupons(context, {
        merchantId: context.scope === "platform" && merchantFilter !== "all" ? merchantFilter : undefined,
      }),
  });

  useEffect(() => {
    if (context.scope === "merchant") {
      setForm((prev) => ({ ...prev, merchant_id: context.merchantId ?? "platform" }));
    }
  }, [context]);

  const saveCoupon = useMutation({
    mutationFn: () =>
      upsertScopedCoupon(context, {
        code: form.code,
        discount_type: form.discount_type,
        value: Number(form.value),
        min_order_amount: form.min_order_amount ? Number(form.min_order_amount) : 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        expires_at: form.expires_at || null,
        is_active: form.is_active,
        merchant_id: context.scope === "platform" ? (form.merchant_id === "platform" ? null : form.merchant_id) : context.merchantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scoped-coupons"] });
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
    onError: (error: any) => {
      const message = String(error?.message ?? "");
      if (message.includes("COUPON_CODE_EXISTS")) {
        toast.error("كود الكوبون مستخدم مسبقًا ضمن نفس النطاق.");
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
      if (message.includes("Max uses must be greater than zero")) {
        toast.error("الحد الأقصى للاستخدام يجب أن يكون أكبر من صفر.");
        return;
      }
      toast.error("تعذر حفظ الكوبون");
    },
  });

  const handleSaveCoupon = () => {
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
      queryClient.invalidateQueries({ queryKey: ["scoped-coupons"] });
      toast.success("تم حذف الكوبون");
    },
    onError: () => toast.error("تعذر حذف الكوبون"),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">{title}</h2>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-7">
        <Input placeholder="الكود" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={form.discount_type}
          onChange={(e) => setForm((p) => ({ ...p, discount_type: e.target.value as "fixed" | "percentage" }))}
        >
          <option value="fixed">مبلغ ثابت</option>
          <option value="percentage">نسبة مئوية</option>
        </select>
        <Input placeholder="قيمة الخصم" type="number" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} />
        <Input
          placeholder="الحد الأدنى للطلب"
          type="number"
          value={form.min_order_amount}
          onChange={(e) => setForm((p) => ({ ...p, min_order_amount: e.target.value }))}
        />
        <Input placeholder="الحد الأقصى للاستخدام" type="number" value={form.max_uses} onChange={(e) => setForm((p) => ({ ...p, max_uses: e.target.value }))} />
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
        <Button disabled={!form.code || !form.value || saveCoupon.isPending} onClick={handleSaveCoupon}>
          حفظ
        </Button>
      </div>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800">
        <p className="font-semibold">السياسة التجارية: {policy.label}</p>
        <p className="mt-1">أقصى خصم نسبي مسموح: {policy.maxDiscountPercent}%</p>
        <p className="mt-1">أدنى حد للطلب: {policy.minCouponOrderAmount} د.ع</p>
        <p className="mt-1">أقصى استخدام للكوبون: {policy.maxCouponUsage}</p>
      </div>

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

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الكود</TableHead>
              <TableHead className="text-right">الخصم</TableHead>
              {context.scope === "platform" && <TableHead className="text-right">النطاق</TableHead>}
              <TableHead className="text-right">الشروط</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-center">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={context.scope === "platform" ? 6 : 5} className="py-10 text-center text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            ) : (coupons ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={context.scope === "platform" ? 6 : 5} className="py-10 text-center text-muted-foreground">
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
                  <TableCell className="text-center">
                    <Button variant="ghost" size="sm" onClick={() => deleteCoupon.mutate(c.id)}>
                      حذف
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
