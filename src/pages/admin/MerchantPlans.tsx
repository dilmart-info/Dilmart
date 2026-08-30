import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export default function AdminMerchantPlans() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed" | "hybrid">("percentage");
  const [commissionRate, setCommissionRate] = useState("");
  const [assistedFeeRate, setAssistedFeeRate] = useState("");
  const [platformFeeRate, setPlatformFeeRate] = useState("");
  const [deliveryBillingMode, setDeliveryBillingMode] = useState<"customer_pays" | "merchant_pays" | "mixed">("customer_pays");

  const plansQuery = useQuery({
    queryKey: ["admin-merchant-plans"],
    queryFn: () => apiClient.listAdminMerchantPlans(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createAdminMerchantPlan({
        name,
        code,
        default_commission_type: commissionType,
        default_commission_rate: Number(commissionRate || 0),
        default_assisted_fee_rate: Number(assistedFeeRate || 0),
        default_platform_fee_rate: Number(platformFeeRate || 0),
        default_delivery_billing_mode: deliveryBillingMode,
      }),
    onSuccess: () => {
      toast.success("تم إنشاء الخطة التجارية");
      setName("");
      setCode("");
      setCommissionRate("");
      setAssistedFeeRate("");
      setPlatformFeeRate("");
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-plans"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر إنشاء الخطة"),
  });

  const toggleMutation = useMutation({
    mutationFn: (plan: any) => apiClient.updateAdminMerchantPlan(plan.id, { is_active: !plan.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-merchant-plans"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر تحديث حالة الخطة"),
  });
  const commissionTypeLabel: Record<"percentage" | "fixed" | "hybrid", string> = {
    percentage: "نسبة مئوية",
    fixed: "قيمة ثابتة",
    hybrid: "مختلط",
  };
  const deliveryBillingModeLabel: Record<"customer_pays" | "merchant_pays" | "mixed", string> = {
    customer_pays: "العميل يدفع",
    merchant_pays: "التاجر يدفع",
    mixed: "مختلط",
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">خطط التجار</h2>
      <Card>
        <CardHeader>
          <CardTitle>إنشاء خطة جديدة</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <Input placeholder="اسم الخطة" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="الكود (basic/pro/premium)" value={code} onChange={(e) => setCode(e.target.value)} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={commissionType} onChange={(e) => setCommissionType(e.target.value as any)}>
            <option value="percentage">{commissionTypeLabel.percentage}</option>
            <option value="fixed">{commissionTypeLabel.fixed}</option>
            <option value="hybrid">{commissionTypeLabel.hybrid}</option>
          </select>
          <Input placeholder="معدل العمولة الافتراضي" type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
          <Input placeholder="رسوم المساعدة الافتراضية" type="number" value={assistedFeeRate} onChange={(e) => setAssistedFeeRate(e.target.value)} />
          <Input placeholder="رسوم المنصة الافتراضية" type="number" value={platformFeeRate} onChange={(e) => setPlatformFeeRate(e.target.value)} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={deliveryBillingMode} onChange={(e) => setDeliveryBillingMode(e.target.value as any)}>
            <option value="customer_pays">{deliveryBillingModeLabel.customer_pays}</option>
            <option value="merchant_pays">{deliveryBillingModeLabel.merchant_pays}</option>
            <option value="mixed">{deliveryBillingModeLabel.mixed}</option>
          </select>
          <Button className="md:col-span-2" onClick={() => createMutation.mutate()} disabled={!name.trim() || !code.trim() || createMutation.isPending}>
            إنشاء الخطة
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الخطط</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(plansQuery.data?.plans ?? []).map((plan: any) => (
            <div key={plan.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{plan.name} ({plan.code})</p>
                <p className="text-xs text-muted-foreground">
                  العمولة {commissionTypeLabel[plan.default_commission_type as "percentage" | "fixed" | "hybrid"] ?? plan.default_commission_type}:{plan.default_commission_rate} | المساعدة {plan.default_assisted_fee_rate} | المنصة {plan.default_platform_fee_rate}
                </p>
              </div>
              <Button size="sm" variant={plan.is_active ? "outline" : "default"} onClick={() => toggleMutation.mutate(plan)} disabled={toggleMutation.isPending}>
                {plan.is_active ? "تعطيل" : "تفعيل"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
