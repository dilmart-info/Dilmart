import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { merchantApi } from "@/lib/api/merchant";
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
import { Bell, ShoppingBag, AlertTriangle, AlertCircle, Info, Volume2, VolumeX } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { playNotificationSound } from "@/lib/notifications";

type MerchantNotification = {
    id: string;
    merchant_id: string;
    order_id: string | null;
    type: "new_order" | "order_status" | "stock" | "system";
    title: string;
    message: string;
    link: string | null;
    is_read: boolean;
    created_at: string;
};

interface MerchantNotificationsProps {
    merchantId: string;
}

export function MerchantNotifications({ merchantId }: MerchantNotificationsProps) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    
    // Manage sound enabled state locally and in localStorage
    const [soundEnabled, setSoundEnabled] = useState(() => {
        return localStorage.getItem("DilMart_merchant_order_sound_enabled") === "true";
    });

    const { data: notifications = [], isLoading, isError } = useQuery<MerchantNotification[]>({
        queryKey: ["merchant-notifications", merchantId],
        queryFn: async () => {
            return (await merchantApi.listMerchantNotifications(merchantId)) as MerchantNotification[];
        },
        enabled: !!merchantId,
        refetchOnWindowFocus: true,
        refetchInterval: 60_000,
    });

    const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

    const markAsRead = useMutation({
        mutationFn: async (id: string) => {
            await merchantApi.markMerchantNotificationRead(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["merchant-notifications", merchantId] });
        },
        onError: () => toast.error("تعذر تحديث حالة الإشعار"),
    });

    const markAllRead = useMutation({
        mutationFn: async () => {
            await merchantApi.markAllMerchantNotificationsRead(merchantId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["merchant-notifications", merchantId] });
            toast.success("تم تحديد الكل كمقروء");
        },
        onError: () => toast.error("تعذر تحديد الكل كمقروء"),
    });

    const handleToggleSound = (enabled: boolean) => {
        localStorage.setItem("DilMart_merchant_order_sound_enabled", enabled ? "true" : "false");
        setSoundEnabled(enabled);
        if (enabled) {
            // Trigger a quick test sound to unlock/confirm browser autoplay policy
            playNotificationSound("merchant_new_order");
            toast.success("تم تفعيل صوت تنبيهات الطلبات الجديدة");
        } else {
            toast.info("تم كتم صوت تنبيهات الطلبات");
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'new_order': return <ShoppingBag className="h-4 w-4 text-blue-500" />;
            case 'order_status': return <Info className="h-4 w-4 text-emerald-500" />;
            case 'stock': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
            case 'system': return <AlertCircle className="h-4 w-4 text-red-500" />;
            default: return <Info className="h-4 w-4 text-blue-500" />;
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-full hover:bg-muted transition-colors">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse ring-2 ring-background" />
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-2 shadow-lg border rounded-xl bg-background/95 backdrop-blur-sm">
                <DropdownMenuLabel className="flex items-center justify-between px-2 py-1.5">
                    <span className="font-semibold text-sm">الإشعارات</span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 font-medium text-primary hover:text-primary/80 transition-colors"
                            onClick={() => markAllRead.mutate()}
                            disabled={markAllRead.isPending}
                        >
                            تحديد الكل كمقروء
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1" />

                {/* Browser Autoplay Setup Banner */}
                {!soundEnabled && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-2.5 mb-2 text-center text-xs flex flex-col gap-1.5">
                        <div className="text-amber-800 dark:text-amber-400 font-medium">
                            ⚠️ صوت تنبيهات الطلبات الجديدة معطّل
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-800 dark:hover:bg-amber-900 h-7 w-full text-xs font-semibold"
                            onClick={() => handleToggleSound(true)}
                        >
                            تفعيل صوت الطلبات
                        </Button>
                    </div>
                )}

                <ScrollArea className="h-[280px] px-1">
                    {isLoading ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">جاري تحميل الإشعارات...</div>
                    ) : isError ? (
                        <div className="p-8 text-center text-xs text-muted-foreground text-red-500">تعذر تحميل الإشعارات حاليًا</div>
                    ) : notifications.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">لا توجد إشعارات جديدة</div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {notifications.map((notification) => (
                                <DropdownMenuItem
                                    key={notification.id}
                                    className={`flex flex-col items-start gap-1 p-2.5 rounded-lg cursor-pointer transition-colors ${
                                        !notification.is_read ? 'bg-muted/40 font-medium' : 'opacity-80'
                                    }`}
                                    onClick={async () => {
                                        if (!notification.is_read && !markAsRead.isPending) {
                                            await markAsRead.mutateAsync(notification.id);
                                        }
                                        if (notification.link) {
                                            navigate(notification.link);
                                        }
                                    }}
                                >
                                    <div className="flex w-full items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 text-xs font-semibold">
                                            {getIcon(notification.type)}
                                            <span>{notification.title}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                            {format(new Date(notification.created_at), 'HH:mm', { locale: ar })}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground line-clamp-2 w-full pr-6 leading-relaxed">
                                        {notification.message}
                                    </div>
                                </DropdownMenuItem>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <DropdownMenuSeparator className="my-1" />
                <div className="p-1 flex items-center justify-between text-xs text-muted-foreground px-2">
                    <span className="font-medium">تنبيهات صوت الطلبات</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-muted"
                        onClick={() => handleToggleSound(!soundEnabled)}
                    >
                        {soundEnabled ? (
                            <Volume2 className="h-4 w-4 text-primary" />
                        ) : (
                            <VolumeX className="h-4 w-4 text-muted-foreground" />
                        )}
                    </Button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
