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
  TriangleAlert,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { useResetOnPrincipalReplaced } from "@/lib/auth/use-customer-principal";
import { isValidIraqiMobile, toIraqiLocalDisplay } from "@/lib/auth/identifier";
import { OrderStatusBadge, getEffectiveOrderStatus } from "@/components/account/OrderStatusBadge";
import { toast } from "sonner";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const trackingSteps = [
  { id: 1, label: "جاري تجهيز الطلب", icon: Package },
  { id: 2, label: "تم تعيين شركة التوصيل", icon: Truck },
  { id: 3, label: "في الطريق للتوصيل", icon: Truck },
  { id: 4, label: "تم التسليم", icon: CheckCircle2 },
];

function getProgressStepFromCode(code: string): number {
  switch (code) {
    case "pending":
    case "preparing":
    case "confirmed":
      return 1;
    case "assigned":
      return 2;
    case "shipped":
      return 3;
    case "delivered":
      return 4;
    default:
      return 0;
  }
}

// ─── Order Detail Panel ───────────────────────────────────────────────────────

function OrderDetailPanel({ orderData }: { orderData: any }) {
  const statusInfo = getEffectiveOrderStatus(orderData);
  const currentStep = getProgressStepFromCode(statusInfo.code);
  const isCancelled = statusInfo.code === "cancelled" || statusInfo.code === "cancellation_requested";
  const isFailedOrReturned = statusInfo.code === "failed" || statusInfo.code === "returned" || statusInfo.code === "return_requested";

  return (
    <div className="mt-8 pt-8 border-t border-border animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Order header */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-8 bg-muted/40 p-5 rounded-2xl border border-border">
        <div>
          <p className="text-xs font-medium text-muted-foreground">رقم الطلب</p>
          <p className="font-mono text-lg font-black text-foreground">#{orderData.order_number}</p>
        </div>
        {orderData.created_at ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">تاريخ الطلب</p>
            <p className="text-sm font-bold text-foreground">
              {format(new Date(orderData.created_at), "dd MMMM yyyy", { locale: arSA })}
            </p>
          </div>
        ) : null}
        {orderData.total !== undefined && orderData.total !== null ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">القيمة الإجمالية</p>
            <p className="text-sm font-black text-primary">{formatPrice(orderData.total)}</p>
          </div>
        ) : null}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">الحالة الحالية</p>
          <OrderStatusBadge order={orderData} />
        </div>
        {orderData.delivery_company ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">شركة التوصيل</p>
            <p className="text-sm font-bold text-foreground">{orderData.delivery_company}</p>
          </div>
        ) : null}
      </div>

      {/* Status display */}
      {isCancelled ? (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6 text-center text-destructive">
          <XCircle size={44} className="mx-auto mb-3" />
          <h3 className="text-lg font-bold mb-1">
            {statusInfo.code === "cancellation_requested" ? "طلب الإلغاء قيد المراجعة" : "تم إلغاء هذا الطلب"}
          </h3>
          <p className="text-sm text-destructive/90">
            يمكنك التواصل مع الدعم لمزيد من المعلومات عبر مركز المساعدة.
          </p>
        </div>
      ) : isFailedOrReturned ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-center text-amber-900 dark:text-amber-300">
          <Clock size={44} className="mx-auto mb-3" />
          <h3 className="text-lg font-bold mb-1">{statusInfo.label}</h3>
          <p className="text-sm">يرجى التواصل مع خدمة العملاء لمتابعة الإجراء المناسب للطلب.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-bold text-muted-foreground mb-6 uppercase tracking-wider">
            مراحل مسار الطلب والتوصيل
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {trackingSteps.map((step) => {
              const isCompleted = currentStep >= step.id;
              const isCurrent = currentStep === step.id;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border transition-all",
                    isCurrent
                      ? "border-primary bg-primary/5 shadow-sm"
                      : isCompleted
                      ? "border-primary/30 bg-muted/30"
                      : "border-border bg-muted/10 opacity-60"
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      isCurrent
                        ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/25"
                        : isCompleted
                        ? "bg-primary/20 text-primary font-bold"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <step.icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-bold truncate", isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground")}>
                      {step.label}
                    </p>
                    {isCurrent ? (
                      <p className="text-[11px] text-primary font-bold mt-0.5">حالة الطلب الحالية</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Items list if supplied */}
      {orderData.items && Array.isArray(orderData.items) && orderData.items.length > 0 ? (
        <div className="mt-8 space-y-3">
          <p className="font-bold text-sm text-foreground">منتجات الطلب</p>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {orderData.items.map((item: any, idx: number) => (
              <div
                key={item.product_id ?? idx}
                className="flex justify-between items-center text-sm p-4"
              >
                <span className="font-medium text-foreground">{item.product_name || item.name}</span>
                <span className="text-xs font-bold text-muted-foreground">
                  {item.quantity} × {formatPrice(item.price)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
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

    const trimmedOrder = orderNumber.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedOrder || !trimmedPhone) {
      toast.error("يرجى إدخال رقم الطلب ورقم الهاتف");
      return;
    }

    if (!isValidIraqiMobile(trimmedPhone)) {
      setError("يرجى إدخال رقم هاتف عراقي صحيح");
      toast.error("يرجى إدخال رقم هاتف عراقي صحيح");
      return;
    }

    const normalizedPhone = toIraqiLocalDisplay(trimmedPhone);

    setLoading(true);
    try {
      const data = await apiClient.trackOrder({
        order_number: trimmedOrder,
        phone: normalizedPhone,
      });

      if (data && data.found) {
        setOrderData(data);
        toast.success("تم العثور على الطلب");
      } else {
        const msg = data?.message || "الطلب غير موجود";
        setError(msg);
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
      <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleSearch}>
        <div className="space-y-2 text-right">
          <Label htmlFor="orderNumber">رقم الطلب</Label>
          <div className="relative">
            <Input
              id="orderNumber"
              placeholder="مثال: ORD-123456"
              className="h-12 pr-10"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              dir="ltr"
            />
            <Package className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 pointer-events-none" />
          </div>
        </div>
        <div className="space-y-2 text-right">
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
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 pointer-events-none" />
          </div>
        </div>
        <div className="md:col-span-2 pt-2">
          <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl" disabled={loading}>
            {loading ? "جاري البحث..." : "تتبع الطلب"}
          </Button>
        </div>
      </form>

      {error ? (
        <div
          role="alert"
          className="mt-6 p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl flex items-center gap-3 text-sm font-bold"
        >
          <AlertCircle size={20} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {orderData ? <OrderDetailPanel orderData={orderData} /> : null}
    </>
  );
}

// ─── Authenticated mode ───────────────────────────────────────────────────────

function AuthenticatedTracker({ orderNumberParam }: { orderNumberParam: string | null }) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showGuestFallback, setShowGuestFallback] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const { user, authSource } = useAuth();
  const principalId = user?.id ?? null;

  useResetOnPrincipalReplaced(() => {
    setSelectedOrderId(null);
    setNotFound(false);
    setShowGuestFallback(false);
  });

  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersIsError,
    refetch: refetchOrders,
    isFetching: ordersFetching,
  } = useQuery({
    queryKey: ["customer-orders-track", authSource, principalId],
    queryFn: () => apiClient.getCustomerOrders({ limit: 20 }),
    enabled: !!principalId,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!orders) return;
    if (orderNumberParam) {
      const match = orders.find((o) => o.order_number === orderNumberParam);
      if (match) {
        setSelectedOrderId(match.id);
        setNotFound(false);
      } else {
        setNotFound(true);
        setSelectedOrderId(null);
      }
    } else if (orders.length === 1) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, orderNumberParam]);

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailIsError,
    refetch: refetchDetail,
    isFetching: detailFetching,
  } = useQuery({
    queryKey: ["customer-order-detail-track", authSource, principalId, selectedOrderId],
    queryFn: () => apiClient.getCustomerOrderDetail(selectedOrderId!),
    enabled: !!selectedOrderId && !!principalId,
    staleTime: 30_000,
  });

  if (showGuestFallback) {
    return (
      <>
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowGuestFallback(false)}
            className="flex items-center gap-1 text-sm text-primary font-bold hover:underline"
          >
            <ChevronLeft size={16} />
            العودة إلى طلباتي
          </button>
        </div>
        <GuestSearchForm />
      </>
    );
  }

  if (ordersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">جاري تحميل طلباتك...</p>
      </div>
    );
  }

  if (ordersIsError) {
    return (
      <div
        role="alert"
        className="py-12 text-center space-y-4 rounded-xl border border-dashed border-destructive/30 bg-card/40 p-6"
      >
        <TriangleAlert className="mx-auto h-8 w-8 text-destructive/80" />
        <p className="font-bold text-lg text-foreground">تعذر تحميل سجل الطلبات</p>
        <p className="text-sm text-muted-foreground">حدث خطأ أثناء جلب طلبات الحساب. حاول مرة أخرى.</p>
        <div className="flex justify-center gap-3 pt-2">
          <Button
            type="button"
            onClick={() => void refetchOrders()}
            disabled={ordersFetching}
            className="rounded-full px-7"
          >
            {ordersFetching ? "...جارِ إعادة المحاولة" : "إعادة المحاولة"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowGuestFallback(true)}
            className="rounded-full px-7"
          >
            تتبع برقم الهاتف
          </Button>
        </div>
      </div>
    );
  }

  if (orders && orders.length === 0) {
    return (
      <div className="py-12 text-center space-y-4">
        <ListOrdered size={40} className="mx-auto text-muted-foreground" />
        <p className="font-bold text-lg text-foreground">لا توجد طلبات في حسابك حالياً</p>
        <p className="text-sm text-muted-foreground">
          بعد إتمام أول طلب ستظهر هنا تفاصيله للمتابعة.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button asChild className="rounded-full px-8">
            <Link to="/products">تصفّح المنتجات</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowGuestFallback(true)}
            className="rounded-full px-8"
          >
            تتبع برقم الهاتف (طلب زائر)
          </Button>
        </div>
      </div>
    );
  }

  if (notFound && orderNumberParam) {
    return (
      <div className="py-8 space-y-5">
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-900 dark:text-amber-300">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div className="text-right">
            <p className="font-bold">هذا الطلب غير موجود ضمن حسابك</p>
            <p className="text-sm mt-1 text-muted-foreground">
              الطلب <span className="font-mono font-bold text-foreground">{orderNumberParam}</span> لم يُعثر عليه في حسابك. قد يكون تم تنفيذه كطلب زائر.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 rounded-xl h-11"
          onClick={() => setShowGuestFallback(true)}
        >
          <Phone size={16} />
          تتبع برقم الهاتف (بحث يدوي)
        </Button>
        {orders && orders.length > 0 ? (
          <div className="pt-2">
            <p className="text-sm font-bold text-muted-foreground mb-3 text-right">
              أو اختر من طلباتك الأخيرة:
            </p>
            <OrdersList orders={orders} onSelect={setSelectedOrderId} />
          </div>
        ) : null}
      </div>
    );
  }

  if (selectedOrderId) {
    if (detailLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">جاري تحميل تفاصيل الطلب...</p>
        </div>
      );
    }

    if (detailIsError || !detail) {
      return (
        <div
          role="alert"
          className="py-10 text-center space-y-4 rounded-xl border border-dashed border-destructive/30 p-6"
        >
          <TriangleAlert className="mx-auto h-8 w-8 text-destructive/80" />
          <p className="font-bold text-foreground">تعذر تحميل تفاصيل الطلب</p>
          <div className="flex justify-center gap-3 pt-2">
            <Button
              type="button"
              onClick={() => void refetchDetail()}
              disabled={detailFetching}
              className="rounded-full px-7"
            >
              {detailFetching ? "...جارِ إعادة المحاولة" : "إعادة المحاولة"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedOrderId(null)}
              className="rounded-full px-7"
            >
              العودة للطلبات
            </Button>
          </div>
        </div>
      );
    }

    return (
      <>
        {orders && orders.length > 1 && !orderNumberParam ? (
          <button
            type="button"
            onClick={() => setSelectedOrderId(null)}
            className="flex items-center gap-1 text-sm text-primary font-bold hover:underline mb-4"
          >
            <ChevronLeft size={16} />
            عرض كل الطلبات
          </button>
        ) : null}
        <OrderDetailPanel orderData={detail} />
        <div className="mt-6 pt-4 border-t border-border text-right">
          <Button
            type="button"
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

  if (orders && orders.length > 0 && !selectedOrderId) {
    return (
      <>
        <OrdersList orders={orders} onSelect={setSelectedOrderId} />
        <div className="mt-6 pt-4 border-t border-border text-right">
          <Button
            type="button"
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
  orders: any[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <button
          type="button"
          key={order.id}
          onClick={() => onSelect(order.id)}
          className="w-full flex items-center justify-between bg-card hover:bg-muted/40 border border-border rounded-xl p-4 transition-colors text-right group shadow-sm"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-mono font-bold text-sm text-foreground">#{order.order_number}</p>
              <OrderStatusBadge order={order} />
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(order.created_at), "dd MMMM yyyy", { locale: arSA })}
              {order.items_count ? ` · ${order.items_count} منتج` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold text-primary text-sm">
              {formatPrice(order.total)}
            </span>
            <ChevronLeft
              size={18}
              className="text-muted-foreground group-hover:text-primary transition-colors"
            />
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrackOrder() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const orderParam = searchParams.get("order");
  const isAuthenticated = !!user;

  useEffect(() => {
    document.title = "تتبع الطلب | DILMART";
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-10 md:py-16">
        <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
          {/* Hero */}
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Truck className="w-7 h-7" strokeWidth={1.75} />
            </div>
            <h1 className="text-3xl font-black text-foreground">
              {isAuthenticated ? "تتبع طلباتك" : "تتبع حالة طلبك"}
            </h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {isAuthenticated
                ? "يمكنك متابعة وتتبع حالة طلباتك الحالية وتحديثات مسار التوصيل."
                : "أدخل رقم الطلب ورقم الهاتف المسجل لمتابعة حالة الشحنة."}
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-card border border-border p-6 md:p-8 rounded-2xl shadow-sm">
            {isAuthenticated ? (
              <AuthenticatedTracker orderNumberParam={orderParam} />
            ) : (
              <GuestSearchForm />
            )}
          </div>

          {/* Footer links */}
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              تواجه مشكلة في التتبع؟{" "}
              <Link to="/support" className="text-primary font-bold hover:underline">
                مركز المساعدة والدعم
              </Link>
            </p>
            {isAuthenticated ? (
              <div>
                <Link
                  to="/my-account/orders"
                  className="text-primary font-bold hover:underline text-sm"
                >
                  عرض سجل طلباتي في الحساب
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
