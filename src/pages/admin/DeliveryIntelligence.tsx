import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const reasonLabel: Record<string, string> = {
  sla_breached: "SLA breached",
  stuck_in_status: "Stuck in current status",
  agent_high_fail_rate: "Agent high fail rate",
  company_high_return_rate: "Company high return rate",
  late_pickup: "Late pickup risk",
  long_cycle_time: "Long cycle time",
};

export default function DeliveryIntelligence() {
  const [limit, setLimit] = useState(100);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const queueFilters = useMemo(() => ({ limit }), [limit]);

  const queueQuery = useQuery({
    queryKey: ["delivery-intelligence-queue", queueFilters],
    queryFn: () => apiClient.listDeliveryIntelligenceQueue(queueFilters),
  });

  const selectedOrderQuery = useQuery({
    queryKey: ["delivery-intelligence-order", selectedOrderId],
    queryFn: () => apiClient.getOrderDeliveryIntelligence(selectedOrderId!),
    enabled: Boolean(selectedOrderId),
  });

  const rows = queueQuery.data?.rows ?? [];
  const topRiskyOrders = rows.slice(0, 10);
  const slaBreachedOrders = rows.filter((row) => row.reasons.includes("sla_breached")).slice(0, 10);

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle>M21 — Delivery Intelligence (Read-Only)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>عدد الطلبات</Label>
            <Input type="number" min={1} max={300} value={limit} onChange={(e) => setLimit(Number(e.target.value || 100))} />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Label>تحديث</Label>
            <Button className="w-full" onClick={() => queueQuery.refetch()}>
              Refresh Queue
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Risky Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {queueQuery.isLoading ? <p className="text-sm text-muted-foreground">جاري التحميل...</p> : null}
          {topRiskyOrders.map((row) => (
            <div key={row.order_id} className="border rounded-md p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Order: {row.order_id.slice(0, 8)}...</div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.risk_score >= 70 ? "destructive" : row.risk_score >= 40 ? "secondary" : "outline"}>
                    Score {row.risk_score}
                  </Badge>
                  <Badge variant="outline">{row.delivery_status}</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Company ID: {row.assigned_company_id ?? "—"} / Agent ID: {row.assigned_agent_id ?? "—"}
              </div>
              <div className="flex flex-wrap gap-2">
                {(row.reasons ?? []).map((code) => (
                  <Badge key={code} variant="outline">
                    {reasonLabel[code] ?? code}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedOrderId(row.order_id)}>View Intelligence</Button>
              </div>
            </div>
          ))}
          {!queueQuery.isLoading && topRiskyOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد طلبات ضمن نطاق الخطورة الحالي.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SLA Breached List</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {slaBreachedOrders.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد طلبات مكسورة SLA حاليًا.</p> : null}
          {slaBreachedOrders.map((row) => (
            <div key={`sla-${row.order_id}`} className="border rounded-md p-3 text-sm flex items-center justify-between gap-2">
              <span>{row.order_id.slice(0, 8)}... / {row.delivery_status}</span>
              <Badge variant="destructive">SLA Breached</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {selectedOrderId ? (
        <Card>
          <CardHeader>
            <CardTitle>Order Intelligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedOrderQuery.isLoading ? <p className="text-sm text-muted-foreground">جاري التحميل...</p> : null}
            {selectedOrderQuery.data?.risk ? (
              <div className="border rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={selectedOrderQuery.data.risk.score >= 70 ? "destructive" : selectedOrderQuery.data.risk.score >= 40 ? "secondary" : "outline"}>
                    Score {selectedOrderQuery.data.risk.score}
                  </Badge>
                  <Badge variant="outline">{selectedOrderQuery.data.risk.level}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">Order: {selectedOrderQuery.data.order.order_id}</div>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {(selectedOrderQuery.data.risk.reasons ?? []).map((code) => (
                    <Badge key={code} variant="outline">{reasonLabel[code] ?? code}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {(selectedOrderQuery.data?.recommendations ?? []).map((rec) => (
              <div key={`${rec.type}-${rec.reason}`} className="border rounded-md p-3 space-y-1">
                <div className="font-medium">{rec.type}</div>
                <div className="text-sm text-muted-foreground">{rec.reason}</div>
                <div className="text-xs">Confidence: {Math.round(rec.confidence * 100)}%</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

