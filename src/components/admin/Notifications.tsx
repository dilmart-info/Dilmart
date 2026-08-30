import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bell, ShoppingBag, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

const ADMIN_NOTIFICATIONS_FORBIDDEN_CACHE_KEY = "DilMart-admin-notifications-forbidden-v1";

function isForbiddenError(error: unknown) {
    const message = String((error as any)?.message ?? error ?? "").toLowerCase();
    return message.includes("403") || message.includes("forbidden") || message.includes("unauthorized");
}

function readAdminNotificationsForbiddenCache() {
    try {
        return window.sessionStorage.getItem(ADMIN_NOTIFICATIONS_FORBIDDEN_CACHE_KEY) === "1";
    } catch {
        return false;
    }
}

function writeAdminNotificationsForbiddenCache(value: boolean) {
    try {
        if (value) {
            window.sessionStorage.setItem(ADMIN_NOTIFICATIONS_FORBIDDEN_CACHE_KEY, "1");
        } else {
            window.sessionStorage.removeItem(ADMIN_NOTIFICATIONS_FORBIDDEN_CACHE_KEY);
        }
    } catch {
        // no-op
    }
}

type AdminNotification = {
    id: string;
    type: string;
    title: string;
    message: string;
    link?: string | null;
    is_read: boolean;
    created_at: string;
};

export function Notifications() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [notificationsForbidden, setNotificationsForbidden] = useState(() => readAdminNotificationsForbiddenCache());

    const { data: notifications = [], isLoading, isError } = useQuery<AdminNotification[]>({
        queryKey: ["admin-notifications"],
        enabled: !notificationsForbidden,
        queryFn: async () => {
            try {
                return (await apiClient.listAdminNotifications()) as AdminNotification[];
            } catch (error) {
                if (isForbiddenError(error)) {
                    setNotificationsForbidden(true);
                    writeAdminNotificationsForbiddenCache(true);
                    return [];
                }
                throw error;
            }
        },
        refetchOnWindowFocus: true,
        retry: false,
        refetchInterval: (query) => (query.state.error ? false : 60_000),
    });

    const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

    const markAsRead = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.markAdminNotificationRead(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
        },
        onError: () => toast.error("تعذر تحديث حالة الإشعار"),
    });

    const markAllRead = useMutation({
        mutationFn: async () => {
            const unreadCount = notifications?.filter(n => !n.is_read).length || 0;
            if (unreadCount === 0) return;
            await apiClient.markAllAdminNotificationsRead();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
            toast.success("تم تحديد الكل كمقروء");
        },
        onError: () => toast.error("تعذر تحديد الكل كمقروء"),
    });

    // Realtime subscription is now handled by NotificationHub globally
    // for all users (admin, agent, customers)

    const getIcon = (type: string) => {
        switch (type) {
            case 'order': return <ShoppingBag className="h-4 w-4 text-primary" />;
            case 'stock': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            case 'cancellation': return <AlertCircle className="h-4 w-4 text-red-500" />;
            case 'alert_delayed_orders': return <AlertCircle className="h-4 w-4 text-red-500" />;
            case 'alert_catalog_quality': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            case 'alert_merchant_readiness': return <Info className="h-4 w-4 text-blue-500" />;
            case 'alert_low_stock': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            default: return <Info className="h-4 w-4 text-blue-500" />;
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse ring-2 ring-background" />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>الإشعارات</span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6 px-2"
                            onClick={() => markAllRead.mutate()}
                        >
                            تحديد الكل كمقروء
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="h-[300px]">
                    {isLoading ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">جاري التحميل...</div>
                    ) : isError ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">تعذر تحميل الإشعارات حاليًا</div>
                    ) : notificationsForbidden ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">لا تملك صلاحية عرض الإشعارات الإدارية</div>
                    ) : notifications?.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">لا توجد إشعارات جديدة</div>
                    ) : (
                        notifications?.map((notification) => (
                            <DropdownMenuItem
                                key={notification.id}
                                className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${!notification.is_read ? 'bg-muted/50' : ''}`}
                                onClick={async () => {
                                    if (!notification.is_read && !notification.id.startsWith("computed-") && !markAsRead.isPending) {
                                        await markAsRead.mutateAsync(notification.id);
                                    }
                                    if (notification.link) navigate(notification.link);
                                }}
                            >
                                <div className="flex w-full items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 font-medium text-sm">
                                        {getIcon(notification.type)}
                                        {notification.title}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                        {format(new Date(notification.created_at), 'HH:mm', { locale: ar })}
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground line-clamp-2 w-full pr-6">
                                    {notification.message}
                                </div>
                            </DropdownMenuItem>
                        ))
                    )}
                </ScrollArea>
                <DropdownMenuSeparator />
                <div className="p-2">
                    <Button variant="outline" size="sm" className="w-full text-xs" asChild>
                        <Link to="/admin">الانتقال للوحة الإدارة</Link>
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
