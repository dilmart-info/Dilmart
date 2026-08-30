import { Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

type RiskLevel = "low" | "medium" | "high";
type ReasonCode =
  | "sla_breached"
  | "stuck_in_status"
  | "agent_high_fail_rate"
  | "company_high_return_rate"
  | "long_cycle_time";

type OpenOrderRow = {
  order_id: string;
  delivery_status: string;
  created_at: string;
  assigned_company_id: string | null;
  assigned_agent_id: string | null;
  last_event_time: string | null;
  time_in_current_status: number;
  sla_threshold: number;
};

type AgentPerfRow = {
  agent_id: string;
  total_orders: number;
  delivered_orders: number;
  failed_orders: number;
  returned_orders: number;
  on_time_rate: number;
  fail_rate: number;
  avg_delivery_time: number;
};

type CompanyPerfRow = {
  company_id: string;
  total_orders: number;
  delivered_orders: number;
  failed_orders: number;
  returned_orders: number;
  on_time_rate: number;
  fail_rate: number;
  return_rate: number;
  avg_delivery_time: number;
};

@Injectable()
export class DeliveryIntelligenceService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private normalizeLevel(score: number): RiskLevel {
    if (score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  scoreOrderRisk(
    order: OpenOrderRow,
    agentPerf?: AgentPerfRow | null,
    companyPerf?: CompanyPerfRow | null,
  ): { score: number; level: RiskLevel; reasons: ReasonCode[] } {
    const reasons: ReasonCode[] = [];
    let score = 0;

    const slaThreshold = Number(order.sla_threshold ?? 360);
    const minutesInStatus = Number(order.time_in_current_status ?? 0);
    const isSlaBreached = minutesInStatus > slaThreshold;
    const hasStuckSignal = minutesInStatus >= Math.max(180, Math.floor(slaThreshold * 0.6));
    const hasLongCycle = minutesInStatus >= 24 * 60;
    const agentFailRate = Number(agentPerf?.fail_rate ?? 0);
    const companyReturnRate = Number(companyPerf?.return_rate ?? 0);

    if (isSlaBreached) {
      score += 45;
      reasons.push("sla_breached");
    }
    if (hasStuckSignal) {
      score += 18;
      reasons.push("stuck_in_status");
    }
    if (agentFailRate >= 18) {
      score += 15;
      reasons.push("agent_high_fail_rate");
    }
    if (companyReturnRate >= 12) {
      score += 12;
      reasons.push("company_high_return_rate");
    }
    if (hasLongCycle) {
      score += 10;
      reasons.push("long_cycle_time");
    }

    const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
    return {
      score: boundedScore,
      level: this.normalizeLevel(boundedScore),
      reasons,
    };
  }

  getOrderRecommendations(
    risk: { score: number; level: RiskLevel; reasons: ReasonCode[] },
  ): Array<{ type: "reassign_agent" | "escalate_company" | "mark_urgent"; reason: string; confidence: number }> {
    const recommendations: Array<{ type: "reassign_agent" | "escalate_company" | "mark_urgent"; reason: string; confidence: number }> = [];
    const has = (reason: ReasonCode) => risk.reasons.includes(reason);

    if (risk.level === "high" || has("sla_breached")) {
      recommendations.push({
        type: "mark_urgent",
        reason: "Risk is high due to SLA/time signals and requires immediate manual follow-up.",
        confidence: Math.min(0.98, 0.65 + risk.score / 200),
      });
    }

    if (has("agent_high_fail_rate") || has("stuck_in_status")) {
      recommendations.push({
        type: "reassign_agent",
        reason: "Agent-level operational signal indicates elevated failure/stuck risk.",
        confidence: has("agent_high_fail_rate") ? 0.82 : 0.68,
      });
    }

    if (has("company_high_return_rate") || has("long_cycle_time")) {
      recommendations.push({
        type: "escalate_company",
        reason: "Company-level return/cycle indicators suggest escalation is needed.",
        confidence: has("company_high_return_rate") ? 0.8 : 0.66,
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: "mark_urgent",
        reason: "No severe signals detected; keep manual monitoring with low urgency.",
        confidence: 0.35,
      });
    }

    return recommendations;
  }

  private async loadPerformanceMaps() {
    const { data: agentPerf, error: agentPerfError } = await this.supabaseAdmin.client
      .from("delivery_agent_performance_view")
      .select("agent_id,total_orders,delivered_orders,failed_orders,returned_orders,on_time_rate,fail_rate,avg_delivery_time");
    if (agentPerfError) throw agentPerfError;

    const { data: companyPerf, error: companyPerfError } = await this.supabaseAdmin.client
      .from("delivery_company_performance_view")
      .select("company_id,total_orders,delivered_orders,failed_orders,returned_orders,on_time_rate,fail_rate,return_rate,avg_delivery_time");
    if (companyPerfError) throw companyPerfError;

    return {
      agentMap: new Map((agentPerf ?? []).map((row: any) => [String(row.agent_id), row as AgentPerfRow])),
      companyMap: new Map((companyPerf ?? []).map((row: any) => [String(row.company_id), row as CompanyPerfRow])),
    };
  }

  private buildScoredOrder(
    order: OpenOrderRow,
    maps: { agentMap: Map<string, AgentPerfRow>; companyMap: Map<string, CompanyPerfRow> },
  ) {
    const risk = this.scoreOrderRisk(
      order,
      order.assigned_agent_id ? maps.agentMap.get(order.assigned_agent_id) : null,
      order.assigned_company_id ? maps.companyMap.get(order.assigned_company_id) : null,
    );
    return {
      ...order,
      risk_score: risk.score,
      risk_level: risk.level,
      reasons: risk.reasons,
    };
  }

  async listQueue(payload?: { limit?: number }) {
    const limit = Math.max(1, Math.min(Number(payload?.limit ?? 100), 300));
    const sourceLimit = Math.max(500, Math.min(limit * 8, 5000));
    const { data: openOrders, error: openOrdersError } = await this.supabaseAdmin.client
      .from("delivery_open_orders_view")
      .select(
        "order_id,delivery_status,created_at,assigned_company_id,assigned_agent_id,last_event_time,time_in_current_status,sla_threshold",
      )
      .order("created_at", { ascending: false })
      .limit(sourceLimit);
    if (openOrdersError) throw openOrdersError;

    const maps = await this.loadPerformanceMaps();

    const rows = (openOrders ?? []).map((row: any) => this.buildScoredOrder(row as OpenOrderRow, maps));

    rows.sort((a, b) => b.risk_score - a.risk_score || +new Date(a.created_at) - +new Date(b.created_at));
    return { rows: rows.slice(0, limit) };
  }

  async getOrderIntelligence(orderId: string) {
    const { data: row, error } = await this.supabaseAdmin.client
      .from("delivery_open_orders_view")
      .select("order_id,delivery_status,created_at,assigned_company_id,assigned_agent_id,last_event_time,time_in_current_status,sla_threshold")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Order not found in delivery intelligence queue.");

    const maps = await this.loadPerformanceMaps();
    const scoredOrder = this.buildScoredOrder(row as OpenOrderRow, maps);

    const risk = {
      score: scoredOrder.risk_score,
      level: scoredOrder.risk_level as RiskLevel,
      reasons: scoredOrder.reasons as ReasonCode[],
    };
    const recommendations = this.getOrderRecommendations(risk);
    return { order: scoredOrder, risk, recommendations };
  }
}
