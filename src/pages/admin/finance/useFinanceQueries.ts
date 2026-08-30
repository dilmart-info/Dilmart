import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const financeKeys = {
  orders: ["admin-finance-reconciliation-orders"] as const,
  merchantBalances: ["admin-finance-reconciliation-merchant-balances"] as const,
  courierPayables: ["admin-finance-reconciliation-courier-payables"] as const,
  courierOrders: ["admin-finance-reconciliation-courier-orders"] as const,
  courierCodSummary: ["admin-finance-reconciliation-courier-cod-summary"] as const,
  merchantLedger: (merchantId: string) => ["admin-finance-merchant-ledger", merchantId] as const,
  courierLedger: (companyId: string) => ["admin-finance-courier-ledger", companyId] as const,
  events: (merchantId?: string) => ["admin-finance-events", merchantId ?? "all"] as const,
  payoutBatches: (status: string, merchantId: string) => ["admin-finance-payout-batches", status, merchantId] as const,
  courierPayoutBatches: (status: string, companyId: string) => ["admin-finance-courier-payout-batches", status, companyId] as const,
};

export function useFinanceOrders(limit = 200) {
  return useQuery({
    queryKey: financeKeys.orders,
    queryFn: () => apiClient.getFinanceReconciliationOrders({ limit }),
  });
}

export function useFinanceMerchantBalances() {
  return useQuery({
    queryKey: financeKeys.merchantBalances,
    queryFn: () => apiClient.getFinanceMerchantBalances(),
  });
}

export function useFinanceCourierPayables() {
  return useQuery({
    queryKey: financeKeys.courierPayables,
    queryFn: () => apiClient.getFinanceCourierPayables(),
  });
}

export function useFinanceCourierOrders(limit = 200) {
  return useQuery({
    queryKey: financeKeys.courierOrders,
    queryFn: () => apiClient.getFinanceCourierReconciliationOrders({ limit }),
  });
}

export function useFinanceCourierCodSummary() {
  return useQuery({
    queryKey: financeKeys.courierCodSummary,
    queryFn: () => apiClient.getFinanceCourierCodSummary(),
  });
}

export function useMerchantLedger(merchantId: string, limit = 100) {
  return useQuery({
    queryKey: financeKeys.merchantLedger(merchantId || "none"),
    enabled: !!merchantId,
    queryFn: () => apiClient.listAdminMerchantLedgerEntries({ merchant_id: merchantId, limit }),
  });
}

export function useCourierLedger(companyId: string, limit = 200) {
  return useQuery({
    queryKey: financeKeys.courierLedger(companyId || "none"),
    enabled: !!companyId,
    queryFn: () => apiClient.listAdminCourierLedgerEntries({ delivery_company_id: companyId, limit }),
  });
}

export function useFinanceEvents(merchantId?: string, limit = 100) {
  return useQuery({
    queryKey: financeKeys.events(merchantId),
    queryFn: () => apiClient.listAdminFinanceEvents({ merchant_id: merchantId || undefined, limit }),
  });
}

export function useMerchantPayoutBatches(status: "all" | "draft" | "approved" | "settled", merchantId: string) {
  return useQuery({
    queryKey: financeKeys.payoutBatches(status, merchantId),
    queryFn: () =>
      apiClient.listAdminPayoutBatches({
        status: status === "all" ? undefined : status,
        merchant_id: merchantId || undefined,
        limit: 100,
      }),
  });
}

export function useCourierPayoutBatches(status: "all" | "draft" | "approved" | "settled" | "cancelled", companyId: string) {
  return useQuery({
    queryKey: financeKeys.courierPayoutBatches(status, companyId),
    queryFn: () =>
      apiClient.listAdminCourierPayoutBatches({
        status: status === "all" ? undefined : status,
        delivery_company_id: companyId || undefined,
        limit: 100,
      }),
  });
}
