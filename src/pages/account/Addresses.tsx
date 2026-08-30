import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api-client";

const initialAddress = {
  label: "home",
  recipient_name: "",
  recipient_phone: "",
  governorate_id: "",
  area: "",
  nearest_landmark: "",
  map_url: "",
  delivery_notes: "",
};

export default function AccountAddresses() {
  const { user, authSource, loading } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialAddress);
  const [editingId, setEditingId] = useState<string | null>(null);

  const labelOptions = [
    { value: "home", label: "المنزل" },
    { value: "work", label: "العمل" },
    { value: "other", label: "أخرى" },
  ] as const;

  const getLabelText = (value?: string | null) => {
    const normalized = (value || "other").toLowerCase();
    return labelOptions.find((item) => item.value === normalized)?.label ?? value ?? "أخرى";
  };

  const { data: addresses } = useQuery({
    queryKey: ["customer-addresses", authSource, user?.id],
    queryFn: () => apiClient.getCustomerAddresses(),
    enabled: !!user,
  });

  const { data: governorates } = useQuery({
    queryKey: ["governorates"],
    queryFn: () => apiClient.getShippingGovernorates(),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        governorate_id: form.governorate_id || null,
        nearest_landmark: form.nearest_landmark || null,
        map_url: form.map_url || null,
        delivery_notes: form.delivery_notes || null,
      };
      if (editingId) return apiClient.updateCustomerAddress(editingId, payload);
      return apiClient.createCustomerAddress(payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "تم تحديث العنوان" : "تم حفظ العنوان");
      setEditingId(null);
      setForm(initialAddress);
      queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
    },
    onError: (error: any) => toast.error(error?.message || "تعذر حفظ العنوان"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteCustomerAddress(id),
    onSuccess: () => {
      toast.success("تم حذف العنوان");
      queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
    },
    onError: (error: any) => toast.error(error?.message || "تعذر حذف العنوان"),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => apiClient.setDefaultCustomerAddress(id),
    onSuccess: () => {
      toast.success("تم تعيين العنوان الافتراضي");
      queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
    },
    onError: (error: any) => toast.error(error?.message || "تعذر تعيين العنوان الافتراضي"),
  });

  if (!loading && !user) return null;

  return (
    <div className="container py-8 space-y-6">
      <h1 className="text-2xl font-bold">العناوين المحفوظة</h1>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "تعديل العنوان" : "إضافة عنوان جديد"}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>التصنيف</Label>
            <Select value={form.label} onValueChange={(value) => setForm({ ...form, label: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {labelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>اسم المستلم</Label>
            <Input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>هاتف المستلم</Label>
            <Input value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label>المحافظة</Label>
            <Select value={form.governorate_id || "none"} onValueChange={(value) => setForm({ ...form, governorate_id: value === "none" ? "" : value })}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المحافظة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون تحديد</SelectItem>
                {(governorates ?? []).map((gov: any) => (
                  <SelectItem key={gov.id} value={gov.id}>
                    {gov.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>المنطقة</Label>
            <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>أقرب نقطة دالة</Label>
            <Input value={form.nearest_landmark} onChange={(e) => setForm({ ...form, nearest_landmark: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>رابط الخريطة</Label>
            <Input value={form.map_url} onChange={(e) => setForm({ ...form, map_url: e.target.value })} dir="ltr" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>ملاحظات التوصيل</Label>
            <Input value={form.delivery_notes} onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })} />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "جاري الحفظ..." : editingId ? "تحديث" : "إضافة"}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setForm(initialAddress);
                }}
              >
                إلغاء
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(addresses ?? []).length === 0 ? (
          <p className="text-muted-foreground">لا يوجد لديك عناوين محفوظة.</p>
        ) : (
          (addresses ?? []).map((addr) => (
            <Card key={addr.id}>
              <CardContent className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {getLabelText(addr.label)} {addr.is_default ? "(افتراضي)" : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">{addr.recipient_name} - {addr.recipient_phone}</p>
                  <p className="text-sm text-muted-foreground">{addr.area}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingId(addr.id);
                      setForm({
                        label: (addr.label || "other").toLowerCase(),
                        recipient_name: addr.recipient_name,
                        recipient_phone: addr.recipient_phone,
                        governorate_id: addr.governorate_id || "",
                        area: addr.area,
                        nearest_landmark: addr.nearest_landmark || "",
                        map_url: addr.map_url || "",
                        delivery_notes: addr.delivery_notes || "",
                      });
                    }}
                  >
                    تعديل
                  </Button>
                  {!addr.is_default ? (
                    <Button variant="outline" onClick={() => setDefaultMutation.mutate(addr.id)}>
                      افتراضي
                    </Button>
                  ) : null}
                  <Button variant="destructive" onClick={() => deleteMutation.mutate(addr.id)}>
                    حذف
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
