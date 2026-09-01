import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { formatPrice } from "@/lib/format";
import { apiClient } from "@/lib/api-client";
import { merchantRejectionReasons, getRejectionLabel } from "@/lib/merchant-rejection-reasons";
import {
  getMerchantPaymentMethodLabel,
  getMerchantChannelLabel,
  getMerchantOrderStatusLabel,
} from "@/lib/merchant-order-status";
import { canMerchantDecide } from "@/lib/merchant-role-authority";
import type { MerchantOrderDetail, MerchantOrderItem } from "@/types/merchant-order";
import { ShoppingBag, Package, Receipt, AlertTriangle, RefreshCw, CheckCircle2, Clock, XCircle } from "lucide-react";

interface MerchantDecisionModalProps {
  orderId: string | null;
  merchantId: string;
  role?: string | null;
  onClose: () => void;
  onDecisionComplete?: () => void;
  queueCount: number;
}

export default function MerchantDecisionModal({
  orderId,
  merchantId,
  role,
  onClose,
  onDecisionComplete,
  queueCount,
}: MerchantDecisionModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<"overview" | "reject">("overview");
  const [selectedRejectReason, setSelectedRejectReason] = useState("");

  const isAuthorized = canMerchantDecide(role);

  // Reset view when order or merchant changes
  useEffect(() => {
    setView("overview");
    setSelectedRejectReason("");
  }, [orderId, merchantId]);

  // Fetch full details of the active order in the modal
  const {
    data: order,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<MerchantOrderDetail | null>({
    queryKey: ["merchant-decision-order-detail", orderId, merchantId],
    queryFn: async () => {
      if (!orderId || !merchantId) return null;
      const res = await apiClient.getOrderDetail(orderId, { merchant_id: merchantId });
      return res as MerchantOrderDetail;
    },
    enabled: !!orderId && !!merchantId && isAuthorized,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", merchantId] });
    queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
    queryClient.invalidateQueries({ queryKey: ["merchant-dashboard-v2", merchantId] });
    queryClient.invalidateQueries({ queryKey: ["merchant-notifications", merchantId] });
    if (orderId) {
      queryClient.invalidateQueries({ queryKey: ["merchant-order-detail", orderId, merchantId] });
    }
  };

  const acknowledgeRelatedNotification = async () => {
    if (!orderId) return;
    try {
      const { merchantApi } = await import("@/lib/api/merchant");
      const { getOrCreateMerchantDeviceId } = await import("@/lib/merchant-push");
      const { stopMerchantOrderAlertLoop } = await import("@/lib/notifications");
      const list = await merchantApi.listMerchantNotifications(merchantId, 40);
      const match = list.find((n) => n.type === "new_order" && n.order_id === orderId);
      if (!match) return;
      await merchantApi.acknowledgeMerchantNotification(match.id, {
        device_id: getOrCreateMerchantDeviceId(),
        opened: true,
      });
      stopMerchantOrderAlertLoop();
    } catch {
      // Non-blocking best effort
    }
  };

  const acceptOrder = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Missing order id");
      if (!merchantId) throw new Error("Missing merchant id");
      await apiClient.merchantAcceptOrder(orderId, merchantId);
    },
    onSuccess: () => {
      toast.success("تم قبول الطلب بنجاح");
      void acknowledgeRelatedNotification();
      invalidateAll();
      if (onDecisionComplete) {
        onDecisionComplete();
      } else {
        onClose();
      }
    },
    onError: () => {
      toast.error("تعذر قبول الطلب. يرجى إعادة المحاولة.");
      void refetch();
      queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", merchantId] });
    },
  });

  const rejectOrder = useMutation({
    mutationFn: async (reasonCode: string) => {
      if (!orderId) throw new Error("Missing order id");
      if (!merchantId) throw new Error("Missing merchant id");
      if (!reasonCode) throw new Error("Missing rejection reason");
      await apiClient.merchantRejectOrder(orderId, reasonCode, merchantId);
    },
    onSuccess: () => {
      toast.success("تم رفض الطلب بنجاح");
      void acknowledgeRelatedNotification();
      invalidateAll();
      if (onDecisionComplete) {
        onDecisionComplete();
      } else {
        onClose();
      }
    },
    onError: () => {
      toast.error("تعذر رفض الطلب. يرجى إعادة المحاولة.");
      void refetch();
      queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", merchantId] });
    },
  });

  const handleViewDetails = () => {
    if (!orderId) return;
    void acknowledgeRelatedNotification();
    onClose();
    navigate(`/merchant/orders/${orderId}`);
  };

  if (!orderId || !isAuthorized) return null;

  const isMutationPending = acceptOrder.isPending || rejectOrder.isPending;

  // Strict decision eligibility: must be new order, pending decision, and authorized owner/manager
  const isEligibleToDecide =
    order?.status === "new" &&
    order?.merchant_decision_status === "pending" &&
    isAuthorized;

  return (
    <Dialog
      open={!!orderId}
      onOpenChange={(open) => {
        if (!open && !isMutationPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-w-2xl w-[92vw] max-h-[90vh] overflow-y-auto p-0 gap-0 border-border bg-card text-foreground backdrop-blur-md text-right"
        data-testid="merchant-decision-modal"
      >
        {/* Header with pending queue count banner */}
        <div className="bg-destructive/10 border-b border-border p-4 flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-2">
            <ShoppingBag className="text-destructive h-5 w-5 animate-pulse" />
            <span className="text-sm font-bold text-destructive">
              {isEligibleToDecide ? "طلب جديد بانتظار قرارك" : "تفاصيل قرار الطلب"}
            </span>
          </div>
          {queueCount > 1 && (
            <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5 text-xs font-bold">
              لديك {queueCount} طلبات معلقة
            </Badge>
          )}
        </div>

        <ScrollArea className="p-6 max-h-[calc(90vh-140px)]" dir="rtl">
          {isLoading ? (
            <div className="py-20 text-center space-y-3" data-testid="decision-modal-loading">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
              <p className="text-xs font-medium text-muted-foreground">جاري تحميل تفاصيل الطلب...</p>
            </div>
          ) : isError || !order ? (
            /* Fetch error with Retry button — does NOT skip or close modal silently */
            <div className="py-12 text-center space-y-4 max-w-sm mx-auto px-4" data-testid="decision-modal-error">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">تعذر تحميل تفاصيل الطلب</p>
                <p className="text-xs text-muted-foreground">{String((error as { message?: string })?.message ?? "حدث خطأ في جلب بيانات الطلب.")}</p>
              </div>
              <div className="flex justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="gap-2 text-xs font-bold"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                  <span>إعادة المحاولة</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    navigate("/merchant/orders");
                  }}
                  className="text-xs font-medium"
                >
                  عرض قائمة الطلبات
                </Button>
              </div>
            </div>
          ) : view === "overview" ? (
            <div className="space-y-6 text-right" dir="rtl" data-testid="decision-modal-overview">
              <DialogHeader className="text-right">
                <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2 justify-start">
                  <Package size={18} />
                  طلب رقم #{order.order_number}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 text-right">
                  تاريخ الطلب:{" "}
                  {order.created_at
                    ? new Date(order.created_at).toLocaleDateString("ar-IQ", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </DialogDescription>
              </DialogHeader>

              {/* Ineligible current status callout (already accepted, rejected, or non-new) */}
              {!isEligibleToDecide && (
                <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-1 text-xs" data-testid="ineligible-status-banner">
                  {order.merchant_decision_status === "accepted" ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 size={16} />
                      <span>تم قبول هذا الطلب مسبقاً — قيد التجهيز</span>
                    </div>
                  ) : order.merchant_decision_status === "rejected" ? (
                    <div className="space-y-1 text-destructive">
                      <div className="flex items-center gap-2 font-semibold">
                        <XCircle size={16} />
                        <span>تم رفض هذا الطلب مسبقاً</span>
                      </div>
                      {order.merchant_rejection_reason_code && (
                        <p className="text-[11px]">
                          سبب الرفض: {getRejectionLabel(order.merchant_rejection_reason_code)}
                        </p>
                      )}
                    </div>
                  ) : order.status === "cancelled" ? (
                    <div className="flex items-center gap-2 text-destructive font-semibold">
                      <XCircle size={16} />
                      <span>الطلب ملغي</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-foreground font-semibold">
                      <Clock size={16} className="text-primary" />
                      <span>حالة الطلب الحالية: {getMerchantOrderStatusLabel(order.status)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Order Metadata summary */}
              <div className="grid grid-cols-2 gap-3 bg-muted/20 p-3.5 rounded-xl border border-border text-right" dir="rtl">
                <div className="space-y-0.5 text-right">
                  <span className="text-[11px] text-muted-foreground block">طريقة الدفع</span>
                  <span className="text-xs font-semibold text-foreground">
                    {getMerchantPaymentMethodLabel(order.payment_method)}
                  </span>
                </div>
                <div className="space-y-0.5 text-right">
                  <span className="text-[11px] text-muted-foreground block">قناة الطلب</span>
                  <span className="text-xs font-semibold text-foreground">{getMerchantChannelLabel(order.channel)}</span>
                </div>
                {order.governorates?.name && (
                  <div className="space-y-0.5 col-span-2 text-right">
                    <span className="text-[11px] text-muted-foreground block">المحافظة</span>
                    <span className="text-xs font-semibold text-foreground">{order.governorates.name}</span>
                  </div>
                )}
              </div>

              {/* Order Items List */}
              <div className="space-y-2.5 text-right" dir="rtl">
                <h4 className="text-xs font-bold flex items-center gap-2 border-b border-border pb-2 justify-start text-foreground">
                  <Receipt size={14} className="text-primary" />
                  تفاصيل المنتجات ({order.order_items?.length || 0})
                </h4>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1 divide-y divide-border/40">
                  {order.order_items?.map((item: MerchantOrderItem) => (
                    <div key={item.id} className="flex items-center justify-between text-xs py-2 first:pt-0 last:pb-0" dir="rtl">
                      <div className="text-right">
                        <span className="font-bold text-foreground block">{item.product_name ?? "منتج"}</span>
                        <span className="text-[11px] text-muted-foreground">الكمية: {item.quantity}</span>
                      </div>
                      <span className="font-mono font-bold text-foreground">
                        {formatPrice((item.unit_price ?? item.price ?? 0) * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="border border-border p-3.5 rounded-xl space-y-2 text-xs bg-muted/10 text-right" dir="rtl">
                <div className="flex justify-between" dir="rtl">
                  <span className="text-muted-foreground">المجموع الفرعي</span>
                  <span className="font-mono font-semibold text-foreground">{formatPrice(order.subtotal ?? 0)}</span>
                </div>
                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400" dir="rtl">
                    <span>الخصم</span>
                    <span className="font-mono font-semibold">- {formatPrice(order.discount ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between" dir="rtl">
                  <span className="text-muted-foreground">تكلفة التوصيل</span>
                  <span className="font-mono font-semibold text-foreground">{formatPrice(order.delivery_cost ?? 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-foreground border-t border-border/50 pt-2" dir="rtl">
                  <span>الإجمالي الكلي</span>
                  <span className="font-mono text-primary text-base">{formatPrice(order.total ?? 0)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              {isEligibleToDecide ? (
                <div className="flex flex-col sm:flex-row gap-2.5 pt-2" dir="rtl" data-testid="decision-modal-actions">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white flex-1 py-5 text-xs font-bold"
                    onClick={() => acceptOrder.mutate()}
                    disabled={isMutationPending}
                  >
                    {acceptOrder.isPending ? "جاري القبول..." : "✅ قبول الطلب"}
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 py-5 text-xs font-bold"
                    onClick={() => setView("reject")}
                    disabled={isMutationPending}
                  >
                    ❌ رفض الطلب
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 py-5 text-xs font-medium"
                    onClick={handleViewDetails}
                    disabled={isMutationPending}
                  >
                    عرض التفاصيل
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2.5 pt-2" dir="rtl" data-testid="ineligible-modal-actions">
                  <Button
                    className="flex-1 py-5 text-xs font-bold"
                    onClick={handleViewDetails}
                  >
                    عرض تفاصيل الطلب
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 py-5 text-xs font-medium"
                    onClick={() => {
                      onClose();
                      if (onDecisionComplete) onDecisionComplete();
                    }}
                  >
                    إغلاق
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* Rejection View */
            <div className="space-y-4 text-right" dir="rtl" data-testid="decision-modal-reject">
              <DialogHeader className="text-right">
                <DialogTitle className="text-base font-bold text-destructive flex items-center gap-2 justify-start">
                  رفض الطلب #{order.order_number}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground text-right">
                  يرجى تحديد سبب الرفض لإبلاغ النظام والعميل بدقة.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {merchantRejectionReasons.map((reason) => (
                  <label
                    key={reason.code}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-xs transition-all ${
                      selectedRejectReason === reason.code
                        ? "border-destructive bg-destructive/10 text-foreground font-semibold ring-1 ring-destructive/30"
                        : "border-border bg-card/60 hover:bg-muted/40 text-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="modal-reject-reason"
                      value={reason.code}
                      checked={selectedRejectReason === reason.code}
                      onChange={(e) => setSelectedRejectReason(e.target.value)}
                      className="accent-destructive"
                    />
                    <span>{reason.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setView("overview");
                    setSelectedRejectReason("");
                  }}
                  disabled={rejectOrder.isPending}
                  className="h-9 text-xs"
                >
                  رجوع
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!selectedRejectReason || rejectOrder.isPending}
                  onClick={() => rejectOrder.mutate(selectedRejectReason)}
                  className="h-9 text-xs font-bold"
                >
                  {rejectOrder.isPending ? "جاري الرفض..." : "تأكيد رفض الطلب"}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
