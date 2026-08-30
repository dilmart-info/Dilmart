import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

const RULE_TYPE_LABELS: Record<"commission" | "assisted_fee" | "platform_fee" | "delivery_billing", string> = {
  commission: "العمولة",
  assisted_fee: "رسوم المساعدة",
  platform_fee: "رسوم المنصة",
  delivery_billing: "تحصيل التوصيل",
};
const SCOPE_TYPE_LABELS: Record<"global" | "merchant" | "category" | "channel" | "merchant_category" | "merchant_channel", string> = {
  global: "عام",
  merchant: "تاجر",
  category: "قسم",
  channel: "قناة",
  merchant_category: "تاجر + قسم",
  merchant_channel: "تاجر + قناة",
};
const VALUE_TYPE_LABELS: Record<"percentage" | "fixed", string> = {
  percentage: "نسبة مئوية",
  fixed: "قيمة ثابتة",
};

export default function AdminCommercialRules() {
  const queryClient = useQueryClient();
  const [ruleType, setRuleType] = useState<"commission" | "assisted_fee" | "platform_fee" | "delivery_billing">("commission");
  const [scopeType, setScopeType] = useState<"global" | "merchant" | "category" | "channel" | "merchant_category" | "merchant_channel">("global");
  const [name, setName] = useState("");
  const [scopeReferenceId, setScopeReferenceId] = useState("");
  const [priority, setPriority] = useState("0");
  const [valueType, setValueType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [conditionsJson, setConditionsJson] = useState("{}");
  const [filterRuleType, setFilterRuleType] = useState("");
  const [filterScopeType, setFilterScopeType] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const rulesQuery = useQuery({
    queryKey: ["admin-commercial-rules", filterRuleType, filterScopeType, filterActive],
    queryFn: () =>
      apiClient.listAdminCommercialRules({
        rule_type: filterRuleType || undefined,
        scope_type: filterScopeType || undefined,
        is_active: filterActive === "all" ? undefined : filterActive === "active",
      }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      let parsedConditions: Record<string, unknown> = {};
      try {
        parsedConditions = JSON.parse(conditionsJson || "{}");
      } catch {
        throw new Error("conditions يجب أن تكون JSON صحيح");
      }
      return apiClient.createAdminCommercialRule({
        name,
        rule_type: ruleType,
        scope_type: scopeType,
        scope_reference_id: scopeReferenceId || null,
        priority: Number(priority || 0),
        value_type: valueType,
        value: Number(value || 0),
        conditions: parsedConditions,
      });
    },
    onSuccess: () => {
      toast.success("تم إنشاء القاعدة التجارية");
      setName("");
      setScopeReferenceId("");
      setValue("");
      setConditionsJson("{}");
      queryClient.invalidateQueries({ queryKey: ["admin-commercial-rules"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "تعذر إنشاء القاعدة"),
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: any) => (rule.is_active ? apiClient.disableAdminCommercialRule(rule.id) : apiClient.enableAdminCommercialRule(rule.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-commercial-rules"] }),
    onError: (err: any) => toast.error(err?.message ?? "تعذر تحديث حالة القاعدة"),
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">القواعد التجارية</h2>

      <Card>
        <CardHeader>
          <CardTitle>إنشاء قاعدة تجارية</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <Input placeholder="اسم القاعدة" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ruleType} onChange={(e) => setRuleType(e.target.value as any)}>
            <option value="commission">{RULE_TYPE_LABELS.commission}</option>
            <option value="assisted_fee">{RULE_TYPE_LABELS.assisted_fee}</option>
            <option value="platform_fee">{RULE_TYPE_LABELS.platform_fee}</option>
            <option value="delivery_billing">{RULE_TYPE_LABELS.delivery_billing}</option>
          </select>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={scopeType} onChange={(e) => setScopeType(e.target.value as any)}>
            <option value="global">{SCOPE_TYPE_LABELS.global}</option>
            <option value="merchant">{SCOPE_TYPE_LABELS.merchant}</option>
            <option value="category">{SCOPE_TYPE_LABELS.category}</option>
            <option value="channel">{SCOPE_TYPE_LABELS.channel}</option>
            <option value="merchant_category">{SCOPE_TYPE_LABELS.merchant_category}</option>
            <option value="merchant_channel">{SCOPE_TYPE_LABELS.merchant_channel}</option>
          </select>
          <Input placeholder="معرّف النطاق (uuid)" value={scopeReferenceId} onChange={(e) => setScopeReferenceId(e.target.value)} />
          <Input placeholder="الأولوية" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={valueType} onChange={(e) => setValueType(e.target.value as "percentage" | "fixed")}>
            <option value="percentage">{VALUE_TYPE_LABELS.percentage}</option>
            <option value="fixed">{VALUE_TYPE_LABELS.fixed}</option>
          </select>
          <Input placeholder="القيمة" type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          <Textarea className="md:col-span-2" placeholder='شروط JSON مثال: {"channel":"web_checkout"}' value={conditionsJson} onChange={(e) => setConditionsJson(e.target.value)} />
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || Number.isNaN(Number(value || 0)) || createMutation.isPending}>
            إنشاء القاعدة
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>قائمة القواعد</CardTitle>
          <div className="grid gap-2 md:grid-cols-3">
            <Input placeholder="فلتر نوع القاعدة" value={filterRuleType} onChange={(e) => setFilterRuleType(e.target.value)} />
            <Input placeholder="فلتر نوع النطاق" value={filterScopeType} onChange={(e) => setFilterScopeType(e.target.value)} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filterActive} onChange={(e) => setFilterActive(e.target.value as any)}>
              <option value="all">الكل</option>
              <option value="active">مفعلة</option>
              <option value="inactive">معطلة</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(rulesQuery.data?.rules ?? []).map((rule: any) => (
            <div key={rule.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{rule.name}</p>
                <p className="text-xs text-muted-foreground">
                  {RULE_TYPE_LABELS[rule.rule_type as "commission" | "assisted_fee" | "platform_fee" | "delivery_billing"] ?? rule.rule_type} |
                  {" "}
                  {SCOPE_TYPE_LABELS[rule.scope_type as "global" | "merchant" | "category" | "channel" | "merchant_category" | "merchant_channel"] ?? rule.scope_type} |
                  {" "}
                  أولوية {rule.priority} |
                  {" "}
                  {VALUE_TYPE_LABELS[rule.value_type as "percentage" | "fixed"] ?? rule.value_type}:{rule.value}
                </p>
              </div>
              <Button size="sm" variant={rule.is_active ? "outline" : "default"} onClick={() => toggleMutation.mutate(rule)} disabled={toggleMutation.isPending}>
                {rule.is_active ? "تعطيل" : "تفعيل"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
