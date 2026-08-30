import { useQuery } from "@tanstack/react-query";
import { useCurrentMerchant } from "@/hooks/use-current-merchant";
import { apiClient } from "@/lib/api-client";

export function usePendingOrders() {
  const { data: membership } = useCurrentMerchant();
  const merchantId = membership?.merchant_id;

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["pending-merchant-orders", merchantId],
    queryFn: async () => {
      if (!merchantId) return { items: [], total: 0 };
      return await apiClient.listScopedOrders({
        merchant_id: merchantId,
        status: "new",
        merchant_decision_status: "pending",
        limit: 20,
      });
    },
    enabled: !!merchantId,
    refetchInterval: 60_000, // Background check every 60s
  });

  const pendingOrders = data?.items ?? [];
  const count = data?.total ?? 0;
  const currentOrderId = pendingOrders[0]?.id ?? null;

  return {
    pendingOrders,
    count,
    currentOrderId,
    isLoading,
    refetch,
    merchantId,
  };
}
