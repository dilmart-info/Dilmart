import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EXPERIMENT_HOME_HERO_MESSAGING_V1 } from "@/lib/experiments";
import { getExperimentRollup } from "@/lib/growth-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    ShoppingBag,
    TrendingUp,
    MapPin,
    DollarSign,
    Calendar,
    ArrowUpRight,
    Package,
    AlertCircle,
    FlaskConical,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
    LineChart,
    Line,
} from 'recharts';
import { apiClient } from "@/lib/api-client";
import { getGovernanceWorkflowTask, upsertGovernanceWorkflowTask } from "@/lib/governance-workflow";
import { ENABLE_LOCAL_FALLBACKS } from "@/lib/runtime-flags";

type AdminDashboardOverview = {
    metrics: {
        todayRevenue: number;
        todayOrdersCount: number;
        totalRevenue: number;
        avgOrderValue: number;
        totalProfit: number;
        cancellationRate: number;
        totalOrders: number;
        monthRevenue: number;
    };
    salesTrend: Array<{ date: string; revenue: number }>;
    statusData: Array<{ name: string; value: number }>;
    monthlyData: Array<{ name: string; revenue: number; profit: number }>;
    topProducts: Array<{ name: string; quantity: number; revenue: number }>;
    govData: Array<{ name: string; revenue: number }>;
};

interface FallbackOrder {
    id: string;
    status: string;
    total: number;
    created_at: string;
    governorate_id?: string;
}

interface FallbackOrderItem {
    product_name: string;
    quantity: number;
    price: number;
}

interface FallbackGovernorate {
    id: string;
    name: string;
}

interface MerchantSummary {
    id: string;
    display_name: string;
}

interface ProductSummary {
    readiness?: { is_ready: boolean };
}

interface OrderSummary {
    status: string;
    created_at: string;
}

interface GovernanceData {
    merchantsCount: number;
    notReadyMerchantsCount: number;
    notReadyProductsCount: number;
    delayedOrdersCount: number;
    topNotReadyMerchants: Array<{ id: string; display_name: string; score: number }>;
}

interface GovernanceTask {
    taskId: string;
    merchantId: string;
    merchantName: string;
    score: number;
    workflow: {
        owner: string;
        deadline: string;
        status: "open" | "in_progress" | "resolved" | "escalated";
        updatedAt: string;
    };
}

