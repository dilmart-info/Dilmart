import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { playNotificationSound, stopMerchantOrderAlertLoop } from "@/lib/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeNotificationChannels } from "@/lib/realtime/notification-subscriptions";

/** M0: realtime delivery shell only — Supabase client is isolated in `notification-subscriptions.ts` + arch allowlist. */
export function NotificationHub() {
    const { user, isAdmin, isMerchantUser, context } = useAuth();
    const queryClient = useQueryClient();

    // Resolve active merchant ID if the user is a merchant user
    let merchantId: string | null = null;
    if (user && isMerchantUser && context) {
        const allMemberships = (context.merchant_memberships ?? [])
            .map((item: { id?: string }) => item.id)
            .filter(Boolean);

        if (allMemberships.length === 0 && context.merchant?.id) {
            allMemberships.push(context.merchant.id);
        }

        if (allMemberships.length > 0) {
            const persistedMerchantId = typeof window !== "undefined"
                ? window.localStorage.getItem("DilMart.active_merchant_id")
                : null;
            merchantId = (persistedMerchantId && allMemberships.includes(persistedMerchantId))
                ? persistedMerchantId
                : allMemberships[0];
        }
    }

    useEffect(() => {
        if (!user) return;

        return subscribeNotificationChannels({
            userId: user.id,
            isAdmin: !!isAdmin,
            merchantId: merchantId,
            queryClient,
            onAdminInsert: (row) => {
                toast.info(String(row.title ?? ""), {
                    description: String(row.message ?? ""),
                    duration: 10000,
                    action: {
                        label: "عرض",
                        onClick: () => (window.location.href = (row.link as string) || "/admin"),
                    },
                });
                playNotificationSound();
            },
            onUserInsert: (row) => {
                toast.success(String(row.title ?? ""), {
                    description: String(row.message ?? ""),
                    duration: 10000,
                    action: {
                        label: "عرض",
                        onClick: () => (window.location.href = (row.link as string) || "/profile"),
                    },
                });
                playNotificationSound();
            },
            onMerchantInsert: (row) => {
                toast.info(String(row.title ?? "طلب جديد وصل للمتجر"), {
                    description: String(row.message ?? "اضغط لعرض تفاصيل الطلب"),
                    duration: 10000,
                    action: {
                        label: "عرض الطلب",
                        onClick: () => {
                            window.location.href = (row.link as string) || "/merchant/orders";
                        },
                    },
                });
                if (row.type === "new_order") {
                    const rowMerchantId =
                        typeof row.merchant_id === "string" && row.merchant_id.trim().length > 0
                            ? row.merchant_id.trim()
                            : null;

                    // Authoritative event contract: fail closed if row has NO merchant_id
                    // Do NOT synthesize authority from fallback state
                    if (!rowMerchantId) {
                        return;
                    }

                    queryClient.invalidateQueries({ queryKey: ["pending-merchant-orders", rowMerchantId] });
                    queryClient.invalidateQueries({ queryKey: ["merchant-notifications", rowMerchantId] });

                    const orderId = row.order_id || (row.link ? (row.link as string).split("/").pop() : null);
                    window.dispatchEvent(new CustomEvent("merchant-new-order", {
                        detail: { orderId, notificationId: row.id, merchantId: rowMerchantId },
                    }));
                } else {
                    playNotificationSound("default");
                }
            },
            onMerchantUpdate: (row) => {
                if (row.acknowledged_at) {
                    stopMerchantOrderAlertLoop();
                    window.dispatchEvent(new CustomEvent("merchant-order-acknowledged", {
                        detail: { notificationId: row.id, orderId: row.order_id },
                    }));
                }
            },
        });
    }, [user, isAdmin, merchantId, queryClient]);

    useEffect(() => {
        if (!user) return;
        const timer = window.setInterval(() => {
            queryClient.invalidateQueries({ queryKey: ["user-notifications", user.id] });
            if (isAdmin) {
                queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
            }
            if (merchantId) {
                queryClient.invalidateQueries({ queryKey: ["merchant-notifications", merchantId] });
            }
        }, 60_000);
        return () => window.clearInterval(timer);
    }, [user, isAdmin, merchantId, queryClient]);

    return null;
}
