import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import AccountLayout from "@/components/account/AccountLayout";
import { OrderStatusBadge, getEffectiveOrderStatus } from "@/components/account/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatPrice } from "@/lib/format";
import { apiClient } from "@/lib/api-client";
import { useCartStore } from "@/lib/cart-store";
import {
  Package,
  RotateCcw,
  Ban,
  Undo2,
  ChevronLeft,
  Calendar,
  Truck,
  MapPin,
  Phone,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Clock,
  ArrowRight,
  Info,
} from "lucide-react";

export function getReturnStatusLabel(status?: string | null): string {
  if (!status) return "حالة الطلب قيد التحديث";
  const raw = status.toLowerCase();
  switch (raw) {
    case "pending":
    case "pending_review":
      return "قيد المراجعة";
    case "approved":
      return "تمت الموافقة";
    case "rejected":
      return "مرفوض";
    case "awaiting_item":
      return "بانتظار استلام المنتج";
    case "completed":
      return "مكتمل";
    default:
      return "حالة الطلب قيد التحديث";
  }
}

export default function AccountOrders() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, authSource, authStatus } = useAuth();
  const { items: cartItems, replaceCartWithReorder } = useCartStore();

  const initialOrderId = searchParams.get("orderId");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId);

  // Cancellation Dialog State
  const [cancellationOrderId, setCancellationOrderId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  // Return Dialog State
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");

  // Reorder Preview State
  const [reorderOrderId, setReorderOrderId] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<Awaited<ReturnType<typeof apiClient.previewCustomerReorder>> | null>(null);

  // Update selected order ID if URL changes
  useEffect(() => {
    const paramId = searchParams.get("orderId");
    if (paramId !== selectedOrderId) {
      setSelectedOrderId(paramId);
    }
  }, [searchParams]);

  const handleSelectOrder = (id: string | null) => {
    setSelectedOrderId(id);
    if (id) {
      setSearchParams({ orderId: id });
    } else {
      setSearchParams({});
    }
  };

  // 1. Fetch Orders List
  const {
    data: orders,
    isLoading: isOrdersLoading,
    isError: isOrdersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ["customer-orders", authSource, user?.id],
    queryFn: () => apiClient.getCustomerOrders({ limit: 50 }),
    enabled: authStatus === "authenticated_ready" && !!user,
  });

  // 2. Fetch Order Detail when an order is selected
  const {
    data: orderDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ["customer-order-detail", authSource, user?.id, selectedOrderId],
    queryFn: () => apiClient.getCustomerOrderDetail(selectedOrderId!),
    enabled: authStatus === "authenticated_ready" && !!user && !!selectedOrderId,
  });

  // 3. Fetch Return Request status if order is delivered
  const isDelivered = orderDetail?.status === "delivered" || orderDetail?.delivery_status === "delivered";
  const {
    data: returnRequestData,
    isLoading: isReturnLoading,
    isError: isReturnError,
    refetch: refetchReturn,
  } = useQuery({
    queryKey: ["customer-return-request", authSource, user?.id, selectedOrderId],
    queryFn: () => apiClient.getReturnRequest(selectedOrderId!),
    enabled: authStatus === "authenticated_ready" && !!user && !!selectedOrderId && isDelivered,
  });

  // Reorder Mutation
  const reorderPreviewMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.previewCustomerReorder(orderId),
    onSuccess: (preview, orderId) => {
      setReorderOrderId(orderId);
      setPendingPreview(preview);
    },
    onError: (error: any) => {
      toast.error(error?.message || "تعذر إعداد إعادة الطلب.");
    },
  });

  // Customer Cancel Mutation (Canonical API)
  const cancelOrderMutation = useMutation({
    mutationFn: ({ id, details }: { id: string; details?: string }) =>
      apiClient.customerCancelOrder(id, {
        reason_code: "customer_requested_cancellation",
        reason_details: details || undefined,
      }),
    onSuccess: (res) => {
      if (res.cancelled) {
        toast.success(res.message || "تم إلغاء الطلب بنجاح وإعادة المنتجات إلى المخزون.");
      } else if (res.cancellation_requested) {
        toast.info(res.message || "الطلب قيد التجهيز. تم تقديم طلب الإلغاء وهو قيد مراجعة الإدارة والتاجر.");
      } else if (res.can_request_return) {
        toast.info("لا يمكن إلغاء الطلب مباشرة في مرحلته الحالية. ستظهر إمكانية الإرجاع عندما يصبح الطلب مؤهلاً لذلك.");
      } else {
        toast.info(res.message || "تمت معالجة طلبك.");
      }

      setCancellationOrderId(null);
      setCancellationReason("");
      queryClient.invalidateQueries({ queryKey: ["customer-orders"] });
      queryClient.invalidateQueries({ queryKey: ["customer-order-detail"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "تعذر إرسال طلب إلغاء الطلب");
    },
  });

  // Customer Return Request Mutation (Canonical API)
  const createReturnMutation = useMutation({
    mutationFn: ({ id, details }: { id: string; details?: string }) =>
      apiClient.createReturnRequest(id, {
        reason_code: "customer_return_request",
        reason_details: details || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.message || "تم تقديم طلب الإرجاع بنجاح وهو قيد المراجعة.");
      setReturnOrderId(null);
      setReturnReason("");
      queryClient.invalidateQueries({ queryKey: ["customer-orders"] });
      queryClient.invalidateQueries({ queryKey: ["customer-order-detail"] });
      queryClient.invalidateQueries({ queryKey: ["customer-return-request"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "تعذر تقديم طلب الإرجاع");
    },
  });

  const handleConfirmReorder = () => {
    if (!pendingPreview || !pendingPreview.can_reorder || !pendingPreview.merchant_id || pendingPreview.valid_items.length === 0) {
      toast.error("لا يمكن إعادة هذا الطلب لأن المنتجات لم تعد متاحة.");
      return;
    }

    if (cartItems.length > 0) {
      toast.info("تم استبدال السلة الحالية بمنتجات هذا الطلب.");
    }

    const reorderLines = pendingPreview.valid_items.map((item) => ({
      quantity: item.quantity,
      product: {
        id: item.product_id,
        name: item.product_name,
        price: item.current_price,
        discount_price: null,
        merchant_id: pendingPreview.merchant_id,
        images: [],
      } as any,
    }));

    replaceCartWithReorder(reorderLines, pendingPreview.merchant_id);
    setPendingPreview(null);
    setReorderOrderId(null);
    navigate("/checkout");
  };

  const getUnavailableReasonLabel = (reason: "inactive" | "deleted" | "out_of_stock" | "merchant_inactive") => {
    switch (reason) {
      case "deleted":
        return "تم حذف المنتج";
      case "inactive":
        return "المنتج غير نشط";
      case "out_of_stock":
        return "نفد المخزون";
      case "merchant_inactive":
        return "المتجر غير نشط";
      default:
        return "غير متوفر حالياً";
    }
  };

  // Determine if an order is eligible for cancel CTA (coarse check, backend remains authority)
  const isCancellable = (status?: string | null) => {
    const raw = (status || "").toLowerCase();
    return !["delivered", "completed", "cancelled", "returned", "failed"].includes(raw);
  };

  return (
    <AccountLayout
      title={selectedOrderId ? `تفاصيل الطلب #${orderDetail?.order_number || ""}` : "طلباتي"}
      subtitle={
        selectedOrderId
          ? "متابعة مسار الشحنة وتفاصيل المنتجات والعنوان"
          : "سجل بجميع طلبات الشراء السابقة وحالات التوصيل الحالية"
      }
      action={
        selectedOrderId ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSelectOrder(null)}
            className="text-xs font-semibold text-slate-700 border-slate-300 flex items-center gap-1.5"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            العودة لقائمة الطلبات
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchOrders()}
            className="text-xs font-semibold text-slate-700 border-slate-300"
          >
            تحديث القائمة
          </Button>
        )
      }
    >
      {/* ─────────────────── ORDER DETAIL VIEW ─────────────────── */}
      {selectedOrderId ? (
        <div className="space-y-6">
          {isDetailLoading ? (
            <Card className="border-slate-200 shadow-sm p-8 text-center">
              <div className="w-8 h-8 border-4 border-[#1261D8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500">جارٍ تحميل تفاصيل الطلب...</p>
            </Card>
          ) : isDetailError || !orderDetail ? (
            <Card className="border-slate-200 shadow-sm p-8 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">تعذر تحميل تفاصيل هذا الطلب</p>
              <Button size="sm" variant="outline" onClick={() => refetchDetail()} className="text-xs">
                إعادة المحاولة
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Order Status & Progress Card */}
              <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
                <div className="bg-slate-50 p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500 font-medium">رقم الطلب:</span>
                      <span className="font-extrabold text-base text-[#071A3D]">#{orderDetail.order_number}</span>
                      <OrderStatusBadge order={orderDetail} />
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      تاريخ الطلب: {new Date(orderDetail.created_at).toLocaleDateString("ar-IQ")}
                    </p>
                  </div>

                  {/* Actions Header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => reorderPreviewMutation.mutate(orderDetail.id)}
                      disabled={reorderPreviewMutation.isPending}
                      className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      إعادة الطلب
                    </Button>

                    {isCancellable(orderDetail.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCancellationOrderId(orderDetail.id);
                          setCancellationReason("");
                        }}
                        className="text-xs font-semibold text-rose-700 border-rose-200 hover:bg-rose-50 flex items-center gap-1.5"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        إلغاء الطلب
                      </Button>
                    )}

                    {isDelivered && (
                      <>
                        {isReturnLoading ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            className="text-xs font-semibold text-slate-400 border-slate-200 cursor-not-allowed flex items-center gap-1.5"
                          >
                            <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            التحقق من الإرجاع...
                          </Button>
                        ) : !isReturnError && !returnRequestData ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReturnOrderId(orderDetail.id);
                              setReturnReason("");
                            }}
                            className="text-xs font-semibold text-amber-800 border-amber-300 hover:bg-amber-50 flex items-center gap-1.5"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            طلب إرجاع
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {/* Return Request Error State */}
                {isReturnError && (
                  <div className="p-3 bg-rose-50 border-b border-rose-200 flex items-center justify-between gap-3 text-xs text-rose-800">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>تعذر التحقق من حالة طلب الإرجاع</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => refetchReturn()} className="text-xs h-7 border-rose-300">
                      إعادة المحاولة
                    </Button>
                  </div>
                )}

                {/* Return Request Banner if active */}
                {returnRequestData && (
                  <div className="p-4 bg-amber-50/70 border-b border-amber-200 flex items-start gap-3">
                    <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs text-amber-900">
                      <p className="font-bold">
                        حالة طلب الإرجاع:{" "}
                        <span className="text-amber-800 font-extrabold">
                          {getReturnStatusLabel(returnRequestData.status)}
                        </span>
                      </p>
                      {returnRequestData.reason_details && (
                        <p className="text-amber-800/90">السبب المقدم: {returnRequestData.reason_details}</p>
                      )}
                      <p className="text-[11px] text-amber-700">
                        تاريخ تقديم الطلب: {new Date(returnRequestData.created_at).toLocaleDateString("ar-IQ")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Visual Step Indicator (Based on Current Status — No invented timestamps) */}
                <CardContent className="p-5">
                  <div className="py-2">
                    <p className="text-xs font-bold text-slate-700 mb-4">مسار متابعة الطلب:</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      {/* Step 1: Received */}
                      <div
                        className={cn(
                          "p-3 rounded-xl border flex flex-col items-center gap-1.5",
                          ["pending", "new", "preparing", "processing", "confirmed", "shipped", "delivered"].includes(
                            getEffectiveOrderStatus(orderDetail).code
                          )
                            ? "bg-blue-50/60 border-[#1261D8]/40 text-[#1261D8] font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        )}
                      >
                        <FileText className="w-4 h-4" />
                        <span>تم استلام الطلب</span>
                      </div>

                      {/* Step 2: In transit */}
                      <div
                        className={cn(
                          "p-3 rounded-xl border flex flex-col items-center gap-1.5",
                          ["shipped", "in_transit", "dispatched", "delivered"].includes(
                            getEffectiveOrderStatus(orderDetail).code
                          )
                            ? "bg-purple-50/60 border-purple-300 text-purple-700 font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        )}
                      >
                        <Truck className="w-4 h-4" />
                        <span>في طريق التوصيل</span>
                      </div>

                      {/* Step 3: Delivered */}
                      <div
                        className={cn(
                          "p-3 rounded-xl border flex flex-col items-center gap-1.5",
                          getEffectiveOrderStatus(orderDetail).code === "delivered"
                            ? "bg-emerald-50/60 border-emerald-300 text-emerald-700 font-bold"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        )}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تم التسليم بنجاح</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Items Table */}
              <Card className="border-slate-200 shadow-sm bg-white">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-[#071A3D]">المنتجات المطلوبة</CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-slate-100">
                  {orderDetail.items.map((item, idx) => (
                    <div key={`${item.product_id}-${idx}`} className="p-4 flex items-center justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-bold text-[#071A3D] truncate">{item.product_name}</p>
                        <p className="text-xs text-slate-500">
                          الكمية: <span className="font-semibold text-slate-800">{item.quantity}</span> × {formatPrice(item.price)}
                        </p>
                      </div>
                      <div className="text-left shrink-0">
                        <p className="text-sm font-extrabold text-[#1261D8]">
                          {formatPrice(item.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}

                  <div className="p-4 bg-slate-50/80 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">إجمالي الطلب:</span>
                    <span className="text-base font-extrabold text-[#1261D8]">
                      {formatPrice(orderDetail.total)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Delivery Address & Contact Info */}
              {orderDetail.delivery_snapshot && (
                <Card className="border-slate-200 shadow-sm bg-white">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-sm font-bold text-[#071A3D] flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#1261D8]" />
                      بيانات عنوان التوصيل
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {orderDetail.delivery_snapshot.customer_name && (
                        <div className="space-y-1">
                          <p className="text-slate-500">اسم المستلم:</p>
                          <p className="font-bold text-slate-800">{orderDetail.delivery_snapshot.customer_name}</p>
                        </div>
                      )}
                      {orderDetail.delivery_snapshot.customer_phone && (
                        <div className="space-y-1">
                          <p className="text-slate-500">رقم الهاتف:</p>
                          <p className="font-bold text-slate-800" dir="ltr">{orderDetail.delivery_snapshot.customer_phone}</p>
                        </div>
                      )}
                      {orderDetail.delivery_snapshot.area && (
                        <div className="space-y-1">
                          <p className="text-slate-500">المنطقة والموقع:</p>
                          <p className="font-bold text-slate-800">
                            {orderDetail.delivery_snapshot.area}
                            {orderDetail.delivery_snapshot.nearest_landmark ? ` — قرب ${orderDetail.delivery_snapshot.nearest_landmark}` : ""}
                          </p>
                        </div>
                      )}
                      {orderDetail.delivery_snapshot.notes && (
                        <div className="space-y-1">
                          <p className="text-slate-500">ملاحظات التوصيل:</p>
                          <p className="font-medium text-slate-700">{orderDetail.delivery_snapshot.notes}</p>
                        </div>
                      )}
                    </div>

                    {orderDetail.delivery_snapshot.map_url && (
                      <div className="pt-2 border-t border-slate-100">
                        <a
                          href={orderDetail.delivery_snapshot.map_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1261D8] font-bold text-xs hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          عرض موقع التوصيل على الخريطة
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ─────────────────── ORDERS LIST VIEW ─────────────────── */
        <div className="space-y-4">
          {isOrdersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <Card key={n} className="p-6 border-slate-200">
                  <div className="h-6 bg-slate-100 rounded w-1/3 mb-3 animate-pulse" />
                  <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
                </Card>
              ))}
            </div>
          ) : isOrdersError ? (
            <Card className="border-slate-200 p-8 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">تعذر تحميل قائمة الطلبات</p>
              <Button size="sm" variant="outline" onClick={() => refetchOrders()} className="text-xs">
                إعادة المحاولة
              </Button>
            </Card>
          ) : !orders || orders.length === 0 ? (
            <Card className="border-slate-200 shadow-sm p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Package className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#071A3D]">لا توجد طلبات سابقة</h3>
                <p className="text-xs text-slate-500">لم تقم بإجراء أي طلب شراء حتى الآن.</p>
              </div>
              <Button
                onClick={() => navigate("/products")}
                className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-bold px-6 shadow-sm"
              >
                تصفح المنتجات وابدأ التسوق
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card
                  key={order.id}
                  className="border-slate-200/90 hover:border-[#1261D8]/40 shadow-sm transition-all overflow-hidden bg-white"
                >
                  <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-extrabold text-sm text-[#071A3D]">#{order.order_number}</span>
                      <OrderStatusBadge order={order} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(order.created_at).toLocaleDateString("ar-IQ")}</span>
                    </div>
                  </div>

                  <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      {order.items_preview && order.items_preview.length > 0 ? (
                        <div className="space-y-1">
                          {order.items_preview.map((p, idx) => (
                            <p key={idx} className="text-xs text-slate-700 truncate">
                              • <span className="font-semibold">{p.product_name}</span> ({p.quantity} × {formatPrice(p.price)})
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          {order.items_count} {order.items_count === 1 ? "منتج" : "منتجات"}
                        </p>
                      )}

                      <div className="pt-1 flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium">المجموع الكلي:</span>
                        <span className="text-sm font-extrabold text-[#1261D8]">
                          {formatPrice(order.total)}
                        </span>
                      </div>
                    </div>

                    {/* Order Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap self-end md:self-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSelectOrder(order.id)}
                        className="text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50"
                      >
                        عرض التفاصيل
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => reorderPreviewMutation.mutate(order.id)}
                        disabled={reorderPreviewMutation.isPending}
                        className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                        إعادة الطلب
                      </Button>

                      {isCancellable(order.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCancellationOrderId(order.id);
                            setCancellationReason("");
                          }}
                          className="text-xs font-semibold text-rose-700 border-rose-200 hover:bg-rose-50"
                        >
                          إلغاء
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────── CANCELLATION DIALOG ─────────────────── */}
      <Dialog open={!!cancellationOrderId} onOpenChange={(open) => !open && setCancellationOrderId(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <Ban className="w-5 h-5 text-rose-600" />
              إلغاء الطلب
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              يرجى إدخال سبب الإلغاء لمساعدتنا في تحسين خدماتنا. سيتم التحقق من إمكانية الإلغاء المباشر فوراً.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-bold text-slate-700">تفاصيل وسبب الإلغاء (اختياري):</label>
            <Textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء هنا..."
              rows={3}
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancellationOrderId(null)}
              className="text-xs"
            >
              تراجع
            </Button>
            <Button
              size="sm"
              disabled={cancelOrderMutation.isPending}
              onClick={() => {
                if (cancellationOrderId) {
                  cancelOrderMutation.mutate({
                    id: cancellationOrderId,
                    details: cancellationReason.trim(),
                  });
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
            >
              {cancelOrderMutation.isPending ? "جارٍ الإلغاء..." : "تأكيد إلغاء الطلب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────── RETURN REQUEST DIALOG ─────────────────── */}
      <Dialog open={!!returnOrderId} onOpenChange={(open) => !open && setReturnOrderId(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-amber-800 flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-amber-600" />
              طلب إرجاع الطلب
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              يمكنك تقديم طلب إرجاع للمنتجات المسلّمة. سيتم مراجعة الطلب من قبل الإدارة والتواصل معك.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="text-xs font-bold text-slate-700">سبب الإرجاع وملاحظات الحالة:</label>
            <Textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="اكتب سبب طلب الإرجاع هنا بالتفصيل..."
              rows={3}
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReturnOrderId(null)}
              className="text-xs"
            >
              إلغاء
            </Button>
            <Button
              size="sm"
              disabled={createReturnMutation.isPending}
              onClick={() => {
                if (returnOrderId) {
                  createReturnMutation.mutate({
                    id: returnOrderId,
                    details: returnReason.trim(),
                  });
                }
              }}
              className="bg-[#FF8A00] hover:bg-[#E07A00] text-white text-xs font-bold"
            >
              {createReturnMutation.isPending ? "جارٍ الإرسال..." : "إرسال طلب الإرجاع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────── REORDER CONFIRMATION ALERT DIALOG ─────────────────── */}
      <AlertDialog open={!!pendingPreview} onOpenChange={(open) => !open && setPendingPreview(null)}>
        <AlertDialogContent className="max-w-lg" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-[#071A3D] flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-[#1261D8]" />
              إعادة الطلب السابق
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-xs text-slate-600 space-y-3">
                {cartItems.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>تنبيه: سيتم استبدال محتويات سلتك الحالية بمنتجات هذا الطلب.</span>
                  </div>
                )}

                {pendingPreview?.warnings && pendingPreview.warnings.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 space-y-1">
                    {pendingPreview.warnings.map((w, idx) => (
                      <p key={idx}>• {w}</p>
                    ))}
                  </div>
                )}

                {/* Unavailable Items */}
                {pendingPreview?.unavailable_items && pendingPreview.unavailable_items.length > 0 && (
                  <div className="space-y-1.5 p-3 bg-slate-100 rounded-xl">
                    <p className="font-bold text-slate-800 text-xs">منتجات لم تعد متوفرة في هذا الطلب:</p>
                    {pendingPreview.unavailable_items.map((item, idx) => (
                      <p key={idx} className="text-slate-600 text-[11px] flex justify-between">
                        <span>• {item.product_name}</span>
                        <span className="text-rose-600 font-semibold">{getUnavailableReasonLabel(item.reason)}</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Available Items Preview */}
                {pendingPreview?.valid_items && pendingPreview.valid_items.length > 0 && (
                  <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="font-bold text-slate-800 text-xs">المنتجات المتوفرة:</p>
                    <div className="max-h-36 overflow-y-auto space-y-1 divide-y divide-slate-100">
                      {pendingPreview.valid_items.map((item) => (
                        <div key={item.product_id} className="pt-1 flex items-center justify-between text-xs">
                          <span className="truncate max-w-[200px]">
                            {item.product_name} (×{item.quantity})
                          </span>
                          <div className="text-left shrink-0">
                            <span className="font-bold text-[#1261D8]">{formatPrice(item.current_price * item.quantity)}</span>
                            {item.price_changed && (
                              <span className="text-[10px] text-amber-700 block">
                                (تغير السعر من {formatPrice(item.previous_price)})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel onClick={() => setPendingPreview(null)} className="text-xs">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReorder}
              disabled={!pendingPreview?.can_reorder || !pendingPreview?.merchant_id || (pendingPreview?.valid_items?.length ?? 0) === 0}
              className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-bold"
            >
              تأكيد وإضافة للسلة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AccountLayout>
  );
}