async function buildAdminOverviewFallback(): Promise<AdminDashboardOverview> {
    // Stub — Supabase direct fallback removed in Phase 1B.
    // Returns empty-safe shape so existing chart code does not crash.
    const orders: FallbackOrder[] = [];
    const orderItems: FallbackOrderItem[] = [];
    const governorates: FallbackGovernorate[] = [];

    const allOrders = orders ?? [];
    const deliveredOrders = allOrders.filter((o) => o?.status === "delivered");
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + Number(o?.total ?? 0), 0);
    const totalOrders = allOrders.length;
    const cancelledCount = allOrders.filter((o) => o?.status === "cancelled").length;
    const cancellationRate = totalOrders > 0 ? (cancelledCount / totalOrders) * 100 : 0;
    const avgOrderValue = deliveredOrders.length > 0 ? totalRevenue / deliveredOrders.length : 0;
    const totalProfit = totalRevenue * 0.15;

    const now = new Date();
    const isSameDay = (iso?: string | null) => {
        if (!iso) return false;
        const d = new Date(iso);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    };
    const todayDeliveredOrders = deliveredOrders.filter((o) => isSameDay(o?.created_at));
    const todayRevenue = todayDeliveredOrders.reduce((sum, o) => sum + Number(o?.total ?? 0), 0);
    const todayOrdersCount = todayDeliveredOrders.length;

    const salesTrend = Array.from({ length: 7 }).map((_, idx) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - idx));
        const dayRevenue = deliveredOrders
            .filter((o) => {
                const od = o?.created_at ? new Date(o.created_at) : null;
                return od && od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth() && od.getDate() === d.getDate();
            })
            .reduce((sum, o) => sum + Number(o?.total ?? 0), 0);
        return {
            date: d.toLocaleDateString("ar-IQ", { day: "2-digit", month: "2-digit" }),
            revenue: dayRevenue,
        };
    });

    const statusMap = new Map<string, number>();
    allOrders.forEach((o) => {
        const key = String(o?.status ?? "new");
        statusMap.set(key, (statusMap.get(key) ?? 0) + 1);
    });
    const statusLabels: Record<string, string> = {
        new: "جديد",
        contacted: "تم التواصل",
        preparing: "قيد التجهيز",
        shipped: "تم الشحن",
        delivered: "تم التسليم",
        cancelled: "ملغي",
        returned: "راجع",
    };
    const statusData = Array.from(statusMap.entries()).map(([status, value]) => ({
        name: statusLabels[status] ?? status,
        value,
    }));

    const monthlyRevenueMap = new Map<string, number>();
    deliveredOrders.forEach((o) => {
        if (!o?.created_at) return;
        const d = new Date(o.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyRevenueMap.set(key, (monthlyRevenueMap.get(key) ?? 0) + Number(o?.total ?? 0));
    });
    const monthlyData = Array.from({ length: 6 }).map((_, idx) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - idx));
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const revenue = monthlyRevenueMap.get(key) ?? 0;
        return {
            name: d.toLocaleDateString("ar-IQ", { month: "short" }),
            revenue,
            profit: revenue * 0.15,
        };
    });

    const monthRevenue = monthlyData[monthlyData.length - 1]?.revenue ?? 0;

    const topProductMap = new Map<string, { quantity: number; revenue: number }>();
    (orderItems ?? []).forEach((item) => {
        const key = String(item?.product_name ?? "منتج");
        const prev = topProductMap.get(key) ?? { quantity: 0, revenue: 0 };
        prev.quantity += Number(item?.quantity ?? 0);
        prev.revenue += Number(item?.price ?? 0) * Number(item?.quantity ?? 0);
        topProductMap.set(key, prev);
    });
    const topProducts = Array.from(topProductMap.entries())
        .map(([name, value]) => ({ name, quantity: value.quantity, revenue: value.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    const governorateNameMap = new Map((governorates ?? []).map((g) => [g.id, g.name]));
    const govRevenueMap = new Map<string, number>();
    deliveredOrders.forEach((o) => {
        const name = governorateNameMap.get(o?.governorate_id) ?? "غير محدد";
        govRevenueMap.set(name, (govRevenueMap.get(name) ?? 0) + Number(o?.total ?? 0));
    });
    const govData = Array.from(govRevenueMap.entries())
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6);

    return {
        metrics: {
            todayRevenue,
            todayOrdersCount,
            totalRevenue,
            avgOrderValue,
            totalProfit,
            cancellationRate,
            totalOrders,
            monthRevenue,
        },
        salesTrend,
        statusData,
        monthlyData,
        topProducts,
        govData,
    };
}

export default function AdminDashboard() {
    const [workflowVersion, setWorkflowVersion] = useState(0);
    const { data: stats, isLoading, isError: statsError } = useQuery({
        queryKey: ["admin-analytics-v2"],
        retry: false,
        queryFn: () => apiClient.getAdminAnalyticsOverview(),
    });

    const { data: governanceData } = useQuery({
        queryKey: ["admin-governance-light-layer"],
        retry: false,
        queryFn: async () => {
            let merchants: MerchantSummary[] = [];
            let productsResponse: any = [];
            let ordersResponse: { items?: OrderSummary[] } = { items: [] };
            [merchants, productsResponse, ordersResponse] = await Promise.all([
                apiClient.getAdminMerchants(),
                apiClient.listScopedProducts(),
                apiClient.listScopedOrders(),
            ]);
            const products: ProductSummary[] = Array.isArray(productsResponse)
                ? productsResponse
                : (productsResponse?.items ?? []);
            const orders: OrderSummary[] = ordersResponse?.items ?? [];

            const readinessPairs = await Promise.all(
                (merchants ?? []).map(async (merchant) => {
                    try {
                        const readiness = await apiClient.getMerchantReadiness(merchant.id);
                        return { merchant, readiness };
                    } catch {
                        return { merchant, readiness: null };
                    }
                }),
            );

            const notReadyMerchants = readinessPairs.filter((x) => x.readiness && !x.readiness.is_ready);
            const notReadyProducts = (products ?? []).filter((p) => !p?.readiness?.is_ready);
            const delayedOrders = (orders ?? []).filter((o) => {
                const pending = o.status === "new" || o.status === "contacted" || o.status === "preparing";
                if (!pending || !o.created_at) return false;
                return Date.now() - new Date(o.created_at).getTime() > 24 * 60 * 60 * 1000;
            });

            return {
                merchantsCount: (merchants ?? []).length,
                notReadyMerchantsCount: notReadyMerchants.length,
                notReadyProductsCount: notReadyProducts.length,
                delayedOrdersCount: delayedOrders.length,
                topNotReadyMerchants: notReadyMerchants.slice(0, 5).map((item) => ({
                    id: item.merchant.id,
                    display_name: item.merchant.display_name,
                    score: item.readiness?.score ?? 0,
                })),
            };
        },
    });

    const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];
    const hasSalesTrendData = (stats?.salesTrend ?? []).some((x) => Number(x?.revenue ?? 0) > 0);
    const hasStatusData = (stats?.statusData ?? []).some((x) => Number(x?.value ?? 0) > 0);
    const hasMonthlyData = (stats?.monthlyData ?? []).some((x) => Number(x?.revenue ?? 0) > 0 || Number(x?.profit ?? 0) > 0);
    const hasGovernoratesData = (stats?.govData ?? []).some((x) => Number(x?.revenue ?? 0) > 0);

    const mainCards = [
        {
            title: "مبيعات اليوم",
            value: formatPrice(stats?.metrics.todayRevenue || 0),
            sub: `${stats?.metrics.todayOrdersCount} طلبات`,
            icon: Calendar,
            color: "text-blue-600",
            bg: "bg-blue-50"
        },
        {
            title: "إجمالي المبيعات",
            value: formatPrice(stats?.metrics.totalRevenue || 0),
            sub: `منذ البداية`,
            icon: TrendingUp,
            color: "text-green-600",
            bg: "bg-green-50"
        },
        {
            title: "متوسط قيمة الطلب",
            value: formatPrice(stats?.metrics.avgOrderValue || 0),
            sub: `لكل عملية شراء`,
            icon: DollarSign,
            color: "text-purple-600",
            bg: "bg-purple-50"
        },
        {
            title: "صافي الربح التقديري",
            value: formatPrice(stats?.metrics.totalProfit || 0),
            sub: `بعد خصم التكلفة`,
            icon: ArrowUpRight,
            color: "text-emerald-600",
            bg: "bg-emerald-50"
        },
    ];

    const homeHeroExperimentRollup = useMemo(
        () => getExperimentRollup({ experimentId: EXPERIMENT_HOME_HERO_MESSAGING_V1, windowDays: 7 }),
        [],
    );
    const { data: serverExperimentReport } = useQuery({
        queryKey: ["admin-experiment-report", EXPERIMENT_HOME_HERO_MESSAGING_V1],
        retry: false,
        queryFn: () => apiClient.getAnalyticsExperimentReport({ experiment_id: EXPERIMENT_HOME_HERO_MESSAGING_V1, window_days: 7 }).catch(() => null),
    });

    const governanceTaskIds = useMemo(
        () => (governanceData?.topNotReadyMerchants ?? []).map((merchant) => `merchant-readiness:${merchant.id}`),
        [governanceData],
    );

    const { data: governanceWorkflowServer } = useQuery({
        queryKey: ["admin-governance-workflow-tasks", governanceTaskIds.join("|"), workflowVersion],
        enabled: governanceTaskIds.length > 0,
        retry: false,
        queryFn: () => apiClient.listAdminGovernanceTasks({ task_ids: governanceTaskIds }).catch(() => ({ tasks: [] })),
    });

    const saveGovernanceTask = async (
        taskId: string,
        patch: Partial<{ owner: string; deadline: string; status: "open" | "in_progress" | "resolved" | "escalated" }>,
        currentStatus: "open" | "in_progress" | "resolved" | "escalated",
    ) => {
        const payload = {
            owner: patch.owner,
            deadline: patch.deadline,
            status: patch.status ?? currentStatus,
        };
        try {
            const res = await apiClient.upsertAdminGovernanceTask(taskId, payload);
            if (res?.ok) {
                setWorkflowVersion((v) => v + 1);
                return;
            }
        } catch {
            // fallback handled below if explicitly enabled
        }
        if (!ENABLE_LOCAL_FALLBACKS) return;
        upsertGovernanceWorkflowTask(taskId, payload);
        setWorkflowVersion((v) => v + 1);
    };

    const governanceTasks = useMemo(() => {
        const merchants = governanceData?.topNotReadyMerchants ?? [];
        const serverMap = new Map(
            (governanceWorkflowServer?.tasks ?? []).map((row) => [
                row.task_id,
                {
                    owner: row.owner ?? "",
                    deadline: row.deadline ?? "",
                    status: (row.status ?? "open") as "open" | "in_progress" | "resolved" | "escalated",
                    updatedAt: row.updated_at ?? "",
                },
            ]),
        );
        return merchants.map((merchant) => {
            const taskId = `merchant-readiness:${merchant.id}`;
            const workflow = serverMap.get(taskId) ?? (ENABLE_LOCAL_FALLBACKS ? getGovernanceWorkflowTask(taskId) : null) ?? {
                owner: "",
                deadline: "",
                status: "open" as const,
                updatedAt: "",
            };
            return {
                taskId,
                merchantId: merchant.id,
                merchantName: merchant.display_name,
                score: merchant.score,
                workflow,
            };
        });
    }, [governanceData, governanceWorkflowServer]);

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-[400px]">جاري تحميل البيانات الإحصائية...</div>;
    }

    if (statsError || !stats) {
        return (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
                تعذّر تحميل البيانات الإحصائية. تحقق من الصلاحيات أو حاول لاحقاً.
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Metric Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {mainCards.map((card) => (
                    <Card key={card.title} className="overflow-hidden border-none shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                            <CardTitle className="text-sm font-bold text-muted-foreground">{card.title}</CardTitle>
                            <div className={`p-2 rounded-lg ${card.bg}`}>
                                <card.icon className={`h-4 w-4 ${card.color}`} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-black">{card.value}</div>
                            <p className="text-xs text-muted-foreground mt-1 font-medium">{card.sub}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="flex items-center p-6 gap-4 border-none shadow-sm">
                    <div className="p-3 bg-red-50 rounded-full">
                        <AlertCircle className="text-red-500" size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-bold">نسبة الإلغاء</p>
                        <div className="text-xl font-black text-red-600">{stats?.metrics.cancellationRate.toFixed(1)}%</div>
                    </div>
                </Card>
                <Card className="flex items-center p-6 gap-4 border-none shadow-sm">
                    <div className="p-3 bg-indigo-50 rounded-full">
                        <ShoppingBag className="text-indigo-500" size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-bold">إجمالي الطلبات</p>
                        <div className="text-xl font-black">{stats?.metrics.totalOrders}</div>
                    </div>
                </Card>
                <Card className="flex items-center p-6 gap-4 border-none shadow-sm">
                    <div className="p-3 bg-emerald-50 rounded-full">
                        <TrendingUp className="text-emerald-500" size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-bold">نمو المبيعات</p>
                        <div className="text-xl font-black">+{((stats?.metrics.monthRevenue || 0) / (stats?.metrics.totalRevenue || 1) * 100).toFixed(1)}%</div>
                    </div>
                </Card>
            </div>

            {/* Governance Light Layer */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">الحوكمة التشغيلية الخفيفة</h3>
                    <Badge variant="secondary">M3.8</Badge>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">إجمالي التجار</p>
                        <p className="text-xl font-bold mt-1">{governanceData?.merchantsCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3">
                        <p className="text-xs text-amber-700">تجار غير جاهزين</p>
                        <p className="text-xl font-bold mt-1 text-amber-800">{governanceData?.notReadyMerchantsCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3">
                        <p className="text-xs text-amber-700">منتجات غير جاهزة</p>
                        <p className="text-xl font-bold mt-1 text-amber-800">{governanceData?.notReadyProductsCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-3">
                        <p className="text-xs text-red-700">طلبات متأخرة (+24h)</p>
                        <p className="text-xl font-bold mt-1 text-red-800">{governanceData?.delayedOrdersCount ?? 0}</p>
                    </div>
                </div>
                {(governanceData?.topNotReadyMerchants?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                        <p className="text-sm font-semibold">أولوية متابعة جاهزية التجار</p>
                        {governanceTasks.map((task: GovernanceTask) => (
                            <div key={task.taskId} className="space-y-2 rounded border border-border px-3 py-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <span>{task.merchantName}</span>
                                    <span className="text-amber-700 font-semibold">{task.score}%</span>
                                </div>
                                <div className="grid gap-2 md:grid-cols-3">
                                    <input
                                        className="h-9 rounded border border-input bg-background px-2 text-xs"
                                        placeholder="المسؤول"
                                        value={task.workflow.owner}
                                        onChange={(e) => {
                                            void saveGovernanceTask(
                                                task.taskId,
                                                { owner: e.target.value },
                                                task.workflow.status,
                                            );
                                        }}
                                    />
                                    <input
                                        type="date"
                                        className="h-9 rounded border border-input bg-background px-2 text-xs"
                                        value={task.workflow.deadline}
                                        onChange={(e) => {
                                            void saveGovernanceTask(
                                                task.taskId,
                                                { deadline: e.target.value },
                                                task.workflow.status,
                                            );
                                        }}
                                    />
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className="rounded bg-zinc-100 px-2 py-1 text-[11px]"
                                            onClick={() => {
                                                void saveGovernanceTask(task.taskId, { status: "in_progress" }, task.workflow.status);
                                            }}
                                        >
                                            قيد التنفيذ
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded bg-emerald-100 px-2 py-1 text-[11px] text-emerald-700"
                                            onClick={() => {
                                                void saveGovernanceTask(task.taskId, { status: "resolved" }, task.workflow.status);
                                            }}
                                        >
                                            محلول
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded bg-red-100 px-2 py-1 text-[11px] text-red-700"
                                            onClick={() => {
                                                void saveGovernanceTask(task.taskId, { status: "escalated" }, task.workflow.status);
                                            }}
                                        >
                                            تصعيد
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>الحالة: {task.workflow.status}</span>
                                    <span>آخر تحديث: {task.workflow.updatedAt ? new Date(task.workflow.updatedAt).toLocaleString("ar-IQ") : "—"}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {/* M5.4 — Server-first experiment reporting contract; falls back to local snapshot if unavailable */}
            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <FlaskConical size={20} className="text-primary" />
                        تجربة نسخ الصفحة الرئيسية
                        <Badge variant="secondary">M5.4</Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        معرّف التجربة: <span className="font-mono">{EXPERIMENT_HOME_HERO_MESSAGING_V1}</span> — آخر{" "}
                        {serverExperimentReport?.window_days ?? homeHeroExperimentRollup.windowDays} أيام.{" "}
                        {serverExperimentReport?.by_variant
                            ? "المؤشرات معروضة من سجل خادمي (server-side)."
                            : "تعذر قراءة التقرير الخادمي؛ يتم عرض ملخص المتصفح المحلي كحل احتياطي."}
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {(["control", "variant_b"] as const).map((vid) => {
                            const row =
                                serverExperimentReport?.by_variant?.[vid] ??
                                homeHeroExperimentRollup.byVariant[vid] ??
                                { exposed: 0, outcomes: {} };
                            const clicks = row.outcomes["hero_primary_cta_click"] ?? 0;
                            const ctr = row.exposed > 0 ? Math.round((clicks / row.exposed) * 100) : 0;
                            return (
                                <div key={vid} className="rounded-lg border border-border p-4 text-sm space-y-2">
                                    <p className="font-semibold">النسخة: {vid}</p>
                                    <p className="text-muted-foreground">
                                        تعرّض: <span className="font-mono text-foreground">{row.exposed}</span>
                                    </p>
                                    <p className="text-muted-foreground">
                                        نقر زر البطل: <span className="font-mono text-foreground">{clicks}</span> ({ctr}%)
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Sales Trend */}
                <Card className="lg:col-span-2 border-none shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <TrendingUp size={20} className="text-primary" />
                            حركة المبيعات (آخر 7 أيام)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[350px] pt-4">
                        {hasSalesTrendData ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats?.salesTrend}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fontWeight: 600 }}
                                        padding={{ left: 20, right: 20 }}
                                    />
                                    <YAxis hide />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number) => [formatPrice(value), "المبيعات"]}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="#ec4899"
                                        strokeWidth={4}
                                        dot={{ r: 6, fill: "#ec4899", strokeWidth: 2, stroke: "#fff" }}
                                        activeDot={{ r: 8 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات مبيعات للأيام السبعة الأخيرة بعد.</div>
                        )}
                    </CardContent>
                </Card>

                {/* Status Distribution */}
                <Card className="border-none shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">توزيع حالات الطلبات</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[350px] flex flex-col items-center justify-center">
                        {hasStatusData ? (
                            <>
                                <ResponsiveContainer width="100%" height="80%">
                                    <PieChart>
                                        <Pie
                                            data={stats?.statusData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {stats?.statusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', direction: 'rtl' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full mt-4">
                                    {stats?.statusData.map((item, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                            <span className="text-[10px] font-bold">{item.name}: {item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">لا توجد حالات طلبات كافية لعرض التوزيع.</div>
                        )}
                    </CardContent>
                </Card>

                {/* Monthly Profit & Revenue Chart */}
                <Card className="lg:col-span-3 border-none shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <TrendingUp size={20} className="text-primary" />
                            الأداء الشهري (الأرباح والمبيعات)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[350px] pt-4">
                        {hasMonthlyData ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats?.monthlyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fontWeight: 600 }}
                                    />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', direction: 'rtl' }}
                                        formatter={(value: number) => [formatPrice(value)]}
                                    />
                                    <Bar dataKey="revenue" name="المبيعات" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="profit" name="الأرباح" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات شهرية لعرض الرسم البياني.</div>
                        )}
                    </CardContent>
                </Card>

                {/* Best Selling Products */}
                <Card className="border-none shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Package size={20} className="text-primary" />
                            المنتجات الأكثر طلباً
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-5">
                            {stats?.topProducts.map((p, i) => (
                                <div key={i} className="flex items-center justify-between group">
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold group-hover:text-primary transition-colors">{p.name}</p>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="text-[10px] py-0">{p.quantity} قطعة</Badge>
                                            <span className="text-[10px] text-muted-foreground font-medium">{formatPrice(p.revenue)}</span>
                                        </div>
                                    </div>
                                    <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary"
                                            style={{ width: `${(p.revenue / (stats?.metrics.totalRevenue || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            {stats?.topProducts.length === 0 && <p className="text-center py-4 text-muted-foreground text-sm italic">لا توجد مبيعات حالياً</p>}
                        </div>
                    </CardContent>
                </Card>

                {/* Top Governorates */}
                <Card className="lg:col-span-2 border-none shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <MapPin size={20} className="text-primary" />
                            أداء المحافظات
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px] pt-4">
                        {hasGovernoratesData ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats?.govData} layout="vertical" margin={{ right: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={100}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12, fontWeight: 700 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#f8f9fa' }}
                                        formatter={(v: number) => [formatPrice(v), "إجمالي المبيعات"]}
                                        contentStyle={{ borderRadius: '12px', border: 'none' }}
                                    />
                                    <Bar dataKey="revenue" radius={[0, 10, 10, 0]} barSize={20}>
                                        {stats?.govData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">لا توجد بيانات محافظات كافية لعرض الأداء.</div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
