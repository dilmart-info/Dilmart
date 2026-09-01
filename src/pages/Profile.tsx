import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import AccountLayout from "@/components/account/AccountLayout";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { formatPrice } from "@/lib/format";
import { apiClient } from "@/lib/api-client";
import { isAuthStorageError } from "@/lib/auth/auth-errors";
import { getCustomerFacingEmail } from "@/lib/auth/identifier";
import AccountRecommendations from "@/components/AccountRecommendations";
import {
  Package,
  MapPin,
  ShieldCheck,
  Sparkles,
  User,
  LogOut,
  ChevronLeft,
  Phone,
  CheckCircle2,
} from "lucide-react";

function ProfileDashboardContent() {
  const {
    user,
    profile,
    appSession,
    session,
    authSource,
    capabilities,
    refetch,
    logoutCurrentDevice,
    logoutAllDevices,
  } = useAuth();

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const customerEmail = getCustomerFacingEmail(user?.email ?? appSession?.user?.email ?? session?.user?.email);
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phoneInput, setPhoneInput] = useState(profile?.phone || "");
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name);
    }
    if (profile?.phone) {
      setPhoneInput(profile.phone);
    }
  }, [profile]);

  // Fetch recent orders (max 3)
  const {
    data: recentOrders,
    isLoading: isOrdersLoading,
    isError: isOrdersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ["customer-orders", authSource, user?.id, 3],
    queryFn: () => apiClient.getCustomerOrders({ limit: 3 }),
    enabled: !!user,
  });

  // Fetch saved addresses (to show default address shortcut)
  const { data: addresses, isLoading: isAddressesLoading } = useQuery({
    queryKey: ["customer-addresses", authSource, user?.id],
    queryFn: () => apiClient.getCustomerAddresses(),
    enabled: !!user,
  });

  const defaultAddress = (addresses ?? []).find((a) => a.is_default);

  // Update profile mutation using canonical customer API
  const updateProfileMutation = useMutation({
    mutationFn: async (payload: { full_name: string; phone?: string }) => {
      return apiClient.updateCustomerProfile(payload);
    },
    onSuccess: async () => {
      toast.success("تم تحديث البيانات الشخصية بنجاح");
      queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
      if (typeof refetch === "function") {
        await refetch();
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || "تعذر تحديث البيانات");
    },
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: { full_name: string; phone?: string } = {
      full_name: fullName.trim(),
    };

    if (!capabilities?.phoneIdentity && phoneInput.trim()) {
      payload.phone = phoneInput.trim();
    }

    updateProfileMutation.mutate(payload);
  };

  const handleLogout = async () => {
    try {
      await logoutCurrentDevice();
      navigate("/");
      toast.success("تم تسجيل الخروج");
    } catch (error) {
      if (!isAuthStorageError(error)) {
        toast.error("تعذر تسجيل الخروج. حاول مرة أخرى.");
      }
    }
  };

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

  const points = profile?.points ?? 0;
  const discountValue = points * 10;

  return (
    <div className="space-y-6">
      {/* Top Grid: Loyalty Card + Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Loyalty Points Card */}
        <Card className="border-none bg-gradient-to-br from-[#1261D8] to-[#071A3D] text-white shadow-md overflow-hidden relative">
          <div className="absolute -left-6 -bottom-6 opacity-10 pointer-events-none">
            <Sparkles size={160} />
          </div>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-100 uppercase tracking-wider">
                برنامج مكافآت ديل مارت
              </span>
              <span className="bg-white/20 text-white text-[11px] px-2.5 py-0.5 rounded-full font-medium backdrop-blur-sm">
                مفعل
              </span>
            </div>
            <CardTitle className="text-xl font-bold text-white mt-1">رصيد نقاطك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight">{points.toLocaleString("ar-IQ")}</span>
              <span className="text-sm font-medium text-blue-200">نقطة</span>
            </div>
            <p className="text-xs text-blue-100">
              تعادل خصمًا بقيمة <strong className="text-white font-bold">{formatPrice(discountValue)}</strong>
            </p>
            <div className="pt-2 border-t border-white/15 text-[11px] text-blue-100/90 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#FF8A00] shrink-0" />
              <span>يمكن استخدام النقاط المؤهلة كخصم أثناء إتمام الطلب.</span>
            </div>
          </CardContent>
        </Card>

        {/* Saved Address Quick Card */}
        <Card className="border-slate-200 shadow-sm bg-white flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-[#071A3D] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#1261D8]" />
                العنوان الافتراضي
              </CardTitle>
              <Link
                to="/my-account/addresses"
                className="text-xs font-semibold text-[#1261D8] hover:underline flex items-center gap-0.5"
              >
                إدارة العناوين
                <ChevronLeft className="w-3.5 h-3.5" />
              </Link>
            </div>
            <CardDescription className="text-xs">عنوان التوصيل المعتمد لطلباتك القادمة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isAddressesLoading ? (
              <div className="h-16 flex items-center justify-center text-xs text-slate-400">
                جارٍ تحميل العناوين...
              </div>
            ) : defaultAddress ? (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{defaultAddress.recipient_name}</span>
                  <span className="text-slate-500" dir="ltr">{defaultAddress.recipient_phone}</span>
                </div>
                <p className="text-xs text-slate-600 truncate">
                  {defaultAddress.area} {defaultAddress.nearest_landmark ? `— قرب ${defaultAddress.nearest_landmark}` : ""}
                </p>
              </div>
            ) : (
              <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-500 mb-2">لم يتم تعيين عنوان افتراضي</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/my-account/addresses")}
                  className="text-xs text-[#1261D8] border-[#1261D8]/30"
                >
                  إدارة العناوين
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders Section (Maximum 3) */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-[#071A3D] flex items-center gap-2">
              <Package className="w-4 h-4 text-[#1261D8]" />
              الطلبات الأخيرة
            </CardTitle>
            <CardDescription className="text-xs">آخر طلبات الشراء المسجلة على حسابك</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/my-account/orders")}
            className="text-xs text-[#1261D8] hover:text-[#071A3D] font-bold flex items-center gap-1"
          >
            عرض جميع الطلبات
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          {isOrdersLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">جارٍ تحميل الطلبات...</div>
          ) : isOrdersError ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-rose-600">تعذر تحميل الطلبات الأخيرة</p>
              <Button size="sm" variant="outline" onClick={() => refetchOrders()} className="text-xs">
                إعادة المحاولة
              </Button>
            </div>
          ) : !recentOrders || recentOrders.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Package className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-600">لا توجد طلبات سابقة حتى الآن</p>
              <Button
                size="sm"
                onClick={() => navigate("/products")}
                className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-semibold"
              >
                تصفح المنتجات وابدأ التسوق
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-3.5 rounded-xl border border-slate-200/90 hover:border-[#1261D8]/40 hover:bg-slate-50/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#071A3D]">#{order.order_number}</span>
                      <OrderStatusBadge order={order} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{new Date(order.created_at).toLocaleDateString("ar-IQ")}</span>
                      <span>•</span>
                      <span>{order.items_count} {order.items_count === 1 ? "منتج" : "منتجات"}</span>
                      <span>•</span>
                      <span className="font-bold text-[#1261D8]">{formatPrice(order.total)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/my-account/orders?orderId=${order.id}`)}
                      className="text-xs font-semibold text-slate-700 border-slate-300 hover:bg-white"
                    >
                      تفاصيل الطلب
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Settings & Security Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Personal Info Form */}
        <Card className="lg:col-span-8 border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-[#071A3D] flex items-center gap-2">
              <User className="w-4 h-4 text-[#1261D8]" />
              المعلومات الشخصية
            </CardTitle>
            <CardDescription className="text-xs">تحديث اسمك وبيانات التواصل الأساسية</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs font-bold text-slate-700">
                    الاسم الكامل
                  </Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="أدخل اسمك الكامل"
                    className="text-sm bg-slate-50/50 border-slate-200"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-bold text-slate-700">
                    البريد الإلكتروني
                  </Label>
                  <Input
                    id="email"
                    value={customerEmail || (profile?.phone ? profile.phone : "لم يتم تسجيل بريد إلكتروني")}
                    disabled
                    className="text-sm bg-slate-100/80 border-slate-200 text-slate-500 cursor-not-allowed"
                    dir={customerEmail ? "ltr" : "rtl"}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="phone" className="text-xs font-bold text-slate-700">
                    رقم الهاتف
                  </Label>
                  {capabilities?.phoneIdentity ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-[#1261D8]" />
                        <span className="text-sm font-semibold text-slate-800" dir="ltr">
                          {profile?.phone || "لم يتم توثيق رقم هاتف"}
                        </span>
                        {profile?.phone_verified && (
                          <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            موثق
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/profile/security/phone")}
                        className="text-xs font-semibold text-[#1261D8] border-[#1261D8]/30 hover:bg-[#1261D8]/5"
                      >
                        إدارة وتوثيق رقم الهاتف
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Phone className="absolute right-3 top-3 text-slate-400" size={16} />
                      <Input
                        id="phone"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="07XXXXXXXX"
                        className="pr-10 text-sm bg-slate-50/50 border-slate-200"
                        dir="ltr"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-bold px-6 shadow-sm"
                >
                  {updateProfileMutation.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Account Security & Logout */}
        <Card className="lg:col-span-4 border-slate-200 shadow-sm bg-white flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base font-bold text-[#071A3D] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              أمان الحساب والجلسات
            </CardTitle>
            <CardDescription className="text-xs">إدارة جلسات تسجيل الدخول الحالية</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <Button
              variant="outline"
              onClick={() => void handleLogout()}
              className="w-full text-xs font-semibold text-rose-700 border-rose-200 hover:bg-rose-50 flex items-center justify-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              تسجيل الخروج من هذا الجهاز
            </Button>

            {capabilities?.federatedLogoutAll ? (
              <Button
                variant="outline"
                data-testid="logout-all-devices"
                disabled={loggingOutAll}
                onClick={() => void handleLogoutAll()}
                className="w-full text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                {loggingOutAll ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج من جميع الأجهزة"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Personalized Recommendations Section */}
      <AccountRecommendations
        title="منتجات مقترحة لك"
        subtitle="استكشف تشكيلة مختارة من أكثر المنتجات طلباً في ديل مارت"
      />
    </div>
  );
}

export default function Profile() {
  const { authStatus, appSession } = useAuth();
  const navigate = useNavigate();

  // Redirect only on definitive unauthenticated state
  useEffect(() => {
    if (authStatus === "bootstrapping" || authStatus === "storage_error") {
      return;
    }
    if (authStatus === "unauthenticated" || !appSession) {
      navigate("/auth");
    }
  }, [authStatus, appSession, navigate]);

  return (
    <AccountLayout
      title="لوحة الحساب"
      subtitle="نظرة عامة على نشاط حسابك وطلباتك الأخيرة وعناوينك المحفوظة"
    >
      {authStatus === "authenticated_ready" ? <ProfileDashboardContent /> : null}
    </AccountLayout>
  );
}
