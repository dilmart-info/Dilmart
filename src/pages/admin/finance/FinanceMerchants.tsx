import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmt, STATUS_LABELS } from "./finance-ui";
import { useFinanceMerchantBalances, useMerchantLedger } from "./useFinanceQueries";

export default function FinanceMerchants() {
  const [merchantId, setMerchantId] = useState("");
  const balancesQuery = useFinanceMerchantBalances();
  const ledgerQuery = useMerchantLedger(merchantId);

  if (balancesQuery.isLoading) return <div className="text-sm text-muted-foreground">جاري تحميل أرصدة التجار...</div>;
  if (balancesQuery.isError) return <div className="text-sm text-destructive">تعذر تحميل أرصدة التجار.</div>;

  const balances = balancesQuery.data?.balances ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">عرض أرصدة التجار</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {balances.map((m) => (
            <button
              type="button"
              key={m.merchant_id}
              onClick={() => setMerchantId(m.merchant_id)}
              className={`w-full rounded border px-3 py-2 text-sm text-right ${merchantId === m.merchant_id ? "border-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{m.merchant_name}</span>
                <span className="text-muted-foreground">المتبقي: {fmt(m.outstanding_total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">متراكم {fmt(m.accrued_total)} | قابل للدفع {fmt(m.payable_total)} | ضمن دفعة {fmt(m.in_payout_total)} | مسوّى {fmt(m.settled_total)}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">كشف قيود التاجر</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!merchantId ? <p className="text-sm text-muted-foreground">اختر تاجرًا لعرض القيود.</p> : null}
          {ledgerQuery.isLoading ? <p className="text-sm text-muted-foreground">جاري تحميل القيود...</p> : null}
          {ledgerQuery.isError ? <p className="text-sm text-destructive">تعذر تحميل كشف القيود.</p> : null}
          {(ledgerQuery.data?.entries ?? []).map((entry: any) => (
            <div key={entry.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{entry.entry_type}</p>
                <Badge variant="outline">{STATUS_LABELS[entry.status] ?? entry.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {entry.direction === "credit" ? "+" : "-"} {fmt(entry.amount)} | {entry.created_at ? new Date(entry.created_at).toLocaleString("ar-IQ") : "—"}
              </p>
            </div>
          ))}
          {merchantId && !ledgerQuery.isLoading && (ledgerQuery.data?.entries ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد قيود لهذا التاجر.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
