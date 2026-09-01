import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import AccountLayout from "@/components/account/AccountLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Star,
  Phone,
  User,
  Navigation,
  FileText,
  AlertCircle,
  Home,
  Briefcase,
  Globe,
} from "lucide-react";

interface AddressFormData {
  label: "home" | "work" | "other";
  recipient_name: string;
  recipient_phone: string;
  governorate_id: string;
  area: string;
  nearest_landmark: string;
  map_url: string;
  delivery_notes: string;
  is_default: boolean;
}

const initialFormData: AddressFormData = {
  label: "home",
  recipient_name: "",
  recipient_phone: "",
  governorate_id: "",
  area: "",
  nearest_landmark: "",
  map_url: "",
  delivery_notes: "",
  is_default: false,
};

export default function AccountAddresses() {
  const { user, authSource, authStatus, profile } = useAuth();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AddressFormData>(initialFormData);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // 1. Fetch saved customer addresses
  const {
    data: addresses,
    isLoading: isAddressesLoading,
    isError: isAddressesError,
    refetch: refetchAddresses,
  } = useQuery({
    queryKey: ["customer-addresses", authSource, user?.id],
    queryFn: () => apiClient.getCustomerAddresses(),
    enabled: authStatus === "authenticated_ready" && !!user,
  });

  // 2. Fetch shipping governorates
  const { data: governorates, isLoading: isGovsLoading } = useQuery({
    queryKey: ["governorates"],
    queryFn: () => apiClient.getShippingGovernorates(),
    enabled: authStatus === "authenticated_ready",
  });

  // Save (Create / Update) Mutation
  const saveAddressMutation = useMutation({
    mutationFn: async (payload: AddressFormData) => {
      const formatted = {
        label: payload.label,
        recipient_name: payload.recipient_name.trim(),
        recipient_phone: payload.recipient_phone.trim(),
        governorate_id: payload.governorate_id || null,
        area: payload.area.trim(),
        nearest_landmark: payload.nearest_landmark.trim() || null,
        map_url: payload.map_url.trim() || null,
        delivery_notes: payload.delivery_notes.trim() || null,
        is_default: payload.is_default,
      };

      if (editingId) {
        return apiClient.updateCustomerAddress(editingId, formatted);
      }
      return apiClient.createCustomerAddress(formatted);
    },
    onSuccess: () => {
      toast.success(editingId ? "تم تحديث العنوان بنجاح" : "تمت إضافة العنوان بنجاح");
      setIsDialogOpen(false);
      setEditingId(null);
      setFormData(initialFormData);
      queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "تعذر حفظ العنوان");
    },
  });

  // Set Default Mutation
  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => apiClient.setDefaultCustomerAddress(id),
    onSuccess: () => {
      toast.success("تم تعيين العنوان الافتراضي");
      queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "تعذر تعيين العنوان كافتراضي");
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteCustomerAddress(id),
    onSuccess: () => {
      toast.success("تم حذف العنوان بنجاح");
      setDeleteTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "تعذر حذف العنوان");
    },
  });

  const handleOpenAddDialog = () => {
    setEditingId(null);
    setFormData({
      ...initialFormData,
      recipient_name: profile?.full_name || "",
      recipient_phone: profile?.phone || "",
    });
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (addr: NonNullable<typeof addresses>[number]) => {
    setEditingId(addr.id);
    setFormData({
      label: (addr.label as any) || "other",
      recipient_name: addr.recipient_name || "",
      recipient_phone: addr.recipient_phone || "",
      governorate_id: addr.governorate_id || "",
      area: addr.area || "",
      nearest_landmark: addr.nearest_landmark || "",
      map_url: addr.map_url || "",
      delivery_notes: addr.delivery_notes || "",
      is_default: Boolean(addr.is_default),
    });
    setIsDialogOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.recipient_name.trim()) {
      toast.error("يرجى إدخال اسم المستلم");
      return;
    }
    if (!formData.recipient_phone.trim()) {
      toast.error("يرجى إدخال رقم هاتف المستلم");
      return;
    }
    if (!formData.governorate_id || !formData.governorate_id.trim()) {
      toast.error("يرجى اختيار المحافظة");
      return;
    }
    if (!formData.area.trim()) {
      toast.error("يرجى إدخال المنطقة أو الحي");
      return;
    }

    saveAddressMutation.mutate(formData);
  };

  const getGovernorateName = (govId?: string | null) => {
    if (!govId || !governorates) return "";
    const found = governorates.find((g: any) => g.id === govId);
    return found ? found.name : "";
  };

  const getLabelBadge = (label?: string | null) => {
    const norm = (label || "other").toLowerCase();
    switch (norm) {
      case "home":
        return (
          <Badge variant="outline" className="bg-blue-50 text-[#1261D8] border-blue-200 text-[11px] flex items-center gap-1 font-semibold">
            <Home className="w-3 h-3" />
            المنزل
          </Badge>
        );
      case "work":
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[11px] flex items-center gap-1 font-semibold">
            <Briefcase className="w-3 h-3" />
            العمل
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[11px] flex items-center gap-1 font-semibold">
            <Globe className="w-3 h-3" />
            أخرى
          </Badge>
        );
    }
  };

  return (
    <AccountLayout
      title="عناويني المحفوظة"
      subtitle="إدارة عناوين التوصيل لتسريع عملية الطلب والشحن"
      action={
        <Button
          size="sm"
          onClick={handleOpenAddDialog}
          className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة عنوان جديد
        </Button>
      }
    >
      <div className="space-y-6">
        {isAddressesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((n) => (
              <Card key={n} className="p-6 border-slate-200">
                <div className="h-5 bg-slate-100 rounded w-1/3 mb-3 animate-pulse" />
                <div className="h-4 bg-slate-100 rounded w-2/3 mb-2 animate-pulse" />
                <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
              </Card>
            ))}
          </div>
        ) : isAddressesError ? (
          <Card className="border-slate-200 p-8 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">تعذر تحميل العناوين المحفوظة</p>
            <Button size="sm" variant="outline" onClick={() => refetchAddresses()} className="text-xs">
              إعادة المحاولة
            </Button>
          </Card>
        ) : !addresses || addresses.length === 0 ? (
          <Card className="border-slate-200 shadow-sm p-12 text-center space-y-4 bg-white">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <MapPin className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#071A3D]">لا يوجد لديك عناوين محفوظة بعد</h3>
              <p className="text-xs text-slate-500">
                أضف عنوان توصيل لتسريع خطوات الشراء والشحن لطلباتك القادمة.
              </p>
            </div>
            <Button
              onClick={handleOpenAddDialog}
              className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-bold px-6 shadow-sm"
            >
              + إضافة أول عنوان
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map((addr) => {
              const govName = getGovernorateName(addr.governorate_id);
              return (
                <Card
                  key={addr.id}
                  className={`border transition-all bg-white shadow-sm flex flex-col justify-between ${
                    addr.is_default
                      ? "border-[#1261D8] ring-1 ring-[#1261D8]/30 shadow-[#1261D8]/5"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getLabelBadge(addr.label)}
                        {addr.is_default && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px] flex items-center gap-1 font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            العنوان الافتراضي
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenEditDialog(addr)}
                          className="w-7 h-7 text-slate-500 hover:text-[#1261D8] hover:bg-blue-50"
                          title="تعديل العنوان"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTargetId(addr.id)}
                          className="w-7 h-7 text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                          title="حذف العنوان"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3 text-xs flex-1">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-slate-800 font-bold">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{addr.recipient_name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 font-medium" dir="ltr">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{addr.recipient_phone}</span>
                      </div>
                    </div>

                    <div className="space-y-1 text-slate-700 pt-2 border-t border-slate-100">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#1261D8] shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {govName ? `${govName}، ` : ""}
                            {addr.area}
                          </p>
                          {addr.nearest_landmark && (
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              أقرب نقطة دالة: {addr.nearest_landmark}
                            </p>
                          )}
                        </div>
                      </div>

                      {addr.delivery_notes && (
                        <div className="flex items-start gap-2 text-slate-500 text-[11px] pt-1">
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>{addr.delivery_notes}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>

                  {/* Card Footer: Set default action */}
                  {!addr.is_default && (
                    <div className="p-3 bg-slate-50/70 border-t border-slate-100 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={setDefaultMutation.isPending}
                        onClick={() => setDefaultMutation.mutate(addr.id)}
                        className="text-xs font-semibold text-[#1261D8] hover:bg-[#1261D8]/10 h-8 px-3"
                      >
                        <Star className="w-3.5 h-3.5 mr-1" />
                        تعيين كعنوان افتراضي
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────────── ADD / EDIT ADDRESS DIALOG ─────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#071A3D] flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#1261D8]" />
              {editingId ? "تعديل عنوان التوصيل" : "إضافة عنوان توصيل جديد"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              أدخل تفاصيل المستلم وموقع التوصيل بدقة لضمان سرعة الوصول.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFormSubmit} className="space-y-4 py-2">
            {/* Label Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">نوع العنوان</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "home", label: "المنزل", icon: Home },
                  { value: "work", label: "العمل", icon: Briefcase },
                  { value: "other", label: "أخرى", icon: Globe },
                ].map((item) => {
                  const Icon = item.icon;
                  const selected = formData.label === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, label: item.value as any })}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        selected
                          ? "bg-[#1261D8] text-white border-[#1261D8] shadow-sm font-bold"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recipient info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="recipientName" className="text-xs font-bold text-slate-700">
                  اسم المستلم *
                </Label>
                <Input
                  id="recipientName"
                  value={formData.recipient_name}
                  onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                  placeholder="الاسم الكامل"
                  className="text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="recipientPhone" className="text-xs font-bold text-slate-700">
                  رقم الهاتف *
                </Label>
                <Input
                  id="recipientPhone"
                  value={formData.recipient_phone}
                  onChange={(e) => setFormData({ ...formData, recipient_phone: e.target.value })}
                  placeholder="07XXXXXXXX"
                  className="text-xs"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            {/* Governorate & Area */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">المحافظة *</Label>
                <Select
                  value={formData.governorate_id}
                  onValueChange={(val) =>
                    setFormData({ ...formData, governorate_id: val })
                  }
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="اختر المحافظة" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {(governorates ?? []).map((gov: any) => (
                      <SelectItem key={gov.id} value={gov.id}>
                        {gov.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="area" className="text-xs font-bold text-slate-700">
                  المنطقة / الحي *
                </Label>
                <Input
                  id="area"
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  placeholder="مثال: الكرادة، المنصور"
                  className="text-xs"
                  required
                />
              </div>
            </div>

            {/* Nearest landmark */}
            <div className="space-y-1">
              <Label htmlFor="nearestLandmark" className="text-xs font-bold text-slate-700">
                أقرب نقطة دالة (اختياري)
              </Label>
              <Input
                id="nearestLandmark"
                value={formData.nearest_landmark}
                onChange={(e) => setFormData({ ...formData, nearest_landmark: e.target.value })}
                placeholder="مثال: قرب جامع، مجاور مدرسة..."
                className="text-xs"
              />
            </div>

            {/* Map URL */}
            <div className="space-y-1">
              <Label htmlFor="mapUrl" className="text-xs font-bold text-slate-700">
                رابط موقع خرائط Google (اختياري)
              </Label>
              <Input
                id="mapUrl"
                value={formData.map_url}
                onChange={(e) => setFormData({ ...formData, map_url: e.target.value })}
                placeholder="https://maps.app.goo.gl/..."
                className="text-xs"
                dir="ltr"
              />
            </div>

            {/* Delivery Notes */}
            <div className="space-y-1">
              <Label htmlFor="deliveryNotes" className="text-xs font-bold text-slate-700">
                ملاحظات التوصيل (اختياري)
              </Label>
              <Textarea
                id="deliveryNotes"
                value={formData.delivery_notes}
                onChange={(e) => setFormData({ ...formData, delivery_notes: e.target.value })}
                placeholder="تعليمات خاصة للمندوب مثل رقم الطابق أو الشقة..."
                rows={2}
                className="text-xs"
              />
            </div>

            {/* Set as Default Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isDefaultCheckbox"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="rounded border-slate-300 text-[#1261D8] focus:ring-[#1261D8]"
              />
              <Label htmlFor="isDefaultCheckbox" className="text-xs font-semibold text-slate-700 cursor-pointer">
                تعيين كعنوان افتراضي للطلبات القادمة
              </Label>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDialogOpen(false)}
                className="text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saveAddressMutation.isPending}
                className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-bold px-5"
              >
                {saveAddressMutation.isPending
                  ? "جارٍ الحفظ..."
                  : editingId
                  ? "حفظ التعديلات"
                  : "إضافة العنوان"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─────────────────── DELETE CONFIRMATION ALERT DIALOG ─────────────────── */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-600" />
              تأكيد حذف العنوان
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-600">
              هل أنت متأكد من رغبتك في حذف هذا العنوان؟ لا يمكن التراجع عن هذه العملية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={() => setDeleteTargetId(null)} className="text-xs">
              تراجع
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTargetId) {
                  deleteMutation.mutate(deleteTargetId);
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              {deleteMutation.isPending ? "جارٍ الحذف..." : "تأكيد الحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AccountLayout>
  );
}
