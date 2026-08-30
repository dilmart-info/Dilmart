import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { Navigate, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Box, ShoppingBag, Settings, LogOut, Store, Ticket, Users, Wallet, Menu, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const { pendingOrders, count, currentOrderId, refetch, merchantId } = usePendingOrders();
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
    if (!membershipLoading && currentOrderId && (location.pathname === "/merchant" || location.pathname === "/merchant/") && !hasAutoOpenedBacklogRef.current) {
      setModalOpenOrderId(currentOrderId);
      hasAutoOpenedBacklogRef.current = true;
    }
  }, [currentOrderId, location.pathname, membershipLoading]);

  if (loading || membershipLoading) return <div className="flex min-h-screen items-center justify-center">جاري التحميل...</div>;

  if (!user || !isMerchantUser) {
    return <Navigate to="/merchant/login" replace />;
  }

  if (!membership?.merchant_id) {
    // Memberships are resolved. Distinguish "no store at all" (register) from
    // "has stores, none of them active" (pending) — a suspended store must never be selected.
    if (hasNoActiveMerchant && (memberships ?? []).length > 0) {
      return <Navigate to="/merchant/pending" replace />;
    }
    return <Navigate to="/merchant/register" replace />;
  }

  const handleLogout = async () => {
    await logoutCurrentDevice();
    toast.success("تم تسجيل الخروج");
  };

  const navItems = [
    { label: "نظرة عامة", icon: LayoutDashboard, href: "/merchant/" },
    { label: "المنتجات", icon: Box, href: "/merchant/products" },
    { label: "الطلبات", icon: ShoppingBag, href: "/merchant/orders" },
    { label: "المالية", icon: Wallet, href: "/merchant/finance" },
    { label: "الكوبونات", icon: Ticket, href: "/merchant/coupons" },
    { label: "العملاء", icon: Users, href: "/merchant/customers" },
    { label: "الإعدادات", icon: Settings, href: "/merchant/settings" },
  ];

  const handleMerchantSwitch = (merchantId: string) => {
    if (!merchantId || merchantId === membership?.merchant_id) return;
    // The hook is the authority: a suspended / non-member / unknown id is refused here and the
    // current store stays selected. Selection is state, so the switch renders immediately.
    if (!setActiveMerchantId(merchantId)) {
      toast.error("لا يمكن اختيار هذا المتجر.");
      return;
    }
    // Merchant-scoped caches are keyed by merchant id, so switching cannot show the previous
    // store's data; these invalidations only refresh the newly selected store's data.
    queryClient.invalidateQueries({ queryKey: ["auth-context"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-products"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-coupons"] });
    queryClient.invalidateQueries({ queryKey: ["scoped-customers"] });
    toast.success("تم تغيير المتجر النشط.");
  };

  const merchantNavigation = (
    <>
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <Store size={18} />
          <div className="font-bold">بوابة التاجر</div>
        </div>
        <div className="text-xs text-muted-foreground mt-2">{(membership.merchants as any)?.display_name ?? "متجر"}</div>
        {(activeMemberships ?? []).length > 1 ? (
          <select
            className="mt-3 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            value={membership?.merchant_id ?? ""}
            onChange={(e) => handleMerchantSwitch(e.target.value)}
            aria-label="المتجر النشط"
          >
            {/* Only selectable (active) stores are offered — a suspended store is not an option. */}
            {(activeMemberships ?? []).map((item) => (
              <option key={item.merchant_id} value={item.merchant_id}>
                {item.merchants?.display_name ?? item.merchant_id}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <nav className="p-4 space-y-2 flex-1">
        {navItems.map((item) => {
          // Same rule as the header title — one source of truth for the active section, and it
          // holds for the desktop sidebar and the mobile Sheet alike.
          const isActive = isBackofficeNavPathActive(location.pathname, item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Button variant={isActive ? "secondary" : "ghost"} className="w-full justify-start gap-3">
                <item.icon size={18} />
                <span>{item.label}</span>
              </Button>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <Button variant="ghost" className="w-full justify-start gap-3 text-destructive" onClick={handleLogout}>
          <LogOut size={18} />
          <span>تسجيل الخروج</span>
        </Button>
      </div>
    </>
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

  return (
    <div className="min-h-screen bg-muted/30 flex">
      <MerchantPwaBootstrap />
      <aside className="hidden lg:flex w-64 border-l border-border bg-card flex-col">
        {merchantNavigation}
      </aside>

      <main className="flex-1 min-h-screen">
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-xs p-0 flex flex-col">
                <SheetHeader className="sr-only">
                  <SheetTitle>قائمة التاجر</SheetTitle>
                </SheetHeader>
                {merchantNavigation}
              </SheetContent>
            </Sheet>
            <h1 className="font-bold">{findActiveBackofficeNavItem(navItems, location.pathname)?.label || "بوابة التاجر"}</h1>
            <span className="text-[11px] rounded-full bg-blue-100 text-blue-700 px-2 py-1 font-semibold">نطاق التاجر</span>
          </div>
          <div className="flex items-center gap-4">
            <MerchantNotifications merchantId={membership.merchant_id} />
            <div className="text-sm text-muted-foreground">{profile?.email?.split("@")[0]}</div>
          </div>
        </header>
        <div className="relative">
          <MerchantNewOrderAlertBanner merchantId={membership.merchant_id} />
          {/* Backlog Banner */}
          {count > 0 && !modalOpenOrderId && (
            <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in no-print">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertCircle size={18} className="animate-pulse" />
                <span>لديك {count} {count === 1 ? "طلب جديد" : "طلبات جديدة"} بانتظار قرار القبول أو الرفض.</span>
              </div>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-white font-semibold text-xs px-4"
                onClick={() => setModalOpenOrderId(currentOrderId)}
              >
                مراجعة الطلبات
              </Button>
            </div>
          )}
          <div className="p-4 lg:p-8">{children}</div>
        </div>
      </main>

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
