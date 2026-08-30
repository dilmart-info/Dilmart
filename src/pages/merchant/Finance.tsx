import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { apiClient } from "@/lib/api-client";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = ["all", "accrued", "payable", "in_payout", "settled", "reversed"] as const;
const ENTRY_TYPE_LABELS: Record<string, string> = {
  order_accrual: "استحقاق طلب",
  commission_charge: "عمولة المنصة",
  assisted_fee_charge: "رسوم المساعدة",
  delivery_deduction: "خصم التوصيل",
  refund_reversal: "عكس/استرجاع",
  manual_adjustment: "تسوية يدوية",
  payout: "دفعة تسوية",
  payout_reversal: "عكس دفعة",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "معلّق",
  accrued: "متراكم",
  payable: "قابل للدفع",
  in_payout: "ضمن دفعة",
  settled: "مسوّى",
  reversed: "معكوس",
  disputed: "متنازع",
  draft: "مسودة",
  approved: "معتمد",
  processing: "قيد المعالجة",
  cancelled: "ملغي",
};

export default function MerchantFinance() {
  const { data: membership, isLoading } = useCurrentMerchant();
  const merchantId = (membership as any)?.merchant_id as string | undefined;
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statementPage, setStatementPage] = useState(0);
  const [payoutPage, setPayoutPage] = useState(0);
  const statementPageSize = 20;
  const payoutPageSize = 10;

  const financeSummary = useQuery({
    queryKey: ["merchant-finance-summary", merchantId],
    enabled: !!merchantId,
    queryFn: () => apiClient.getMerchantFinanceSummary(merchantId!),
  });

  const statement = useQuery({
    queryKey: ["merchant-finance-statement", merchantId, status, fromDate, toDate, statementPage],
    enabled: !!merchantId,
    queryFn: () =>
      apiClient.getMerchantFinanceStatement(merchantId!, {
        limit: statementPageSize,
        offset: statementPage * statementPageSize,
        status: status === "all" ? undefined : status,
        from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
        to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
      }),
  });

  const payoutHistory = useQuery({
    queryKey: ["merchant-finance-payout-history", merchantId, fromDate, toDate, payoutPage],
    enabled: !!merchantId,
    queryFn: () =>
      apiClient.getMerchantPayoutHistory(merchantId!, {
        limit: payoutPageSize,
        offset: payoutPage * payoutPageSize,
        from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined,
        to: toDate ? `${toDate}T23:59:59.999Z` : undefined,
      }),
  });

  const statementRows = useMemo(() => statement.data?.entries ?? [], [statement.data?.entries]);

  if (isLoading) return <div>جاري التحميل...</div>;
  if (!merchantId) return <div className="text-muted-foreground">لا يوجد متجر مرتبط بحسابك.</div>;

  const exportStatementCsv = () => {
    const rows = statementRows;
    const header = ["التاريخ", "نوع القيد", "الاتجاه", "المبلغ", "الحالة", "رقم الطلب", "الوصف"];
    const lines = rows.map((r) =>
      [
        r.effective_at ?? r.created_at,
        ENTRY_TYPE_LABELS[r.entry_type] ?? r.entry_type,
        r.direction === "credit" ? "دائن" : "مدين",
        Number(r.amount ?? 0),
        STATUS_LABELS[r.status] ?? r.status,
        r.order_id ?? "",
        (r.description ?? "").replaceAll(",", " "),
      ].join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `merchant_statement_${merchantId}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">المالية والتسوية</h2>
        <p className="text-muted-foreground mt-1">ملخص المستحقات وكشف الحساب وسجل الدفعات.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">متراكم</p><p className="text-2xl font-bold">{formatPrice(financeSummary.data?.total_accrued ?? 0)}</p></CardContent></Card>
        <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">قابل للدفع</p><p className="text-2xl font-bold">{formatPrice(financeSummary.data?.total_payable ?? 0)}</p></CardContent></Card>
        <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">ضمن دفعة</p><p className="text-2xl font-bold">{formatPrice(financeSummary.data?.total_in_payout ?? 0)}</p></CardContent></Card>
        <Card className="border-none shadow-sm"><CardContent className="pt-6"><p className="text-xs text-muted-foreground">الرصيد المعلّق</p><p className="text-2xl font-bold">{formatPrice(financeSummary.data?.outstanding_balance ?? 0)}</p></CardContent></Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg">كشف الحساب</CardTitle>
          <div className="flex flex-wrap gap-2">
            <input type="date" className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-700" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input type="date" className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-700" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Button size="sm" variant="outline" onClick={exportStatementCsv}>تصدير CSV</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                onClick={() => {
                  setStatus(s);
                  setStatementPage(0);
                }}
              >
                {s === "all" ? "الكل" : STATUS_LABELS[s] ?? s}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {statementRows.map((row) => (
            <div key={row.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">{ENTRY_TYPE_LABELS[row.entry_type] ?? row.entry_type}</div>
                <Badge variant={row.direction === "credit" ? "secondary" : "outline"}>{STATUS_LABELS[row.status] ?? row.status}</Badge>
              </div>
              <p className="text-muted-foreground">
                {row.direction === "credit" ? "+" : "-"} {formatPrice(row.amount)} {row.order_id ? `• طلب ${row.order_id.slice(0, 8)}` : ""}
              </p>
            </div>
          ))}
          {!statement.isLoading && statementRows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد قيود ضمن الفلتر الحالي.</p> : null}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">الإجمالي: {statement.data?.total ?? 0}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={statementPage === 0} onClick={() => setStatementPage((p) => Math.max(0, p - 1))}>
                السابق
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={(statement.data?.offset ?? 0) + (statement.data?.limit ?? statementPageSize) >= (statement.data?.total ?? 0)}
                onClick={() => setStatementPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader><CardTitle className="text-lg">سجل دفعات التسوية</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(payoutHistory.data?.payouts ?? []).map((payout) => (
            <div key={payout.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">{payout.id.slice(0, 8)}</div>
                <Badge variant="outline">{STATUS_LABELS[payout.status] ?? payout.status}</Badge>
              </div>
              <p className="text-muted-foreground">
                صافي {formatPrice(payout.net_amount)} • دائن {formatPrice(payout.total_credits)} • مدين {formatPrice(payout.total_debits)}
              </p>
            </div>
          ))}
          {!payoutHistory.isLoading && (payoutHistory.data?.payouts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد سجل دفعات حتى الآن.</p>
          ) : null}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">الإجمالي: {payoutHistory.data?.total ?? 0}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={payoutPage === 0} onClick={() => setPayoutPage((p) => Math.max(0, p - 1))}>
                السابق
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={(payoutHistory.data?.offset ?? 0) + (payoutHistory.data?.limit ?? payoutPageSize) >= (payoutHistory.data?.total ?? 0)}
                onClick={() => setPayoutPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
