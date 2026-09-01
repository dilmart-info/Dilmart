import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Ticket,
  Users,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  Store,
  AlertCircle,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { usePendingOrders } from "@/hooks/use-pending-orders";
import { merchantApi } from "@/lib/api/merchant";
import { getOrCreateMerchantDeviceId } from "@/lib/merchant-push";
import { stopMerchantOrderAlertLoop } from "@/lib/notifications";
import { canMerchantDecide } from "@/lib/merchant-role-authority";
import { isBackofficeNavPathActive, findActiveBackofficeNavItem } from "@/lib/backoffice-navigation";
import { toast } from "sonner";
import MerchantDecisionModal from "@/components/merchant/MerchantDecisionModal";
import { MerchantNotifications } from "@/components/merchant/MerchantNotifications";
import { MerchantNewOrderAlertBanner } from "@/components/merchant/MerchantNewOrderAlertBanner";
import { MerchantPwaBootstrap } from "@/components/merchant/MerchantPwaBootstrap";

interface MerchantLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/merchant", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/merchant/products", label: "المنتجات", icon: Package },
  { href: "/merchant/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/merchant/coupons", label: "الكوبونات", icon: Ticket },
  { href: "/merchant/customers", label: "العملاء", icon: Users },
  { href: "/merchant/finance", label: "المالية والأرباح", icon: DollarSign },
  { href: "/merchant/settings", label: "الإعدادات", icon: Settings },
] as const;

export const MerchantLayout: React.FC<MerchantLayoutProps> = ({ children }) => {
  const { user, profile, loading, isMerchantUser, logoutCurrentDevice } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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

  const isAuthorizedToDecide = canMerchantDecide(membership?.role);

  // Pending orders queue state
  const { count, currentOrderId, refetch } = usePendingOrders();
  const [modalOpenOrderId, setModalOpenOrderId] = useState<string | null>(null);

  // Guard to prevent auto-opening backlog repeatedly on page transitions
  const hasAutoOpenedBacklogRef = useRef(false);

  // Active merchant ref for async race and store-switch isolation
  const activeMerchantIdRef = useRef(membership?.merchant_id);
  useEffect(() => {
    activeMerchantIdRef.current = membership?.merchant_id;
  }, [membership?.merchant_id]);

  // Store switch isolation: reset modal and queue state immediately when active merchant changes
  useEffect(() => {
    setModalOpenOrderId(null);
    hasAutoOpenedBacklogRef.current = false;
  }, [membership?.merchant_id]);

  // Setup listener for real-time incoming orders from NotificationHub
  useEffect(() => {
    const handleNewOrder = (e: Event) => {
      const customEvent = e as CustomEvent;
      const orderId = customEvent.detail?.orderId;
      const eventMerchantId = customEvent.detail?.merchantId;

      const currentActiveMerchantId = activeMerchantIdRef.current;

      // Fail closed on missing, undefined, or mismatched merchant IDs
      if (!eventMerchantId || !currentActiveMerchantId || eventMerchantId !== currentActiveMerchantId) {
        return;
      }

      if (orderId && isAuthorizedToDecide) {
        const capturedMerchantId = currentActiveMerchantId;

        refetch().then((res) => {
          // Re-check against latest active merchant after refetch resolves
          if (capturedMerchantId !== activeMerchantIdRef.current) {
            return;
          }

          const pendingList = res.data?.items ?? [];
          const existsInQueue = pendingList.some((item: { id?: string }) => item.id === orderId);
          if (existsInQueue) {
            setModalOpenOrderId(orderId);
          }
        });
      } else {
        void refetch();
      }
    };
    window.addEventListener("merchant-new-order", handleNewOrder);
    return () => window.removeEventListener("merchant-new-order", handleNewOrder);
  }, [refetch, isAuthorizedToDecide]);

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

  // Backlog Auto-Open: runs only for authorized owner/manager on initial render when on Overview
  useEffect(() => {
    if (
      !membershipLoading &&
      isAuthorizedToDecide &&
      currentOrderId &&
      (location.pathname === "/merchant" || location.pathname === "/merchant/") &&
      !hasAutoOpenedBacklogRef.current
    ) {
      setModalOpenOrderId(currentOrderId);
      hasAutoOpenedBacklogRef.current = true;
    }
  }, [currentOrderId, location.pathname, membershipLoading, isAuthorizedToDecide]);

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

  const handleMerchantSwitch = (newMerchantId: string) => {
    if (newMerchantId === membership.merchant_id) return;
    const ok = setActiveMerchantId(newMerchantId);
    if (!ok) return;
    setModalOpenOrderId(null);
    queryClient.invalidateQueries({ queryKey: ["auth-context"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-products"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-coupons"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-customers"] });
    queryClient.invalidateQueries({ queryKey: ["merchant-dashboard-v2"] });
    queryClient.invalidateQueries({ queryKey: ["merchant-notifications"] });
    queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders"] });
    toast.success("تم تغيير المتجر النشط.");
  };

  const currentStoreDisplayName = membership.merchants?.display_name ?? membership.merchant_id;
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
                {item.href === "/merchant/orders" && count > 0 && (
                  <Badge variant={isActive ? "secondary" : "destructive"} className="mr-auto h-5 px-1.5 text-[10px] font-bold">
                    {count}
                  </Badge>
                )}
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
                <span>
                  {isAuthorizedToDecide
                    ? `لديك ${count} ${count === 1 ? "طلب جديد" : "طلبات جديدة"} بانتظار قرار القبول أو الرفض.`
                    : `لديك ${count} ${count === 1 ? "طلب جديد" : "طلبات جديدة"} في قائمة الانتظار.`}
                </span>
              </div>
              {isAuthorizedToDecide ? (
                <Button
                  size="sm"
                  className="bg-destructive hover:bg-destructive/90 text-white font-semibold text-xs px-4 rounded-lg self-start sm:self-auto"
                  onClick={() => setModalOpenOrderId(currentOrderId)}
                >
                  مراجعة الطلبات
                </Button>
              ) : (
                <Link to="/merchant/orders">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold text-xs px-4 rounded-lg self-start sm:self-auto"
                  >
                    عرض قائمة الطلبات
                  </Button>
                </Link>
              )}
            </div>
          )}

          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* Decision Modal & Queue */}
      {modalOpenOrderId && isAuthorizedToDecide && (
        <MerchantDecisionModal
          orderId={modalOpenOrderId}
          merchantId={membership.merchant_id}
          role={membership.role}
          onClose={() => {
            setModalOpenOrderId(null);
            void refetch();
          }}
          onDecisionComplete={handleDecisionComplete}
          queueCount={count}
        />
      )}
    </div>
  );
};

export default MerchantLayout;
