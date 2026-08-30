import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Phone, MapPin, CheckCircle2, XCircle, LogOut, Loader2, History, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api-client";

export default function AgentOrders() {
    const { user, profile, isAgent, loading: authLoading, logoutCurrentDevice } = useAuth();
    const [activeTab, setActiveTab] = useState<"current" | "history">("current");
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { data: currentOrders, isLoading: isLoadingCurrent } = useQuery({
        queryKey: ["agent-orders-current", user?.id],
        queryFn: async () => {
            if (!user) return [];
            return apiClient.getAgentOrders(user.id, { mode: "current" });
        },
        enabled: !!user && activeTab === "current"
    });

    const { data: historyOrders, isLoading: isLoadingHistory } = useQuery({
        queryKey: ["agent-orders-history", user?.id],
        queryFn: async () => {
            if (!user) return [];
            return apiClient.getAgentOrders(user.id, { mode: "history" });
        },
        enabled: !!user && activeTab === "history"
    });

    const updateStatus = useMutation({
        mutationFn: async ({ orderId, action }: { orderId: string, action: "picked_up" | "in_transit" | "delivered" | "failed" }) => {
            if (action === "picked_up") return apiClient.markOrderPickedUp(orderId);
            if (action === "in_transit") return apiClient.markOrderInTransit(orderId);
            if (action === "failed") {
                const reason = prompt("سبب فشل التسليم (مثل: customer_unavailable)") || "";
                if (!reason.trim()) throw new Error("reason_code is required");
                return apiClient.markOrderDeliveryFailed(orderId, { reason_code: reason.trim() });
            }
            return apiClient.markOrderDeliveryDelivered(orderId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["agent-orders-current"] });
            queryClient.invalidateQueries({ queryKey: ["agent-orders-history"] });
            toast.success("تم تحديث حالة الطلب");
        },
        onError: (err: any) => toast.error(err?.message ?? "حدث خطأ أثناء التحديث"),
    });

    const handleLogout = async () => {
        await logoutCurrentDevice();
        navigate("/auth");
    };

    if (authLoading) return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
    );

    if (!user || !isAgent) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <XCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-xl font-bold mb-2">غير مصرح لك بالدخول</h2>
                <p className="text-muted-foreground mb-6">هذه الصفحة مخصصة للمناديب فقط.</p>
                <Button onClick={() => navigate("/auth")}>تسجيل الدخول</Button>
            </div>
        );
    }

    const isLoading = activeTab === "current" ? isLoadingCurrent : isLoadingHistory;
    const orders = activeTab === "current" ? currentOrders : historyOrders;

    return (
        <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-20 px-4 pt-4 pb-0 shadow-sm safe-top">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h1 className="text-lg font-bold">لوحة المندوب</h1>
                        <p className="text-xs text-muted-foreground">أهلاً، {profile.full_name}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleLogout} className="text-destructive">
                        <LogOut size={20} />
                    </Button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mt-2">
                    <button
                        onClick={() => setActiveTab("current")}
                        className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === "current" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                            }`}
                    >
                        <ShoppingBag size={18} />
                        الطلبات الحالية
                    </button>
                    <button
                        onClick={() => setActiveTab("history")}
                        className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                            }`}
                    >
                        <History size={18} />
                        سجل الطلبات
                    </button>
                </div>
            </div>

            {/* Content List */}
            <div className="p-4 space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
                    </div>
                ) : orders?.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="bg-white rounded-full h-20 w-20 flex items-center justify-center mx-auto mb-4 border shadow-sm text-slate-200">
                            {activeTab === "current" ? <ShoppingBag size={40} /> : <History size={40} />}
                        </div>
                        <p className="text-muted-foreground font-medium">
                            {activeTab === "current" ? "لا توجد طلبات جارية حالياً" : "سجل الطلبات فارغ"}
                        </p>
                    </div>
                ) : (
                    orders?.map((order) => (
                        <Card key={order.id} className="border-none shadow-sm overflow-hidden">
                            <CardHeader className="bg-slate-50/50 py-3 px-4 border-b">
                                <div className="flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-muted-foreground">رقم الطلب</span>
                                        <span className="text-sm font-bold">#{order.order_number}</span>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={`
                                            ${order.delivery_status === 'delivered' ? "bg-green-50 text-green-700 border-green-200" : ""}
                                            ${order.delivery_status === 'returned' || order.delivery_status === 'failed' ? "bg-red-50 text-red-700 border-red-200" : ""}
                                            ${activeTab === 'current' ? "bg-amber-50 text-amber-700 border-amber-200" : ""}
                                        `}
                                    >
                                        {order.delivery_status === 'delivered' ? "تم التوصيل" :
                                            order.delivery_status === 'returned' ? "مسترجع" :
                                                order.delivery_status === 'failed' ? "فشل التسليم" :
                                                    order.delivery_status === 'in_transit' ? "في الطريق" :
                                                        order.delivery_status === 'picked_up' ? "تم الاستلام" : "مُعيّن للمندوب"}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                {activeTab === "current" ? (
                                    <>
                                        {/* Customer Info */}
                                        <div className="flex items-start gap-3">
                                            <div className="bg-primary/10 p-2 rounded">
                                                <Phone className="text-primary" size={18} />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-sm">{order.customer_name}</p>
                                                <p className="text-xs text-muted-foreground" dir="ltr">{order.customer_phone}</p>
                                            </div>
                                            <a href={`tel:${order.customer_phone}`}>
                                                <Button size="sm" variant="outline" className="rounded-full h-10 w-10 p-0 border-green-200 text-green-600">
                                                    <Phone size={18} />
                                                </Button>
                                            </a>
                                        </div>

                                        {/* Address Info */}
                                        <div className="flex items-start gap-3">
                                            <div className="bg-blue-100 p-2 rounded">
                                                <MapPin className="text-blue-600" size={18} />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-medium">{order.governorates?.name} - {order.area}</p>
                                                {order.nearest_landmark && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        أقرب نقطة: {order.nearest_landmark}
                                                    </p>
                                                )}
                                            </div>
                                            {(order as any).map_url && (
                                                <a href={(order as any).map_url} target="_blank" rel="noreferrer">
                                                    <Button size="sm" variant="outline" className="rounded-full h-10 w-10 p-0 border-blue-200 text-blue-600">
                                                        <MapPin size={18} />
                                                    </Button>
                                                </a>
                                            )}
                                        </div>

                                        <div className="pt-2 border-t flex justify-between items-center">
                                            <div className="flex flex-col">
                                                <span className="text-xs text-muted-foreground">المبلغ المستحق</span>
                                                <span className="font-black text-blue-600">{formatPrice(order.total)}</span>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="grid grid-cols-2 gap-3 pt-2">
                                            <Button
                                                variant="outline"
                                                className="border-red-200 text-red-600 h-11 font-bold shadow-none"
                                                onClick={() => {
                                                    if (confirm("هل تريد تعليم الطلب كفشل تسليم؟")) {
                                                        updateStatus.mutate({ orderId: order.id, action: "failed" });
                                                    }
                                                }}
                                            >
                                                <XCircle className="ml-2" size={18} />
                                                فشل
                                            </Button>
                                            <Button
                                                className="bg-green-600 hover:bg-green-700 h-11 font-bold"
                                                onClick={() => {
                                                    if (order.delivery_status === "assigned_to_agent") {
                                                        updateStatus.mutate({ orderId: order.id, action: "picked_up" });
                                                        return;
                                                    }
                                                    if (order.delivery_status === "picked_up") {
                                                        updateStatus.mutate({ orderId: order.id, action: "in_transit" });
                                                        return;
                                                    }
                                                    if (confirm("هل تم تسليم الطلب واستلام المبلغ؟")) {
                                                        updateStatus.mutate({ orderId: order.id, action: "delivered" });
                                                    }
                                                }}
                                            >
                                                <CheckCircle2 className="ml-2" size={18} />
                                                {order.delivery_status === "assigned_to_agent"
                                                    ? "تم الاستلام"
                                                    : order.delivery_status === "picked_up"
                                                        ? "في الطريق"
                                                        : "تم التوصيل"}
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-sm mb-1">{order.customer_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(order.created_at).toLocaleDateString('ar-IQ')}
                                            </p>
                                        </div>
                                        <div className="text-left">
                                            <p className="font-black text-blue-600 text-sm">{formatPrice(order.total)}</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
