import { useState, useEffect } from "react";
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
import { merchantRejectionReasons } from "@/lib/merchant-rejection-reasons";
import { ShoppingBag, Package, Receipt, ArrowRight, X } from "lucide-react";

interface MerchantDecisionModalProps {
  orderId: string | null;
  merchantId: string;
  onClose: () => void;
  onDecisionComplete?: () => void;
  queueCount: number;
}

export default function MerchantDecisionModal({
  orderId,
  merchantId,
  onClose,
  onDecisionComplete,
  queueCount,
}: MerchantDecisionModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<"overview" | "reject">("overview");
  const [selectedRejectReason, setSelectedRejectReason] = useState("");

  // Reset view when order changes
  useEffect(() => {
    setView("overview");
    setSelectedRejectReason("");
  }, [orderId]);

  // Fetch full details of the active order in the modal
  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["merchant-decision-order-detail", orderId, merchantId],
    queryFn: async () => {
      if (!orderId || !merchantId) return null;
      return await apiClient.getOrderDetail(orderId, { merchant_id: merchantId });
    },
    enabled: !!orderId && !!merchantId,
  });

  const acceptOrder = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Missing order id");
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
    onError: () => toast.error("حدث خطأ أثناء قبول الطلب"),
  });

  const rejectOrder = useMutation({
    mutationFn: async (reasonCode: string) => {
      if (!orderId) throw new Error("Missing order id");
      await apiClient.merchantRejectOrder(orderId, reasonCode, merchantId);
    },
    onSuccess: () => {
      toast.success("تم رفض الطلب وإلغاؤه وإعادة المخزون بنجاح");
      void acknowledgeRelatedNotification();
      invalidateAll();
      if (onDecisionComplete) {
        onDecisionComplete();
      } else {
        onClose();
      }
    },
    onError: () => toast.error("حدث خطأ أثناء رفض الطلب"),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", merchantId] });
    queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
    queryClient.invalidateQueries({ queryKey: ["merchant-notifications", merchantId] });
    if (orderId) {
      queryClient.invalidateQueries({ queryKey: ["merchant-order-detail", orderId] });
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
      // non-blocking
    }
  };

  const handleViewDetails = () => {
    if (!orderId) return;
    void acknowledgeRelatedNotification();
    onClose();
    navigate(`/merchant/orders/${orderId}`);
  };

  if (!orderId) return null;

  return (
    <Dialog open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        dir="rtl" 
        className="max-w-2xl w-[92vw] max-h-[90vh] overflow-y-auto p-0 gap-0 border-border bg-card text-foreground backdrop-blur-md text-right"
      >
        {/* Header with pending queue count banner */}
        <div className="bg-destructive/10 border-b border-border p-4 flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-2">
            <ShoppingBag className="text-destructive h-5 w-5 animate-pulse" />
            <span className="text-sm font-semibold text-destructive">طلب جديد بانتظار قرارك</span>
          </div>
          {queueCount > 1 && (
            <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5 text-xs">
              لديك {queueCount} طلبات معلقة
            </Badge>
          )}
        </div>

        <ScrollArea className="p-6 max-h-[calc(90vh-140px)]" dir="rtl">
          {isLoading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">جاري تحميل تفاصيل الطلب...</div>
          ) : isError || !order ? (
            <div className="py-20 text-center text-sm text-destructive">تعذر تحميل تفاصيل الطلب</div>
          ) : view === "overview" ? (
            <div className="space-y-6 text-right" dir="rtl">
              <DialogHeader className="text-right">
                <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2 justify-start">
                  <Package size={18} />
                  طلب رقم #{order.order_number}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 text-right">
                  تاريخ الطلب: {new Date(order.created_at).toLocaleString("ar-IQ")}
                </DialogDescription>
              </DialogHeader>

              {/* Order Metadata summary */}
              <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-lg border border-border text-right" dir="rtl">
                <div className="space-y-1 text-right">
                  <span className="text-xs text-muted-foreground block">طريقة الدفع</span>
                  <span className="text-sm font-medium">
                    {order.payment_method === "cod" ? "الدفع عند الاستلام" : order.payment_method ?? "—"}
                  </span>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-xs text-muted-foreground block">القناة</span>
                  <span className="text-sm font-medium">{order.channel ?? "متجر ويب"}</span>
                </div>
                <div className="space-y-1 col-span-2 text-right">
                  <span className="text-xs text-muted-foreground block">المحافظة</span>
                  <span className="text-sm font-medium">{order.governorates?.name ?? "—"}</span>
                </div>
              </div>

              {/* Order Items List */}
              <div className="space-y-3 text-right" dir="rtl">
                <h4 className="text-sm font-semibold flex items-center gap-2 border-b border-border pb-2 justify-start">
                  <Receipt size={16} />
                  تفاصيل المنتجات ({order.order_items?.length || 0})
                </h4>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {order.order_items?.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0" dir="rtl">
                      <div className="text-right">
                        <span className="font-medium text-foreground block">{item.product_name}</span>
                        <span className="text-xs text-muted-foreground">الكمية: {item.quantity}</span>
                      </div>
                      <span className="font-semibold text-primary">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="border-t border-border pt-4 space-y-2 text-sm bg-muted/10 p-4 rounded-lg text-right" dir="rtl">
                <div className="flex justify-between" dir="rtl">
                  <span className="text-muted-foreground">المجموع الفرعي</span>
                  <span>{formatPrice(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-red-500" dir="rtl">
                    <span>الخصم</span>
                    <span>-{formatPrice(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between" dir="rtl">
                  <span className="text-muted-foreground">تكلفة التوصيل</span>
                  <span>{formatPrice(order.delivery_cost)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-primary border-t border-border/40 pt-2" dir="rtl">
                  <span>الإجمالي</span>
                  <span>{formatPrice(order.total)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2" dir="rtl">
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white flex-1 py-6 text-base font-semibold"
                  onClick={() => acceptOrder.mutate()}
                  disabled={acceptOrder.isPending || rejectOrder.isPending}
                >
                  {acceptOrder.isPending ? "جاري القبول..." : "✅ قبول الطلب"}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 py-6 text-base font-semibold"
                  onClick={() => setView("reject")}
                  disabled={acceptOrder.isPending || rejectOrder.isPending}
                >
                  ❌ رفض الطلب
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 py-6 text-base font-semibold"
                  onClick={handleViewDetails}
                  disabled={acceptOrder.isPending || rejectOrder.isPending}
                >
                  عرض التفاصيل
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 text-right" dir="rtl">
              <DialogHeader className="text-right">
                <DialogTitle className="text-lg font-bold text-destructive flex items-center gap-2 justify-start">
                  <ArrowRight
                    className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors ml-1"
                    size={20}
                    onClick={() => setView("overview")}
                  />
                  سبب رفض الطلب #{order.order_number}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 text-right">
                  يرجى تحديد سبب الإلغاء/الرفض لتسجيله وإشعار الإدارة
                </DialogDescription>
              </DialogHeader>

              {/* Predefined Rejection Reasons Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1" dir="rtl">
                {merchantRejectionReasons.map((reason) => (
                  <label
                    key={reason.code}
                    className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all duration-200 text-right ${
                      selectedRejectReason === reason.code
                        ? "border-destructive bg-destructive/10 text-foreground ring-1 ring-destructive/30"
                        : "border-border bg-card/40 hover:bg-muted/40 text-foreground"
                    }`}
                    dir="rtl"
                  >
                    <input
                      type="radio"
                      name="modal-reject-reason"
                      value={reason.code}
                      checked={selectedRejectReason === reason.code}
                      onChange={(e) => setSelectedRejectReason(e.target.value)}
                      className="accent-destructive"
                    />
                    <span className="text-sm">{reason.label}</span>
                  </label>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border" dir="rtl">
                <Button
                  variant="destructive"
                  className="flex-1 py-5 text-base font-semibold"
                  disabled={!selectedRejectReason || rejectOrder.isPending}
                  onClick={() => rejectOrder.mutate(selectedRejectReason)}
                >
                  {rejectOrder.isPending ? "جاري الرفض..." : "تأكيد الرفض"}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 py-5 text-base font-semibold"
                  onClick={() => setView("overview")}
                  disabled={rejectOrder.isPending}
                >
                  رجوع
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
