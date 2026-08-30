import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { customerApi } from "@/lib/api/customer";
import { useCartStore } from "@/lib/cart-store";

function statusLabel(status: string) {
  switch (status) {
    case "pending":
    case "new":
      return "قيد الانتظار";
    case "processing":
    case "preparing":
      return "قيد التجهيز";
    case "shipped":
      return "قيد الشحن";
    case "delivered":
      return "تم التسليم";
    case "cancelled":
      return "ملغي";
    default:
      return status;
  }
}

export default function AccountOrders() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { items: cartItems, replaceCartWithReorder } = useCartStore();
  // STORE-PR5 §6 — user-scoped order caches are keyed by (authSource, user id) so a Supabase user and a
  // federated user can never see each other's cached orders after an account/source switch.
  const { user, authSource } = useAuth();
  const initialOrderId = searchParams.get("orderId");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId);
  const [pendingPreview, setPendingPreview] = useState<Awaited<ReturnType<typeof apiClient.previewCustomerReorder>> | null>(null);

  const { data: orders, refetch } = useQuery({
    queryKey: ["customer-orders", authSource, user?.id],
    queryFn: () => apiClient.getCustomerOrders({ limit: 30 }),
  });

  const detailQuery = useQuery({
    queryKey: ["customer-order-detail", authSource, user?.id, selectedOrderId],
    queryFn: () => apiClient.getCustomerOrderDetail(selectedOrderId!),
    enabled: !!selectedOrderId,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderId: string) => apiClient.previewCustomerReorder(orderId),
    onSuccess: (preview) => {
      setPendingPreview(preview);
    },
    onError: (error: any) => {
      toast.error(error?.message || "تعذر إعداد إعادة الطلب.");
    },
  });

  const sortedOrders = useMemo(() => orders ?? [], [orders]);
  const reorderTotal = useMemo(
    () => (pendingPreview?.valid_items ?? []).reduce((sum, item) => sum + item.current_price * item.quantity, 0),
    [pendingPreview],
  );

  const getUnavailableReasonLabel = (reason: "inactive" | "deleted" | "out_of_stock" | "merchant_inactive") => {
    if (reason === "deleted") return "تم حذف المنتج";
    if (reason === "inactive") return "المنتج غير نشط";
    if (reason === "out_of_stock") return "نفد المخزون";
    return "المتجر غير نشط";
  };

  const handleConfirmReorder = () => {
    if (!pendingPreview || !pendingPreview.can_reorder || !pendingPreview.merchant_id || pendingPreview.valid_items.length === 0) {
      toast.error("لا يمكن إعادة هذا الطلب لأن المنتجات لم تعد متاحة.");
      return;
    }

    if (cartItems.length > 0) {
      toast.info("تم استبدال السلة الحالية بمنتجات الطلب السابق.");
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
    navigate("/checkout");
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">طلباتي السابقة</h1>
        <Button variant="outline" onClick={() => refetch()}>
          تحديث
        </Button>
      </div>

      {sortedOrders.length === 0 ? (
        <p className="text-muted-foreground">لا توجد طلبات سابقة بعد.</p>
      ) : (
        <div className="space-y-3">
          {sortedOrders.map((order) => (
            <Card key={order.id}>
              <CardContent className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold">#{order.order_number}</p>
                  <p className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleString("ar-IQ")}</p>
                  <p className="text-sm">{formatPrice(order.total)}</p>
                  <Badge variant="secondary">{statusLabel(order.status)}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setSelectedOrderId(order.id)}>
                    عرض التفاصيل
                  </Button>
                  <Button onClick={() => reorderMutation.mutate(order.id)} disabled={reorderMutation.isPending}>
                    إعادة الطلب
                  </Button>
                  {(order.status === "new" || order.status === "pending" || order.status === "processing" || order.status === "preparing") && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        const reason = prompt("يرجى إدخال سبب الإلغاء:");
                        if (reason) {
                          customerApi.cancelOrder(order.id, reason)
                            .then(() => {
                              toast.success("تم إلغاء الطلب بنجاح");
                              refetch();
                            })
                            .catch((err) => toast.error(err?.message || "فشل إلغاء الطلب"));
                        }
                      }}
                    >
                      إلغاء الطلب
                    </Button>
                  )}
                  {order.status === "delivered" && (
                    <Button
                      variant="outline"
                      className="border-amber-500 text-amber-700 hover:bg-amber-50"
                      onClick={() => {
                        const reason = prompt("يرجى إدخال سبب الإرجاع:");
                        if (reason) {
                          customerApi.requestOrderReturn(order.id, { reason })
                            .then(() => {
                              toast.success("تم تقديم طلب الإرجاع بنجاح، وهو قيد المراجعة");
                              refetch();
                            })
                            .catch((err) => toast.error(err?.message || "فشل تقديم طلب الإرجاع"));
                        }
                      }}
                    >
                      طلب إرجاع
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {detailQuery.data ? (
        <Card>
          <CardHeader>
            <CardTitle>تفاصيل الطلب #{detailQuery.data.order_number}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              العنوان: {detailQuery.data.delivery_snapshot.area} - {detailQuery.data.delivery_snapshot.nearest_landmark || "بدون"}
            </p>
            <ul className="space-y-1 text-sm">
              {detailQuery.data.items.map((item) => (
                <li key={`${item.product_id}-${item.product_name}`}>
                  {item.product_name} × {item.quantity} - {formatPrice(item.price)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={!!pendingPreview} onOpenChange={(open) => (!open ? setPendingPreview(null) : null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>معاينة إعادة الطلب</AlertDialogTitle>
            <AlertDialogDescription>راجِع المنتجات المتاحة قبل استبدال السلة والمتابعة للدفع.</AlertDialogDescription>
          </AlertDialogHeader>

          {!pendingPreview || !pendingPreview.can_reorder || pendingPreview.valid_items.length === 0 ? (
            <div className="space-y-2 text-sm">
              <p>لا يمكن إعادة هذا الطلب لأن المنتجات لم تعد متاحة.</p>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {pendingPreview.valid_items.map((item) => (
                  <div key={item.product_id} className="rounded-md border p-2">
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-muted-foreground">الكمية: {item.quantity}</p>
                    <p>
                      السعر الحالي: <span className="font-semibold">{formatPrice(item.current_price)}</span>
                    </p>
                    {item.price_changed ? (
                      <p className="text-amber-700">السعر السابق: {formatPrice(item.previous_price)}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              {pendingPreview.unavailable_items.length > 0 ? (
                <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2">
                  <p className="font-medium text-amber-800">منتجات غير متاحة</p>
                  {pendingPreview.unavailable_items.map((item) => (
                    <p key={`${item.product_id}-${item.reason}`} className="text-amber-800">
                      {item.product_name}: {getUnavailableReasonLabel(item.reason)}
                    </p>
                  ))}
                </div>
              ) : null}

              {pendingPreview.warnings.length > 0 ? (
                <div className="space-y-1 rounded-md border border-blue-200 bg-blue-50 p-2">
                  {pendingPreview.warnings.map((warning) => (
                    <p key={warning} className="text-blue-800">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}

              <p className="font-semibold">الإجمالي المتوقع: {formatPrice(reorderTotal)}</p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReorder}
              disabled={!pendingPreview?.can_reorder || !pendingPreview?.merchant_id || pendingPreview.valid_items.length === 0}
            >
              استبدال السلة والمتابعة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
