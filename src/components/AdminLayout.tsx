import { useAuth } from "@/hooks/use-auth";
import { Navigate, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingBag, Box, Tags, LogOut, Menu, Package, Truck, Ticket, Users, Coins, X, Store, LineChart, RefreshCcw, Layers, SlidersHorizontal, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Notifications } from "@/components/admin/Notifications";
import { findActiveBackofficeNavItem, isBackofficeNavPathActive } from "@/lib/backoffice-navigation";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
    const { user, profile, isAdmin, loading, logoutCurrentDevice } = useAuth();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close mobile sidebar when route changes
    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);

    if (loading) return <div className="flex items-center justify-center min-h-screen">جاري التحميل...</div>;

    if (!user || !isAdmin) {
        return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }

    const handleLogout = async () => {
        await logoutCurrentDevice();
        toast.success("تم تسجيل الخروج");
    };

    const navItems = [
        { label: "نظرة عامة", icon: LayoutDashboard, href: "/admin" },
        { label: "حوكمة تنفيذية", icon: LineChart, href: "/admin/executive" },
        { label: "التسويات", icon: RefreshCcw, href: "/admin/reconciliation" },
        { label: "التسوية المالية", icon: RefreshCcw, href: "/admin/finance" },
        { label: "الطلبات", icon: ShoppingBag, href: "/admin/orders" },
        { label: "المنتجات", icon: Box, href: "/admin/products" },
        { label: "الأقسام", icon: Tags, href: "/admin/categories" },
        { label: "المخزون", icon: Package, href: "/admin/inventory" },
        { label: "التوصيل", icon: Truck, href: "/admin/delivery" },
        { label: "عمليات التوصيل", icon: Truck, href: "/admin/delivery-ops" },
        { label: "ذكاء التوصيل", icon: LineChart, href: "/admin/delivery-intelligence" },
        { label: "مركز تكامل Jenni", icon: Link2, href: "/admin/integrations/jenni" },
        { label: "الكوبونات", icon: Ticket, href: "/admin/coupons" },
        { label: "الوكلاء (المناديب)", icon: Users, href: "/admin/agents" },
        { label: "التجار", icon: Store, href: "/admin/merchants" },
        { label: "خطط التجار", icon: Layers, href: "/admin/merchant-plans" },
        { label: "تعيين الخطط", icon: Layers, href: "/admin/merchant-plan-assignments" },
        { label: "القواعد التجارية", icon: SlidersHorizontal, href: "/admin/commercial-rules" },
        { label: "روابط شريط الهيدر", icon: Link2, href: "/admin/desktop-quick-links" },
        { label: "نظام الولاء", icon: Coins, href: "/admin/loyalty" },
        { label: "المستخدمين", icon: Users, href: "/admin/users" },
    ];

    return (
        <div className="min-h-screen bg-muted/30 flex relative">
            {/* Mobile Overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 right-0 z-50 bg-card border-l border-border transition-transform duration-300 lg:static lg:translate-x-0 no-print
                ${sidebarOpen ? "w-64" : "w-20"}
                ${mobileOpen ? "translate-x-0" : "translate-x-full"}
                flex flex-col
            `}>
                <div className="p-6 flex items-center justify-between border-b border-border">
                    {(sidebarOpen || mobileOpen) && <span className="font-bold text-xl">لوحة التحكم</span>}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => mobileOpen ? setMobileOpen(false) : setSidebarOpen(!sidebarOpen)}
                        className="lg:flex"
                    >
                        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </Button>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navItems.map((item) => {
                        // Same rule as the header title below — one source of truth, so the sidebar
                        // and the header can never disagree about the current section.
                        const isActive = isBackofficeNavPathActive(location.pathname, item.href);
                        return (
                        <Link key={item.href} to={item.href} aria-current={isActive ? "page" : undefined}>
                            <Button
                                variant={isActive ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-3 ${(sidebarOpen || mobileOpen) ? "" : "px-0 justify-center"}`}
                            >
                                <item.icon size={20} />
                                {(sidebarOpen || mobileOpen) && <span>{item.label}</span>}
                            </Button>
                        </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-border mt-auto">
                    <Button
                        variant="ghost"
                        className={`w-full justify-start gap-3 text-destructive hover:text-destructive ${(sidebarOpen || mobileOpen) ? "" : "px-0 justify-center"}`}
                        onClick={handleLogout}
                    >
                        <LogOut size={20} />
                        {(sidebarOpen || mobileOpen) && <span>تسجيل الخروج</span>}
                    </Button>
                </div>
            </aside>

            {/* Content */}
            <main className="flex-1 overflow-x-hidden min-h-screen">
                <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-8 sticky top-0 z-10 no-print safe-top">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden"
                            onClick={() => setMobileOpen(true)}
                        >
                            <Menu size={24} />
                        </Button>
                        <h1 className="font-bold text-md lg:text-lg whitespace-nowrap">
                            {findActiveBackofficeNavItem(navItems, location.pathname)?.label || "لوحة التحكم"}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 lg:gap-4">
                        <Notifications />
                        <div className="text-xs lg:text-sm font-medium truncate max-w-[120px] lg:max-w-none">
                            {profile?.email?.split('@')[0]}
                        </div>
                    </div>
                </header>
                <div className="p-4 lg:p-8 pb-20 lg:pb-8">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
