import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DELIVERY_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "pending_assignment", label: "بانتظار التعيين" },
  { value: "assigned_to_company", label: "معيّن لشركة" },
  { value: "assigned_to_agent", label: "معيّن لمندوب" },
  { value: "picked_up", label: "تم الاستلام" },
  { value: "in_transit", label: "قيد التوصيل" },
  { value: "delivered", label: "تم التسليم" },
  { value: "failed", label: "فشل التوصيل" },
  { value: "returned", label: "مرتجع" },
  { value: "cancelled", label: "ملغي" },
];

export default function DeliveryOps() {
  const [deliveryStatus, setDeliveryStatus] = useState("all");
  const [deliveryCompanyId, setDeliveryCompanyId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [slaBreachedOnly, setSlaBreachedOnly] = useState(false);

  const { data: deliveryCompanies } = useQuery({
    queryKey: ["delivery-companies-list"],
    queryFn: () => apiClient.getDeliveryCompanies(),
  });

  const { data: agents } = useQuery({
    queryKey: ["admin-agents-list"],
    queryFn: () => apiClient.getAgentsList(),
  });

  const filters = useMemo(
    () => ({
      delivery_status: deliveryStatus,
      delivery_company_id: deliveryCompanyId || undefined,
      agent_id: agentId || undefined,
      sla_breached: slaBreachedOnly ? "true" : undefined,
      limit: 300,
    }),
    [deliveryStatus, deliveryCompanyId, agentId, slaBreachedOnly],
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-delivery-ops", filters],
    queryFn: () => apiClient.listAdminDeliveryOps(filters),
  });

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle>تشغيل التوصيل (M19)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label>حالة التوصيل</Label>
            <Select value={deliveryStatus} onValueChange={setDeliveryStatus}>
              <SelectTrigger className="w-full bg-background text-foreground">
                <SelectValue placeholder="اختر الحالة" />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>شركة التوصيل</Label>
            <Select
              value={deliveryCompanyId || "all"}
              onValueChange={(v) => setDeliveryCompanyId(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-full bg-background text-foreground">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(deliveryCompanies ?? []).map((company: any) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>المندوب</Label>
            <Select value={agentId || "all"} onValueChange={(v) => setAgentId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-full bg-background text-foreground">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(agents ?? []).map((agent: any) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.full_name ?? agent.email ?? agent.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>SLA</Label>
            <Button variant={slaBreachedOnly ? "default" : "outline"} className="w-full" onClick={() => setSlaBreachedOnly((v) => !v)}>
              {slaBreachedOnly ? "المتأخر فقط" : "كل الطلبات"}
            </Button>
          </div>
          <div className="space-y-1">
            <Label>تحديث</Label>
            <Button className="w-full" onClick={() => refetch()}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>طلبات التوصيل</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : (
            (data?.rows ?? []).map((row: any) => (
              <div key={row.id} className="border rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="space-y-1">
                  <div className="font-semibold">#{row.order_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.delivery_companies?.name ?? "—"} / {row.profiles?.full_name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">COD: {formatPrice(Number(row.cash_expected_amount ?? 0))}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{row.delivery_status ?? "pending_assignment"}</Badge>
                  {row.delivery_sla_breached ? <Badge variant="destructive">SLA Breached</Badge> : null}
                  <Link to={`/admin/orders/${row.id}`}>
                    <Button size="sm" variant="outline">
                      فتح الطلب
                    </Button>
                  </Link>
                </div>
              </div>
            ))
          )}
          {!isLoading && (data?.rows ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد طلبات حسب الفلاتر الحالية.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

