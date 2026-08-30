import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

const AdminMerchantCreate = () => {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    name_ar: "",
    name_en: "",
    display_name: "",
  });

  const createMerchant = async () => {
    if (!form.slug || !form.name_ar || !form.name_en || !form.display_name) {
      toast.error("يرجى إكمال الحقول المطلوبة");
      return;
    }
    setCreating(true);
    try {
      const created = await apiClient.createMerchant(form);
      toast.success("تم إنشاء التاجر بنجاح");
      if (created?.id) {
        navigate(`/admin/merchants/${created.id}`);
        return;
      }
      navigate("/admin/merchants");
    } catch (e) {
      console.error(e);
      toast.error("تعذّر إنشاء التاجر");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">إنشاء تاجر جديد</h2>
        <Button type="button" variant="outline" onClick={() => navigate("/admin/merchants")}>
          رجوع
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input
            placeholder="مثال: barber-pro"
            value={form.slug}
            onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.trim().toLowerCase() }))}
          />
        </div>
        <div className="space-y-2">
          <Label>الاسم العربي</Label>
          <Input placeholder="الاسم العربي" value={form.name_ar} onChange={(e) => setForm((p) => ({ ...p, name_ar: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>English name</Label>
          <Input placeholder="English name" value={form.name_en} onChange={(e) => setForm((p) => ({ ...p, name_en: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Display name</Label>
          <Input
            placeholder="Display name"
            value={form.display_name}
            onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
          />
        </div>
        <div className="pt-2">
          <Button type="button" onClick={createMerchant} disabled={creating}>
            {creating ? "جاري الإنشاء..." : "حفظ وإنشاء التاجر"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminMerchantCreate;
