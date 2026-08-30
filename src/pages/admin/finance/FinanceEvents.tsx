import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFinanceEvents, useFinanceMerchantBalances } from "./useFinanceQueries";

export default function FinanceEvents() {
  const [merchantId, setMerchantId] = useState("");
  const balancesQuery = useFinanceMerchantBalances();
  const eventsQuery = useFinanceEvents(merchantId || undefined, 200);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">سجل الأحداث المالية</CardTitle>
        <div className="grid gap-2 md:grid-cols-3">
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
            <option value="">كل التجار</option>
            {(balancesQuery.data?.balances ?? []).map((m) => <option key={m.merchant_id} value={m.merchant_id}>{m.merchant_name}</option>)}
          </select>
          <Input placeholder="فلترة معرف التاجر يدويًا (اختياري)" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
          <Button variant="outline" onClick={() => eventsQuery.refetch()}>تحديث</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {eventsQuery.isLoading ? <p className="text-sm text-muted-foreground">جاري تحميل الأحداث...</p> : null}
        {eventsQuery.isError ? <p className="text-sm text-destructive">تعذر تحميل سجل الأحداث. حاول مجددًا.</p> : null}
        {(eventsQuery.data?.events ?? []).map((evt: any) => (
          <div key={evt.id} className="rounded border px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{evt.event_type}</span>
              <span className="text-xs text-muted-foreground">{evt.created_at ? new Date(evt.created_at).toLocaleString("ar-IQ") : "—"}</span>
            </div>
            <p className="text-xs text-muted-foreground">التاجر: {evt.merchant_id ?? "—"} | الطلب: {evt.order_id ?? "—"}</p>
          </div>
        ))}
        {!eventsQuery.isLoading && (eventsQuery.data?.events ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أحداث مالية ضمن الفلاتر الحالية.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
