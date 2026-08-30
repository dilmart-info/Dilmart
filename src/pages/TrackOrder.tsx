import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  Search,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ListOrdered,
  Phone,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { useResetOnPrincipalReplaced } from "@/lib/auth/use-customer-principal";
import { toast } from "sonner";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type DeliveryStatus =
  | "new"
  | "preparing"
  | "processing"
  | "confirmed"
  | "pending_assignment"
  | "assigned_to_company"
  | "assigned_to_agent"
  | "picked_up"
  | "in_transit"
  | "shipped"
  | "delivered"
  | "failed"
  | "returned"
  | "cancelled";

type OrderDetail = Awaited<ReturnType<typeof apiClient.getCustomerOrderDetail>>;
type OrderSummary = Awaited<ReturnType<typeof apiClient.getCustomerOrders>>[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const steps = [
  { id: 1, label: "جاري تجهيز الطلب", icon: Package },
  { id: 2, label: "تم تعيين شركة التوصيل", icon: Truck },
  { id: 3, label: "تم استلام الطلب من التاجر", icon: CheckCircle2 },
  { id: 4, label: "الطلب في الطريق", icon: Truck },
  { id: 5, label: "تم التوصيل", icon: CheckCircle2 },
];

function getStatusStep(status: DeliveryStatus): number {
  switch (status) {
    case "new":
    case "preparing":
    case "processing":
    case "confirmed":
    case "pending_assignment":
      return 1;
    case "assigned_to_company":
    case "assigned_to_agent":
      return 2;
    case "picked_up":
      return 3;
    case "in_transit":
    case "shipped":
      return 4;
    case "delivered":
      return 5;
    default:
      return 0;
  }
}

// ─── Order Detail Panel (shared between modes) ────────────────────────────────

function OrderDetailPanel({ orderData }: { orderData: OrderDetail | any }) {
  const effectiveStatus: DeliveryStatus = (
    orderData.delivery_status ?? orderData.status
  ) as DeliveryStatus;
  const currentStep = getStatusStep(effectiveStatus);
  const isCancelled = effectiveStatus === "cancelled";

  return (
    <div className="mt-8 pt-8 border-t border-border animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Order header */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-8 bg-muted/30 p-4 rounded-xl">
        <div>
          <p className="text-sm text-muted-foreground">رقم الطلب</p>
          <p className="font-black text-xl">#{orderData.order_number}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">تاريخ الطلب</p>
          <p className="font-bold">
            {format(new Date(orderData.created_at), "dd MMMM yyyy", {
              locale: arSA,
            })}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">الإجمالي</p>
          <p className="font-bold text-primary">{formatPrice(orderData.total)}</p>
        </div>
      </div>

      {/* Status display */}
      {isCancelled ? (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center text-destructive">
          <XCircle size={48} className="mx-auto mb-4" />
          <h3 className="text-xl font-black mb-2">تم إلغاء هذا الطلب</h3>
          <p>يرجى التواصل مع خدمة العملاء لمزيد من التفاصيل.</p>
        </div>
      ) : effectiveStatus === "failed" || effectiveStatus === "returned" ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800">
          <Clock size={48} className="mx-auto mb-4" />
          <h3 className="text-xl font-black mb-2">
            {effectiveStatus === "returned" ? "تم إرجاع الطلب" : "تعذر التسليم"}
          </h3>
          <p>يرجى التواصل مع الدعم لمتابعة الإجراء المناسب.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Progress bar */}
          <div className="absolute top-5 right-0 left-0 h-1 bg-muted rounded-full overflow-hidden hidden md:block">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-out"
              style={{ width: `${Math.max(0, (currentStep - 1) * 25)}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 relative">
            {steps.map((step) => {
              const isCompleted = currentStep >= step.id;
              const isCurrent = currentStep === step.id;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex flex-row md:flex-col items-center md:text-center gap-4 md:gap-2 p-4 rounded-xl border md:border-none transition-all duration-300",
                    isCompleted
                      ? "border-primary/20 bg-primary/5 md:bg-transparent"
                      : "border-border bg-muted/10 md:bg-transparent opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all duration-500",
                      isCompleted
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <step.icon size={20} />
                  </div>
                  <div className="flex-1 md:flex-none">
                    <p
                      className={cn(
                        "font-bold",
                        isCompleted ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-primary animate-pulse font-medium mt-1">
                        جاري الآن...
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Items list */}
      {orderData.items && orderData.items.length > 0 && (
        <div className="mt-8 space-y-3">
          <p className="font-semibold text-sm text-muted-foreground">منتجات الطلب</p>
          {orderData.items.map((item: any, idx: number) => (
            <div
              key={item.product_id ?? idx}
              className="flex justify-between items-center text-sm bg-muted/20 rounded-lg px-4 py-2"
            >
              <span className="font-medium">{item.product_name}</span>
              <span className="text-muted-foreground">
                {item.quantity} × {formatPrice(item.price)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Guest search form ────────────────────────────────────────────────────────

function GuestSearchForm() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOrderData(null);
    if (!orderNumber.trim() || !phone.trim()) {
      toast.error("يرجى إدخال رقم الطلب ورقم الهاتف");
      return;
    }
    setLoading(true);
    try {
      const data = await apiClient.trackOrder({
        order_number: orderNumber.trim(),
        phone: phone.trim(),
      });
      if (data.found) {
        setOrderData(data);
        toast.success("تم العثور على الطلب");
      } else {
        setError(data.message || "الطلب غير موجود");
      }
    } catch {
      setError("حدث خطأ أثناء البحث عن الطلب");
      toast.error("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        onSubmit={handleSearch}
      >
        <div className="space-y-2">
          <Label htmlFor="orderNumber">رقم الطلب</Label>
          <div className="relative">
            <Input
              id="orderNumber"
              placeholder="مثال: DUK-260706-1234"
              className="h-12 pr-10"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
            <Package className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">رقم الهاتف</Label>
          <div className="relative">
            <Input
              id="phone"
              placeholder="07xxxxxxxxx"
              className="h-12 pr-10"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          </div>
        </div>
        <div className="md:col-span-2 pt-2">
          <Button className="w-full h-12 text-lg font-bold" disabled={loading}>
            {loading ? "جاري البحث..." : "تتبع الطلب"}
          </Button>
        </div>
      </form>

      {error && (
        <div className="mt-6 p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          <span className="font-bold">{error}</span>
        </div>
      )}

      {orderData && <OrderDetailPanel orderData={orderData} />}
    </>
  );
}

// ─── Authenticated mode ───────────────────────────────────────────────────────

function AuthenticatedTracker({ orderNumberParam }: { orderNumberParam: string | null }) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showGuestFallback, setShowGuestFallback] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // §9.3 — these queries return PRIVATE customer orders, so their cache identity must include the
  // principal. Unscoped keys meant a remount under a different customer reused the previous
  // customer's still-fresh entries and rendered their orders.
  const { user, authSource } = useAuth();
  const principalId = user?.id ?? null;

  // A selected order belongs to the customer who selected it; it must not stay selected under a
  // different one. Render-phase so no committed frame shows the previous owner's selection.
  useResetOnPrincipalReplaced(() => {
    setSelectedOrderId(null);
    setNotFound(false);
    setShowGuestFallback(false);
  });

  // Fetch recent orders list
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["customer-orders-track", authSource, principalId],
    queryFn: () => apiClient.getCustomerOrders({ limit: 20 }),
    enabled: !!principalId,
    retry: false,
    staleTime: 30_000,
  });

  // Resolve order ID from URL param
  useEffect(() => {
    if (!orders) return;
    if (orderNumberParam) {
      const match = orders.find(
        (o) => o.order_number === orderNumberParam,
      );
      if (match) {
        setSelectedOrderId(match.id);
        setNotFound(false);
      } else {
        setNotFound(true);
        setSelectedOrderId(null);
      }
    } else if (orders.length === 1) {
      // Only one order — auto-select
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, orderNumberParam]);

  // Fetch detail for selected order
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["customer-order-detail-track", authSource, principalId, selectedOrderId],
    queryFn: () => apiClient.getCustomerOrderDetail(selectedOrderId!),
    enabled: !!selectedOrderId && !!principalId,
    staleTime: 30_000,
  });

  const isLoading = ordersLoading || detailLoading;

  // ── Guest fallback toggled ──
  if (showGuestFallback) {
    return (
      <>
        <div className="mb-4">
          <button
            onClick={() => setShowGuestFallback(false)}
            className="flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
          >
            <ChevronLeft size={16} />
            العودة إلى طلباتي
          </button>
        </div>
        <GuestSearchForm />
      </>
    );
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">جاري تحميل طلباتك...</p>
      </div>
    );
  }

  // ── No orders at all ──
  if (orders && orders.length === 0) {
    return (
      <div className="py-12 text-center space-y-4">
        <ListOrdered size={40} className="mx-auto text-muted-foreground" />
        <p className="font-bold text-lg">لا توجد طلبات في حسابك حالياً</p>
        <p className="text-sm text-muted-foreground">
          بعد إتمام أول طلب ستظهر هنا تفاصيله للمتابعة.
        </p>
        <Link to="/products">
          <Button variant="outline" className="mt-2">
            تصفح المنتجات
          </Button>
        </Link>
      </div>
    );
  }

  // ── Order not found in account ──
  if (notFound && orderNumberParam) {
    return (
      <div className="py-10 space-y-5">
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">هذا الطلب غير موجود ضمن حسابك</p>
            <p className="text-sm mt-1">
              الطلب{" "}
              <span className="font-mono font-bold">{orderNumberParam}</span> لم
              يُعثر عليه في سجل طلباتك الأخيرة.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setShowGuestFallback(true)}
        >
          <Phone size={16} />
          تتبع برقم الهاتف (بحث يدوي)
        </Button>
        {orders && orders.length > 0 && (
          <div className="pt-2">
            <p className="text-sm font-semibold text-muted-foreground mb-3">
              أو اختر من طلباتك الأخيرة:
            </p>
            <OrdersList orders={orders} onSelect={setSelectedOrderId} />
          </div>
        )}
      </div>
    );
  }

  // ── Show order detail ──
  if (detail) {
    return (
      <>
        {/* Back to list if multiple orders exist */}
        {orders && orders.length > 1 && !orderNumberParam && (
          <button
            onClick={() => setSelectedOrderId(null)}
            className="flex items-center gap-1 text-sm text-primary font-semibold hover:underline mb-4"
          >
            <ChevronLeft size={16} />
            عرض كل الطلبات
          </button>
        )}
        <OrderDetailPanel orderData={detail} />
        <div className="mt-6 pt-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowGuestFallback(true)}
          >
            <Phone size={14} />
            تتبع طلب آخر برقم الهاتف
          </Button>
        </div>
      </>
    );
  }

  // ── Orders list (multiple, no specific order selected) ──
  if (orders && orders.length > 0 && !selectedOrderId) {
    return (
      <>
        <OrdersList orders={orders} onSelect={setSelectedOrderId} />
        <div className="mt-6 pt-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowGuestFallback(true)}
          >
            <Phone size={14} />
            تتبع طلب آخر برقم الهاتف
          </Button>
        </div>
      </>
    );
  }

  return null;
}

function OrdersList({
  orders,
  onSelect,
}: {
  orders: OrderSummary[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <button
          key={order.id}
          onClick={() => onSelect(order.id)}
          className="w-full flex items-center justify-between bg-muted/30 hover:bg-muted/60 rounded-xl px-4 py-3 transition-colors text-right group"
        >
          <div className="space-y-0.5">
            <p className="font-bold text-sm">#{order.order_number}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(order.created_at), "dd MMMM yyyy", {
                locale: arSA,
              })}
              {" · "}
              {order.items_count} منتج
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-primary text-sm">
              {formatPrice(order.total)}
            </span>
            <ChevronLeft
              size={16}
              className="text-muted-foreground group-hover:text-primary transition-colors"
            />
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TrackOrder = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const orderParam = searchParams.get("order");

  const isAuthenticated = !!user;

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <Header />
      <main className="flex-1 container py-12 md:py-20">
        <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
          {/* Hero */}
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Truck className="text-primary w-10 h-10" />
            </div>
            {isAuthenticated ? (
              <>
                <h1 className="text-3xl font-black">تتبع طلباتك</h1>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  أنت داخل الحساب، يمكنك متابعة طلباتك مباشرة.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-black">تتبع حالة طلبك</h1>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  أدخل رقم الطلب ورقم الهاتف المستخدم في الطلب لمتابعة حالة
                  شحنتك لحظة بلحظة
                </p>
              </>
            )}
          </div>

          {/* Main card */}
          <div className="bg-background border border-border p-6 md:p-8 rounded-2xl shadow-xl">
            {isAuthenticated ? (
              <AuthenticatedTracker orderNumberParam={orderParam} />
            ) : (
              <GuestSearchForm />
            )}
          </div>

          {/* Footer links */}
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              تواجه مشكلة؟{" "}
              <Link to="/support" className="text-primary font-bold hover:underline">
                تواصل مع الدعم
              </Link>
            </p>
            {isAuthenticated && (
              <div>
                <Link
                  to="/my-account/orders"
                  className="text-primary font-bold hover:underline text-sm"
                >
                  عرض كل طلباتي في الحساب
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default TrackOrder;
