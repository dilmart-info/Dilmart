import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowRight, Printer, Package, ClipboardList, Truck, Tag } from "lucide-react";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { apiClient } from "@/lib/api-client";
import { merchantRejectionReasons, getRejectionLabel } from "@/lib/merchant-rejection-reasons";

const statusMap: Record<string, { label: string; color: string }> = {
  new: { label: "جديد", color: "bg-blue-500" },
  contacted: { label: "تم التواصل", color: "bg-purple-500" },
  preparing: { label: "قيد التجهيز", color: "bg-amber-500" },
  shipped: { label: "تم الشحن", color: "bg-indigo-500" },
  delivered: { label: "تم التوصيل", color: "bg-green-500" },
  cancelled: { label: "ملغي", color: "bg-destructive" },
  returned: { label: "مرجع", color: "bg-gray-500" },
};

const deliveryStatusMap: Record<string, { label: string; color: string }> = {
  pending_assignment: { label: "بانتظار الإسناد", color: "bg-gray-400" },
  assigned_to_company: { label: "تم الإسناد لشركة التوصيل", color: "bg-blue-400" },
  picked_up: { label: "تم الاستلام من التاجر", color: "bg-indigo-400" },
  in_transit: { label: "في الطريق", color: "bg-amber-400" },
  delivered: { label: "تم التوصيل", color: "bg-green-500" },
  returned: { label: "مرجع", color: "bg-red-400" },
  failed: { label: "فشل التوصيل", color: "bg-red-600" },
};

const dispatchStatusMap: Record<string, string> = {
  pending: "قيد الانتظار",
  dispatched: "تم الإرسال",
  failed: "فشل الإرسال",
  synced: "تمت المزامنة",
  cancelled: "ملغي",
};

/**
 * Merchant-only order detail page.
 * Fulfillment view — NO customer contact data is displayed.
 * Print output is a Merchant Fulfillment Slip (no PII).
 */
