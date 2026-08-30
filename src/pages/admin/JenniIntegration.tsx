import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    Truck,
    RefreshCw,
    Link2,
    ShieldAlert,
    CheckCircle2,
    Database,
    AlertTriangle,
    Info,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    HelpCircle
} from "lucide-react";
import { apiClient } from "@/lib/api-client";

export default function AdminJenniIntegration() {
    const queryClient = useQueryClient();
    const [targetOrderId, setTargetOrderId] = useState("ddba4bc7-e9b8-4810-9426-f6362cb2b038");
    const [isJsonOpen, setIsJsonOpen] = useState(false);

    // Fetch Jenni integration for target order (default: last successful test order)
    const { data: integration, isLoading, refetch } = useQuery({
        queryKey: ["admin-order-jenni", targetOrderId],
        queryFn: () => apiClient.getOrderJenniIntegration(targetOrderId),
        enabled: !!targetOrderId && targetOrderId.length === 36,
        retry: false
    });

    const syncMutation = useMutation({
        mutationFn: async (orderId: string) => {
            return apiClient.syncOrderFromJenni(orderId);
        },
        onSuccess: () => {
            toast.success("تمت المزامنة وقراءة الحالة من Jenni بنجاح");
            refetch();
            queryClient.invalidateQueries({ queryKey: ["admin-order-jenni", targetOrderId] });
        },
        onError: (err: any) => {
            toast.error(err?.message ?? "فشلت المزامنة. تأكد من أن السيرفر يعمل ومعرف الطلب صحيح.");
        }
    });

    const handleSync = () => {
        if (!targetOrderId || targetOrderId.length !== 36) {
            toast.error("يرجى إدخال معرف طلب (Order ID) صالح بطول 36 حرفاً.");
            return;
        }
        syncMutation.mutate(targetOrderId);
    };

    // Steps marked "Real Query Confirmed" were directly observed on pilot shipment 9311578
    // via /v2/shipments/query. History: NEW_WITH_PA → IN_SC → PRINT_MANIFEST_DA → OFD → RTO_WITH_DA
    const statusMappings = [
        { step: "NEW_WITH_PA", label: "شحنات جديدة مع مندوب الاستلام", internalStatus: "assigned_to_company", event: "provider_synced", finance: "لا يوجد", review: "لا", source: "Real Query Confirmed", note: "" },
        { step: "IN_SC", label: "في مركز الفرز", internalStatus: "in_transit", event: "provider_synced", finance: "لا يوجد", review: "لا", source: "Real Query Confirmed", note: "" },
        { step: "PRINT_MANIFEST_DA", label: "طباعة البيان مع مندوب التوصيل", internalStatus: "in_transit", event: "provider_synced", finance: "لا يوجد", review: "لا", source: "Real Query Confirmed", note: "" },
        { step: "OFD", label: "خارج للتوصيل", internalStatus: "in_transit", event: "provider_synced", finance: "لا يوجد", review: "لا", source: "Real Query Confirmed", note: "" },
        { step: "RTO_WITH_DA", label: "راجع عند المندوب", internalStatus: "returned", event: "provider_return", finance: "تسوية مرتجعات", review: "لا", source: "Real Query Confirmed", note: "الإرجاع بدأ والشحنة مع المندوب — لم تصل المستودع بعد. قد يُراجع المعنى مستقبلاً." },
        { step: "DELIVERED", label: "تم التوصيل", internalStatus: "delivered", event: "provider_synced", finance: "تسوية مالية للتوصيل", review: "لا", source: "Docs", note: "" },
        { step: "SUCCESSFUL_DELIVERY", label: "توصيل ناجح", internalStatus: "delivered", event: "provider_synced", finance: "تسوية مالية للتوصيل", review: "لا", source: "Docs", note: "" },
        { step: "DELIVERED_PRICE_CHANGED", label: "تم التوصيل مع تغيير السعر", internalStatus: "delivered", event: "amount_change_reported", finance: "تعديل مالي يدوي", review: "نعم", source: "Docs", note: "" },
        { step: "POSTPONED", label: "مؤجل", internalStatus: "in_transit", event: "provider_postponed", finance: "لا يوجد", review: "لا", source: "Docs", note: "" },
        { step: "POSTPONED_CONFIRMED", label: "مؤجل مؤكد", internalStatus: "in_transit", event: "provider_postponed", finance: "لا يوجد", review: "لا", source: "Docs", note: "" },
        { step: "DELIVERY_REATTEMPT", label: "إعادة محاولة التوصيل", internalStatus: "in_transit", event: "provider_synced", finance: "لا يوجد", review: "لا", source: "Docs", note: "" },
        { step: "RTO_WH", label: "مرتجع في المستودع", internalStatus: "returned", event: "provider_return", finance: "تسوية مرتجعات", review: "لا", source: "Docs", note: "" },
        { step: "RETURN_APPROVED", label: "مرتجع معتمد", internalStatus: "returned", event: "provider_return", finance: "تسوية مرتجعات", review: "لا", source: "Docs", note: "" },
        { step: "RTO_CONFIRMED", label: "مرتجع مؤكد", internalStatus: "returned", event: "provider_return", finance: "تسوية مرتجعات", review: "لا", source: "Docs", note: "" },
        { step: "RTO_ARCHIVED", label: "مرتجع مؤرشف", internalStatus: "returned", event: "provider_return", finance: "تسوية مرتجعات", review: "لا", source: "Docs", note: "" },
        { step: "RETURNED_WITH_AGENT", label: "مرتجع مع الوكيل", internalStatus: "returned", event: "provider_return", finance: "تسوية مرتجعات", review: "لا", source: "Docs", note: "" },
        { step: "PARTIALLY_DELIVERED", label: "مستلم جزئياً", internalStatus: "in_transit", event: "provider_partially_delivered", finance: "تأكيد المبالغ المستلمة", review: "نعم", source: "Docs", note: "" }
    ];

    const apiReferences = [
        { purpose: "المصادقة / تسجيل الدخول", endpoint: "/v2/login", method: "POST", used: "نعم", type: "Read-only", safety: "توليد توكن مؤقت" },
        { purpose: "إنشاء تاجر جديد", endpoint: "/v2/merchant-management/create", method: "POST", used: "نعم", type: "Mutating", safety: "مغلق بـ Env Gate" },
        { purpose: "إنشاء متجر جديد للتاجر", endpoint: "/v2/stores/create", method: "POST", used: "نعم", type: "Mutating", safety: "مغلق بـ Env Gate" },
        { purpose: "استعلام المتاجر المرتبطة", endpoint: "/v2/merchants/my-stores", method: "GET", used: "نعم", type: "Read-only", safety: "آمن" },
        { purpose: "إرسال شحنة جديدة", endpoint: "/v2/shipments/create", method: "POST", used: "نعم", type: "Mutating", safety: "حرج، مغلق بـ Env Gate" },
        { purpose: "الاستعلام ومزامنة الحالة", endpoint: "/v2/shipments/query", method: "POST/GET", used: "نعم", type: "Read-only", safety: "آمن تماماً (قراءة فقط)" },
        { purpose: "استقبال التحديثات من ويبهوك", endpoint: "/v2/push/update-status", method: "POST", used: "نعم (وارد)", type: "Inbound Webhook / Local DB write", safety: "قادم من Jenni، يتطلب توكن التحقق ونظام الكود، لا يستدعيه الأدمن" },
        { purpose: "تحديث شحنة / أكواد العمليات", endpoint: "/v2/shipments/update-status", method: "POST", used: "لا", type: "Mutating", safety: "محظور استخدامها للمزامنة التلقائية" },
        { purpose: "بيانات المحافظات", endpoint: "/v2/reference/governorates", method: "GET", used: "نعم", type: "Read-only", safety: "آمن" },
        { purpose: "بيانات المدن والمناطق", endpoint: "/v2/reference/cities", method: "GET", used: "نعم", type: "Read-only", safety: "آمن" }
    ];

    const knownErrors = [
        { code: "POST store.DilMart.org/v2/push/update-status → 404", cause: "استخدام نطاق الـ Frontend (Netlify) لاستقبال الـ Webhook بدلاً من الـ Backend.", fix: "يجب تسجيل عنوان الـ Backend فقط: https://DilMart-store-backend.onrender.com/v2/push/update-status" },
        { code: "Bearer Bearer token", cause: "ترجع بوابة Jenni التوكن مسبوقاً ببادئة Bearer مكررة.", fix: "يقوم كود المصادقة بازالة البادئة المكررة تلقائياً قبل بناء الهيدر." },
        { code: "merchant_id is required for AGGREGATOR users", cause: "محاولة إرسال شحنة بدون تمرير معرف التاجر لـ Aggregator.", fix: "تأكد من توريد jenni_merchant_id في حمولة الشحن." },
        { code: "store_id required / pickup store missing", cause: "عدم تحديد المتجر المعتمد للتاجر عند إرسال الطلب.", fix: "يتم تخزين store_id وربطه بكل شحنة بشكل صريح." },
        { code: "name is reduplicate", cause: "المتجر تم إنشاؤه مسبقاً في نظام Jenni ويحمل نفس الاسم.", fix: "يجب ربط المتجر يدوياً باستخدام زر الربط بدلاً من إعادة الإنشاء." },
        { code: "city/area rejected", cause: "المدينة أو المنطقة المرسلة لا تطابق قاعدة بيانات Jenni.", fix: "استخدم أسماء المدن والمناطق العربية الرسمية المزامنة مسبقاً (مثل: المنصور وليس Mansour)." },
        { code: "Missing provider shipment ID", cause: "محاولة مزامنة طلب لم يتم إرساله إلى Jenni بنجاح بعد.", fix: "لا يمكن المزامنة حتى يتم إرسال الشحنة بنجاح وحفظ رقم الشحنة." },
        { code: "{\"ok\":true,\"duplicate\":true}", cause: "وصل نفس الـ Webhook payload مرتين (نفس payload_hash مسجل مسبقاً).", fix: "سلوك مقصود وآمن — النظام يتجاهل التكرار. ليس خطأً." }
    ];

    const getConfidenceBadgeColor = (source: string) => {
        switch (source) {
            case "Real Query Confirmed":
                return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
            case "Docs":
                return "bg-blue-500/15 text-blue-600 border-blue-500/30";
            default:
                return "bg-amber-500/15 text-amber-600 border-amber-500/30";
        }
    };

    return (
        <div className="space-y-6 pb-12 text-right" dir="rtl">
            {/* Page Header */}
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border/80 pb-5">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Link2 className="h-6 w-6 text-primary" />
                        مركز تكامل Jenni
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        صفحة المعرفة والتشخيص الآمن والمطابقة لخدمات شركة التوصيل Jenni / Al Zaeem Express
                    </p>
                </div>
            </div>

            {/* Warning Note */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 flex gap-3 items-start">
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 space-y-1">
                    <p className="font-semibold">صفحة تشخيصية آمنة</p>
                    <p className="text-xs text-amber-700">
                        هذه الصفحة لا تنشئ شحنات ولا تستدعي أي API تعديلي لدى Jenni. زر المزامنة يقرأ الحالة من Jenni ويحدّث سجلات الحالة محلياً فقط.
                        ولا يتم عرض أي كلمات مرور أو مفاتيح سرية (Secrets) لـ Supabase/Render هنا.
                    </p>
                </div>
            </div>

            {/* Integration Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Provider Card */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-md flex items-center gap-2">
                            <Truck className="h-5 w-5 text-primary" />
                            مزود الخدمة
                        </CardTitle>
                        <CardDescription>تفاصيل الحساب الأساسية في النظام</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-border/40 py-1.5">
                            <span className="text-muted-foreground">الاسم:</span>
                            <span className="font-medium">Jenni / الزعيم إكسبريس</span>
                        </div>
                        <div className="flex justify-between border-b border-border/40 py-1.5">
                            <span className="text-muted-foreground">نوع الحساب:</span>
                            <span className="font-medium">منصة / Aggregator</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                            <span className="text-muted-foreground">كود النظام:</span>
                            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">STYL_AI</code>
                        </div>
                    </CardContent>
                </Card>

                {/* Webhook Configuration */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-md flex items-center gap-2">
                            <Database className="h-5 w-5 text-primary" />
                            إعدادات الويب هوك والربط
                        </CardTitle>
                        <CardDescription>مسارات الاستقبال وحالة التصريح</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="py-1.5 border-b border-border/40">
                            <p className="text-muted-foreground text-xs mb-1">عنوان Webhook الصحيح (Backend):</p>
                            <code className="bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-2 py-1 rounded font-mono text-xs block" dir="ltr">
                                https://DilMart-store-backend.onrender.com/v2/push/update-status
                            </code>
                        </div>
                        <div className="py-1.5 border-b border-border/40">
                            <p className="text-muted-foreground text-xs mb-1">عنوان خاطئ — لا يُسجَّل لدى Jenni (Frontend):</p>
                            <code className="bg-red-500/10 text-red-600 border border-red-500/20 px-2 py-1 rounded font-mono text-xs block line-through" dir="ltr">
                                https://store.DilMart.org/v2/push/update-status
                            </code>
                            <p className="text-xs text-red-500 mt-1">store.DilMart.org هو الـ Frontend ويعيد 404 للـ webhook.</p>
                        </div>
                        <div className="flex justify-between border-b border-border/40 py-1.5">
                            <span className="text-muted-foreground">حالة بوابة الإرسال:</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600">تحت إدارة البيئة (Render env)</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                            <span className="text-muted-foreground">فحص التوكن:</span>
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="h-4 w-4" /> نشط ومؤكد
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Successful Dispatch Card */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-md flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            آخر شحنة ناجحة مؤكدة
                        </CardTitle>
                        <CardDescription>شحنة حية تم إرسالها واختبارها</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-border/40 py-1.5">
                            <span className="text-muted-foreground">رقم الطلب:</span>
                            <span className="font-semibold">DUK-260430-2387</span>
                        </div>
                        <div className="flex justify-between border-b border-border/40 py-1.5">
                            <span className="text-muted-foreground">معرف شحنة Jenni:</span>
                            <span className="font-mono text-xs">9311578</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                            <span className="text-muted-foreground">الحالة الناتجة:</span>
                            <span className="text-xs font-bold bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                Dispatched + Synced
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Test & Query Panel */}
            <Card className="border-primary/20">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <RefreshCw className="h-5 w-5 text-primary" />
                        أداة الاستعلام والمزامنة الآمنة للطلبات
                    </CardTitle>
                    <CardDescription>
                        أدخل معرّف الطلب الداخلي المكون من 36 حرفاً (UUID) لمزامنة حالته الحالية من Jenni عبر الاستعلام الآمن
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-end max-w-2xl">
                        <div className="flex-1 space-y-2 w-full">
                            <Label htmlFor="order-id">معرّف الطلب (Order UUID):</Label>
                            <Input
                                id="order-id"
                                placeholder="e.g. ddba4bc7-e9b8-4810-9426-f6362cb2b038"
                                value={targetOrderId}
                                onChange={(e) => setTargetOrderId(e.target.value)}
                                className="font-mono text-xs md:text-sm text-left placeholder:text-right"
                                dir="ltr"
                            />
                        </div>
                        <Button
                            onClick={handleSync}
                            disabled={syncMutation.isPending || isLoading}
                            className="w-full md:w-auto gap-2"
                        >
                            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                            مزامنة من Jenni
                        </Button>
                    </div>

                    {/* Query Result Details */}
                    {isLoading ? (
                        <div className="text-sm text-muted-foreground py-4 text-center">جاري جلب تفاصيل التكامل...</div>
                    ) : integration ? (
                        <div className="mt-6 rounded-xl border border-border bg-muted/20 p-5 space-y-4 text-sm">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-1">
                                    <span className="text-muted-foreground text-xs block">رقم الشحنة الخارجي</span>
                                    <span className="font-semibold block">{String(integration.external_shipment_number || "—")}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-muted-foreground text-xs block">معرّف شحنة Jenni</span>
                                    <span className="font-mono font-semibold block text-primary">{String(integration.provider_shipment_id || "—")}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-muted-foreground text-xs block">الخطوة الحالية المزامنة</span>
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="outline">{String(integration.provider_current_step || "—")}</Badge>
                                        <span className="text-xs text-muted-foreground">({String(integration.provider_current_step_ar || "غير محدد")})</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-muted-foreground text-xs block">حالة الإرسال</span>
                                    <Badge variant={integration.dispatch_status === "dispatched" ? "secondary" : "destructive"}>
                                        {String(integration.dispatch_status || "—")}
                                    </Badge>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-border/40">
                                <div className="space-y-1">
                                    <span className="text-muted-foreground text-xs block">تاريخ الإرسال</span>
                                    <span className="text-xs block">{integration.dispatched_at ? new Date(String(integration.dispatched_at)).toLocaleString("ar-IQ") : "—"}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-muted-foreground text-xs block">آخر وقت مزامنة ناجح</span>
                                    <span className="text-xs text-primary font-medium block">
                                        {integration.last_synced_at ? new Date(String(integration.last_synced_at)).toLocaleString("ar-IQ") : "—"}
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-muted-foreground text-xs block">تغيير السعر (Amount Flag)</span>
                                    <span className="text-xs block">{integration.amount_change_flag ? "نعم (يتطلب مراجعة)" : "لا"}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-muted-foreground text-xs block">متجر Jenni</span>
                                    <span className="font-mono text-xs block">{String(integration.jenni_store_id || "—")}</span>
                                </div>
                            </div>

                            {/* Collapsible raw json payload */}
                            <div className="pt-4 border-t border-border/40">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsJsonOpen(!isJsonOpen)}
                                    className="p-0 hover:bg-transparent h-auto font-semibold text-xs text-primary flex items-center gap-1"
                                >
                                    {isJsonOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    {isJsonOpen ? "إخفاء الـ Raw JSON Payload" : "عرض الـ Raw JSON Payload المسترجع"}
                                </Button>

                                {isJsonOpen && (
                                    <pre className="mt-3 p-4 bg-muted/80 rounded-lg text-xs font-mono overflow-auto max-h-60 text-left border border-border" dir="ltr">
                                        {JSON.stringify(integration.provider_last_payload, null, 2)}
                                    </pre>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
                            <Info className="h-6 w-6 text-muted-foreground/60" />
                            لم يتم العثور على سجل تكامل Jenni لهذا المعرف.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* API Reference Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        جدول مراجع واجهات البرمجة APIs
                    </CardTitle>
                    <CardDescription>
                        استعراض واجهات البرمجة لـ Jenni المستخدمة في نظام ستايل آي ونوع الاستدعاء المعتمد لكل منها
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-right">الغرض / الهدف</TableHead>
                                <TableHead className="text-left font-mono">Jenni Endpoint</TableHead>
                                <TableHead className="text-right">نوع الاستدعاء</TableHead>
                                <TableHead className="text-right">مستعمل؟</TableHead>
                                <TableHead className="text-right">النوع</TableHead>
                                <TableHead className="text-right">ملاحظات الأمان والمخاطر</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {apiReferences.map((api, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-medium">{api.purpose}</TableCell>
                                    <TableCell className="text-left font-mono text-xs" dir="ltr">{api.endpoint}</TableCell>
                                    <TableCell><Badge variant="outline">{api.method}</Badge></TableCell>
                                    <TableCell>{api.used}</TableCell>
                                    <TableCell>
                                        <Badge className={api.type === "Mutating" ? "bg-red-500/10 text-red-600 hover:bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 border-emerald-500/20"}>
                                            {api.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{api.safety}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Status Mapping Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <RefreshCw className="h-5 w-5 text-primary" />
                        جدول مطابقة الحالات (Status Mapping)
                    </CardTitle>
                    <CardDescription>
                        خرائط الحالات بين Jenni وحالات التوصيل الداخلية.
                        الحالات المؤكدة بالاستعلام الحقيقي (✅ Real Query Confirmed) مبنية على تتبع الشحنة <code className="text-xs bg-muted px-1 rounded font-mono">9311578</code> (DUK-260430-2387)،
                        تسلسل: NEW_WITH_PA → IN_SC → PRINT_MANIFEST_DA → OFD → RTO_WITH_DA.
                        الحالات الأخرى مبنية على التوثيق (Docs) وتنتظر التأكيد عند استقبال webhook حقيقي.
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-left font-mono">Jenni Step</TableHead>
                                <TableHead className="text-right">المعنى بالعربية</TableHead>
                                <TableHead className="text-right">حالة التوصيل الداخلية</TableHead>
                                <TableHead className="text-right">نوع حدث التوصيل</TableHead>
                                <TableHead className="text-right">الأثر المالي للطلب</TableHead>
                                <TableHead className="text-right">مراجعة الأدمن؟</TableHead>
                                <TableHead className="text-right">مصدر الثقة</TableHead>
                                <TableHead className="text-right">ملاحظة تشغيلية</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {statusMappings.map((mapping, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-mono text-xs font-bold text-left" dir="ltr">{mapping.step}</TableCell>
                                    <TableCell>{mapping.label}</TableCell>
                                    <TableCell><Badge variant="secondary">{mapping.internalStatus}</Badge></TableCell>
                                    <TableCell className="font-mono text-xs" dir="ltr">{mapping.event}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{mapping.finance}</TableCell>
                                    <TableCell>{mapping.review}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={getConfidenceBadgeColor(mapping.source)}>
                                            {mapping.source}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                                        {mapping.note || "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Action Codes & Warning */}
            <Card className="border-red-200/50 bg-red-50/10">
                <CardHeader>
                    <CardTitle className="text-red-700 text-lg flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        تحذير هام بخصوص أكواد العمليات (Action Codes)
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3 text-red-800">
                    <p className="font-medium">
                        أكواد العمليات (Action Codes) تختلف تماماً عن حالات الخطوات (Step Status):
                    </p>
                    <ul className="list-disc list-inside space-y-1.5 text-xs text-red-700">
                        <li><strong>حالة الخطوات (Step Status):</strong> تعبر عن الموضع الحالي للشحنة في دورة حياتها لدى المزود (مثل: بانتظار الاستلام، مع المندوب).</li>
                        <li><strong>أكواد العمليات (Action Codes):</strong> توثق حدثاً أو تغييراً طارئاً (مثل: تأجيل العميل، مشكلة في العنوان) ويتم إرسالها اختيارياً.</li>
                    </ul>
                    <div className="rounded border border-red-200 bg-red-50 p-3 mt-3 text-xs font-bold flex gap-2 items-center text-red-900">
                        <ShieldAlert className="h-4 w-4 text-red-700" />
                        <span>تحذير: لا تقم باستدعاء API المزامنة التعديلي `update-status` لغايات الاستعلام القراءي البسيط.</span>
                    </div>
                </CardContent>
            </Card>

            {/* Known Errors & Solutions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-primary" />
                        الأخطاء الشائعة وحلولها التشغيلية
                    </CardTitle>
                    <CardDescription>أبرز مشاكل الربط المسجلة في السجلات وكيفية التعامل معها</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-right w-1/4">الخطأ المسجل</TableHead>
                                <TableHead className="text-right w-1/3">السبب الرئيسي</TableHead>
                                <TableHead className="text-right">الحل البرمجي والتشغيلي</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {knownErrors.map((err, idx) => (
                                <TableRow key={idx}>
                                    <TableCell className="font-mono text-xs text-red-600 text-left font-bold" dir="ltr">{err.code}</TableCell>
                                    <TableCell className="text-sm">{err.cause}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{err.fix}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Webhook Validation Checklist */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        قائمة التحقق من Webhook (Webhook Validation Checklist)
                    </CardTitle>
                    <CardDescription>المعايير المطبقة لحماية وتحسين استلام الإشعارات الفورية</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border rounded-lg p-3 flex gap-3 items-start bg-muted/10">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                                <p className="font-bold text-foreground">مسار المزامنة الفوري</p>
                                <p className="text-xs">يتم استقبال البيانات عبر المسار الحصري الموثق `/v2/push/update-status`</p>
                            </div>
                        </div>

                        <div className="border rounded-lg p-3 flex gap-3 items-start bg-muted/10">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                                <p className="font-bold text-foreground">التحقق من التوكن الأمني</p>
                                <p className="text-xs">يتم فحص الهيدر Authorization ومطابقته برمجياً مع التوكن المخزن سرياً.</p>
                            </div>
                        </div>

                        <div className="border rounded-lg p-3 flex gap-3 items-start bg-muted/10">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                                <p className="font-bold text-foreground">فحص كود النظام (System Code)</p>
                                <p className="text-xs">يتم رفض أي إشعار فوري لا يتضمن كود تعريف النظام الخاص بنا.</p>
                            </div>
                        </div>

                        <div className="border rounded-lg p-3 flex gap-3 items-start bg-muted/10">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                                <p className="font-bold text-foreground">منع التحديثات المكررة (Deduplication)</p>
                                <p className="text-xs">يقوم النظام بفلترة وتجاهل البيانات المتطابقة منعاً لإرهاق قاعدة البيانات.</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
