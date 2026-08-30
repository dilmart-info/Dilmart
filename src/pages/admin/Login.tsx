import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { WEAK_PASSWORD_SIGN_IN_WARNING_AR } from "@/lib/auth/password-errors";
import { apiClient } from "@/lib/api-client";

export default function AdminLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { signInWithPassword, logoutCurrentDevice } = useAuth();

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
            } catch (contextErr: unknown) {
                await logoutCurrentDevice();
                const raw = contextErr instanceof Error ? contextErr.message : "";
                // ── Specific error: SERVICE_ROLE_KEY is invalid on Render ──
                if (/service_role_key/i.test(raw) || /invalid api key/i.test(raw) || /cannot reach supabase/i.test(raw)) {
                    throw new Error(
                        "🔴 خطأ في إعدادات السيرفر: مفتاح SUPABASE_SERVICE_ROLE_KEY في Render غير صحيح أو منتهي الصلاحية.\n\nالحل: اذهب إلى Render Dashboard → DilMart-store-backend → Environment → حدّث SUPABASE_SERVICE_ROLE_KEY من لوحة Supabase."
                    );
                }
                if (/supabase project/i.test(raw)) {
                    throw new Error(
                        "🔴 مشروع Supabase في الواجهة لا يطابق السيرفر. تحقق من SUPABASE_URL و SERVICE_ROLE_KEY في Render ثم أعد النشر.",
                    );
                }
                if (/invalid or expired bearer token/i.test(raw)) {
                    throw new Error(
                        "🔴 فشل التحقق من الجلسة على السيرفر. تأكد أن Render يستخدم مشروع Supabase الصحيح (ztplxqlthuqkuktbznbo) ثم أعد النشر.",
                    );
                }
                // Generic fallback with more context
                const hint = raw ? ` (${raw})` : "";
                throw new Error(`تعذّر التحقق من صلاحيات الحساب عبر السيرفر${hint}. تحقق من اتصال الباك إند بـ Supabase.`);
            }

            const activeRole = authContext?.activeRole;
            const roles = authContext?.roles ?? [];
            const hasAdminAccess =
                activeRole === "admin" ||
                activeRole === "super_admin" ||
                roles.includes("admin") ||
                roles.includes("super_admin");

            if (!hasAdminAccess) {
                console.error("[admin-login] /auth/context returned non-admin role:", { activeRole, roles });
                await logoutCurrentDevice();
                throw new Error("عذراً، ليس لديك صلاحية الوصول للوحة التحكم");
            }

            // Do NOT invalidateQueries here — the SIGNED_IN handler in useAuth already schedules
            // invalidation, and calling it again right before navigate() triggers a background
            // refetch that can race with RequirePlatformAdmin, causing isAdmin to flicker false.
            toast.success("تم تسجيل الدخول بنجاح");
            // Only after admin authorization passed. Advisory, never an auth error.
            if (passwordSecurityWarning) toast.warning(WEAK_PASSWORD_SIGN_IN_WARNING_AR);
            navigate("/admin");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "حدث خطأ أثناء تسجيل الدخول";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-6">
                        <picture>
                          <source srcSet="/DilMart-store-logo.webp" type="image/webp" />
                          <img src="/DilMart-store-logo.png" alt="DilMart-store" width={280} height={94} className="h-32 w-auto object-contain" />
                        </picture>
                    </div>
                    <CardTitle className="text-2xl font-bold">تسجيل دخول المسؤول</CardTitle>
                </CardHeader>


                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">البريد الإلكتروني</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@DilMart.store"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                dir="ltr"
                                autoComplete="email"
                            />
                            <p className="text-xs text-muted-foreground">
                                أدخل بريد حساب المسؤول المسجّل في المنصة.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">كلمة المرور</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                dir="ltr"
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "جاري التحقق من الجلسة والصلاحيات..." : "تسجيل الدخول"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
