import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { Navigate, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Box,
  ShoppingBag,
  Settings,
  LogOut,
  Store,
  Ticket,
  Users,
  Wallet,
  Menu,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { findActiveBackofficeNavItem, isBackofficeNavPathActive } from "@/lib/backoffice-navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { MerchantNotifications } from "@/components/merchant/MerchantNotifications";
import { MerchantNewOrderAlertBanner } from "@/components/merchant/MerchantNewOrderAlertBanner";
import { MerchantPwaBootstrap } from "@/components/merchant/MerchantPwaBootstrap";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import MerchantDecisionModal from "@/components/merchant/MerchantDecisionModal";
import { getOrCreateMerchantDeviceId } from "@/lib/merchant-push";
import { merchantApi } from "@/lib/api/merchant";
import { stopMerchantOrderAlertLoop } from "@/lib/notifications";

const navItems = [
  { label: "نظرة عامة", icon: LayoutDashboard, href: "/merchant/" },
  { label: "المنتجات", icon: Box, href: "/merchant/products" },
  { label: "الطلبات", icon: ShoppingBag, href: "/merchant/orders" },
  { label: "المالية", icon: Wallet, href: "/merchant/finance" },
  { label: "الكوبونات", icon: Ticket, href: "/merchant/coupons" },
  { label: "العملاء", icon: Users, href: "/merchant/customers" },
  { label: "الإعدادات", icon: Settings, href: "/merchant/settings" },
];

const MerchantLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, isMerchantUser, loading, logoutCurrentDevice } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const {
    data: membership,
    memberships,
    activeMemberships,
    hasNoActiveMerchant,
    setActiveMerchantId,
    isLoading: membershipLoading,
  } = useCurrentMerchant();

  // Pending orders queue state
  const { count, currentOrderId, refetch } = usePendingOrders();
  const [modalOpenOrderId, setModalOpenOrderId] = useState<string | null>(null);

  // Guard to prevent auto-opening backlog repeatedly on page transitions
  const hasAutoOpenedBacklogRef = useRef(false);

  // Setup listener for real-time incoming orders from NotificationHub
  useEffect(() => {
    const handleNewOrder = (e: Event) => {
      const customEvent = e as CustomEvent;
      const orderId = customEvent.detail?.orderId;
      if (orderId) {
        // Refetch the queue to make sure it includes the new order
        refetch().then(() => {
          setModalOpenOrderId(orderId);
        });
      }
    };
    window.addEventListener("merchant-new-order", handleNewOrder);
    return () => window.removeEventListener("merchant-new-order", handleNewOrder);
  }, [refetch]);

  // Acknowledge when merchant opens an order (decision modal / deep link)
  useEffect(() => {
    if (!modalOpenOrderId || !membership?.merchant_id) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await merchantApi.listMerchantNotifications(membership.merchant_id, 40);
        const match = list.find(
          (n) => n.type === "new_order" && n.order_id === modalOpenOrderId && !n.acknowledged_at,
        );
        if (!match || cancelled) return;
        await merchantApi.acknowledgeMerchantNotification(match.id, {
          device_id: getOrCreateMerchantDeviceId(),
          opened: true,
        });
        stopMerchantOrderAlertLoop();
        queryClient.invalidateQueries({ queryKey: ["merchant-notifications", membership.merchant_id] });
      } catch {
        // non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpenOrderId, membership?.merchant_id, queryClient]);

  // Deep-link from Push: /merchant/orders/:id?notification=<id>
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const notificationId = params.get("notification");
    if (!notificationId || !membership?.merchant_id) return;
    void merchantApi
      .acknowledgeMerchantNotification(notificationId, {
        device_id: getOrCreateMerchantDeviceId(),
        opened: true,
      })
      .then(() => {
        stopMerchantOrderAlertLoop();
        queryClient.invalidateQueries({ queryKey: ["merchant-notifications", membership.merchant_id] });
        const next = new URLSearchParams(location.search);
        next.delete("notification");
        const qs = next.toString();
        window.history.replaceState({}, "", `${location.pathname}${qs ? `?${qs}` : ""}`);
      })
      .catch(() => undefined);
  }, [location.search, location.pathname, membership?.merchant_id, queryClient]);

  // Backlog Auto-Open: runs only on initial layout render when on the Overview page
  useEffect(() => {
    if (
      !membershipLoading &&
      currentOrderId &&
      (location.pathname === "/merchant" || location.pathname === "/merchant/") &&
      !hasAutoOpenedBacklogRef.current
    ) {
      setModalOpenOrderId(currentOrderId);
      hasAutoOpenedBacklogRef.current = true;
    }
  }, [currentOrderId, location.pathname, membershipLoading]);

  if (loading || membershipLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-medium">جاري تحميل بيانات التاجر...</p>
        </div>
      </div>
    );
  }

  if (!user || !isMerchantUser) {
    return <Navigate to="/merchant/login" replace />;
  }

  if (!membership?.merchant_id) {
    if (hasNoActiveMerchant && (memberships ?? []).length > 0) {
      return <Navigate to="/merchant/pending" replace />;
    }
    return <Navigate to="/merchant/register" replace />;
  }

  const handleLogout = async () => {
    try {
      await logoutCurrentDevice();
      toast.success("تم تسجيل الخروج بنجاح");
    } catch {
      toast.error("تعذر تسجيل الخروج بأمان. حاول مرة أخرى.");
    }
  };

  const handleMerchantSwitch = (merchantId: string) => {
    if (!merchantId || merchantId === membership?.merchant_id) return;
    if (!setActiveMerchantId(merchantId)) {
      toast.error("لا يمكن اختيار هذا المتجر.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["auth-context"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-products"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-coupons"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-customers"] });
    queryClient.invalidateQueries({ queryKey: ["merchant-dashboard-v2"] });
    queryClient.invalidateQueries({ queryKey: ["merchant-notifications"] });
    toast.success("تم تغيير المتجر النشط.");
  };

  const currentStoreDisplayName = membership.merchants?.display_name ?? "متجر التاجر";
  const activeCount = (activeMemberships ?? []).length;

  const merchantNavigation = (
    <div className="flex h-full flex-col">
      {/* Brand & Store Header */}
      <div className="p-4 lg:p-5 border-b border-border bg-card/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-foreground tracking-tight">بوابة التاجر</div>
            <div className="text-xs text-muted-foreground truncate" title={currentStoreDisplayName}>
              {currentStoreDisplayName}
            </div>
          </div>
        </div>

        {/* Multi-store Switcher if more than 1 active store */}
        {activeCount > 1 && (
          <div className="mt-3.5 pt-3 border-t border-border/70">
            <label htmlFor="merchant-store-switcher" className="text-[11px] font-medium text-muted-foreground block mb-1.5">
              تبديل المتجر النشط:
            </label>
            <div className="relative">
              <select
                id="merchant-store-switcher"
                data-testid="merchant-store-switcher"
                className="h-9 w-full appearance-none rounded-lg border border-input bg-background pl-8 pr-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary truncate cursor-pointer"
                value={membership.merchant_id}
                onChange={(e) => handleMerchantSwitch(e.target.value)}
                aria-label="المتجر النشط"
              >
                {(activeMemberships ?? []).map((item) => (
                  <option key={item.merchant_id} value={item.merchant_id}>
                    {item.merchants?.display_name ?? item.merchant_id}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="p-3 space-y-1 flex-1 overflow-y-auto" aria-label="أقسام بوابة التاجر">
        {navItems.map((item) => {
          const isActive = isBackofficeNavPathActive(location.pathname, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setMobileMenuOpen(false)}
              className="block"
            >
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={`w-full justify-start gap-3 h-10 rounded-lg text-xs font-bold transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span>{item.label}</span>
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* Footer / Logout */}
      <div className="p-3 border-t border-border bg-card/40">
        <Button
          variant="ghost"
          data-testid="merchant-logout-btn"
          className="w-full justify-start gap-3 h-10 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>تسجيل الخروج</span>
        </Button>
      </div>
    </div>
  );

  const handleDecisionComplete = async () => {
    const result = await refetch();
    const nextOrderId = result.data?.items?.[0]?.id ?? null;
    if (nextOrderId) {
      setModalOpenOrderId(nextOrderId);
    } else {
      setModalOpenOrderId(null);
    }
  };

  const activePageTitle = findActiveBackofficeNavItem(navItems, location.pathname)?.label || "بوابة التاجر";

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-background flex font-tajawal" dir="rtl">
      <MerchantPwaBootstrap />

      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-64 border-l border-border bg-card flex-col shrink-0 sticky top-0 h-screen shadow-sm">
        {merchantNavigation}
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Operational Bar */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-8 sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Sheet Trigger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden h-9 w-9 rounded-lg"
                  aria-label="فتح القائمة الجانبية"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-xs p-0 flex flex-col">
                <SheetHeader className="sr-only">
                  <SheetTitle>قائمة التاجر</SheetTitle>
                </SheetHeader>
                {merchantNavigation}
              </SheetContent>
            </Sheet>

            <h1 className="font-bold text-base sm:text-lg text-foreground truncate">{activePageTitle}</h1>
            <Badge variant="secondary" className="hidden sm:inline-flex bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[11px] font-semibold">
              نطاق التاجر
            </Badge>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <MerchantNotifications merchantId={membership.merchant_id} />
            <div className="hidden sm:block text-xs font-medium text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full border border-border">
              {profile?.email?.split("@")[0] ?? "التاجر"}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          <MerchantNewOrderAlertBanner merchantId={membership.merchant_id} />

          {/* Pending Backlog Alert Banner */}
          {count > 0 && !modalOpenOrderId && (
            <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in no-print">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 animate-pulse" />
                <span>لديك {count} {count === 1 ? "طلب جديد" : "طلبات جديدة"} بانتظار قرار القبول أو الرفض.</span>
              </div>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-white font-semibold text-xs px-4 rounded-lg self-start sm:self-auto"
                onClick={() => setModalOpenOrderId(currentOrderId)}
              >
                مراجعة الطلبات
              </Button>
            </div>
          )}

          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* Decision Modal & Queue */}
      {modalOpenOrderId && (
        <MerchantDecisionModal
          orderId={modalOpenOrderId}
          merchantId={membership.merchant_id}
          onClose={() => {
            setModalOpenOrderId(null);
            refetch();
          }}
          onDecisionComplete={handleDecisionComplete}
          queueCount={count}
        />
      )}
    </div>
  );
};

export default MerchantLayout;
