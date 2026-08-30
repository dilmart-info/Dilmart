import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmt, STATUS_LABELS } from "./finance-ui";
import { apiClient } from "@/lib/api-client";
import { financeKeys, useCourierLedger, useFinanceCourierPayables, useFinanceMerchantBalances, useMerchantLedger } from "./useFinanceQueries";

export default function FinanceReversals() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"merchant" | "courier">("merchant");
  const [merchantId, setMerchantId] = useState("");
  const [merchantReason, setMerchantReason] = useState("MANUAL_REVIEW_REVERSAL");
  const [merchantDesc, setMerchantDesc] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [courierReason, setCourierReason] = useState("COURIER_REVIEW_REVERSAL");

  const merchantBalancesQuery = useFinanceMerchantBalances();
  const courierPayablesQuery = useFinanceCourierPayables();
  const merchantLedgerQuery = useMerchantLedger(merchantId);
  const courierLedgerQuery = useCourierLedger(companyId);

  const reverseMerchant = useMutation({
    mutationFn: (entryId: string) => apiClient.reverseAdminFinanceEntry(entryId, { reason_code: merchantReason, description: merchantDesc || null }),
    onSuccess: () => {
      toast.success("تم عكس القيد المالي للتاجر");
      queryClient.invalidateQueries({ queryKey: financeKeys.merchantLedger(merchantId || "none") });
      queryClient.invalidateQueries({ queryKey: financeKeys.merchantBalances });
      queryClient.invalidateQueries({ queryKey: financeKeys.events(merchantId) });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر عكس القيد"),
  });

  const reverseCourier = useMutation({
    mutationFn: (entryId: string) => apiClient.reverseAdminCourierLedgerEntry(entryId, { reason_code: courierReason }),
    onSuccess: () => {
      toast.success("تم عكس قيد التوصيل");
      queryClient.invalidateQueries({ queryKey: financeKeys.courierLedger(companyId || "none") });
      queryClient.invalidateQueries({ queryKey: financeKeys.courierPayables });
      queryClient.invalidateQueries({ queryKey: financeKeys.events() });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر عكس قيد التوصيل"),
  });

  const merchantEntries = (merchantLedgerQuery.data?.entries ?? []).filter((entry: any) => entry.status !== "reversed" && entry.status !== "settled");
  const courierEntries = (courierLedgerQuery.data?.entries ?? []).filter((entry: any) => entry.status !== "reversed" && entry.status !== "settled");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "merchant" ? "default" : "outline"} onClick={() => setTab("merchant")}>عكس قيود التجار</Button>
        <Button size="sm" variant={tab === "courier" ? "default" : "outline"} onClick={() => setTab("courier")}>عكس قيود التوصيل</Button>
      </div>

      {tab === "merchant" ? (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">عكس قيود التجار</CardTitle>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
              <option value="">اختر التاجر</option>
              {(merchantBalancesQuery.data?.balances ?? []).map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>)}
            </select>
            <Input placeholder="رمز سبب العكس" value={merchantReason} onChange={(e) => setMerchantReason(e.target.value)} />
            <Input placeholder="وصف العكس (اختياري)" value={merchantDesc} onChange={(e) => setMerchantDesc(e.target.value)} />
          </CardHeader>
          <CardContent className="space-y-2">
            {!merchantId ? <p className="text-sm text-muted-foreground">اختر تاجرًا لعرض القيود القابلة للعكس.</p> : null}
            {merchantLedgerQuery.isLoading ? <p className="text-sm text-muted-foreground">جاري تحميل القيود...</p> : null}
            {merchantEntries.map((entry: any) => (
              <div key={entry.id} className="rounded border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{entry.entry_type}</p>
                    <p className="text-xs text-muted-foreground">{entry.direction === "credit" ? "+" : "-"} {fmt(entry.amount)} • {STATUS_LABELS[entry.status] ?? entry.status}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reverseMerchant.isPending || !merchantReason.trim()}
                    onClick={() => window.confirm("تأكيد عكس هذا القيد؟") && reverseMerchant.mutate(entry.id)}
                  >
                    عكس
                  </Button>
                </div>
              </div>
            ))}
            {merchantId && !merchantLedgerQuery.isLoading && merchantEntries.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد قيود قابلة للعكس.</p> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">عكس قيود التوصيل</CardTitle>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">اختر شركة التوصيل</option>
              {(courierPayablesQuery.data?.courier_payables ?? []).map((c) => <option key={c.delivery_company_id} value={c.delivery_company_id}>{c.delivery_company_name}</option>)}
            </select>
            <Input placeholder="رمز سبب العكس" value={courierReason} onChange={(e) => setCourierReason(e.target.value)} />
          </CardHeader>
          <CardContent className="space-y-2">
            {!companyId ? <p className="text-sm text-muted-foreground">اختر شركة توصيل لعرض القيود القابلة للعكس.</p> : null}
            {courierLedgerQuery.isLoading ? <p className="text-sm text-muted-foreground">جاري تحميل القيود...</p> : null}
            {courierEntries.map((entry: any) => (
              <div key={entry.id} className="rounded border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{entry.entry_type} • {entry.orders?.order_number ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{entry.direction === "credit" ? "+" : "-"} {fmt(entry.amount)} • {STATUS_LABELS[entry.status] ?? entry.status}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reverseCourier.isPending || !courierReason.trim()}
                    onClick={() => window.confirm("تأكيد عكس هذا القيد؟") && reverseCourier.mutate(entry.id)}
                  >
                    عكس
                  </Button>
                </div>
              </div>
            ))}
            {companyId && !courierLedgerQuery.isLoading && courierEntries.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد قيود قابلة للعكس.</p> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
