import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";

type RegisterForm = {
  email: string;
  password: string;
  owner_full_name: string;
  owner_phone: string;
  store_name_ar: string;
  store_name_en: string;
  display_name: string;
  slug: string;
  city: string;
  address: string;
  contact_phone: string;
  support_email: string;
  business_type: string;
  description: string;
};

const initialForm: RegisterForm = {
  email: "",
  password: "",
  owner_full_name: "",
  owner_phone: "",
  store_name_ar: "",
  store_name_en: "",
  display_name: "",
  slug: "",
  city: "",
  address: "",
  contact_phone: "",
  support_email: "",
  business_type: "",
  description: "",
};

export default function MerchantRegister() {
  const [form, setForm] = useState<RegisterForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const setField = (key: keyof RegisterForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        slug: form.slug.trim().toLowerCase(),
        support_email: form.support_email || undefined,
        business_type: form.business_type || undefined,
        description: form.description || undefined,
      };
      await apiClient.registerMerchantApplication(payload);
      toast.success("تم إرسال طلب الانضمام بنجاح. بانتظار موافقة الإدارة.");
      setForm(initialForm);
      navigate("/merchant/login", { replace: true });
    } catch (error: any) {
      toast.error(error.message || "تعذر إرسال طلب التسجيل");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">انضم كتاجر</CardTitle>
            <CardDescription>املأ بيانات الحساب والمتجر، ثم انتظر موافقة فريق المنصة.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور</Label>
                <Input type="password" value={form.password} onChange={(e) => setField("password", e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>اسم المالك</Label>
                <Input value={form.owner_full_name} onChange={(e) => setField("owner_full_name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>هاتف المالك</Label>
                <Input value={form.owner_phone} onChange={(e) => setField("owner_phone", e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>اسم المتجر (عربي)</Label>
                <Input value={form.store_name_ar} onChange={(e) => setField("store_name_ar", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>اسم المتجر (إنجليزي)</Label>
                <Input value={form.store_name_en} onChange={(e) => setField("store_name_en", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>الاسم المعروض</Label>
                <Input value={form.display_name} onChange={(e) => setField("display_name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>المعرّف المقترح للرابط</Label>
                <Input value={form.slug} onChange={(e) => setField("slug", e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>المدينة</Label>
                <Input value={form.city} onChange={(e) => setField("city", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>العنوان</Label>
                <Input value={form.address} onChange={(e) => setField("address", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>هاتف التواصل</Label>
                <Input value={form.contact_phone} onChange={(e) => setField("contact_phone", e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>بريد الدعم (اختياري)</Label>
                <Input type="email" value={form.support_email} onChange={(e) => setField("support_email", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>نوع النشاط (اختياري)</Label>
                <Input value={form.business_type} onChange={(e) => setField("business_type", e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>وصف المتجر (اختياري)</Label>
                <Input value={form.description} onChange={(e) => setField("description", e.target.value)} />
              </div>
              <div className="md:col-span-2 flex flex-col gap-2 pt-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "جاري إرسال الطلب..." : "إرسال طلب التسجيل"}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/merchant/login")}>
                  لدي حساب تاجر
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
