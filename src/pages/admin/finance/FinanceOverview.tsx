import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "./finance-ui";
import { useFinanceCourierPayables, useFinanceMerchantBalances, useFinanceOrders } from "./useFinanceQueries";

export default function FinanceOverview() {
  const ordersQuery = useFinanceOrders();
  const merchantBalancesQuery = useFinanceMerchantBalances();
  const courierPayablesQuery = useFinanceCourierPayables();

  const totals = useMemo(() => {
    const orders = (ordersQuery.data?.orders ?? []).filter((o) => Number(o.financial_snapshot_version ?? 0) > 0);
    return {
      grossCollected: orders.reduce((s, o) => s + Number(o.gross_collected_amount ?? 0), 0),
      merchantNet: orders.reduce((s, o) => s + Number(o.merchant_net_amount ?? 0), 0),
      platformCommission: orders.reduce((s, o) => s + Number(o.platform_commission_amount ?? 0), 0),
      courierPayable: orders.reduce((s, o) => s + Number(o.courier_fee_payable ?? 0), 0),
    };
  }, [ordersQuery.data?.orders]);

  const merchantSummary = useMemo(() => {
    const balances = merchantBalancesQuery.data?.balances ?? [];
    return {
      accrued: balances.reduce((s, m) => s + Number(m.accrued_total ?? 0), 0),
      payable: balances.reduce((s, m) => s + Number(m.payable_total ?? 0), 0),
      inPayout: balances.reduce((s, m) => s + Number(m.in_payout_total ?? 0), 0),
      settled: balances.reduce((s, m) => s + Number(m.settled_total ?? 0), 0),
    };
  }, [merchantBalancesQuery.data?.balances]);

  const courierSummary = useMemo(() => {
    const rows = courierPayablesQuery.data?.courier_payables ?? [];
    return {
      accrued: rows.reduce((s, c) => s + Number(c.accrued_amount ?? 0), 0),
      payable: rows.reduce((s, c) => s + Number(c.payable_amount ?? 0), 0),
      inPayout: rows.reduce((s, c) => s + Number(c.in_payout_amount ?? 0), 0),
      settled: rows.reduce((s, c) => s + Number(c.settled_amount ?? 0), 0),
    };
  }, [courierPayablesQuery.data?.courier_payables]);

  if (ordersQuery.isLoading || merchantBalancesQuery.isLoading || courierPayablesQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">جاري تحميل لوحة النظرة العامة المالية...</div>;
  }

  if (ordersQuery.isError || merchantBalancesQuery.isError || courierPayablesQuery.isError) {
    return <div className="text-sm text-destructive">تعذر تحميل بيانات النظرة العامة. يرجى المحاولة مرة أخرى.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">إجمالي المقبوضات</p><p className="text-2xl font-bold">{fmt(totals.grossCollected)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">صافي التاجر</p><p className="text-2xl font-bold">{fmt(totals.merchantNet)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">عمولة المنصة</p><p className="text-2xl font-bold">{fmt(totals.platformCommission)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">مستحق شركة التوصيل</p><p className="text-2xl font-bold">{fmt(totals.courierPayable)}</p></CardContent></Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">ملخص أرصدة التجار</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1 text-muted-foreground">
            <p>متراكم: {fmt(merchantSummary.accrued)}</p>
            <p>قابل للدفع: {fmt(merchantSummary.payable)}</p>
            <p>ضمن دفعة: {fmt(merchantSummary.inPayout)}</p>
            <p>مسوّى: {fmt(merchantSummary.settled)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">ملخص مستحقات التوصيل</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1 text-muted-foreground">
            <p>متراكم: {fmt(courierSummary.accrued)}</p>
            <p>قابل للدفع: {fmt(courierSummary.payable)}</p>
            <p>ضمن دفعة: {fmt(courierSummary.inPayout)}</p>
            <p>مسوّى: {fmt(courierSummary.settled)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
