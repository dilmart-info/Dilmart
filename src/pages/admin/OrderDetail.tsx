import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getRejectionLabel } from "@/lib/merchant-rejection-reasons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { ArrowRight, Phone, MapPin, ClipboardList, Info, Printer, MessageCircle, Truck, Eye, Edit, Loader2, RefreshCw } from "lucide-react";
import { platformScope } from "@/lib/data-scope";
import { apiClient } from "@/lib/api-client";


const statusMap: Record<string, { label: string, color: string }> = {
    new: { label: "جديد", color: "bg-blue-500" },
    contacted: { label: "تم التواصل", color: "bg-purple-500" },
    preparing: { label: "قيد التجهيز", color: "bg-amber-500" },
    shipped: { label: "تم الشحن", color: "bg-indigo-500" },
    delivered: { label: "تم التوصيل", color: "bg-green-500" },
    cancelled: { label: "ملغي", color: "bg-destructive" },
    returned: { label: "مرجع", color: "bg-gray-500" },
};

type ConfirmActionType =
    | "mark_collected"
    | "remit_platform"
    | "remit_merchant"
    | "settle_courier"
    | "mark_disputed"
    | "release_courier_dispute"
    | null;

/** Admin-only order detail. For merchant view use MerchantOrderDetail. */
export default function AdminOrderDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [printMode, setPrintMode] = useState<"invoice" | "delivery">("invoice");
    const [showCollectedForm, setShowCollectedForm] = useState(false);
    const [showDisputeForm, setShowDisputeForm] = useState(false);
    const [collectedByType, setCollectedByType] = useState<"courier" | "delivery_company" | "platform">("courier");
    const [collectedById, setCollectedById] = useState("");
    const [collectedAmount, setCollectedAmount] = useState("");
    const [collectionNotes, setCollectionNotes] = useState("");
    const [collectionReference, setCollectionReference] = useState("");
    const [collectionActualRemittedAmount, setCollectionActualRemittedAmount] = useState("");
    const [deliveryCompanyIdDraft, setDeliveryCompanyIdDraft] = useState("");
    const [deliveryAgentIdDraft, setDeliveryAgentIdDraft] = useState("");
    const [deliveryFailureReason, setDeliveryFailureReason] = useState("customer_unavailable");
    const [deliveryFailureNotes, setDeliveryFailureNotes] = useState("");
    const [deliveryGeneralNote, setDeliveryGeneralNote] = useState("");
    const [disputeReasonCode, setDisputeReasonCode] = useState("ORDER_DISPUTED");
    const [disputeNotes, setDisputeNotes] = useState("");
    const [confirmAction, setConfirmAction] = useState<ConfirmActionType>(null);
    const scope = platformScope();
    const canManageAgents = true;

    const { data: order, isLoading } = useQuery({
        queryKey: ["admin-order", id],
        queryFn: async () => {
            if (!id) throw new Error("Missing order id");
            return apiClient.getOrderDetail(id, {
                merchant_id: scope.kind === "merchant" ? scope.merchantId : undefined,
            });
        }
    });

    const { data: agents } = useQuery({
        queryKey: ["admin-agents"],
        queryFn: () => apiClient.getAgentsList(),
        enabled: canManageAgents,
    });

    const { data: financeDetail } = useQuery({
        queryKey: ["admin-order-finance", id],
        enabled: !!id,
        queryFn: () => apiClient.getOrderFinancialDetail(id!),
    });

    const { data: financeEvents } = useQuery({
        queryKey: ["admin-order-finance-events", id],
        enabled: !!id,
        queryFn: () => apiClient.listAdminFinanceEvents({ order_id: id!, limit: 100 }),
    });

    const { data: collectionEvents } = useQuery({
        queryKey: ["admin-order-collection-events", id],
        enabled: !!id,
        queryFn: () => apiClient.listAdminOrderCollectionEvents(id!, { limit: 100 }),
    });

    const { data: deliveryEvents } = useQuery({
        queryKey: ["admin-order-delivery-events", id],
        enabled: !!id,
        queryFn: () => apiClient.listAdminOrderDeliveryEvents(id!, { limit: 200 }),
    });

    const { data: deliveryCompanies } = useQuery({
        queryKey: ["delivery-companies-for-ops"],
        queryFn: () => apiClient.getDeliveryCompanies(),
    });

    const { data: jenniIntegration, refetch: refetchJenni } = useQuery({
        queryKey: ["admin-order-jenni", id],
        enabled: !!id,
        queryFn: () => apiClient.getOrderJenniIntegration(id!),
    });

    const dispatchJenni = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            return apiClient.dispatchOrderToJenni(id);
        },
        onSuccess: (result) => {
            if (result?.local_update_failed) {
                toast.warning(result.message ?? "قُبلت الشحنة في Jenni لكن التحديث المحلي فشل — أعد الضغط لإكمال الربط المحلي.");
            } else if (result?.retried_local_dispatch) {
                toast.success("تم إكمال الربط المحلي مع Jenni دون إنشاء شحنة مكررة");
            } else {
                toast.success("تم إرسال الطلب إلى Jenni");
            }
            refetchJenni();
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "فشل الإرسال إلى Jenni"),
    });

    const syncJenni = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            return apiClient.syncOrderFromJenni(id);
        },
        onSuccess: () => {
            toast.success("تمت مزامنة الحالة من Jenni");
            refetchJenni();
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "فشلت المزامنة من Jenni"),
    });

    const updateAgent = useMutation({
        mutationFn: async (agentId: string | null) => {
            if (!id) throw new Error("Missing order id");
            await apiClient.updateOrderAgent(id, { agent_id: agentId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            toast.success("تم تعيين المندوب بنجاح");
        },
        onError: () => toast.error("حدث خطأ أثناء تعيين المندوب"),
    });

    const updateStatus = useMutation({
        mutationFn: async (newStatus: string) => {
            if (!id) throw new Error("Missing order id");
            await apiClient.updateOrderStatus(id, {
                status: newStatus,
                merchant_id: scope.kind === "merchant" ? scope.merchantId : undefined,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            toast.success("تم تحديث حالة الطلب");
        },
        onError: () => toast.error("حدث خطأ أثناء تحديث الحالة"),
    });

    const updateNotes = useMutation({
        mutationFn: async (notes: string) => {
            if (!id) throw new Error("Missing order id");
            await apiClient.updateOrderNotes(id, {
                admin_notes: notes,
                merchant_id: scope.kind === "merchant" ? scope.merchantId : undefined,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            toast.success("تم حفظ الملاحظات");
        },
        onError: () => toast.error("حدث خطأ أثناء حفظ الملاحظات"),
    });

    const refreshFinancialQueries = () => {
        queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
        queryClient.invalidateQueries({ queryKey: ["admin-order-finance", id] });
        queryClient.invalidateQueries({ queryKey: ["admin-order-finance-events", id] });
        queryClient.invalidateQueries({ queryKey: ["admin-order-collection-events", id] });
        queryClient.invalidateQueries({ queryKey: ["admin-finance-reconciliation-orders"] });
        queryClient.invalidateQueries({ queryKey: ["admin-finance-reconciliation-merchant-balances"] });
    };

    const markCollected = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markOrderCashCollected(id, {
                collected_by_type: collectedByType,
                collected_by_id: collectedById || undefined,
                amount: Number(collectedAmount || 0),
                notes: collectionNotes || undefined,
                reference: collectionReference || undefined,
            });
        },
        onSuccess: () => {
            toast.success("تم تسجيل التحصيل من العميل");
            setShowCollectedForm(false);
            setConfirmAction(null);
            refreshFinancialQueries();
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تسجيل التحصيل"),
    });

    const remitToPlatform = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markOrderRemittedToPlatform(id, {
                notes: collectionNotes || undefined,
                reference: collectionReference || undefined,
                amount: Number(collectionActualRemittedAmount || 0),
            });
        },
        onSuccess: () => {
            toast.success("تم تسجيل التوريد إلى المنصة");
            setConfirmAction(null);
            refreshFinancialQueries();
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تسجيل التوريد للمنصة"),
    });

    const remitToMerchant = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markOrderRemittedToMerchant(id, { notes: collectionNotes || undefined, reference: collectionReference || undefined });
        },
        onSuccess: () => {
            toast.success("تم تسجيل التوريد إلى التاجر");
            setConfirmAction(null);
            refreshFinancialQueries();
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تسجيل التوريد للتاجر"),
    });

    const settleCourier = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.settleOrderCourier(id, { notes: collectionNotes || undefined, reference: collectionReference || undefined });
        },
        onSuccess: () => {
            toast.success("تمت تسوية مستحق التوصيل");
            setConfirmAction(null);
            refreshFinancialQueries();
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تسوية مستحق التوصيل"),
    });

    const markDisputed = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markOrderAsDisputed(id, { reason_code: disputeReasonCode, notes: disputeNotes || undefined });
        },
        onSuccess: () => {
            toast.success("تم نقل الطلب إلى disputed");
            setShowDisputeForm(false);
            setConfirmAction(null);
            refreshFinancialQueries();
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر نقل الطلب إلى disputed"),
    });
    const releaseCourierDispute = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.releaseAdminOrderCourierDispute(id, { notes: disputeNotes || undefined });
        },
        onSuccess: () => {
            toast.success("تم تحرير نزاع التوصيل وإعادة الطلب إلى المسار المالي");
            setConfirmAction(null);
            refreshFinancialQueries();
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تحرير نزاع التوصيل"),
    });

    const assignDeliveryCompany = useMutation({
        mutationFn: async () => {
            if (!id || !deliveryCompanyIdDraft) throw new Error("اختر شركة التوصيل أولاً");
            await apiClient.assignOrderToDeliveryCompany(id, { delivery_company_id: deliveryCompanyIdDraft });
        },
        onSuccess: () => {
            toast.success("تم تعيين شركة التوصيل");
            refreshFinancialQueries();
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تعيين الشركة"),
    });

    const assignDeliveryAgent = useMutation({
        mutationFn: async () => {
            if (!id || !deliveryAgentIdDraft) throw new Error("اختر المندوب أولاً");
            await apiClient.assignOrderToAgent(id, { agent_id: deliveryAgentIdDraft });
        },
        onSuccess: () => {
            toast.success("تم تعيين المندوب");
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تعيين المندوب"),
    });

    const markDeliveryPickedUp = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markAdminOrderPickedUp(id);
        },
        onSuccess: () => {
            toast.success("تم تسجيل الاستلام من التاجر");
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تسجيل الاستلام"),
    });

    const markDeliveryInTransit = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markAdminOrderInTransit(id);
        },
        onSuccess: () => {
            toast.success("تم تحديث الطلب إلى في الطريق");
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تحديث الحالة"),
    });

    const markDeliveryDelivered = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markAdminOrderDeliveryDelivered(id);
        },
        onSuccess: () => {
            toast.success("تم تسجيل التسليم");
            refreshFinancialQueries();
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تسجيل التسليم"),
    });

    const markDeliveryFailed = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markAdminOrderDeliveryFailed(id, { reason_code: deliveryFailureReason, notes: deliveryFailureNotes || undefined });
        },
        onSuccess: () => {
            toast.success("تم تسجيل فشل التسليم");
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تسجيل الفشل"),
    });

    const markDeliveryReturned = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.markOrderReturned(id, { reason_code: deliveryFailureReason, notes: deliveryFailureNotes || undefined });
        },
        onSuccess: () => {
            toast.success("تم تسجيل الإرجاع");
            queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر تسجيل الإرجاع"),
    });

    const addDeliveryNote = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Missing order id");
            await apiClient.addAdminOrderDeliveryNote(id, { notes: deliveryGeneralNote });
        },
        onSuccess: () => {
            toast.success("تمت إضافة ملاحظة التوصيل");
            setDeliveryGeneralNote("");
            queryClient.invalidateQueries({ queryKey: ["admin-order-delivery-events", id] });
        },
        onError: (err: any) => toast.error(err?.message ?? "تعذر إضافة الملاحظة"),
    });

    const remittanceMode = String((financeDetail as any)?.courier_cod_remittance_mode ?? "gross_remittance");
    const remitExpectedAmount =
        remittanceMode === "net_remittance"
            ? Number((financeDetail as any)?.cash_net_expected_from_courier ?? 0)
            : Number((financeDetail as any)?.cash_gross_expected_amount ?? 0);

    useEffect(() => {
        if (confirmAction !== "remit_platform") return;
        setCollectionActualRemittedAmount(String(remitExpectedAmount));
    }, [confirmAction, remitExpectedAmount]);

    const handlePrint = (mode: "invoice" | "delivery") => {
        setPrintMode(mode);
        setTimeout(() => window.print(), 100);
    };

    if (isLoading) return <div className="text-center py-20">جاري التحميل...</div>;
    if (!order) return <div className="text-center py-20 text-destructive">الطلب غير موجود</div>;

    const paymentMethod = String(financeDetail?.payment_method ?? "cod").toLowerCase();
    const deliveryStatus = String((order as any)?.delivery_status ?? ((order as any)?.status === "delivered" ? "delivered" : "pending_assignment"));
    const collectionStatus = String(financeDetail?.collection_status ?? "not_collected");
    const settlementStatus = String(financeDetail?.settlement_status ?? "not_accrued");
    const courierSettlementStatus = String((financeDetail as any)?.courier_settlement_status ?? "pending");
    const canMarkCollected = paymentMethod === "cod" && collectionStatus === "not_collected" && deliveryStatus === "delivered";
    const canRemitToPlatform = collectionStatus === "collected_from_customer";
    const canRemitToMerchant = collectionStatus === "remitted_to_platform";
    const canSettleCourier = Number((financeDetail as any)?.courier_fee_payable ?? 0) > 0 && courierSettlementStatus !== "settled";
    const canMarkDisputed = settlementStatus !== "disputed" && settlementStatus !== "settled";
    const canReleaseCourierDispute = courierSettlementStatus === "disputed";
    const timelineRows = [
        ...(financeEvents?.events ?? []).map((e: any) => ({ source: "finance", type: e.event_type, created_at: e.created_at })),
        ...(collectionEvents?.events ?? []).map((e: any) => ({ source: "collection", type: e.event_type, created_at: e.created_at })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const isSlaBreached =
        !!(order as any)?.delivery_sla_due_at &&
        !["delivered", "failed", "returned", "cancelled"].includes(deliveryStatus) &&
        new Date((order as any).delivery_sla_due_at).getTime() < Date.now();
    const hasCourierDisputeReleaseEvent = (financeEvents?.events ?? []).some((e: any) => e?.event_type === "courier_dispute_release");

    const confirmContent: Record<Exclude<ConfirmActionType, null>, { title: string; description: string }> = {
        mark_collected: {
            title: "تأكيد تسجيل التحصيل",
            description: "هل أنت متأكد من تسجيل أن النقد تم تحصيله من العميل؟",
        },
        remit_platform: {
            title: "تأكيد التوريد إلى المنصة",
            description: "هل أنت متأكد من تسجيل أن المبلغ تم توريده إلى المنصة؟",
        },
        remit_merchant: {
            title: "تأكيد التوريد إلى التاجر",
            description: "هل أنت متأكد من تسجيل أن المبلغ تم توريده إلى التاجر؟",
        },
        settle_courier: {
            title: "تأكيد تسوية التوصيل",
            description: "هل أنت متأكد من تسوية مستحق شركة التوصيل لهذا الطلب؟",
        },
        mark_disputed: {
            title: "تأكيد تحويل الطلب إلى disputed",
            description: "هل أنت متأكد من نقل هذا الطلب إلى حالة disputed؟",
        },
        release_courier_dispute: {
            title: "تأكيد تحرير نزاع التوصيل",
            description: "هل أنت متأكد من تحرير نزاع التوصيل وإعادة الطلب إلى حالة قابلة للتسوية؟",
        },
    };

    const executeConfirmedAction = () => {
        if (confirmAction === "mark_collected") {
            markCollected.mutate();
        } else if (confirmAction === "remit_platform") {
            const actualAmount = Number(collectionActualRemittedAmount || 0);
            if (actualAmount <= 0) {
                toast.error("يرجى إدخال المبلغ الفعلي المورّد للمنصة.");
                return;
            }
            if (Math.abs(actualAmount - remitExpectedAmount) > 0.001 && !collectionNotes.trim()) {
                toast.error("عند اختلاف المبلغ الفعلي عن المتوقع، يجب إدخال ملاحظات.");
                return;
            }
            remitToPlatform.mutate();
        } else if (confirmAction === "remit_merchant") {
            remitToMerchant.mutate();
        } else if (confirmAction === "settle_courier") {
            settleCourier.mutate();
        } else if (confirmAction === "mark_disputed") {
            markDisputed.mutate();
        } else if (confirmAction === "release_courier_dispute") {
            releaseCourierDispute.mutate();
        }
    };

    const confirmActionPending = (confirmAction === "mark_collected" && markCollected.isPending)
        || (confirmAction === "remit_platform" && remitToPlatform.isPending)
        || (confirmAction === "remit_merchant" && remitToMerchant.isPending)
        || (confirmAction === "settle_courier" && settleCourier.isPending)
        || (confirmAction === "mark_disputed" && markDisputed.isPending)
        || (confirmAction === "release_courier_dispute" && releaseCourierDispute.isPending);

    const confirmActionLabel = confirmActionPending ? "جاري التنفيذ..." : "تأكيد";

    const remitAmountDiffers = Math.abs(Number(collectionActualRemittedAmount || 0) - remitExpectedAmount) > 0.001;
    const remitNotesMissing = confirmAction === "remit_platform" && remitAmountDiffers && !collectionNotes.trim();

    return (
        <div className="space-y-6">
            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page { margin: 10mm; }
                    body { 
                        visibility: hidden; 
                        background: white !important;
                    }
                    #printable-area { 
                        visibility: visible; 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%; 
                        padding: 0;
                        margin: 0;
                        display: block !important;
                    }
                    .no-print { display: none !important; }
                    /* Fix for extra blank pages */
                    html, body {
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                    }
                }
            `}} />

            <div className="flex flex-wrap items-center gap-3 no-print">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ArrowRight size={20} />
                </Button>
                <h2 className="text-2xl font-bold">تفاصيل الطلب: {order.order_number}</h2>
                <Badge className={`${statusMap[order.status || 'new'].color}`}>
                    {statusMap[order.status || 'new'].label}
                </Badge>
                <div className="mr-auto flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrint("invoice")}>
                        <Printer size={18} />
                        فاتورة الأدمن
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2 text-blue-400 border-blue-500/30 hover:bg-blue-500/10" onClick={() => handlePrint("delivery")}>
                        <Printer size={18} />
                        وصل التوصيل
                    </Button>
                    {(jenniIntegration as any)?.dispatch_status === "dispatched" && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() => apiClient.downloadJenniSticker(id!)}
                        >
                            <Printer size={18} />
                            طباعة الستيكر
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Admin Invoice (print mode: invoice) ── */}
            {printMode === "invoice" && (
            <div id="printable-area" className="hidden print:block text-right" dir="rtl">
                <div className="flex justify-between items-start mb-8 border-b pb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-primary">ديل مارت— فاتورة أدمن</h1>
                    </div>
                    <div className="text-left">
                        <h2 className="text-xl font-bold">Admin Invoice</h2>
                        <p className="text-sm">رقم الطلب: {order.order_number}</p>
                        <p className="text-sm">التاريخ: {order.created_at && new Date(order.created_at).toLocaleDateString('ar-IQ')}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-8 mb-8">
                    <div>
                        <h3 className="font-bold border-b mb-2 pb-1">بيانات العميل</h3>
                        <p>الاسم: {order.customer_name}</p>
                        <p>الهاتف: {order.customer_phone}</p>
                        <p>العنوان: {order.governorates?.name} - {order.area}</p>
                        {order.nearest_landmark && <p>أقرب نقطة دالة: {order.nearest_landmark}</p>}
                    </div>
                    <div>
                        <h3 className="font-bold border-b mb-2 pb-1">تفاصيل الدفع</h3>
                        <p>حالة الطلب: {statusMap[order.status || 'new'].label}</p>
                        <p>طريقة الدفع: الدفع عند الاستلام</p>
                    </div>
                </div>
                <table className="w-full border-collapse mb-8">
                    <thead>
                        <tr className="bg-muted">
                            <th className="border p-2 text-right">المنتج</th>
                            <th className="border p-2 text-center">السعر</th>
                            <th className="border p-2 text-center">الكمية</th>
                            <th className="border p-2 text-left">المجموع</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.order_items.map((item: any) => (
                            <tr key={item.id}>
                                <td className="border p-2">{item.product_name}</td>
                                <td className="border p-2 text-center">{formatPrice(item.price)}</td>
                                <td className="border p-2 text-center">{item.quantity}</td>
                                <td className="border p-2 text-left">{formatPrice(item.price * item.quantity)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr><td colSpan={3} className="border p-2 text-left font-bold">المجموع الفرعي</td><td className="border p-2 text-left">{formatPrice(order.subtotal)}</td></tr>
                        <tr><td colSpan={3} className="border p-2 text-left font-bold">التوصيل</td><td className="border p-2 text-left">{formatPrice(order.delivery_cost)}</td></tr>
                        {order.discount > 0 && (<tr><td colSpan={3} className="border p-2 text-left font-bold text-green-600">الخصم</td><td className="border p-2 text-left text-green-600">-{formatPrice(order.discount)}</td></tr>)}
                        {(order as any).points_discount > 0 && (<tr><td colSpan={3} className="border p-2 text-left font-bold text-amber-600">خصم النقاط</td><td className="border p-2 text-left text-amber-600">-{formatPrice((order as any).points_discount)}</td></tr>)}
                        <tr className="bg-muted/50 font-bold"><td colSpan={3} className="border p-2 text-left text-lg">المجموع الكلي</td><td className="border p-2 text-left text-lg">{formatPrice(order.total)}</td></tr>
                    </tfoot>
                </table>
                <div className="text-center mt-12 pt-8 border-t text-sm text-muted-foreground">شكراً — ستايلي</div>
            </div>
            )}

            {/* ── Delivery Manifest (print mode: delivery) ── */}
            {printMode === "delivery" && (
            <div id="printable-area" className="hidden print:block text-right" dir="rtl">
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", lineHeight: "1.7" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #333", paddingBottom: "12px", marginBottom: "16px" }}>
                        <div>
                            <h1 style={{ fontSize: "20px", fontWeight: "bold", margin: 0 }}>وصل التوصيل — Delivery Manifest</h1>
                            <p style={{ margin: "4px 0 0", color: "#666", fontSize: "12px" }}>للمندوب / شركة التوصيل فقط — CONFIDENTIAL</p>
                        </div>
                        <div style={{ textAlign: "left" }}>
                            <p style={{ margin: 0 }}><strong>رقم الطلب:</strong> {order.order_number}</p>
                            <p style={{ margin: 0 }}><strong>التاريخ:</strong> {order.created_at && new Date(order.created_at).toLocaleDateString('ar-IQ')}</p>
                            <p style={{ margin: 0 }}><strong>الحالة:</strong> {statusMap[order.status || 'new'].label}</p>
                        </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "16px" }}>
                        <div style={{ border: "1px solid #ddd", padding: "12px", borderRadius: "4px" }}>
                            <h3 style={{ margin: "0 0 8px", borderBottom: "1px solid #eee", paddingBottom: "4px" }}>بيانات المستلم</h3>
                            <p style={{ margin: "4px 0" }}><strong>الاسم:</strong> {order.customer_name}</p>
                            <p style={{ margin: "4px 0" }}><strong>الهاتف:</strong> <span dir="ltr">{order.customer_phone}</span></p>
                        </div>
                        <div style={{ border: "1px solid #ddd", padding: "12px", borderRadius: "4px" }}>
                            <h3 style={{ margin: "0 0 8px", borderBottom: "1px solid #eee", paddingBottom: "4px" }}>عنوان التسليم</h3>
                            <p style={{ margin: "4px 0" }}><strong>المحافظة:</strong> {order.governorates?.name}</p>
                            <p style={{ margin: "4px 0" }}><strong>المنطقة:</strong> {order.area}</p>
                            {order.nearest_landmark && <p style={{ margin: "4px 0" }}><strong>أقرب نقطة:</strong> {order.nearest_landmark}</p>}
                            {order.map_url && <p style={{ margin: "4px 0" }}><strong>الخريطة:</strong> <span dir="ltr" style={{ fontSize: "11px" }}>{order.map_url}</span></p>}
                        </div>
                    </div>
                    {order.notes && <div style={{ background: "#fffbe6", border: "1px solid #ffe58f", padding: "8px 12px", borderRadius: "4px", marginBottom: "16px" }}><strong>ملاحظات التسليم:</strong> {order.notes}</div>}
                    <div style={{ marginBottom: "16px" }}>
                        <h3 style={{ borderBottom: "1px solid #ccc", paddingBottom: "4px" }}>المنتجات</h3>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr style={{ background: "#f5f5f5" }}><th style={{ padding: "6px 8px", textAlign: "right", border: "1px solid #ddd" }}>المنتج</th><th style={{ padding: "6px 8px", textAlign: "center", border: "1px solid #ddd", width: "60px" }}>الكمية</th></tr></thead>
                            <tbody>{order.order_items.map((item: any) => (<tr key={item.id}><td style={{ padding: "6px 8px", border: "1px solid #ddd" }}>{item.product_name}</td><td style={{ padding: "6px 8px", border: "1px solid #ddd", textAlign: "center" }}>{item.quantity}</td></tr>))}</tbody>
                        </table>
                    </div>
                    <div style={{ background: "#e8f5e9", border: "1px solid #4caf50", padding: "12px", borderRadius: "4px", fontSize: "16px", fontWeight: "bold" }}>
                        💰 المبلغ المطلوب تحصيله: {formatPrice(order.total)} — COD
                    </div>
                    <div style={{ marginTop: "16px", borderTop: "1px solid #eee", paddingTop: "8px", fontSize: "11px", color: "#999" }}>
                        وصل التوصيل — للمندوب فقط — بيانات العميل سرية — ستايلي
                    </div>
                </div>
            </div>
            )}


            <div className="grid gap-6 lg:grid-cols-5">

                {/* ══════════════ MAIN COLUMN (3/5) ══════════════ */}
                <div className="lg:col-span-3 space-y-6">

                    {/* Products */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ClipboardList size={20} />
                                المنتجات
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border">
                                {order.order_items.map((item: any) => (
                                    <div key={item.id} className="p-4 flex justify-between items-center">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 group">
                                                <p className="font-medium">{item.product_name}</p>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                                    <a href={`/product/${item.products?.slug || item.product_id}`} target="_blank" rel="noreferrer" title="عرض في المتجر">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7"><Eye size={14} className="text-blue-500" /></Button>
                                                    </a>
                                                    <a href={`/admin/products/${item.product_id}/edit`} target="_blank" rel="noreferrer" title="تعديل المنتج">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7"><Edit size={14} className="text-amber-500" /></Button>
                                                    </a>
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground">{formatPrice(item.price)} × {item.quantity}</p>
                                        </div>
                                        <p className="font-bold whitespace-nowrap">{formatPrice(item.price * item.quantity)}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-muted/30 space-y-2">
                                <div className="flex justify-between text-sm"><span>المجموع الفرعي</span><span>{formatPrice(order.subtotal)}</span></div>
                                <div className="flex justify-between text-sm"><span>التوصيل</span><span>{formatPrice(order.delivery_cost)}</span></div>
                                {order.discount > 0 && (
                                    <div className="flex justify-between text-sm text-green-500"><span>الخصم</span><span>-{formatPrice(order.discount)}</span></div>
                                )}
                                {(order as any).points_discount > 0 && (
                                    <div className="flex justify-between text-sm text-amber-500 font-bold">
                                        <span>خصم النقاط ({(order as any).points_spent} نقطة)</span>
                                        <span>-{formatPrice((order as any).points_discount)}</span>
                                    </div>
                                )}
                                {(order as any).points_earned > 0 && (
                                    <div className="flex justify-between text-sm text-blue-500 italic">
                                        <span>النقاط المكتسبة من الطلب</span>
                                        <span>+{(order as any).points_earned} نقطة</span>
                                    </div>
                                )}
                                <Separator className="my-2" />
                                <div className="flex justify-between font-bold text-lg"><span>الإجمالي</span><span>{formatPrice(order.total)}</span></div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Customer Notes */}
                    {order.notes && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Info size={20} />
                                    ملاحظات العميل
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg text-sm">
                                    {order.notes}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Delivery Events — Timeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Truck size={20} />
                                أحداث التوصيل
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {(deliveryEvents?.events ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">لا توجد أحداث توصيل.</p>
                            ) : (
                                <div className="space-y-4 relative before:absolute before:inset-y-0 before:right-3.5 before:w-0.5 before:bg-border">
                                    {(deliveryEvents?.events ?? []).slice(0, 20).map((event: any, idx: number) => {
                                        const isWebhook = event.actor_type === "external_provider";
                                        const isAdmin = event.actor_type === "admin";
                                        const dotColor = isWebhook ? "bg-emerald-500" : isAdmin ? "bg-blue-500" : "bg-muted-foreground";
                                        const badgeClass = isWebhook
                                            ? "border-emerald-500/40 text-emerald-400"
                                            : isAdmin ? "border-blue-500/40 text-blue-400"
                                            : "border-border text-muted-foreground";
                                        return (
                                            <div key={`${event.id ?? idx}`} className="relative pr-8 flex flex-col gap-1.5">
                                                <div className={`absolute right-1.5 top-1.5 w-4 h-4 rounded-full border-4 border-background shrink-0 ${dotColor}`} />
                                                <div className="rounded-lg border border-border bg-card/40 p-3 text-sm">
                                                    <div className="flex items-start justify-between gap-2 mb-1">
                                                        <span className="font-semibold">{event.event_type}</span>
                                                        <Badge variant="outline" className={`text-[10px] shrink-0 ${badgeClass}`}>
                                                            {event.actor_type ?? "system"}
                                                        </Badge>
                                                    </div>
                                                    {(event.from_status || event.to_status) && (
                                                        <p className="text-xs text-muted-foreground mb-1" dir="ltr">
                                                            {event.from_status ?? "—"} → {event.to_status ?? "—"}
                                                        </p>
                                                    )}
                                                    {event.notes && (
                                                        <p className="text-xs mb-1">{event.notes}</p>
                                                    )}
                                                    <p className="text-[10px] text-muted-foreground">
                                                        {event.created_at ? new Date(event.created_at).toLocaleString("ar-IQ") : "—"}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Financial Operations */}
                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ClipboardList size={20} />
                                العمليات المالية
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">

                            {/* Status summary */}
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">الحالات</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {([
                                        { label: "طريقة الدفع", value: financeDetail?.payment_method ?? "cod" },
                                        { label: "حالة الدفع", value: financeDetail?.payment_status ?? "unpaid" },
                                        { label: "التحصيل", value: financeDetail?.collection_status ?? "not_collected" },
                                        { label: "التسوية", value: financeDetail?.settlement_status ?? "not_accrued" },
                                        { label: "تسوية التوصيل", value: (financeDetail as any)?.courier_settlement_status ?? "pending" },
                                    ] as { label: string; value: string }[]).map(({ label, value }) => (
                                        <div key={label} className="rounded-md border border-border bg-background/50 px-3 py-2 flex justify-between items-center gap-1">
                                            <span className="text-muted-foreground text-xs">{label}</span>
                                            <span className="font-medium text-xs">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Amounts */}
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">المبالغ</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {([
                                        { label: "المبلغ المتوقع (COD)", value: formatPrice(Number((financeDetail as any)?.cash_expected_amount ?? 0)) },
                                        { label: "المبلغ المستلم", value: formatPrice(Number((financeDetail as any)?.cash_received_amount ?? 0)) },
                                        { label: "صافي التاجر", value: formatPrice(Number((financeDetail as any)?.merchant_net_amount ?? 0)) },
                                        { label: "عمولة المنصة", value: formatPrice(Number((financeDetail as any)?.platform_commission_amount ?? 0)) },
                                        { label: "أجرة التوصيل المستحقة", value: formatPrice(Number((financeDetail as any)?.courier_fee_payable ?? 0)) },
                                    ] as { label: string; value: string }[]).map(({ label, value }) => (
                                        <div key={label} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                                            <span className="text-muted-foreground text-sm">{label}</span>
                                            <span className="font-semibold text-sm">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* COD Remittance */}
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">نمط توريد COD</p>
                                <div className="rounded-md border border-border bg-background/50 px-3 py-2 text-xs mb-2">
                                    {String((financeDetail as any)?.courier_cod_remittance_mode ?? "gross_remittance") === "net_remittance"
                                        ? "شركة التوصيل تخصم أجرتها وتورّد الصافي"
                                        : "شركة التوصيل تورّد كامل المبلغ للمنصة"}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {([
                                        { label: "الإجمالي المتوقع", value: formatPrice(Number((financeDetail as any)?.cash_gross_expected_amount ?? 0)) },
                                        { label: "المحتجز للتوصيل", value: formatPrice(Number((financeDetail as any)?.courier_fee_retained_amount ?? 0)) },
                                        { label: "الصافي من التوصيل", value: formatPrice(Number((financeDetail as any)?.cash_net_expected_from_courier ?? 0)) },
                                        { label: "الفعلي المورّد", value: formatPrice(Number((financeDetail as any)?.cash_actual_remitted_amount ?? 0)) },
                                        { label: "فرق التوريد", value: formatPrice(Number((financeDetail as any)?.cash_remittance_difference ?? 0)) },
                                        { label: "تطبيق الخصم", value: (financeDetail as any)?.courier_fee_offset_applied ? "نعم" : "لا" },
                                    ] as { label: string; value: string }[]).map(({ label, value }) => (
                                        <div key={label} className="rounded-md border border-border bg-background/50 px-2 py-1.5">
                                            <p className="text-muted-foreground text-[10px]">{label}</p>
                                            <p className="font-medium text-xs">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Debug fields */}
                            <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none list-none flex items-center gap-1 py-1">
                                    ▸ تفاصيل تقنية (rule IDs)
                                </summary>
                                <div className="grid grid-cols-2 gap-1.5 mt-2">
                                    {([
                                        { label: "plan", value: String((financeDetail as any)?.resolved_plan_code ?? "—") },
                                        { label: "snapshot v", value: String((financeDetail as any)?.financial_snapshot_version ?? 0) },
                                        { label: "commercial v", value: String((financeDetail as any)?.commercial_snapshot_version ?? 0) },
                                        { label: "commission_rule", value: String((financeDetail as any)?.commission_rule_id ?? "—") },
                                        { label: "assisted_fee_rule", value: String((financeDetail as any)?.assisted_fee_rule_id ?? "—") },
                                        { label: "platform_fee_rule", value: String((financeDetail as any)?.platform_fee_rule_id ?? "—") },
                                        { label: "delivery_billing_rule", value: String((financeDetail as any)?.delivery_billing_rule_id ?? "—") },
                                    ] as { label: string; value: string }[]).map(({ label, value }) => (
                                        <div key={label} className="rounded border border-border/50 px-2 py-1 bg-background/30">
                                            <p className="text-muted-foreground text-[9px]">{label}</p>
                                            <p className="font-mono text-[10px] truncate" title={value}>{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </details>

                            {/* Dispute release notice */}
                            {hasCourierDisputeReleaseEvent && (
                                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                                    تم تحرير نزاع التوصيل لهذا الطلب وإعادته للمسار المالي.
                                </div>
                            )}

                            {/* Finance action buttons */}
                            <div className="flex flex-wrap gap-2 pt-1">
                                {canMarkCollected && (
                                    <Button size="sm" onClick={() => setShowCollectedForm((v) => !v)} disabled={markCollected.isPending}>
                                        تسجيل التحصيل النقدي
                                    </Button>
                                )}
                                {canRemitToPlatform && (
                                    <Button size="sm" variant="outline" disabled={remitToPlatform.isPending} onClick={() => setConfirmAction("remit_platform")}>
                                        توريد للمنصة
                                    </Button>
                                )}
                                {canRemitToMerchant && (
                                    <Button size="sm" variant="outline" disabled={remitToMerchant.isPending} onClick={() => setConfirmAction("remit_merchant")}>
                                        توريد للتاجر
                                    </Button>
                                )}
                                {canSettleCourier && (
                                    <Button size="sm" variant="outline" disabled={settleCourier.isPending} onClick={() => setConfirmAction("settle_courier")}>
                                        تسوية التوصيل
                                    </Button>
                                )}
                                {canMarkDisputed && (
                                    <Button size="sm" variant="destructive" onClick={() => setShowDisputeForm((v) => !v)} disabled={markDisputed.isPending}>
                                        تحويل إلى متنازع
                                    </Button>
                                )}
                                {canReleaseCourierDispute && (
                                    <Button size="sm" variant="outline" disabled={releaseCourierDispute.isPending} onClick={() => setConfirmAction("release_courier_dispute")}>
                                        تحرير نزاع التوصيل
                                    </Button>
                                )}
                            </div>

                            {/* Collected form */}
                            {showCollectedForm && (
                                <div className="space-y-2 rounded-lg border border-border p-3 bg-background/50">
                                    <Label className="text-sm font-medium">تفاصيل التحصيل</Label>
                                    <Select value={collectedByType} onValueChange={(v: any) => setCollectedByType(v)}>
                                        <SelectTrigger className="bg-background text-foreground border-border">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="courier">مندوب (courier)</SelectItem>
                                            <SelectItem value="delivery_company">شركة توصيل</SelectItem>
                                            <SelectItem value="platform">المنصة</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input className="bg-background text-foreground border-border" placeholder="معرف المحصّل (اختياري)" value={collectedById} onChange={(e) => setCollectedById(e.target.value)} />
                                    <Input className="bg-background text-foreground border-border" placeholder="المبلغ المحصّل" type="number" value={collectedAmount} onChange={(e) => setCollectedAmount(e.target.value)} />
                                    <Textarea className="bg-background text-foreground border-border" placeholder="ملاحظات (اختياري)" value={collectionNotes} onChange={(e) => setCollectionNotes(e.target.value)} />
                                    <Input className="bg-background text-foreground border-border" placeholder="رقم المرجع (اختياري)" value={collectionReference} onChange={(e) => setCollectionReference(e.target.value)} />
                                    <Button size="sm" disabled={markCollected.isPending || Number(collectedAmount) <= 0} onClick={() => setConfirmAction("mark_collected")}>
                                        تأكيد التحصيل
                                    </Button>
                                </div>
                            )}

                            {/* Dispute form */}
                            {showDisputeForm && (
                                <div className="space-y-2 rounded-lg border border-destructive/30 p-3 bg-destructive/5">
                                    <Label className="text-sm font-medium text-destructive">تسجيل نزاع</Label>
                                    <Input className="bg-background text-foreground border-border" placeholder="كود السبب" value={disputeReasonCode} onChange={(e) => setDisputeReasonCode(e.target.value)} />
                                    <Textarea className="bg-background text-foreground border-border" placeholder="ملاحظات" value={disputeNotes} onChange={(e) => setDisputeNotes(e.target.value)} />
                                    <Button size="sm" variant="destructive" disabled={markDisputed.isPending || !disputeReasonCode.trim()} onClick={() => setConfirmAction("mark_disputed")}>
                                        تأكيد التحويل إلى متنازع
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Mini Finance Timeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">سجل الأحداث المالية</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {timelineRows.slice(0, 12).map((event, idx) => (
                                <div key={`${event.source}-${event.type}-${event.created_at}-${idx}`}
                                    className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2 text-xs">
                                    <span className="font-medium">{event.type}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="outline" className="text-[10px]">{event.source}</Badge>
                                        <span className="text-muted-foreground text-[10px]">
                                            {event.created_at ? new Date(event.created_at).toLocaleString("ar-IQ") : "—"}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {timelineRows.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">لا توجد أحداث مالية لهذا الطلب.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ══════════════ SIDE COLUMN (2/5) ══════════════ */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Customer */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Phone size={18} />
                                العميل
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <Label className="text-muted-foreground text-xs">الاسم الكامل</Label>
                                <p className="font-medium text-sm mt-0.5">{order.customer_name}</p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground text-xs">رقم الهاتف</Label>
                                <div className="flex items-center justify-between mt-0.5">
                                    <p className="font-medium text-sm" dir="ltr">{order.customer_phone}</p>
                                    <div className="flex gap-1.5">
                                        <a href={`tel:${order.customer_phone}`}>
                                            <Button size="icon" variant="outline" className="h-7 w-7" title="اتصال"><Phone size={14} /></Button>
                                        </a>
                                        <a href={`https://wa.me/${order.customer_phone?.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                                            <Button size="icon" variant="outline" className="h-7 w-7 text-green-400 border-green-500/30 hover:bg-green-500/10" title="واتساب">
                                                <MessageCircle size={14} />
                                            </Button>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Address */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MapPin size={18} />
                                العنوان
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-muted-foreground text-xs">المحافظة</Label>
                                    <p className="font-medium text-sm mt-0.5">{order.governorates?.name}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground text-xs">المنطقة</Label>
                                    <p className="font-medium text-sm mt-0.5">{order.area}</p>
                                </div>
                            </div>
                            {order.nearest_landmark && (
                                <div>
                                    <Label className="text-muted-foreground text-xs">أقرب نقطة دالة</Label>
                                    <p className="font-medium text-sm mt-0.5">{order.nearest_landmark}</p>
                                </div>
                            )}
                            {order.map_url && (
                                <div className="flex flex-col gap-1.5 pt-1">
                                    <a href={order.map_url} target="_blank" rel="noreferrer" className="w-full">
                                        <Button variant="outline" size="sm" className="w-full gap-2 text-blue-400 border-blue-500/30 hover:bg-blue-500/10">
                                            <MapPin size={14} />فتح في الخرائط
                                        </Button>
                                    </a>
                                    <a href={`https://wa.me/?text=${encodeURIComponent(`رابط موقع التوصيل للطلب #${order.order_number}: ${order.map_url}`)}`} target="_blank" rel="noreferrer" className="w-full">
                                        <Button variant="outline" size="sm" className="w-full gap-2 text-green-400 border-green-500/30 hover:bg-green-500/10">
                                            <MessageCircle size={14} />مشاركة الموقع مع المندوب
                                        </Button>
                                    </a>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Jenni Card — Improved */}
                    <Card className="border-emerald-500/30">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Truck size={18} />
                                مزود التوصيل — Jenni
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {/* Dispatch status badge */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">حالة الإرسال:</span>
                                {(() => {
                                    const ds = String((jenniIntegration as any)?.dispatch_status ?? "لم يُرسل");
                                    const colorMap: Record<string, string> = {
                                        dispatched: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                                        synced: "bg-blue-500/20 text-blue-400 border-blue-500/40",
                                        local_update_failed: "bg-red-500/20 text-red-400 border-red-500/40",
                                    };
                                    const cls = colorMap[ds] ?? "bg-muted text-muted-foreground border-border";
                                    return (
                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
                                            {ds}
                                        </span>
                                    );
                                })()}
                            </div>

                            {/* Info rows */}
                            <div className="space-y-1.5">
                                {([
                                    { label: "Jenni Shipment ID", value: String((jenniIntegration as any)?.provider_shipment_id ?? "—"), dir: "ltr" },
                                    { label: "Airway Bill", value: String((jenniIntegration as any)?.airway_bill_number ?? "—"), dir: "ltr" },
                                    { label: "الخطوة الحالية (عربي)", value: String((jenniIntegration as any)?.provider_current_step_ar ?? "—"), dir: "rtl" },
                                    { label: "الخطوة (EN)", value: String((jenniIntegration as any)?.provider_current_step ?? "—"), dir: "ltr" },
                                    { label: "المرحلة", value: String((jenniIntegration as any)?.provider_current_stage ?? "—"), dir: "ltr" },
                                    { label: "آخر مزامنة", value: (jenniIntegration as any)?.last_synced_at ? new Date((jenniIntegration as any).last_synced_at).toLocaleString("ar-IQ") : "—", dir: "rtl" },
                                ] as { label: string; value: string; dir: "ltr" | "rtl" }[]).map(({ label, value, dir }) => (
                                    <div key={label} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                                        <span className="text-muted-foreground text-xs">{label}</span>
                                        <span className="font-medium text-xs" dir={dir}>{value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Error / flag banners */}
                            {(jenniIntegration as any)?.dispatch_error && (
                                <p className="text-destructive text-xs rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                                    {(jenniIntegration as any).dispatch_error}
                                </p>
                            )}
                            {(jenniIntegration as any)?.amount_change_flag && (
                                <Badge variant="destructive" className="w-full justify-center">تغيير مبلغ COD — مراجعة إدارية</Badge>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                    size="sm"
                                    onClick={() => dispatchJenni.mutate()}
                                    disabled={
                                        dispatchJenni.isPending ||
                                        (jenniIntegration as any)?.dispatch_status === "dispatched" ||
                                        (jenniIntegration as any)?.dispatch_status === "synced"
                                    }
                                    title={(jenniIntegration as any)?.dispatch_status === "dispatched" ? "تم الإرسال مسبقاً" : undefined}
                                >
                                    {dispatchJenni.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
                                    {(jenniIntegration as any)?.dispatch_status === "local_update_failed"
                                        ? "إكمال الربط المحلي"
                                        : "إرسال إلى Jenni"}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => syncJenni.mutate()}
                                    disabled={syncJenni.isPending || !(jenniIntegration as any)?.provider_shipment_id}
                                    title={!(jenniIntegration as any)?.provider_shipment_id ? "لا يوجد shipment_id بعد" : undefined}
                                >
                                    {syncJenni.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <RefreshCw size={14} className="ml-1" />}
                                    مزامنة
                                </Button>
                                {(jenniIntegration as any)?.dispatch_status === "dispatched" && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                        onClick={() => apiClient.downloadJenniSticker(id!)}
                                    >
                                        <Printer size={14} className="ml-1" />
                                        الستيكر
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Delivery Operations — Grouped */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Truck size={18} />
                                عمليات التوصيل
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">

                            {/* Status Info */}
                            <div className="grid grid-cols-2 gap-1.5 text-xs">
                                <div className="rounded border border-border bg-background/50 px-2 py-1.5">
                                    <p className="text-muted-foreground text-[10px]">delivery_status</p>
                                    <p className="font-medium">{deliveryStatus}</p>
                                </div>
                                <div className="rounded border border-border bg-background/50 px-2 py-1.5">
                                    <p className="text-muted-foreground text-[10px]">شركة التوصيل</p>
                                    <p className="font-medium">{(order as any)?.delivery_companies?.name ?? "—"}</p>
                                </div>
                                <div className="rounded border border-border bg-background/50 px-2 py-1.5">
                                    <p className="text-muted-foreground text-[10px]">استُلم في</p>
                                    <p className="font-medium">{(order as any)?.picked_up_at ? new Date((order as any).picked_up_at).toLocaleString("ar-IQ") : "—"}</p>
                                </div>
                                <div className="rounded border border-border bg-background/50 px-2 py-1.5">
                                    <p className="text-muted-foreground text-[10px]">في الطريق منذ</p>
                                    <p className="font-medium">{(order as any)?.in_transit_at ? new Date((order as any).in_transit_at).toLocaleString("ar-IQ") : "—"}</p>
                                </div>
                                <div className="rounded border border-border bg-background/50 px-2 py-1.5">
                                    <p className="text-muted-foreground text-[10px]">سُلّم في</p>
                                    <p className="font-medium">{(order as any)?.delivered_at ? new Date((order as any).delivered_at).toLocaleString("ar-IQ") : "—"}</p>
                                </div>
                                <div className="rounded border border-border bg-background/50 px-2 py-1.5">
                                    <p className="text-muted-foreground text-[10px]">فشل في</p>
                                    <p className="font-medium">{(order as any)?.delivery_failed_at ? new Date((order as any).delivery_failed_at).toLocaleString("ar-IQ") : "—"}</p>
                                </div>
                            </div>

                            {/* SLA */}
                            <div className="flex gap-2 items-center">
                                <Badge variant="outline" className="text-xs">
                                    SLA: {(order as any)?.delivery_sla_due_at ? new Date((order as any).delivery_sla_due_at).toLocaleString("ar-IQ") : "—"}
                                </Badge>
                                {isSlaBreached && <Badge variant="destructive" className="text-xs">SLA Breached</Badge>}
                            </div>

                            {/* Group 1: Assignment */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">التعيين</p>
                                <div className="flex gap-2">
                                    <select
                                        className="h-9 flex-1 rounded-md border border-border bg-background text-foreground px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        value={deliveryCompanyIdDraft}
                                        onChange={(e) => setDeliveryCompanyIdDraft(e.target.value)}
                                    >
                                        <option value="">اختر شركة التوصيل</option>
                                        {(deliveryCompanies ?? []).map((company: any) => (
                                            <option key={company.id} value={company.id}>{company.name}</option>
                                        ))}
                                    </select>
                                    <Button size="sm" variant="outline" onClick={() => assignDeliveryCompany.mutate()} disabled={assignDeliveryCompany.isPending || !deliveryCompanyIdDraft}>
                                        {assignDeliveryCompany.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تعيين"}
                                    </Button>
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        className="h-9 flex-1 rounded-md border border-border bg-background text-foreground px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        value={deliveryAgentIdDraft}
                                        onChange={(e) => setDeliveryAgentIdDraft(e.target.value)}
                                    >
                                        <option value="">اختر المندوب</option>
                                        {(agents ?? []).map((agent: any) => (
                                            <option key={agent.id} value={agent.id}>{agent.full_name ?? agent.email ?? agent.id}</option>
                                        ))}
                                    </select>
                                    <Button size="sm" variant="outline" onClick={() => assignDeliveryAgent.mutate()} disabled={assignDeliveryAgent.isPending || !deliveryAgentIdDraft}>
                                        {assignDeliveryAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تعيين"}
                                    </Button>
                                </div>
                            </div>

                            {/* Group 2: Status Actions */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">تحديث الحالة</p>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" onClick={() => markDeliveryPickedUp.mutate()} disabled={markDeliveryPickedUp.isPending}>
                                        {markDeliveryPickedUp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "استُلم من التاجر"}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => markDeliveryInTransit.mutate()} disabled={markDeliveryInTransit.isPending}>
                                        {markDeliveryInTransit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "في الطريق"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-green-400 border-green-500/30 hover:bg-green-500/10"
                                        onClick={() => {
                                            if (confirm("تأكيد تسجيل التسليم؟ هذا الإجراء يؤثر على دورة التسوية المالية.")) {
                                                markDeliveryDelivered.mutate();
                                            }
                                        }}
                                        disabled={markDeliveryDelivered.isPending}
                                    >
                                        {markDeliveryDelivered.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "✓ تم التوصيل"}
                                    </Button>
                                </div>
                            </div>

                            {/* Group 3: Failure / Return */}
                            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
                                <p className="text-xs font-semibold text-destructive/80 uppercase tracking-wide">فشل / إرجاع</p>
                                <select
                                    className="w-full h-9 rounded-md border border-border bg-background text-foreground px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    value={deliveryFailureReason}
                                    onChange={(e) => setDeliveryFailureReason(e.target.value)}
                                >
                                    <option value="customer_unavailable">العميل غير متاح</option>
                                    <option value="wrong_address">عنوان خاطئ</option>
                                    <option value="customer_rejected">العميل رفض الاستلام</option>
                                    <option value="could_not_contact">تعذر التواصل</option>
                                    <option value="cash_not_available">لا يوجد كاش</option>
                                    <option value="vehicle_issue">مشكلة المركبة</option>
                                    <option value="merchant_not_ready">التاجر غير جاهز</option>
                                    <option value="other">أخرى</option>
                                </select>
                                <Textarea
                                    className="bg-background text-foreground border-border text-sm"
                                    placeholder="ملاحظات الفشل / الإرجاع (اختياري)"
                                    value={deliveryFailureNotes}
                                    onChange={(e) => setDeliveryFailureNotes(e.target.value)}
                                />
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => { if (confirm("تأكيد تسجيل فشل التسليم؟")) markDeliveryFailed.mutate(); }}
                                        disabled={markDeliveryFailed.isPending}
                                    >
                                        {markDeliveryFailed.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تسجيل فشل"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => { if (confirm("تأكيد تسجيل إرجاع الطلب؟")) markDeliveryReturned.mutate(); }}
                                        disabled={markDeliveryReturned.isPending}
                                    >
                                        {markDeliveryReturned.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تسجيل إرجاع"}
                                    </Button>
                                </div>
                            </div>

                            {/* Group 4: Delivery Note */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ملاحظة توصيل</p>
                                <div className="flex gap-2">
                                    <Input
                                        className="bg-background text-foreground border-border"
                                        placeholder="أضف ملاحظة توصيل"
                                        value={deliveryGeneralNote}
                                        onChange={(e) => setDeliveryGeneralNote(e.target.value)}
                                    />
                                    <Button size="sm" variant="outline" onClick={() => addDeliveryNote.mutate()} disabled={addDeliveryNote.isPending || !deliveryGeneralNote.trim()}>
                                        إضافة
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Mandoub Assignment */}
                    {canManageAgents && (
                        <Card className="border-primary/20 bg-primary/5">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Truck size={18} />
                                    تعيين مندوب (اختياري)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Select
                                    value={(order as any).agent_id || "unassigned"}
                                    onValueChange={(val) => updateAgent.mutate(val === "unassigned" ? null : val)}
                                >
                                    <SelectTrigger className="bg-background text-foreground border-border">
                                        <SelectValue placeholder="اختر مندوباً" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">غير محدد</SelectItem>
                                        {agents?.map((agent) => (
                                            <SelectItem key={agent.id} value={agent.id}>
                                                {agent.full_name || agent.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">سيتمكن المندوب من رؤية هذا الطلب في حسابه الخاص</p>
                            </CardContent>
                        </Card>
                    )}
                    {/* Merchant Decision Status */}
                    {(order as any).merchant_decision_status && (
                        <Card className={`border-l-4 ${(order as any).merchant_decision_status === "rejected" ? "border-l-red-500 bg-red-50/50 dark:bg-red-950/10" : (order as any).merchant_decision_status === "pending" ? "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/10" : "border-l-green-500 bg-green-50/50 dark:bg-green-950/10"}`}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">قرار التاجر</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center gap-2">
                                    {(order as any).merchant_decision_status === "rejected" ? (
                                        <Badge className="bg-red-600 text-white">مرفوض</Badge>
                                    ) : (order as any).merchant_decision_status === "pending" ? (
                                        <Badge className="bg-amber-500 text-white">بانتظار قرار التاجر</Badge>
                                    ) : (
                                        <Badge className="bg-green-600 text-white">مقبول</Badge>
                                    )}
                                </div>
                                {(order as any).merchant_decision_status === "rejected" && (order as any).merchant_rejection_reason_code && (
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                        سبب الرفض: {getRejectionLabel((order as any).merchant_rejection_reason_code)}
                                    </p>
                                )}
                                {(order as any).merchant_decision_at && (
                                    <p className="text-xs text-muted-foreground">
                                        تاريخ القرار: {new Date((order as any).merchant_decision_at).toLocaleString("ar-IQ")}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Status Update */}
                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">تحديث حالة الطلب</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Select defaultValue={order.status || "new"} onValueChange={(val) => updateStatus.mutate(val)}>
                                <SelectTrigger className="bg-background text-foreground border-border">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(statusMap).map(([val, { label }]) => (
                                        <SelectItem key={val} value={val}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">سيتم حفظ التغيير فوراً عند الاختيار</p>
                        </CardContent>
                    </Card>

                    {/* WhatsApp Quick Actions */}
                    {canManageAgents && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-base text-green-400">
                                    <MessageCircle size={18} />
                                    إشعارات واتساب (سريع)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {([
                                    {
                                        num: "1",
                                        label: "تأكيد الطلب",
                                        color: "border-green-500/30 hover:bg-green-500/10",
                                        msg: `أهلاً ${order.customer_name}، شكراً لطلبك من DilMart متجر. تم تأكيد طلبك رقم (#${order.order_number}) وجاري التجهيز.`,
                                    },
                                    {
                                        num: "2",
                                        label: "إشعار خروج المندوب",
                                        color: "border-amber-500/30 hover:bg-amber-500/10",
                                        msg: `زبوننا العزيز، طلبك رقم (#${order.order_number}) مع المندوب الآن. سيتم التواصل معك قريباً للتوصيل. ${order.map_url ? `موقعك: ${order.map_url}` : ""}`,
                                    },
                                    {
                                        num: "3",
                                        label: "شكر بعد التوصيل",
                                        color: "border-emerald-500/30 hover:bg-emerald-500/10",
                                        msg: `تم توصيل طلبك رقم (#${order.order_number}) بنجاح. شكراً لثقتك بDilMart متجر. نتمنى لك تجربة سعيدة!`,
                                    },
                                ] as { num: string; label: string; color: string; msg: string }[]).map(({ num, label, color, msg }) => (
                                    <Button
                                        key={num}
                                        variant="outline"
                                        className={`w-full text-xs justify-start gap-2 ${color}`}
                                        onClick={() => window.open(`https://wa.me/${order.customer_phone?.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank")}
                                    >
                                        <Badge variant="outline" className="text-[10px]">{num}</Badge>
                                        {label}
                                    </Button>
                                ))}
                                <p className="text-[10px] text-muted-foreground text-center">سيتم فتح واتساب برسالة جاهزة</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Admin Notes */}
                    {canManageAgents && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">ملاحظات إدارية</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <textarea
                                    className="w-full min-h-[100px] p-2 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                                    placeholder="أضف ملاحظات داخلية هنا..."
                                    defaultValue={(order as any).admin_notes || ""}
                                    onBlur={(e) => updateNotes.mutate(e.target.value)}
                                />
                                <p className="text-[10px] text-muted-foreground">يتم الحفظ تلقائياً عند الابتعاد عن الحقل</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            <AlertDialog
                open={confirmAction !== null}
                onOpenChange={(open) => {
                    if (!open && !confirmActionPending) setConfirmAction(null);
                }}
            >
                <AlertDialogContent dir="rtl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmAction ? confirmContent[confirmAction].title : "تأكيد"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmAction ? confirmContent[confirmAction].description : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {confirmAction === "remit_platform" ? (
                        <div className="space-y-2">
                            <Label htmlFor="actual-remitted-amount">Actual remitted amount</Label>
                            <Input
                                id="actual-remitted-amount"
                                type="number"
                                value={collectionActualRemittedAmount}
                                onChange={(e) => setCollectionActualRemittedAmount(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                expected: {formatPrice(remitExpectedAmount)} ({remittanceMode === "net_remittance" ? "net" : "gross"})
                            </p>
                            {remitAmountDiffers ? (
                                <p className="text-xs text-amber-700">المبلغ مختلف عن المتوقع: يجب إدخال Notes في نموذج الإجراءات.</p>
                            ) : null}
                            {remitNotesMissing ? (
                                <p className="text-xs text-destructive">Notes مطلوبة قبل التأكيد.</p>
                            ) : null}
                            <Textarea
                                placeholder="notes"
                                value={collectionNotes}
                                onChange={(e) => setCollectionNotes(e.target.value)}
                            />
                            <Input
                                placeholder="reference"
                                value={collectionReference}
                                onChange={(e) => setCollectionReference(e.target.value)}
                            />
                        </div>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={confirmActionPending}>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={confirmActionPending || (confirmAction === "remit_platform" && Number(collectionActualRemittedAmount || 0) <= 0) || remitNotesMissing}
                            onClick={() => {
                                executeConfirmedAction();
                            }}
                        >
                            {confirmActionPending ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {confirmActionLabel}
                                </span>
                            ) : (
                                confirmActionLabel
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
