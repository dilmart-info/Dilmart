import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export default function AdminMerchantPlanAssignments() {
  const queryClient = useQueryClient();
  const [merchantId, setMerchantId] = useState("");
  const [planId, setPlanId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const merchantsQuery = useQuery({
    queryKey: ["admin-merchants-list-for-plan-assignments"],
    queryFn: () => apiClient.getAdminMerchants(),
  });
  const plansQuery = useQuery({
    queryKey: ["admin-merchant-plans-for-assignments"],
    queryFn: () => apiClient.listAdminMerchantPlans({ active: true }),
  });
  const assignmentsQuery = useQuery({
    queryKey: ["admin-merchant-plan-assignments-list"],
    queryFn: () => apiClient.listAdminMerchantPlanAssignments({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createAdminMerchantPlanAssignment({
        merchant_id: merchantId,
        plan_id: planId,
        start_at: startAt ? `${startAt}T00:00:00.000Z` : undefined,
        end_at: endAt ? `${endAt}T23:59:59.999Z` : null,
        is_active: true,
      }),
    onSuccess: () => {
      toast.success("تم تعيين الخطة للتاجر");
      setStartAt("");
      setEndAt("");
      queryClient.invalidateQueries({ queryKey: ["admin-merchants-list-for-plan-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-plan-assignments-list"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر تعيين الخطة"),
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Merchant Plan Assignments</h2>
      <Card>
        <CardHeader>
          <CardTitle>تعيين خطة لتاجر</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
            <option value="">اختر التاجر</option>
            {(merchantsQuery.data ?? []).map((merchant: any) => (
              <option key={merchant.id} value={merchant.id}>{merchant.display_name ?? merchant.slug ?? merchant.id}</option>
            ))}
          </select>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">اختر الخطة</option>
            {(plansQuery.data?.plans ?? []).map((plan: any) => (
              <option key={plan.id} value={plan.id}>{plan.name} ({plan.code})</option>
            ))}
          </select>
          <Input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          <Input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          <Button className="md:col-span-2" onClick={() => createMutation.mutate()} disabled={!merchantId || !planId || createMutation.isPending}>
            Assign Plan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(assignmentsQuery.data?.assignments ?? []).map((assignment: any) => (
            <div key={assignment.id} className="rounded border px-3 py-2 text-sm">
              <p className="font-medium">
                {assignment.merchants?.display_name ?? assignment.merchant_id} → {assignment.merchant_plans?.name ?? assignment.plan_id}
              </p>
              <p className="text-xs text-muted-foreground">
                code {assignment.merchant_plans?.code ?? "—"} | active {String(assignment.is_active)} | start {assignment.start_at ? new Date(assignment.start_at).toLocaleString("ar-IQ") : "—"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
