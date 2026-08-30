/** `GET /admin/analytics/executive` — M4.8 executive governance view */

export type ExecutiveMerchantHealthDistribution = {
  key: string;
  label: string;
  count: number;
};

export type ExecutiveLowestReadinessMerchant = {
  merchant_id: string;
  display_name: string;
  score: number;
  is_ready: boolean;
};

export type ExecutiveDelayedGovernorate = {
  governorate_name: string;
  delayed_orders: number;
  delayed_revenue: number;
};

export type ExecutiveWeeklyThroughput = {
  label: string;
  order_count: number;
  revenue: number;
};

export type AdminExecutiveGovernanceResponse = {
  contract_version: number;
  generated_at: string;
  merchant_health: {
    avg_readiness_score: number;
    ready_merchants: number;
    total_merchants: number;
    distribution: ExecutiveMerchantHealthDistribution[];
    lowest_readiness_merchants: ExecutiveLowestReadinessMerchant[];
  };
  delayed_order_risk: {
    total_delayed: number;
    by_governorate: ExecutiveDelayedGovernorate[];
  };
  weekly_commercial_throughput: ExecutiveWeeklyThroughput[];
};