export default function MerchantOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: membership } = useCurrentMerchant();
  const merchantId = (membership as any)?.merchant_id as string | undefined;

  const { data: order, isLoading } = useQuery({
    queryKey: ["merchant-order-detail", id, merchantId],
    queryFn: async () => {
      if (!id) throw new Error("Missing order id");
      if (!merchantId) throw new Error("Missing merchant scope");
      const res = await apiClient.getOrderDetail(id, { merchant_id: merchantId });
      return res;
    },
    enabled: !!id && !!merchantId,
  });

  const acceptOrder = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing order id");
      await apiClient.merchantAcceptOrder(id, merchantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchant-order-detail", id] });
      toast.success("تم قبول الطلب بنجاح");
    },
    onError: () => toast.error("حدث خطأ أثناء قبول الطلب"),
  });

  const rejectOrder = useMutation({
    mutationFn: async (reasonCode: string) => {
      if (!id) throw new Error("Missing order id");
      await apiClient.merchantRejectOrder(id, reasonCode, merchantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["merchant-order-detail", id] });
      setRejectDialogOpen(false);
      setSelectedRejectReason("");
      toast.success("تم رفض الطلب");
    },
    onError: () => toast.error("حدث خطأ أثناء رفض الطلب"),
  });

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRejectReason, setSelectedRejectReason] = useState("");

  const handlePrint = () => window.print();

  // Delivery state detection — four-state model:
  // 1. No delivery (no company, no status, no integration)
  // 2. Legacy/manual delivery (company or status exists, but no integration row)
  // 3. Jenni integration row exists, but dispatch not complete
  // 4. Jenni dispatched with shipment ID → full Jenni block + sticker
  //
  // PostgREST joins can return either an array of objects or a singular object. We handle both robustly.
  const rawIntegration = (order as any)?.order_delivery_integrations;
  const jenniIntegration = Array.isArray(rawIntegration)
    ? rawIntegration.find((int: any) => int.provider_code === "jenni")
    : rawIntegration?.provider_code === "jenni"
    ? rawIntegration
    : null;

  const deliveryCompanyIsJenni = (order as any)?.delivery_companies?.provider_code === "jenni";
  const hasJenniIntegrationRow = !!jenniIntegration;
  const isJenniDispatched = jenniIntegration?.dispatch_status === "dispatched";
  const hasJenniShipmentId = !!jenniIntegration?.provider_shipment_id;
  const canPrintSticker = hasJenniIntegrationRow && isJenniDispatched && hasJenniShipmentId;

  // Legacy delivery: order has a delivery company or status, but no Jenni integration row.
  const hasLegacyDelivery =
    !hasJenniIntegrationRow &&
    (!!(order as any)?.delivery_company_id || !!(order as any)?.delivery_status || !!(order as any)?.delivery_companies?.name);

  const deliveryStatus = (order as any)?.delivery_status;
  const deliveryStatusInfo = deliveryStatusMap[deliveryStatus] ?? null;

  const orderStatus = (order as { status?: string })?.status ?? "new";
  const merchantDecisionStatus = (order as any)?.merchant_decision_status ?? "pending";
  const rejectionReasonCode = (order as any)?.merchant_rejection_reason_code ?? null;

  const handlePrintSticker = () => {
    if (!id) return;
    apiClient.downloadJenniSticker(id);
  };

  if (!merchantId) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        لا يمكن تحديد نطاق التاجر.
      </div>
    );
  }

  if (isLoading) return <div className="text-center py-20">جاري التحميل...</div>;
  if (!order) return <div className="text-center py-20 text-destructive">الطلب غير موجود</div>;

  const items: any[] = (order as any).order_items ?? [];
  const governorateName = (order as any).governorates?.name ?? null;
  const statusInfo = statusMap[(order as any).status ?? "new"] ?? { label: (order as any).status, color: "bg-gray-400" };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Print styles — Merchant Fulfillment Slip ONLY */}
      <style dangerouslySetInnerHTML={{
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
        `
      }} />

      {/* Header */}
      <div className="flex items-center gap-4 no-print">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowRight size={20} />
        </Button>
        <h2 className="text-2xl font-bold">طلب #{(order as any).order_number}</h2>
        <Badge className={`${statusInfo.color} text-white`}>{statusInfo.label}</Badge>
        <div className="mr-auto flex gap-2">
          {/* Jenni sticker button — only when a real integration row exists */}
          {hasJenniIntegrationRow && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 disabled:opacity-50"
              onClick={handlePrintSticker}
              disabled={!canPrintSticker}
              title={
                !isJenniDispatched
                  ? "لا يمكن طباعة الستيكر قبل اكتمال الإرسال إلى Jenni"
                  : !hasJenniShipmentId
                  ? "معرف الشحنة غير متوفر"
                  : "طباعة الملصق"
              }
            >
              <Tag size={16} />
              طباعة الستيكر
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
            <Printer size={16} />
            طباعة وصل التجهيز
          </Button>
        </div>
      </div>

      {/* ── Legacy / Manual Delivery Block ── */}
      {hasLegacyDelivery && (
        <Card className="no-print border-amber-200/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck size={16} />
              حالة التوصيل (قراءة فقط)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-muted-foreground block text-xs">شركة التوصيل</span>
                <span className="font-semibold">
                  {(order as any)?.delivery_companies?.name || "غير محدد"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">حالة التوصيل الحالية</span>
                <div className="flex items-center gap-2 mt-1">
                  {deliveryStatusInfo ? (
                    <Badge className={`${deliveryStatusInfo.color} text-white`}>{deliveryStatusInfo.label}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">لا توجد حالة توصيل بعد</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-md border border-border">
              هذا الطلب لا يحتوي على سجل شحنة Jenni، لذلك لا يتوفر ستيكر.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Jenni Integration Block (integration row exists) ── */}
      {hasJenniIntegrationRow && (
        <Card className="no-print border-blue-200/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck size={16} />
              حالة التوصيل — Jenni (قراءة فقط)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-muted-foreground block text-xs">شركة التوصيل</span>
                <span className="font-semibold">
                  {(order as any)?.delivery_companies?.name || (deliveryCompanyIsJenni ? "Jenni" : "غير محدد")}
                </span>
              </div>
              {jenniIntegration?.provider_shipment_id && (
                <div>
                  <span className="text-muted-foreground block text-xs">معرف الشحنة</span>
                  <span className="font-mono text-xs">{jenniIntegration.provider_shipment_id}</span>
                </div>
              )}
              {jenniIntegration?.dispatch_status && (
                <div>
                  <span className="text-muted-foreground block text-xs">حالة الإرسال لشركة التوصيل</span>
                  <Badge variant="outline" className="text-xs mt-0.5">
                    {dispatchStatusMap[jenniIntegration.dispatch_status] ?? jenniIntegration.dispatch_status}
                  </Badge>
                </div>
              )}
              <div>
                <span className="text-muted-foreground block text-xs">حالة التوصيل الحالية</span>
                <div className="flex items-center gap-2 mt-1">
                  {deliveryStatusInfo ? (
                    <Badge className={`${deliveryStatusInfo.color} text-white`}>{deliveryStatusInfo.label}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">لا توجد حالة توصيل بعد</span>
                  )}
                </div>
              </div>
              {jenniIntegration?.provider_current_step_ar && (
                <div>
                  <span className="text-muted-foreground block text-xs">موقع الشحنة الحالي</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{jenniIntegration.provider_current_step_ar}</span>
                </div>
              )}
              {jenniIntegration?.last_synced_at && (
                <div>
                  <span className="text-muted-foreground block text-xs">آخر تحديث من التتبع</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(jenniIntegration.last_synced_at).toLocaleString("ar-IQ")}
                  </span>
                </div>
              )}
            </div>

            {/* Jenni sticker footer */}
            <div className="pt-2 flex items-center justify-between border-t border-border mt-3">
              <div>
                {!isJenniDispatched && (
                  <p className="text-[10px] text-muted-foreground">لا يمكن طباعة الستيكر قبل اكتمال الإرسال إلى Jenni.</p>
                )}
                {jenniIntegration?.dispatch_error && (
                  <p className="text-[10px] text-destructive mt-0.5">{jenniIntegration.dispatch_error}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 disabled:opacity-50 text-xs"
                onClick={handlePrintSticker}
                disabled={!canPrintSticker}
                title={
                  !isJenniDispatched
                    ? "لا يمكن طباعة الستيكر قبل اكتمال الإرسال إلى Jenni"
                    : !hasJenniShipmentId
                    ? "معرف الشحنة غير متوفر"
                    : "طباعة الملصق"
                }
              >
                <Tag size={14} />
                طباعة الستيكر
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merchant Decision */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package size={16} />
            قرار التاجر
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {merchantDecisionStatus === "pending" && orderStatus === "new" ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-muted-foreground">هذا الطلب بانتظار قرارك:</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none sm:min-w-[160px]"
                  onClick={() => acceptOrder.mutate()}
                  disabled={acceptOrder.isPending || rejectOrder.isPending}
                >
                  {acceptOrder.isPending ? "جاري القبول..." : "✅ قبول الطلب"}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 sm:flex-none sm:min-w-[160px]"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={acceptOrder.isPending || rejectOrder.isPending}
                >
                  ❌ رفض الطلب
                </Button>
              </div>

              {/* Reject Dialog */}
              {rejectDialogOpen && (
                <div className="mt-4 p-5 border border-destructive/20 rounded-lg bg-destructive/5 space-y-4">
                  <h4 className="font-semibold text-sm text-destructive">اختر سبب رفض الطلب</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {merchantRejectionReasons.map((reason) => (
                      <label
                        key={reason.code}
                        className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all duration-200 ${
                          selectedRejectReason === reason.code
                            ? "border-destructive bg-destructive/10 text-foreground ring-1 ring-destructive/30"
                            : "border-border bg-card/40 hover:bg-muted/40 text-foreground"
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
                        <span className="text-sm">{reason.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!selectedRejectReason || rejectOrder.isPending}
                      onClick={() => rejectOrder.mutate(selectedRejectReason)}
                    >
                      {rejectOrder.isPending ? "جاري الرفض..." : "تأكيد الرفض"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setRejectDialogOpen(false); setSelectedRejectReason(""); }}
                      disabled={rejectOrder.isPending}
                    >
                      رجوع
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : merchantDecisionStatus === "accepted" ? (
            <div className="flex items-center gap-2">
              <Badge className="bg-green-600 text-white">تم القبول</Badge>
              <span className="text-sm text-muted-foreground">تم قبول الطلب — قيد التجهيز</span>
            </div>
          ) : merchantDecisionStatus === "rejected" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-red-600 text-white">مرفوض</Badge>
                <span className="text-sm text-muted-foreground">تم رفض الطلب — بانتظار مراجعة الإدارة</span>
              </div>
              {rejectionReasonCode && (
                <p className="text-sm text-destructive bg-destructive/5 p-3 rounded-md border border-destructive/20">
                  سبب الرفض: {getRejectionLabel(rejectionReasonCode)}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge className={`${statusMap[orderStatus]?.color || "bg-gray-500"} text-white`}>
                {statusMap[orderStatus]?.label || orderStatus}
              </Badge>
              <span className="text-sm text-muted-foreground">الحالة الحالية (قراءة فقط)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">معلومات الطلب</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">رقم الطلب</span>
              <span className="font-medium">{(order as any).order_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">القناة</span>
              <span>{(order as any).channel ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">تاريخ الإنشاء</span>
              <span>{(order as any).created_at ? new Date((order as any).created_at).toLocaleDateString("ar-IQ") : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">طريقة الدفع</span>
              <span>{(order as any).payment_method ?? "الدفع عند الاستلام"}</span>
            </div>
            {governorateName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">المحافظة</span>
                <span>{governorateName}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملخص المبالغ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span>{formatPrice((order as any).subtotal ?? 0)}</span>
            </div>
            {Number((order as any).discount) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>الخصم</span>
                <span>- {formatPrice((order as any).discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">توصيل</span>
              <span>{formatPrice((order as any).delivery_cost ?? 0)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>الإجمالي</span>
              <span>{formatPrice((order as any).total ?? 0)}</span>
            </div>
            {(order as any).payment_method === "cod" || !(order as any).payment_method ? (
              <Badge variant="outline" className="mt-1">الدفع عند الاستلام</Badge>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList size={16} />
            المنتجات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد منتجات.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between border-b border-border/40 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">الكمية: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-medium">{formatPrice(Number(item.price) * Number(item.quantity))}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prep Notes */}
      {(order as any).merchant_notes && (
        <Card className="no-print">
          <CardHeader>
            <CardTitle className="text-base">ملاحظات التجهيز</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{(order as any).merchant_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════
          MERCHANT FULFILLMENT SLIP — print only, NO customer PII
          ═══════════════════════════════════════════════════════ */}
      <div id="merchant-fulfillment-slip" className="hidden" dir="rtl">
        <div style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", lineHeight: "1.6" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #333", paddingBottom: "12px", marginBottom: "16px" }}>
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: "bold", margin: 0 }}>وصل التجهيز</h1>
              <p style={{ margin: "4px 0 0", color: "#666" }}>وصل تجهيز التاجر</p>
            </div>
            <div style={{ textAlign: "left" }}>
              <p style={{ margin: 0 }}><strong>رقم الطلب:</strong> {(order as any).order_number}</p>
              <p style={{ margin: 0 }}><strong>التاريخ:</strong> {(order as any).created_at ? new Date((order as any).created_at).toLocaleDateString("ar-IQ") : "—"}</p>
              <p style={{ margin: 0 }}><strong>الحالة:</strong> {statusInfo.label}</p>
            </div>
          </div>

          {/* Items */}
          <h3 style={{ borderBottom: "1px solid #ccc", paddingBottom: "4px" }}>المنتجات والكميات</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "6px 8px", textAlign: "right", border: "1px solid #ddd" }}>المنتج</th>
                <th style={{ padding: "6px 8px", textAlign: "center", border: "1px solid #ddd", width: "80px" }}>الكمية</th>
                <th style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #ddd", width: "120px" }}>السعر</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td style={{ padding: "6px 8px", border: "1px solid #ddd" }}>{item.product_name}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #ddd", textAlign: "center" }}>{item.quantity}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #ddd", textAlign: "left" }}>{formatPrice(Number(item.price) * Number(item.quantity))}</td>
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
                  <td style={{ padding: "4px 8px", textAlign: "left" }}>{formatPrice((order as any).subtotal ?? 0)}</td>
                </tr>
                {Number((order as any).discount) > 0 && (
                  <tr>
                    <td style={{ padding: "4px 8px", color: "#666" }}>الخصم</td>
                    <td style={{ padding: "4px 8px", textAlign: "left" }}>- {formatPrice((order as any).discount)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: "4px 8px", color: "#666" }}>التوصيل</td>
                  <td style={{ padding: "4px 8px", textAlign: "left" }}>{formatPrice((order as any).delivery_cost ?? 0)}</td>
                </tr>
                <tr style={{ borderTop: "2px solid #333", fontWeight: "bold" }}>
                  <td style={{ padding: "6px 8px" }}>الإجمالي</td>
                  <td style={{ padding: "6px 8px", textAlign: "left" }}>{formatPrice((order as any).total ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Payment + Governorate */}
          <div style={{ display: "flex", gap: "32px", marginBottom: "16px" }}>
            <div>
              <strong>طريقة الدفع:</strong>{" "}
              {(order as any).payment_method === "cod" || !(order as any).payment_method ? "الدفع عند الاستلام" : (order as any).payment_method}
            </div>
            {governorateName && (
              <div>
                <strong>المحافظة:</strong> {governorateName}
              </div>
            )}
            <div>
              <strong>القناة:</strong> {(order as any).channel ?? "—"}
            </div>
          </div>

          {/* Prep Notes */}
          {(order as any).merchant_notes && (
            <div style={{ background: "#fffbe6", border: "1px solid #ffe58f", padding: "8px 12px", borderRadius: "4px" }}>
              <strong>ملاحظات التجهيز:</strong> {(order as any).merchant_notes}
            </div>
          )}

          {/* Privacy notice */}
          <div style={{ marginTop: "24px", borderTop: "1px solid #eee", paddingTop: "8px", fontSize: "11px", color: "#999" }}>
            وصل التجهيز الخاص بالتاجر — لا يحتوي على بيانات التواصل مع العميل — جميع الحقوق محفوظة للمنصة.
          </div>
        </div>
      </div>
    </div>
  );
}
