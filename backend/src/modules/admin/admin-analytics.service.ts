import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { MerchantsService } from "../merchants/merchants.service";

@Injectable()
export class AdminAnalyticsService {
  private readonly logger = new Logger(AdminAnalyticsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly merchantsService: MerchantsService,
  ) {}

  async getAnalyticsOverview() {
    const { data, error } = await this.supabaseAdmin.client.rpc("analytics_overview");

    if (error) {
      this.logger.warn(`analytics_overview RPC failed, falling back to empty shell: ${error.message}`);
      return {
        metrics: {
          totalRevenue: 0,
          todayRevenue: 0,
          monthRevenue: 0,
          totalOrders: 0,
          todayOrdersCount: 0,
          avgOrderValue: 0,
          cancellationRate: 0,
          totalProfit: 0,
        },
        topProducts: [],
        govData: [],
        salesTrend: [],
        statusData: [],
        monthlyData: [],
      };
    }

    return data;
  }

  async getExecutiveGovernance() {
    const [readinessBlock, metricsRes] = await Promise.all([
      this.merchantsService.getPlatformMerchantReadinessSummariesForAdmin(),
      this.supabaseAdmin.client.rpc("executive_governance_metrics"),
    ]);
    if (metricsRes.error) throw metricsRes.error;

    const metrics = metricsRes.data as {
      delayed_order_risk: {
        total_delayed: number;
        by_governorate: Array<{ governorate_name: string; delayed_orders: number; delayed_revenue: number }>;
      };
      weekly_commercial_throughput: Array<{ label: string; order_count: number; revenue: number }>;
    };

    const sortedByScore = [...readinessBlock.merchants].sort((a, b) => a.score - b.score);
    const lowest_readiness_merchants = sortedByScore.slice(0, 8).map((m) => ({
      merchant_id: m.merchant_id,
      display_name: m.display_name,
      score: m.score,
      is_ready: m.is_ready,
    }));

    return {
      contract_version: 1,
      generated_at: new Date().toISOString(),
      merchant_health: {
        avg_readiness_score: readinessBlock.avg_readiness_score,
        ready_merchants: readinessBlock.ready_merchants,
        total_merchants: readinessBlock.total_merchants,
        distribution: readinessBlock.distribution,
        lowest_readiness_merchants,
      },
      delayed_order_risk: metrics.delayed_order_risk,
      weekly_commercial_throughput: metrics.weekly_commercial_throughput,
    };
  }
}
