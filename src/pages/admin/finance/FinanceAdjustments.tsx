import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { DIRECTION_LABELS } from "./finance-ui";
import { financeKeys, useFinanceCourierPayables, useFinanceMerchantBalances } from "./useFinanceQueries";

export default function FinanceAdjustments() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"merchant" | "courier">("merchant");
  const [merchantId, setMerchantId] = useState("");
  const [merchantDirection, setMerchantDirection] = useState<"credit" | "debit">("credit");
  const [merchantAmount, setMerchantAmount] = useState("");
  const [merchantReason, setMerchantReason] = useState("");
  const [merchantRef, setMerchantRef] = useState("");
  const [merchantDesc, setMerchantDesc] = useState("");

  const [companyId, setCompanyId] = useState("");
  const [courierDirection, setCourierDirection] = useState<"credit" | "debit">("credit");
  const [courierAmount, setCourierAmount] = useState("");
  const [courierReason, setCourierReason] = useState("");
  const [courierDesc, setCourierDesc] = useState("");

  const merchantBalancesQuery = useFinanceMerchantBalances();
  const courierPayablesQuery = useFinanceCourierPayables();

  const createMerchantAdjustment = useMutation({
    mutationFn: () =>
      apiClient.createAdminManualAdjustment({
        merchant_id: merchantId,
        direction: merchantDirection,
        amount: Number(merchantAmount),
        reason_code: merchantReason,
        description: merchantDesc || null,
        reference_id: merchantRef || null,
      }),
    onSuccess: () => {
      toast.success("تم إنشاء التسوية اليدوية للتاجر");
      setMerchantAmount("");
      setMerchantDesc("");
      setMerchantRef("");
      queryClient.invalidateQueries({ queryKey: financeKeys.merchantBalances });
      queryClient.invalidateQueries({ queryKey: financeKeys.merchantLedger(merchantId || "none") });
      queryClient.invalidateQueries({ queryKey: financeKeys.events(merchantId) });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر إنشاء التسوية اليدوية للتاجر"),
  });

  const createCourierAdjustment = useMutation({
    mutationFn: () =>
      apiClient.createAdminCourierManualAdjustment({
        delivery_company_id: companyId,
        direction: courierDirection,
        amount: Number(courierAmount),
        reason_code: courierReason,
        description: courierDesc || null,
      }),
    onSuccess: () => {
      toast.success("تم إنشاء تسوية يدوية للتوصيل");
      setCourierAmount("");
      setCourierDesc("");
      queryClient.invalidateQueries({ queryKey: financeKeys.courierPayables });
      queryClient.invalidateQueries({ queryKey: financeKeys.courierLedger(companyId || "none") });
      queryClient.invalidateQueries({ queryKey: financeKeys.events() });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر إنشاء تسوية التوصيل اليدوية"),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "merchant" ? "default" : "outline"} onClick={() => setTab("merchant")}>تسويات التجار</Button>
        <Button size="sm" variant={tab === "courier" ? "default" : "outline"} onClick={() => setTab("courier")}>تسويات التوصيل</Button>
      </div>

      {tab === "merchant" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">تسوية يدوية للتاجر</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
              <option value="">اختر التاجر</option>
              {(merchantBalancesQuery.data?.balances ?? []).map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>)}
            </select>
            <div className="flex gap-2">
              <Button size="sm" variant={merchantDirection === "credit" ? "default" : "outline"} onClick={() => setMerchantDirection("credit")}>{DIRECTION_LABELS.credit}</Button>
              <Button size="sm" variant={merchantDirection === "debit" ? "default" : "outline"} onClick={() => setMerchantDirection("debit")}>{DIRECTION_LABELS.debit}</Button>
            </div>
            <Input placeholder="المبلغ" type="number" value={merchantAmount} onChange={(e) => setMerchantAmount(e.target.value)} />
            <Input placeholder="رمز السبب (إلزامي)" value={merchantReason} onChange={(e) => setMerchantReason(e.target.value)} />
            <Input placeholder="مرجع (اختياري)" value={merchantRef} onChange={(e) => setMerchantRef(e.target.value)} />
            <Textarea placeholder="الوصف" value={merchantDesc} onChange={(e) => setMerchantDesc(e.target.value)} />
            <Button
              onClick={() => {
                if (window.confirm("تأكيد إنشاء تسوية يدوية للتاجر؟")) createMerchantAdjustment.mutate();
              }}
              disabled={!merchantId || !merchantReason.trim() || Number(merchantAmount) <= 0 || createMerchantAdjustment.isPending}
            >
              إنشاء التسوية
            </Button>
            {!merchantId ? <p className="text-xs text-muted-foreground">اختر تاجرًا أولًا لتفعيل النموذج.</p> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">تسوية يدوية للتوصيل</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">اختر شركة التوصيل</option>
              {(courierPayablesQuery.data?.courier_payables ?? []).map((c) => <option key={c.delivery_company_id} value={c.delivery_company_id}>{c.delivery_company_name}</option>)}
            </select>
            <div className="flex gap-2">
              <Button size="sm" variant={courierDirection === "credit" ? "default" : "outline"} onClick={() => setCourierDirection("credit")}>{DIRECTION_LABELS.credit}</Button>
              <Button size="sm" variant={courierDirection === "debit" ? "default" : "outline"} onClick={() => setCourierDirection("debit")}>{DIRECTION_LABELS.debit}</Button>
            </div>
            <Input placeholder="المبلغ" type="number" value={courierAmount} onChange={(e) => setCourierAmount(e.target.value)} />
            <Input placeholder="رمز السبب (إلزامي)" value={courierReason} onChange={(e) => setCourierReason(e.target.value)} />
            <Textarea placeholder="الوصف" value={courierDesc} onChange={(e) => setCourierDesc(e.target.value)} />
            <Button
              onClick={() => {
                if (window.confirm("تأكيد إنشاء تسوية يدوية للتوصيل؟")) createCourierAdjustment.mutate();
              }}
              disabled={!companyId || !courierReason.trim() || Number(courierAmount) <= 0 || createCourierAdjustment.isPending}
            >
              إنشاء التسوية
            </Button>
            {!companyId ? <p className="text-xs text-muted-foreground">اختر شركة توصيل أولًا لتفعيل النموذج.</p> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
