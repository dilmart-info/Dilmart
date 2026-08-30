import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatPrice } from "@/lib/format";
import { Package, User, MapPin, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import AccountRecommendations from "@/components/AccountRecommendations";
import { isAuthStorageError } from "@/lib/auth/auth-errors";

export default function Profile() {
    // STORE-PR5 §Phase J — auth ownership is source-neutral (appSession), never the raw Supabase session
    // (which is null for a federated customer). capabilities/logoutAllDevices drive the account controls.
    const { user, profile, session, appSession, authStatus, capabilities, logoutCurrentDevice, logoutAllDevices } = useAuth();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [loggingOutAll, setLoggingOutAll] = useState(false);
    const navigate = useNavigate();

    const accountEmail = user?.email ?? appSession?.user?.email ?? session?.user?.email ?? "";

    // Form state
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");

    useEffect(() => {
        if (authStatus === "bootstrapping" || authStatus === "storage_error") {
            return;
        }

        // Redirect only on definitive unauthenticated state — never on missing backend context alone
        // (offline sessions keep appSession without `user`). Source-neutral: a federated customer has
        // appSession != null even though the Supabase session is null.
        if (authStatus === "unauthenticated" || !appSession) {
            navigate("/auth");
            return;
        }

        setFullName(profile?.full_name || "");
        setPhone(profile?.phone || "");
        setAddress(profile?.address || "");

        if (authStatus === "authenticated_offline") {
            // Keep the shell; do not hit private APIs until connectivity returns.
            setOrders([]);
            setLoading(false);
            return;
        }

        if (authStatus === "authenticated_loading_context") {
            return;
        }

        void fetchOrders();
    }, [user, profile, appSession, authStatus, navigate]);

    const fetchOrders = async () => {
        try {
            const data = await apiClient.getMyOrders();
            setOrders(data || []);
        } catch (error) {
            console.error("Error fetching orders:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (authStatus === "authenticated_offline") {
            toast.error("لا يوجد اتصال بالإنترنت. حاول مرة أخرى عند عودة الشبكة.");
            return;
        }
        setUpdating(true);

        try {
            await apiClient.updateMyProfile({
                full_name: fullName,
                phone,
                address,
            });
            toast.success("تم تحديث الملف الشخصي بنجاح");
        } catch (error: any) {
            toast.error(error.message || "حدث خطأ أثناء التحديث");
        } finally {
            setUpdating(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logoutCurrentDevice();
            navigate("/");
            toast.success("تم تسجيل الخروج");
        } catch (error) {
            // Secure-clear failure surfaces as storage_error — never claim success.
            if (!isAuthStorageError(error)) {
                toast.error("تعذر تسجيل الخروج. حاول مرة أخرى.");
            }
        }
    };

    // STORE-PR5 §Phase M — "logout everywhere" is offered only when the backend capability permits it
    // (federated customers). A secure-clear failure must NOT show success.
    const handleLogoutAll = async () => {
        setLoggingOutAll(true);
        try {
            await logoutAllDevices();
            navigate("/");
            toast.success("تم تسجيل الخروج من جميع الأجهزة");
        } catch (error) {
            if (!isAuthStorageError(error) && (error as { code?: string })?.code !== "storage_error") {
                toast.error("تعذر تسجيل الخروج من جميع الأجهزة. حاول مرة أخرى.");
            }
        } finally {
            setLoggingOutAll(false);
        }
    };

    if (authStatus === "bootstrapping" || authStatus === "authenticated_loading_context") {
        return <div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>;
    }

    if (authStatus === "authenticated_offline" && appSession) {
        return (
            <div className="min-h-screen flex flex-col bg-muted/30" data-testid="profile-offline-shell">
                <Header />
                <main className="flex-1 container py-8">
                    <div className="max-w-4xl mx-auto space-y-4">
                        <h1 className="text-3xl font-bold mb-2">حسابي</h1>
                        <Card>
                            <CardHeader>
                                <CardTitle>أنت متصل بالحساب دون شبكة</CardTitle>
                                <CardDescription>
                                    الجلسة محفوظة على الجهاز. سيتم تحديث بيانات الحساب تلقائيًا عند عودة الإنترنت.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm text-muted-foreground">
                                <p>البريد: {accountEmail || "—"}</p>
                                <p className="text-amber-700 dark:text-amber-400">لا يوجد اتصال بالإنترنت</p>
                            </CardContent>
                        </Card>
                    </div>
                </main>
                <Footer />
            </div>
        );
    }

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">جاري التحميل...</div>;
    }

    return (
        <div className="min-h-screen flex flex-col bg-muted/30">
            <Header />
            <main className="flex-1 container py-8">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-3xl font-bold mb-6">حسابي</h1>

                    {/* Account Claim Banner for Provisional Users */}
                    {((profile as any)?.claim_required || (profile as any)?.account_type === "provisional_customer") && (
                        <Card className="mb-6 border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/30">
                            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="space-y-1 text-center sm:text-right">
                                    <h3 className="font-bold text-amber-800 dark:text-amber-300 text-sm">
                                        🛡️ حسابك مؤقت وغير موثق
                                    </h3>
                                    <p className="text-xs text-amber-700 dark:text-amber-400">
                                        استلم حسابك الآن وتأكد من حفظ طلباتك ونقاطك دائماً عبر توثيق رقم الهاتف وتعيين كلمة مرور.
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => navigate("/claim-account")}
                                    className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                                >
                                    استلام وتأكيد الحساب
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Loyalty Points Card */}
                    <Card className="mb-8 border-none bg-gradient-to-l from-indigo-600 to-indigo-700 text-white shadow-lg overflow-hidden relative">
                        <div className="absolute -right-6 -top-6 opacity-10">
                            <Package size={120} />
                        </div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-indigo-100 text-sm font-medium">نقاط الولاء المتوفرة</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-end justify-between">
                                <div>
                                    <div className="text-4xl font-black mb-1">{(profile as any)?.points || 0}</div>
                                    <p className="text-indigo-200 text-xs">تعادل خصم بقيمة {formatPrice(((profile as any)?.points || 0) * 10)}</p>
                                </div>
                                <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
                                    <Package className="text-white" size={24} />
                                </div>
                            </div>
                        </CardContent>
                        <div className="bg-black/10 px-6 py-2 text-[10px] text-indigo-100 flex justify-between items-center">
                            <span>* تنتهي صلاحية النقاط بعد سنة من تاريخ اكتسابها</span>
                        </div>
                    </Card>

                    <Tabs defaultValue="orders" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-8">
                            <TabsTrigger value="orders" className="flex items-center gap-2">
                                <Package size={18} />
                                <span>طلباتي</span>
                            </TabsTrigger>
                            <TabsTrigger value="settings" className="flex items-center gap-2">
                                <User size={18} />
                                <span>إعدادات الحساب</span>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="orders">
                            <div className="space-y-4">
                                {orders.length === 0 ? (
                                    <Card>
                                        <CardContent className="py-12 text-center text-muted-foreground">
                                            <Package className="mx-auto mb-4 opacity-20" size={64} />
                                            <p>ليس لديك أي طلبات بعد</p>
                                            <Button variant="link" onClick={() => navigate("/products")}>
                                                تصفح المنتجات الآن
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    orders.map((order) => (
                                        <Card key={order.id} className="overflow-hidden">
                                            <div className="bg-primary/5 p-4 border-b flex justify-between items-center">
                                                <div>
                                                    <p className="text-xs text-muted-foreground">رقم الطلب</p>
                                                    <p className="font-bold">#{order.order_number}</p>
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-xs text-muted-foreground">التاريخ</p>
                                                    <p className="text-sm">{new Date(order.created_at).toLocaleDateString('ar-EG')}</p>
                                                </div>
                                            </div>
                                            <CardContent className="p-4 flex flex-col md:flex-row justify-between gap-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <span className="font-medium">الحالة:</span>
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                                                            {order.status === 'pending' ? 'قيد الانتظار' : order.status}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm font-bold mt-2">
                                                        <span>الإجمالي:</span>
                                                        <span className="text-primary">{formatPrice(order.total)}</span>
                                                    </div>
                                                </div>
                                                <Button variant="outline" size="sm" onClick={() => navigate(`/my-account/orders?orderId=${order.id}`)}>
                                                    عرض التفاصيل وإعادة الطلب
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="settings">
                            <Card>
                                <CardHeader>
                                    <CardTitle>المعلومات الشخصية</CardTitle>
                                    <CardDescription>قم بتحديث بياناتك لتسهيل عملية التوصيل في المرات القادمة</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="fullName">الاسم الكامل</Label>
                                                <Input
                                                    id="fullName"
                                                    value={fullName}
                                                    onChange={(e) => setFullName(e.target.value)}
                                                    placeholder="أدخل اسمك الكامل"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="email">البريد الإلكتروني</Label>
                                                <Input id="email" value={accountEmail} disabled className="bg-muted" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="phone">رقم الهاتف</Label>
                                                <div className="relative">
                                                    <Phone className="absolute right-3 top-3 text-muted-foreground" size={16} />
                                                    <Input
                                                        id="phone"
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value)}
                                                        placeholder="07XXXXXXXX"
                                                        className="pr-10"
                                                        dir="ltr"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <Label htmlFor="address">العنوان الافتراضي</Label>
                                                <div className="relative">
                                                    <MapPin className="absolute right-3 top-3 text-muted-foreground" size={16} />
                                                    <Input
                                                        id="address"
                                                        value={address}
                                                        onChange={(e) => setAddress(e.target.value)}
                                                        placeholder="المحافظة، المنطقة، أقرب نقطة دالة"
                                                        className="pr-10"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <Button type="submit" disabled={updating} className="w-full md:w-auto px-8">
                                            {updating ? "جاري الحفظ..." : "حفظ التغييرات"}
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>

                            <Card className="mt-8 border-destructive/20 bg-destructive/5">
                                <CardHeader>
                                    <CardTitle className="text-destructive">الخروج</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-2">
                                    <Button variant="destructive" onClick={() => void handleLogout()}>
                                        تسجيل الخروج من الحساب
                                    </Button>
                                    {capabilities?.federatedLogoutAll ? (
                                        <Button
                                            variant="outline"
                                            data-testid="logout-all-devices"
                                            disabled={loggingOutAll}
                                            onClick={() => void handleLogoutAll()}
                                        >
                                            تسجيل الخروج من جميع الأجهزة
                                        </Button>
                                    ) : null}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
                <AccountRecommendations
                    title="مقترحات لك"
                    subtitle="اعتمادًا على المنتجات الرائجة حاليًا. قريبًا سنخصصها حسب طلباتك السابقة."
                />
            </main>
            <Footer />
        </div>
    );
}
