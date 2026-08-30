import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "./finance-ui";
import { useCourierLedger, useFinanceCourierCodSummary, useFinanceCourierOrders, useFinanceCourierPayables } from "./useFinanceQueries";

export default function FinanceCouriers() {
  const [companyId, setCompanyId] = useState("");
  const payablesQuery = useFinanceCourierPayables();
  const ordersQuery = useFinanceCourierOrders();
  const codSummaryQuery = useFinanceCourierCodSummary();
  const ledgerQuery = useCourierLedger(companyId);

  if (payablesQuery.isLoading || ordersQuery.isLoading || codSummaryQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">جاري تحميل بيانات التوصيل...</div>;
  }
  if (payablesQuery.isError || ordersQuery.isError || codSummaryQuery.isError) {
    return <div className="text-sm text-destructive">تعذر تحميل بيانات التسوية للتوصيل.</div>;
  }

  const payables = payablesQuery.data?.courier_payables ?? [];
  const orders = ordersQuery.data?.orders ?? [];
  const codRows = codSummaryQuery.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">عرض مستحقات شركات التوصيل</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {payables.map((c) => (
            <button
              type="button"
              key={c.delivery_company_id}
              onClick={() => setCompanyId(c.delivery_company_id)}
              className={`w-full rounded border px-3 py-2 text-sm text-right ${companyId === c.delivery_company_id ? "border-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.delivery_company_name}</span>
                <span className="text-muted-foreground">المتبقي: {fmt(c.outstanding_amount)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                متراكم {fmt(c.accrued_amount)} | قابل للدفع {fmt(c.payable_amount)} | ضمن دفعة {fmt(c.in_payout_amount)} | مسوّى {fmt(c.settled_amount)}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">تسوية طلبات التوصيل</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {orders.map((row) => (
            <div key={row.id} className="rounded border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">{row.order_number} • {row.delivery_companies?.name ?? "—"}</p>
                <Badge variant="outline">{row.courier_settlement_status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                mode {(row.courier_cod_remittance_mode ?? "gross_remittance")} | مستحق التوصيل {fmt(row.courier_fee_payable)}
              </p>
              <p className="text-xs text-muted-foreground">
                gross {fmt(Number(row.cash_gross_expected_amount ?? 0))} | retained {fmt(Number(row.courier_fee_retained_amount ?? 0))}
              </p>
              <p className="text-xs text-muted-foreground">
                net expected {fmt(Number(row.cash_net_expected_from_courier ?? 0))} | actual {fmt(Number(row.cash_actual_remitted_amount ?? 0))} | diff{" "}
                {fmt(Number(row.cash_remittance_difference ?? 0))}
              </p>
            </div>
          ))}
          {orders.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد طلبات توصيل حالياً.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">ملخص COD للشركات</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {codRows.map((row) => (
            <div key={row.delivery_company_id} className="rounded border px-3 py-2 text-sm">
              <p className="font-medium">{row.delivery_company_name}</p>
              <p className="text-xs text-muted-foreground">
                gross {fmt(row.gross_collected_total)} | retained {fmt(row.courier_retained_total)} | net expected {fmt(row.net_expected_total)}
              </p>
              <p className="text-xs text-muted-foreground">
                actual remitted {fmt(row.actual_remitted_total)} | diff {fmt(row.difference_total)}
              </p>
              <p className="text-xs text-muted-foreground">
                offset-settled {fmt(row.offset_settled_courier_fees)} | payout-payable {fmt(row.payout_payable_courier_fees)}
              </p>
            </div>
          ))}
          {codRows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد بيانات COD حالياً.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">كشف حساب التوصيل</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!companyId ? <p className="text-sm text-muted-foreground">اختر شركة توصيل لعرض كشف الحساب.</p> : null}
          {ledgerQuery.isLoading ? <p className="text-sm text-muted-foreground">جاري تحميل كشف الحساب...</p> : null}
          {ledgerQuery.isError ? <p className="text-sm text-destructive">تعذر تحميل كشف حساب الشركة المحددة.</p> : null}
          {(ledgerQuery.data?.entries ?? []).map((entry: any) => (
            <div key={entry.id} className="rounded border px-3 py-2 text-sm">
              <p className="font-medium">{entry.entry_type} • {entry.orders?.order_number ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{entry.direction === "credit" ? "+" : "-"} {fmt(entry.amount)} • {entry.status}</p>
            </div>
          ))}
          {companyId && !ledgerQuery.isLoading && (ledgerQuery.data?.entries ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد قيود للشركة المحددة.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
