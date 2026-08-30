import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fmt } from "./finance-ui";
import { useFinanceOrders } from "./useFinanceQueries";

export default function FinanceOrders() {
  const [search, setSearch] = useState("");
  const [settlementStatus, setSettlementStatus] = useState("all");
  const ordersQuery = useFinanceOrders();

  const filteredOrders = useMemo(() => {
    const rows = ordersQuery.data?.orders ?? [];
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const statusMatch = settlementStatus === "all" || row.settlement_status === settlementStatus;
      if (!statusMatch) return false;
      if (!needle) return true;
      const hay = `${row.order_number} ${row.merchants?.display_name ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [ordersQuery.data?.orders, search, settlementStatus]);

  const settlementStatuses = useMemo(() => {
    const rows = ordersQuery.data?.orders ?? [];
    return Array.from(new Set(rows.map((r) => r.settlement_status).filter(Boolean)));
  }, [ordersQuery.data?.orders]);

  if (ordersQuery.isLoading) return <div className="text-sm text-muted-foreground">جاري تحميل تسوية الطلبات...</div>;
  if (ordersQuery.isError) return <div className="text-sm text-destructive">تعذر تحميل الطلبات المالية. حاول مجددًا.</div>;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">تسوية الطلبات المالية</CardTitle>
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="بحث برقم الطلب أو اسم التاجر..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={settlementStatus} onChange={(e) => setSettlementStatus(e.target.value)}>
            <option value="all">كل حالات التسوية</option>
            {settlementStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filteredOrders.map((row) => (
          <div key={row.id} className="rounded border p-3 text-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">{row.order_number}</div>
              <div className="flex gap-2">
                {Number(row.financial_snapshot_version ?? 0) === 0 ? <Badge variant="destructive">طلب قديم</Badge> : null}
                <Badge variant="outline">{row.settlement_status}</Badge>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <p>التاجر: <span className="font-medium">{row.merchants?.display_name ?? "—"}</span></p>
              <p>الدفع: <span className="font-medium">{row.payment_status}</span></p>
              <p>التحصيل: <span className="font-medium">{row.collection_status}</span></p>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <p>الإجمالي: <span className="font-medium">{fmt(row.gross_collected_amount)}</span></p>
              <p>صافي التاجر: <span className="font-medium">{fmt(row.merchant_net_amount)}</span></p>
              <Link to={`/admin/orders/${row.id}`}>
                <Button size="sm" variant="outline">فتح تفاصيل الطلب</Button>
              </Link>
            </div>
          </div>
        ))}
        {filteredOrders.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد طلبات مطابقة للفلاتر الحالية.</p> : null}
      </CardContent>
    </Card>
  );
}
