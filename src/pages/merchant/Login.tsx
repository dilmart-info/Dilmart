import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { WEAK_PASSWORD_SIGN_IN_WARNING_AR } from "@/lib/auth/password-errors";
import { apiClient } from "@/lib/api-client";

export default function MerchantLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { signInWithPassword } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { session, passwordSecurityWarning } = await signInWithPassword({ email, password });

      queryClient.removeQueries({ queryKey: ["auth-context"] });
      let authContext: Awaited<ReturnType<typeof apiClient.getAuthContext>> | null = null;
      try {
        authContext = await queryClient.fetchQuery({
          queryKey: ["auth-context", session.user.id],
          queryFn: () => apiClient.getAuthContext(session.access_token),
          staleTime: 0,
        });
      } catch {
        // /auth/context is the sole authority — do not fall back to direct Supabase reads.
        throw new Error("تعذر التحقق من صلاحيات الحساب. تحقق من الاتصال بالخادم وأعد المحاولة.");
      }

      const role = authContext?.activeRole;
      const isMerchantRole = role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff";
      const merchantStatus = authContext?.merchant?.status ?? null;

      if (role === "merchant_applicant") {
        toast.info("طلبك قيد المراجعة.");
        navigate("/merchant/pending", { replace: true });
        return;
      }

      if (!isMerchantRole) {
        toast.info("لا يوجد متجر مرتبط بهذا الحساب. قدّم طلب تسجيل تاجر.");
        navigate("/merchant/register", { replace: true });
        return;
      }

      // Only past this point has the account actually cleared merchant authorization. Warning
      // earlier would tell an unauthorized account something about its access that is not true.
      if (passwordSecurityWarning) toast.warning(WEAK_PASSWORD_SIGN_IN_WARNING_AR);

      if (merchantStatus === "active") {
        toast.success("تم تسجيل دخول التاجر بنجاح");
        navigate("/merchant", { replace: true });
        return;
      }

      navigate("/merchant/pending", { replace: true });
    } catch (error: any) {
      toast.error(error.message || "فشل تسجيل دخول التاجر");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">تسجيل دخول التاجر</CardTitle>
          <CardDescription>ادخل بحساب التاجر لإدارة متجرك بعد الموافقة</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جاري التحقق من الجلسة والصلاحيات..." : "دخول بوابة التاجر"}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/merchant/register")}>
              ليس لديك متجر؟ قدم طلب تسجيل
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
