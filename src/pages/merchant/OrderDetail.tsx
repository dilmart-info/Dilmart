import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowRight,
  Printer,
  Package,
  ClipboardList,
  Truck,
  Tag,
  AlertTriangle,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { apiClient } from "@/lib/api-client";
import { merchantRejectionReasons, getRejectionLabel } from "@/lib/merchant-rejection-reasons";
import {
  getMerchantOrderStatusLabel,
  getMerchantDeliveryStatusLabel,
  getMerchantPaymentMethodLabel,
  getMerchantChannelLabel,
  getMerchantJenniDispatchLabel,
  getMerchantJenniErrorLabel,
} from "@/lib/merchant-order-status";
import { canMerchantDecide, isMerchantStaff } from "@/lib/merchant-role-authority";
import type { MerchantOrderDetail as MerchantOrderDetailType, MerchantOrderItem } from "@/types/merchant-order";

/**
 * Merchant-only order detail page.
 * Fulfillment view — NO customer contact PII is displayed.
 * Print output is a Merchant Fulfillment Slip (strictly PII-free).
 */
export default function MerchantOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: membership } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;
  const userRole = membership?.role;
  const isAuthorizedToDecide = canMerchantDecide(userRole);
  const isStaffOnly = isMerchantStaff(userRole);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRejectReason, setSelectedRejectReason] = useState("");

  const {
    data: order,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<MerchantOrderDetailType | null>({
    queryKey: ["merchant-order-detail", id, merchantId],
    queryFn: async () => {
      if (!id) throw new Error("Missing order id");
      if (!merchantId) throw new Error("Missing merchant scope");
      const res = await apiClient.getOrderDetail(id, { merchant_id: merchantId });
      return res as MerchantOrderDetailType;
    },
    enabled: !!id && !!merchantId,
  });

  const invalidateOrderRelatedCaches = () => {
    if (merchantId) {
      queryClient.invalidateQueries({ queryKey: ["merchant-order-detail", id, merchantId] });
      queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["merchant-dashboard-v2", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["merchant-notifications", merchantId] });
    }
    queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
  };

  const acceptOrder = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing order id");
      if (!merchantId) throw new Error("Missing merchant scope");
      await apiClient.merchantAcceptOrder(id, merchantId);
    },
    onSuccess: () => {
      invalidateOrderRelatedCaches();
      toast.success("تم قبول الطلب بنجاح");
    },
    onError: () => {
      toast.error("تعذر اتخاذ القرار بشأن الطلب. يرجى المحاولة مرة أخرى.");
      void refetch();
      if (merchantId) {
        queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", merchantId] });
      }
    },
  });

  const rejectOrder = useMutation({
    mutationFn: async (reasonCode: string) => {
      if (!id) throw new Error("Missing order id");
      if (!merchantId) throw new Error("Missing merchant scope");
      if (!reasonCode) throw new Error("Missing rejection reason");
      await apiClient.merchantRejectOrder(id, reasonCode, merchantId);
    },
    onSuccess: () => {
      invalidateOrderRelatedCaches();
      setRejectDialogOpen(false);
      setSelectedRejectReason("");
      toast.success("تم رفض الطلب بنجاح");
    },
    onError: () => {
      toast.error("تعذر اتخاذ القرار بشأن الطلب. يرجى المحاولة مرة أخرى.");
      void refetch();
      if (merchantId) {
        queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", merchantId] });
      }
    },
  });

  const handlePrint = () => window.print();

  const handlePrintSticker = async () => {
    if (!id) return;
    try {
      await apiClient.downloadJenniSticker(id);
    } catch {
      toast.error("تعذر تحميل ستيكر التوصيل حالياً");
    }
  };

  // Delivery integration model
  const rawIntegration = order?.order_delivery_integrations;
  const jenniIntegration = useMemo(() => {
    if (!rawIntegration) return null;
    if (Array.isArray(rawIntegration)) {
      return rawIntegration.find((int) => int.provider_code === "jenni") ?? null;
    }
    return rawIntegration.provider_code === "jenni" ? rawIntegration : null;
  }, [rawIntegration]);

  const deliveryCompanyIsJenni = order?.delivery_companies?.provider_code === "jenni";
  const hasJenniIntegrationRow = !!jenniIntegration;
  const isJenniDispatchedOrSynced =
    jenniIntegration?.dispatch_status === "dispatched" || jenniIntegration?.dispatch_status === "synced";
  const externalShipmentNumber = (jenniIntegration?.external_shipment_number ?? "").trim();
  const hasJenniShipmentNumber = externalShipmentNumber.length > 0;
  const canPrintSticker = hasJenniIntegrationRow && isJenniDispatchedOrSynced && hasJenniShipmentNumber;

  const hasLegacyDelivery =
    !hasJenniIntegrationRow &&
    (!!order?.delivery_company_id || !!order?.delivery_status || !!order?.delivery_companies?.name);

  const deliveryStatusLabel = getMerchantDeliveryStatusLabel(order?.delivery_status);
  const jenniDispatchLabel = getMerchantJenniDispatchLabel(jenniIntegration?.dispatch_status);

  const orderStatusLabel = getMerchantOrderStatusLabel(order?.status);
  const merchantDecisionStatus = order?.merchant_decision_status ?? null;
  const rejectionReasonCode = order?.merchant_rejection_reason_code ?? null;
  const isPendingDecision = merchantDecisionStatus === "pending" && order?.status === "new";

  // Check for 404 status in error
  const apiError = error as { status?: number; statusCode?: number; response?: { status?: number }; message?: string } | null;
  const is404 =
    apiError?.status === 404 ||
    apiError?.response?.status === 404 ||
    apiError?.statusCode === 404 ||
    (typeof apiError?.message === "string" && (apiError.message.includes("404") || apiError.message.includes("NotFound")));

  if (!merchantId) {
    return (
      <div className="text-center py-20 text-muted-foreground text-sm">
        لا يمكن تحديد نطاق المتجر النشط.
      </div>
    );
  }

  // State 1: Loading
  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3" data-testid="order-loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">جاري تحميل تفاصيل الطلب...</p>
      </div>
    );
  }

  // State 2: 404 Not Found
  if (is404 || (!order && !isError)) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto px-4" data-testid="order-not-found">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Package className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-bold text-foreground">الطلب غير موجود أو لم يعد متاحاً</p>
          <p className="text-xs text-muted-foreground">تأكد من رقم الطلب أو تحقق من صلاحيات المتجر النشط.</p>
        </div>
        <Link to="/merchant/orders">
          <Button variant="outline" size="sm" className="gap-2 text-xs font-bold">
            <ArrowRight className="h-3.5 w-3.5" />
            <span>العودة لقائمة الطلبات</span>
          </Button>
        </Link>
      </div>
    );
  }

  // State 3: API / Network Error + Retry
  if (isError || !order) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto px-4" data-testid="order-error">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-bold text-foreground">تعذر تحميل تفاصيل الطلب</p>
          <p className="text-xs text-muted-foreground">{String((error as { message?: string })?.message ?? "حدث خطأ في الاتصال بالخادم.")}</p>
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
          <Link to="/merchant/orders">
            <Button variant="outline" size="sm" className="text-xs font-medium">
              قائمة الطلبات
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // State 4: Populated Order View
  const items: MerchantOrderItem[] = order.order_items ?? [];
  const governorateName = order.governorates?.name ?? null;

  return (
    <div className="space-y-6" dir="rtl" data-testid="merchant-order-detail">
      {/* Print styles — Merchant Fulfillment Slip ONLY */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { margin: 10mm; size: A4; }
              body { visibility: hidden; background: white !important; }
              #merchant-fulfillment-slip {
                visibility: visible;
                position: absolute;
                left: 0; top: 0;
                width: 100%;
                padding: 0; margin: 0;
                display: block !important;
              }
              .no-print { display: none !important; }
              html, body { height: auto !important; overflow: visible !important; margin: 0 !important; }
            }
          `,
        }}
      />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-4 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                طلب #{order.order_number}
              </h1>
              <Badge variant="outline" className="text-xs font-medium">
                {orderStatusLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
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
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Jenni sticker button */}
          {hasJenniIntegrationRow && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
              onClick={handlePrintSticker}
              disabled={!canPrintSticker}
              title={
                !isJenniDispatchedOrSynced
                  ? "لا يمكن طباعة الستيكر قبل إرسال الشحنة أو مزامنتها مع شركة التوصيل"
                  : !hasJenniShipmentNumber
                  ? "رقم الشحنة غير متوفر"
                  : "طباعة الملصق"
              }
            >
              <Tag className="h-3.5 w-3.5" />
              <span>طباعة الستيكر</span>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs font-bold" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            <span>طباعة وصل التجهيز</span>
          </Button>
        </div>
      </div>

      {/* Merchant Decision Status & Controls Card */}
      <Card className="no-print border-border shadow-2xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-sm font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <span>قرار المتجر</span>
            </div>
            {isStaffOnly && (
              <Badge variant="secondary" className="text-[11px] font-normal">
                عرض فقط (حساب موظف)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Case 1: Pending decision + New Order + Authorized Owner/Manager */}
          {isPendingDecision && isAuthorizedToDecide ? (
            <div className="space-y-3" data-testid="decision-controls">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
                <span className="font-semibold text-foreground">هذا الطلب بانتظار قرارك التشغيلي:</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none sm:min-w-[160px] font-bold text-xs"
                  onClick={() => acceptOrder.mutate()}
                  disabled={acceptOrder.isPending || rejectOrder.isPending}
                >
                  {acceptOrder.isPending ? "جاري القبول..." : "✅ قبول الطلب"}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 sm:flex-none sm:min-w-[160px] font-bold text-xs"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={acceptOrder.isPending || rejectOrder.isPending}
                >
                  ❌ رفض الطلب
                </Button>
              </div>

              {/* Reject Dialog Panel */}
              {rejectDialogOpen && (
                <div className="mt-4 p-4 border border-destructive/20 rounded-xl bg-destructive/5 space-y-3 animate-fade-in" data-testid="reject-dialog">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-destructive">اختر سبب رفض الطلب</h4>
                    <span className="text-[11px] text-muted-foreground">مطلوب لتأكيد الرفض</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                          name="reject-reason"
                          value={reason.code}
                          checked={selectedRejectReason === reason.code}
                          onChange={(e) => setSelectedRejectReason(e.target.value)}
                          className="accent-destructive"
                        />
                        <span>{reason.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRejectDialogOpen(false);
                        setSelectedRejectReason("");
                      }}
                      disabled={rejectOrder.isPending}
                      className="h-8 text-xs"
                    >
                      إلغاء
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!selectedRejectReason || rejectOrder.isPending}
                      onClick={() => rejectOrder.mutate(selectedRejectReason)}
                      className="h-8 text-xs font-bold"
                    >
                      {rejectOrder.isPending ? "جاري الرفض..." : "تأكيد الرفض"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : isPendingDecision && isStaffOnly ? (
            /* Case 2: Pending decision, but user is staff -> Read-only info */
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border"
              data-testid="staff-readonly-banner"
            >
              <Clock className="h-4 w-4 text-amber-500" />
              <span>الطلب بانتظار قرار مالك أو مدير المتجر (حساب الموظف مخصص للقراءة والتجهيز فقط).</span>
            </div>
          ) : merchantDecisionStatus === "accepted" ? (
            /* Case 3: Accepted */
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge className="bg-emerald-600 text-white text-xs py-0.5 font-bold">
                قرار المتجر: تم القبول
              </Badge>
              <span className="text-xs text-muted-foreground">
                حالة الطلب الحالية: {orderStatusLabel}
              </span>
            </div>
          ) : merchantDecisionStatus === "rejected" ? (
            /* Case 4: Rejected */
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge className="bg-destructive text-destructive-foreground text-xs py-0.5 font-bold">
                  قرار المتجر: مرفوض
                </Badge>
                <span className="text-xs text-muted-foreground">
                  حالة الطلب: {orderStatusLabel}
                </span>
              </div>
              {rejectionReasonCode && (
                <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                  سبب الرفض: {getRejectionLabel(rejectionReasonCode)}
                </p>
              )}
            </div>
          ) : (
            /* Case 5: Normal historical view */
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span>حالة الطلب: {orderStatusLabel}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Status Card (Read-Only) */}
      {(hasLegacyDelivery || hasJenniIntegrationRow) && (
        <Card className="no-print border-border shadow-2xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <span>حالة التوصيل (قراءة فقط)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <span className="text-muted-foreground block mb-1">شركة التوصيل</span>
                <span className="font-semibold text-foreground">
                  {order.delivery_companies?.name || (deliveryCompanyIsJenni ? "Jenni" : "غير محدد")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">حالة التوصيل الحالية</span>
                <Badge variant="outline" className="text-xs font-medium">
                  {deliveryStatusLabel}
                </Badge>
              </div>
              {hasJenniIntegrationRow && jenniIntegration?.dispatch_status && (
                <div>
                  <span className="text-muted-foreground block mb-1">حالة الإرسال لشركة التوصيل</span>
                  <Badge variant="secondary" className="text-xs font-medium">
                    {jenniDispatchLabel}
                  </Badge>
                </div>
              )}
              {hasJenniIntegrationRow && externalShipmentNumber && (
                <div>
                  <span className="text-muted-foreground block mb-1">رقم الشحنة</span>
                  <span className="font-mono font-bold text-foreground">
                    {externalShipmentNumber}
                  </span>
                </div>
              )}
              {hasJenniIntegrationRow && jenniIntegration?.provider_shipment_id && (
                <div>
                  <span className="text-muted-foreground block mb-1">معرف المزود الداخلي</span>
                  <span className="font-mono text-muted-foreground text-xs">
                    {jenniIntegration.provider_shipment_id}
                  </span>
                </div>
              )}
              {hasJenniIntegrationRow && jenniIntegration?.provider_current_step_ar && (
                <div>
                  <span className="text-muted-foreground block mb-1">موقع الشحنة الحالي</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {jenniIntegration.provider_current_step_ar}
                  </span>
                </div>
              )}
              {hasJenniIntegrationRow && jenniIntegration?.last_synced_at && (
                <div>
                  <span className="text-muted-foreground block mb-1">آخر تحديث من التتبع</span>
                  <span className="text-muted-foreground">
                    {new Date(jenniIntegration.last_synced_at).toLocaleString("ar-IQ")}
                  </span>
                </div>
              )}
            </div>

            {hasJenniIntegrationRow && jenniIntegration?.dispatch_error && (
              <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                {getMerchantJenniErrorLabel(jenniIntegration.dispatch_error)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Order Info & Amounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
        {/* Order Metadata */}
        <Card className="border-border shadow-2xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-bold">معلومات الطلب</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">رقم الطلب</span>
              <span className="font-mono font-bold text-foreground">#{order.order_number}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">قناة الطلب</span>
              <span className="font-medium text-foreground">{getMerchantChannelLabel(order.channel)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">طريقة الدفع</span>
              <span className="font-medium text-foreground">{getMerchantPaymentMethodLabel(order.payment_method)}</span>
            </div>
            {governorateName && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">المحافظة</span>
                <span className="font-medium text-foreground">{governorateName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial Amounts Summary */}
        <Card className="border-border shadow-2xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-bold">ملخص المبالغ</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span className="font-mono font-semibold text-foreground">{formatPrice(order.subtotal ?? 0)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                <span>الخصم</span>
                <span className="font-mono font-semibold">- {formatPrice(order.discount ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">أجور التوصيل</span>
              <span className="font-mono font-semibold text-foreground">{formatPrice(order.delivery_cost ?? 0)}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between items-center font-bold text-sm text-foreground pt-1">
              <span>الإجمالي الكلي</span>
              <span className="font-mono text-base text-primary">{formatPrice(order.total ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items List */}
      <Card className="no-print border-border shadow-2xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span>المنتجات المطلوبة ({items.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">لا توجد منتجات مسجلة في هذا الطلب.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {items.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                  <div className="space-y-0.5">
                    <p className="font-bold text-xs text-foreground">{item.product_name ?? "منتج بدون اسم"}</p>
                    <p className="text-[11px] text-muted-foreground">الكمية: {item.quantity}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-mono font-bold text-xs text-foreground">
                      {formatPrice((item.unit_price ?? item.price ?? 0) * item.quantity)}
                    </p>
                    {item.quantity > 1 && (
                      <p className="font-mono text-[10px] text-muted-foreground">
                        ({formatPrice(item.unit_price ?? item.price ?? 0)} للوحدة)
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prep Notes */}
      {order.merchant_notes && (
        <Card className="no-print border-border shadow-2xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-bold">ملاحظات التجهيز</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
              {order.merchant_notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          MERCHANT FULFILLMENT SLIP — print only, STRICTLY NO CUSTOMER PII
          ═══════════════════════════════════════════════════════ */}
      <div id="merchant-fulfillment-slip" className="hidden" dir="rtl">
        <div style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", lineHeight: "1.6" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #333", paddingBottom: "12px", marginBottom: "16px" }}>
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: "bold", margin: 0 }}>وصل التجهيز</h1>
              <p style={{ margin: "4px 0 0", color: "#666" }}>وصل تجهيز المتجر (Fulfillment Slip)</p>
            </div>
            <div style={{ textAlign: "left" }}>
              <p style={{ margin: 0 }}><strong>رقم الطلب:</strong> #{order.order_number}</p>
              <p style={{ margin: 0 }}><strong>التاريخ:</strong> {order.created_at ? new Date(order.created_at).toLocaleDateString("ar-IQ") : "—"}</p>
              <p style={{ margin: 0 }}><strong>الحالة:</strong> {orderStatusLabel}</p>
            </div>
          </div>

          {/* Items */}
          <h3 style={{ borderBottom: "1px solid #ccc", paddingBottom: "4px", fontSize: "15px" }}>المنتجات والكميات</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "6px 8px", textAlign: "right", border: "1px solid #ddd" }}>المنتج</th>
                <th style={{ padding: "6px 8px", textAlign: "center", border: "1px solid #ddd", width: "80px" }}>الكمية</th>
                <th style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #ddd", width: "120px" }}>السعر</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ padding: "6px 8px", border: "1px solid #ddd" }}>{item.product_name ?? "منتج"}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #ddd", textAlign: "center" }}>{item.quantity}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #ddd", textAlign: "left" }}>
                    {formatPrice((item.unit_price ?? item.price ?? 0) * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
            <table style={{ borderCollapse: "collapse", minWidth: "240px" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "4px 8px", color: "#666" }}>المجموع الفرعي</td>
                  <td style={{ padding: "4px 8px", textAlign: "left" }}>{formatPrice(order.subtotal ?? 0)}</td>
                </tr>
                {Number(order.discount) > 0 && (
                  <tr>
                    <td style={{ padding: "4px 8px", color: "#666" }}>الخصم</td>
                    <td style={{ padding: "4px 8px", textAlign: "left" }}>- {formatPrice(order.discount ?? 0)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: "4px 8px", color: "#666" }}>التوصيل</td>
                  <td style={{ padding: "4px 8px", textAlign: "left" }}>{formatPrice(order.delivery_cost ?? 0)}</td>
                </tr>
                <tr style={{ borderTop: "2px solid #333", fontWeight: "bold" }}>
                  <td style={{ padding: "6px 8px" }}>الإجمالي</td>
                  <td style={{ padding: "6px 8px", textAlign: "left" }}>{formatPrice(order.total ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Payment + Governorate */}
          <div style={{ display: "flex", gap: "32px", marginBottom: "16px" }}>
            <div>
              <strong>طريقة الدفع:</strong> {getMerchantPaymentMethodLabel(order.payment_method)}
            </div>
            {governorateName && (
              <div>
                <strong>المحافظة:</strong> {governorateName}
              </div>
            )}
            <div>
              <strong>القناة:</strong> {getMerchantChannelLabel(order.channel)}
            </div>
          </div>

          {/* Prep Notes */}
          {order.merchant_notes && (
            <div style={{ background: "#fffbe6", border: "1px solid #ffe58f", padding: "8px 12px", borderRadius: "4px" }}>
              <strong>ملاحظات التجهيز:</strong> {order.merchant_notes}
            </div>
          )}

          {/* Privacy notice */}
          <div style={{ marginTop: "24px", borderTop: "1px solid #eee", paddingTop: "8px", fontSize: "11px", color: "#999" }}>
            وصل التجهيز الخاص بالمتجر — لا يحتوي على بيانات التواصل مع العميل — جميع الحقوق محفوظة لـ DILMART.
          </div>
        </div>
      </div>
    </div>
  );
}
