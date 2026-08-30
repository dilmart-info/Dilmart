import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { PAYOUT_STATUS_LABELS, fmt } from "./finance-ui";
import { financeKeys, useCourierPayoutBatches, useFinanceCourierPayables, useFinanceMerchantBalances, useMerchantPayoutBatches } from "./useFinanceQueries";

export default function FinancePayouts() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"merchant" | "courier">("merchant");
  const [merchantId, setMerchantId] = useState("");
  const [merchantStart, setMerchantStart] = useState("");
  const [merchantEnd, setMerchantEnd] = useState("");
  const [merchantStatus, setMerchantStatus] = useState<"all" | "draft" | "approved" | "settled">("all");
  const [companyId, setCompanyId] = useState("");
  const [courierStart, setCourierStart] = useState("");
  const [courierEnd, setCourierEnd] = useState("");
  const [courierStatus, setCourierStatus] = useState<"all" | "draft" | "approved" | "settled" | "cancelled">("all");

  const merchantBalancesQuery = useFinanceMerchantBalances();
  const courierPayablesQuery = useFinanceCourierPayables();
  const merchantBatchesQuery = useMerchantPayoutBatches(merchantStatus, merchantId);
  const courierBatchesQuery = useCourierPayoutBatches(courierStatus, companyId);

  const createMerchantPayout = useMutation({
    mutationFn: () =>
      apiClient.createAdminPayoutBatch({
        merchant_id: merchantId,
        period_start: merchantStart ? `${merchantStart}T00:00:00.000Z` : undefined,
        period_end: merchantEnd ? `${merchantEnd}T23:59:59.999Z` : undefined,
      }),
    onSuccess: (result) => {
      toast.success(result.empty ? (result.message ?? "لا توجد قيود قابلة للدفع") : "تم إنشاء دفعة التاجر");
      queryClient.invalidateQueries({ queryKey: financeKeys.payoutBatches(merchantStatus, merchantId) });
      queryClient.invalidateQueries({ queryKey: financeKeys.merchantBalances });
      queryClient.invalidateQueries({ queryKey: financeKeys.merchantLedger(merchantId || "none") });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر إنشاء دفعة التاجر"),
  });

  const approveMerchantPayout = useMutation({
    mutationFn: (batchId: string) => apiClient.approveAdminPayoutBatch(batchId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.payoutBatches(merchantStatus, merchantId) }),
    onError: (err: any) => toast.error(err?.message ?? "تعذر اعتماد دفعة التاجر"),
  });
  const settleMerchantPayout = useMutation({
    mutationFn: (batchId: string) => apiClient.settleAdminPayoutBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.payoutBatches(merchantStatus, merchantId) });
      queryClient.invalidateQueries({ queryKey: financeKeys.merchantBalances });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر تسوية دفعة التاجر"),
  });

  const createCourierPayout = useMutation({
    mutationFn: () =>
      apiClient.createAdminCourierPayoutBatch({
        delivery_company_id: companyId,
        period_start: courierStart ? `${courierStart}T00:00:00.000Z` : undefined,
        period_end: courierEnd ? `${courierEnd}T23:59:59.999Z` : undefined,
      }),
    onSuccess: (result) => {
      toast.success(result.empty ? (result.message ?? "لا توجد قيود قابلة للدفع") : "تم إنشاء دفعة التوصيل");
      queryClient.invalidateQueries({ queryKey: financeKeys.courierPayoutBatches(courierStatus, companyId) });
      queryClient.invalidateQueries({ queryKey: financeKeys.courierPayables });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر إنشاء دفعة التوصيل"),
  });
  const approveCourierPayout = useMutation({
    mutationFn: (batchId: string) => apiClient.approveAdminCourierPayoutBatch(batchId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.courierPayoutBatches(courierStatus, companyId) }),
    onError: (err: any) => toast.error(err?.message ?? "تعذر اعتماد دفعة التوصيل"),
  });
  const settleCourierPayout = useMutation({
    mutationFn: (batchId: string) => apiClient.settleAdminCourierPayoutBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.courierPayoutBatches(courierStatus, companyId) });
      queryClient.invalidateQueries({ queryKey: financeKeys.courierPayables });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر تسوية دفعة التوصيل"),
  });
  const cancelCourierPayout = useMutation({
    mutationFn: (batchId: string) => apiClient.cancelAdminCourierPayoutBatch(batchId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.courierPayoutBatches(courierStatus, companyId) }),
    onError: (err: any) => toast.error(err?.message ?? "تعذر إلغاء دفعة التوصيل"),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={tab === "merchant" ? "default" : "outline"} onClick={() => setTab("merchant")}>دفعات التجار</Button>
        <Button size="sm" variant={tab === "courier" ? "default" : "outline"} onClick={() => setTab("courier")}>دفعات التوصيل</Button>
      </div>

      {tab === "merchant" ? (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">دفعات التجار</CardTitle>
            <div className="grid gap-2 md:grid-cols-4">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
                <option value="">اختر التاجر</option>
                {(merchantBalancesQuery.data?.balances ?? []).map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>)}
              </select>
              <Input type="date" value={merchantStart} onChange={(e) => setMerchantStart(e.target.value)} />
              <Input type="date" value={merchantEnd} onChange={(e) => setMerchantEnd(e.target.value)} />
              <Button
                onClick={() => {
                  if (window.confirm("تأكيد إنشاء دفعة جديدة للتاجر المحدد؟")) createMerchantPayout.mutate();
                }}
                disabled={!merchantId || createMerchantPayout.isPending}
              >
                إنشاء دفعة
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              {(["all", "draft", "approved", "settled"] as const).map((s) => (
                <Button key={s} size="sm" variant={merchantStatus === s ? "default" : "outline"} onClick={() => setMerchantStatus(s)}>
                  {PAYOUT_STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
            {(merchantBatchesQuery.data?.batches ?? []).map((batch: any) => (
              <div key={batch.id} className="rounded border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{batch.id.slice(0, 8)} • تاجر {String(batch.merchant_id ?? "").slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">الصافي {fmt(batch.net_amount)} | إضافات {fmt(batch.total_credits)} | خصومات {fmt(batch.total_debits)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">{batch.status}</Badge>
                    <Button size="sm" variant="outline" disabled={batch.status !== "draft" || approveMerchantPayout.isPending} onClick={() => window.confirm("تأكيد اعتماد هذه الدفعة؟") && approveMerchantPayout.mutate(batch.id)}>اعتماد</Button>
                    <Button size="sm" disabled={!["approved", "processing"].includes(batch.status) || settleMerchantPayout.isPending} onClick={() => window.confirm("تأكيد تسوية هذه الدفعة؟") && settleMerchantPayout.mutate(batch.id)}>تسوية</Button>
                  </div>
                </div>
              </div>
            ))}
            {!merchantBatchesQuery.isLoading && (merchantBatchesQuery.data?.batches ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد دفعات ضمن الفلتر الحالي.</p> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">دفعات التوصيل</CardTitle>
            <div className="grid gap-2 md:grid-cols-4">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">اختر شركة التوصيل</option>
                {(courierPayablesQuery.data?.courier_payables ?? []).map((c) => <option key={c.delivery_company_id} value={c.delivery_company_id}>{c.delivery_company_name}</option>)}
              </select>
              <Input type="date" value={courierStart} onChange={(e) => setCourierStart(e.target.value)} />
              <Input type="date" value={courierEnd} onChange={(e) => setCourierEnd(e.target.value)} />
              <Button
                onClick={() => {
                  if (window.confirm("تأكيد إنشاء دفعة توصيل جديدة؟")) createCourierPayout.mutate();
                }}
                disabled={!companyId || createCourierPayout.isPending}
              >
                إنشاء دفعة توصيل
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              {(["all", "draft", "approved", "settled", "cancelled"] as const).map((s) => (
                <Button key={s} size="sm" variant={courierStatus === s ? "default" : "outline"} onClick={() => setCourierStatus(s)}>
                  {PAYOUT_STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
            {(courierBatchesQuery.data?.batches ?? []).map((batch: any) => (
              <div key={batch.id} className="rounded border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{batch.id.slice(0, 8)} • {batch.delivery_companies?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">الصافي {fmt(batch.net_amount)} | إضافات {fmt(batch.total_credits)} | خصومات {fmt(batch.total_debits)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">{batch.status}</Badge>
                    <Button size="sm" variant="outline" disabled={batch.status !== "draft" || approveCourierPayout.isPending} onClick={() => window.confirm("تأكيد اعتماد دفعة التوصيل؟") && approveCourierPayout.mutate(batch.id)}>اعتماد</Button>
                    <Button size="sm" disabled={!["approved", "processing"].includes(batch.status) || settleCourierPayout.isPending} onClick={() => window.confirm("تأكيد تسوية دفعة التوصيل؟") && settleCourierPayout.mutate(batch.id)}>تسوية</Button>
                    <Button size="sm" variant="destructive" disabled={batch.status !== "draft" || cancelCourierPayout.isPending} onClick={() => window.confirm("تأكيد إلغاء هذه الدفعة؟") && cancelCourierPayout.mutate(batch.id)}>إلغاء</Button>
                  </div>
                </div>
              </div>
            ))}
            {!courierBatchesQuery.isLoading && (courierBatchesQuery.data?.batches ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد دفعات توصيل ضمن الفلاتر.</p> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
