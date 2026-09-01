import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Package, MapPin, Heart, ShieldCheck, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccountLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export default function AccountLayout({ children, title, subtitle, action }: AccountLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, appSession, session, authStatus, capabilities } = useAuth();

  const accountEmail = user?.email ?? appSession?.user?.email ?? session?.user?.email ?? "";
  const displayName = profile?.full_name?.trim() || "عميل ديل مارت";
  const points = profile?.points ?? 0;

  const isProvisional = Boolean(
    profile?.claim_required ||
    profile?.account_type === "provisional_customer" ||
    (capabilities?.accountClaim && !profile?.phone_verified)
  );

  const navItems = [
    {
      href: "/profile",
      label: "لوحة الحساب",
      icon: LayoutDashboard,
      active: location.pathname === "/profile",
    },
    {
      href: "/my-account/orders",
      label: "طلباتي",
      icon: Package,
      active: location.pathname.startsWith("/my-account/orders"),
    },
    {
      href: "/my-account/addresses",
      label: "عناويني",
      icon: MapPin,
      active: location.pathname.startsWith("/my-account/addresses"),
    },
    {
      href: "/wishlist",
      label: "المفضلة",
      icon: Heart,
      active: location.pathname === "/wishlist",
    },
    ...(capabilities?.phoneIdentity
      ? [
          {
            href: "/profile/security/phone",
            label: "توثيق الهاتف",
            icon: ShieldCheck,
            active: location.pathname === "/profile/security/phone",
          },
        ]
      : []),
  ];

  if (authStatus === "bootstrapping" || authStatus === "authenticated_loading_context") {
    return (
      <div className="min-h-screen flex flex-col bg-[#F5F7FA]" dir="rtl">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-16 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-4 border-[#1261D8] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-500 font-medium">جارٍ تحميل بيانات الحساب...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (authStatus === "authenticated_offline" && appSession) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F5F7FA]" dir="rtl" data-testid="profile-offline-shell">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto space-y-4">
            <h1 className="text-2xl font-bold text-[#071A3D]">حسابي</h1>
            <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-amber-900 text-lg">أنت متصل بالحساب دون شبكة</CardTitle>
                <CardDescription className="text-amber-700 text-sm">
                  الجلسة محفوظة على الجهاز. سيتم تحديث بيانات الحساب تلقائيًا عند عودة الإنترنت.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <p>البريد: <span className="font-semibold text-slate-800">{accountEmail || "—"}</span></p>
                <p className="text-amber-800 font-medium">لا يوجد اتصال بالإنترنت</p>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
        <WhatsAppButton />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F7FA]" dir="rtl">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        {/* Provisional / Account Claim Alert */}
        {isProvisional && (
          <Card className="mb-6 border-amber-300 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent shadow-sm">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-right">
                <h3 className="font-bold text-amber-900 text-sm flex items-center justify-center sm:justify-start gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  حسابك غير موثق بالكامل
                </h3>
                <p className="text-xs text-amber-800">
                  قم بتأكيد حسابك وتعيين كلمة مرور لحفظ طلباتك ونقاطك وإدارتها بسهولة.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => navigate("/claim-account")}
                className="bg-[#FF8A00] hover:bg-[#E07A00] text-white font-medium shrink-0 shadow-sm"
              >
                تأكيد واستلام الحساب
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar / Navigation (Desktop: 3 cols, Mobile: full width horizontal scroll) */}
          <aside className="lg:col-span-3 space-y-4">
            {/* User Profile Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#1261D8]/10 text-[#1261D8] flex items-center justify-center font-bold text-lg border border-[#1261D8]/20 shrink-0">
                  {displayName.charAt(0) || <User className="w-6 h-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-[#071A3D] truncate">{displayName}</h2>
                  <p className="text-xs text-slate-500 truncate" dir="ltr">{accountEmail || profile?.phone || "عميل ديل مارت"}</p>
                </div>
              </div>

              {/* Loyalty summary badge */}
              <div className="bg-gradient-to-l from-[#1261D8]/5 to-indigo-50/50 rounded-xl p-3 border border-[#1261D8]/15 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FF8A00]" />
                  <span className="text-xs font-semibold text-slate-700">رصيد النقاط:</span>
                </div>
                <span className="text-sm font-bold text-[#1261D8]">{points.toLocaleString("ar-IQ")} نقطة</span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex flex-col bg-white rounded-2xl p-2 border border-slate-200/80 shadow-sm space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                      item.active
                        ? "bg-[#1261D8] text-white shadow-sm shadow-[#1261D8]/25 font-bold"
                        : "text-slate-600 hover:text-[#071A3D] hover:bg-slate-50"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", item.active ? "text-white" : "text-slate-400")} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Mobile Navigation Horizontal Scrollable Bar */}
            <div className="lg:hidden flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 border",
                      item.active
                        ? "bg-[#1261D8] text-white border-[#1261D8] shadow-sm font-bold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </aside>

          {/* Main Account Content Area (9 cols on desktop) */}
          <section className="lg:col-span-9 space-y-6">
            {(title || action) && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
                <div>
                  {title && <h1 className="text-2xl font-bold text-[#071A3D]">{title}</h1>}
                  {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
                </div>
                {action && <div>{action}</div>}
              </div>
            )}

            {children}
          </section>
        </div>
      </main>

      <Footer />
      <WhatsAppButton />
    </div>
  );
}
