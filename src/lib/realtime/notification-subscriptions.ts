import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

/**
 * M0: single controlled entry point for Supabase Realtime (postgres_changes) used by the app shell.
 * Intentional residual — business reads/writes go through the Nest API; this is delivery-only.
 */
export function subscribeNotificationChannels(params: {
  userId: string;
  isAdmin: boolean;
  merchantId?: string | null;
  queryClient: QueryClient;
  onAdminInsert: (row: Record<string, unknown>) => void;
  onUserInsert: (row: Record<string, unknown>) => void;
  onMerchantInsert?: (row: Record<string, unknown>) => void;
  onMerchantUpdate?: (row: Record<string, unknown>) => void;
}): () => void {
  const channels: ReturnType<typeof supabase.channel>[] = [];

  if (params.isAdmin) {
    const adminChannel = supabase
      .channel("admin-global-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          params.queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
          params.onAdminInsert(payload.new as Record<string, unknown>);
        },
      )
      .subscribe();
    channels.push(adminChannel);
  }

  const userChannel = supabase
    .channel(`user-notifications-${params.userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_notifications",
        filter: `user_id=eq.${params.userId}`,
      },
      (payload) => {
        params.queryClient.invalidateQueries({ queryKey: ["user-notifications", params.userId] });
        params.onUserInsert(payload.new as Record<string, unknown>);
      },
    )
    .subscribe();
  channels.push(userChannel);

  if (params.merchantId) {
    const merchantChannel = supabase
      .channel(`merchant-notifications-${params.merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "merchant_notifications",
          filter: `merchant_id=eq.${params.merchantId}`,
        },
        (payload) => {
          params.queryClient.invalidateQueries({ queryKey: ["merchant-notifications", params.merchantId] });
          params.queryClient.invalidateQueries({ queryKey: ["scoped-orders"] });
          params.onMerchantInsert?.(payload.new as Record<string, unknown>);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "merchant_notifications",
          filter: `merchant_id=eq.${params.merchantId}`,
        },
        (payload) => {
          params.queryClient.invalidateQueries({ queryKey: ["merchant-notifications", params.merchantId] });
          params.onMerchantUpdate?.(payload.new as Record<string, unknown>);
        },
      )
      .subscribe();
    channels.push(merchantChannel);
  }

  return () => {
    channels.forEach((ch) => {
      supabase.removeChannel(ch);
    });
  };
}
