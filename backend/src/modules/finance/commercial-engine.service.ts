import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import {
  type CommercialRuleType,
  type ResolveContext,
  type RuleRow,
  isHybridRule,
  resolveWinningRuleForType,
} from "./commercial-rule-resolution";

export type CommercialPlanDefaults = {
  default_commission_type: string;
  default_commission_rate: number;
  default_assisted_fee_rate: number;
  default_platform_fee_rate: number;
  default_delivery_billing_mode: string;
};

export type CommercialResolveResult = {
  commission_type: string;
  commission_rate: number;
  commission_rule_id: string | null;
  assisted_fee_rate: number;
  assisted_fee_rule_id: string | null;
  platform_fee_rate: number;
  platform_fee_rule_id: string | null;
  delivery_billing_mode: string;
  delivery_billing_rule_id: string | null;
  plan_id: string | null;
  plan_code: string | null;
  commercial_snapshot_version: number;
  channel: string;
  resolution_source: string;
  plan_defaults: CommercialPlanDefaults;
  debug?: {
    matched_rules: Array<Pick<RuleRow, "id" | "rule_type" | "scope_type" | "priority" | "value" | "value_type">>;
    selected_rule_ids: Record<string, string | null>;
    resolution_path: string[];
  };
};

@Injectable()
export class CommercialEngineService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private static readonly RECOGNIZED_CHANNELS = new Set(["web_checkout", "whatsapp_assisted", "manual_assisted", "barber_app_checkout"]);

  private normalizeChannel(channel?: string | null) {
    const safe = String(channel ?? "web_checkout").trim().toLowerCase();
    if (CommercialEngineService.RECOGNIZED_CHANNELS.has(safe)) return safe;
    return "web_checkout";
  }

  private extractConditionString(conditions: Record<string, unknown> | null | undefined, key: string) {
    if (!conditions) return null;
    const value = conditions[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    return null;
  }

  private extractConditionNumber(conditions: Record<string, unknown> | null | undefined, key: string) {
    if (!conditions) return null;
    const value = conditions[key];
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private ruleMatchesContext(rule: RuleRow, context: ResolveContext) {
    const channel = this.normalizeChannel(context.channel);
    const categoryIds = context.category_ids ?? [];
    const conditions = (rule.conditions ?? {}) as Record<string, unknown>;
    const conditionChannel = this.extractConditionString(conditions, "channel");
    const conditionCategoryId = this.extractConditionString(conditions, "category_id");
    const minOrderValue = this.extractConditionNumber(conditions, "min_order_value");
    const maxOrderValue = this.extractConditionNumber(conditions, "max_order_value");
    const orderValue = Number(context.order_value ?? 0);

    if (minOrderValue !== null && orderValue < minOrderValue) return false;
    if (maxOrderValue !== null && orderValue > maxOrderValue) return false;

    if (rule.scope_type === "global") return true;
    if (rule.scope_type === "merchant") return String(rule.scope_reference_id ?? "") === context.merchant_id;
    if (rule.scope_type === "category") {
      const categoryRef = String(rule.scope_reference_id ?? conditionCategoryId ?? "");
      return !!categoryRef && categoryIds.includes(categoryRef);
    }
    if (rule.scope_type === "channel") {
      const channelRef = String(conditionChannel ?? "");
      return channelRef === channel;
    }
    if (rule.scope_type === "merchant_category") {
      const categoryRef = String(conditionCategoryId ?? "");
      return String(rule.scope_reference_id ?? "") === context.merchant_id && !!categoryRef && categoryIds.includes(categoryRef);
    }
    if (rule.scope_type === "merchant_channel") {
      const channelRef = String(conditionChannel ?? "");
      return String(rule.scope_reference_id ?? "") === context.merchant_id && channelRef === channel;
    }
    return false;
  }

  private getRuleValueAsText(rule: RuleRow | null, fallback: string) {
    if (!rule) return fallback;
    const vt = String(rule.value_type ?? "percentage").toLowerCase();
    if (vt === "hybrid") return fallback;
    return vt === "fixed" ? "fixed" : "percentage";
  }

  private getRuleValueAsNumber(rule: RuleRow | null, fallback: number) {
    if (!rule) return fallback;
    if (isHybridRule(rule)) return fallback;
    const value = Number(rule.value ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }

  async resolveCommercialTerms(context: ResolveContext, options?: { debug?: boolean }): Promise<CommercialResolveResult> {
    const effectiveAt = context.effective_at ?? new Date().toISOString();
    const channel = this.normalizeChannel(context.channel);

    const { data: activePlanAssignment, error: planAssignmentError } = await this.supabaseAdmin.client
      .from("merchant_plan_assignments")
      .select("id,merchant_id,plan_id,start_at,end_at,is_active,merchant_plans(*)")
      .eq("merchant_id", context.merchant_id)
      .eq("is_active", true)
      .or(`end_at.is.null,end_at.gte.${effectiveAt}`)
      .lte("start_at", effectiveAt)
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (planAssignmentError) throw planAssignmentError;

    type AssignmentWithPlan = { merchant_plans?: Record<string, unknown> | null } | null;
    const plan = (activePlanAssignment as AssignmentWithPlan)?.merchant_plans ?? null;

    // Merchant Commercial Agreement windows are half-open [start_at, end_at) — start inclusive,
    // end exclusive (see admin_schedule_merchant_commercial_agreement) — so this must use a
    // strictly-greater-than end boundary. `end_at.gte` would let the OLD and NEW agreement both
    // match at the exact transition instant.
    const { data: rules, error: rulesError } = await this.supabaseAdmin.client
      .from("commercial_rules")
      .select("*")
      .eq("is_active", true)
      .or(`end_at.is.null,end_at.gt.${effectiveAt}`)
      .lte("start_at", effectiveAt)
      .order("priority", { ascending: false })
      .limit(500);
    if (rulesError) throw rulesError;

    const rulesList = (rules ?? []) as RuleRow[];
    const rawMatches = rulesList.filter((rule) => this.ruleMatchesContext(rule, { ...context, channel }));
    const matches = rawMatches.filter((r) => !isHybridRule(r));

    const resolutionPath: string[] = [];
    const selectedRuleIds: Record<string, string | null> = {};

    const resolveRule = (ruleType: CommercialRuleType) => {
      const candidates = matches.filter((r) => r.rule_type === ruleType);
      const { selected, trace } = resolveWinningRuleForType(candidates, { category_ids: context.category_ids });
      resolutionPath.push(
        `${ruleType}: tier_priority=${trace.tier_scope_priority ?? "none"} count=${trace.tier_count} tiebreak=${trace.tiebreak} selected=${trace.selected_rule_id ?? "null"}`,
      );
      selectedRuleIds[ruleType] = selected?.id ?? null;
      return selected;
    };

    const commissionRule = resolveRule("commission");
    const assistedFeeRule = resolveRule("assisted_fee");
    const platformFeeRule = resolveRule("platform_fee");
    const deliveryBillingRule = resolveRule("delivery_billing");

    const fallbackTerms = await this.getLegacyFallbackTerms(context.merchant_id);

    const planRow = plan as Record<string, unknown> | null;
    const plan_defaults: CommercialPlanDefaults = {
      default_commission_type: String(planRow?.default_commission_type ?? fallbackTerms.commission_type ?? "percentage"),
      default_commission_rate: Number(planRow?.default_commission_rate ?? fallbackTerms.commission_rate ?? 0),
      default_assisted_fee_rate: Number(planRow?.default_assisted_fee_rate ?? fallbackTerms.assisted_fee_rate ?? 0),
      default_platform_fee_rate: Number(planRow?.default_platform_fee_rate ?? 0),
      default_delivery_billing_mode: String(planRow?.default_delivery_billing_mode ?? fallbackTerms.delivery_billing_mode ?? "customer_pays"),
    };

    const commissionType = this.getRuleValueAsText(commissionRule, plan_defaults.default_commission_type);
    const commissionRate = this.getRuleValueAsNumber(commissionRule, plan_defaults.default_commission_rate);
    const assistedFeeRate = this.getRuleValueAsNumber(assistedFeeRule, plan_defaults.default_assisted_fee_rate);
    const platformFeeRate = this.getRuleValueAsNumber(platformFeeRule, plan_defaults.default_platform_fee_rate);
    const deliveryBillingMode = deliveryBillingRule
      ? String(this.extractConditionString((deliveryBillingRule.conditions ?? {}) as Record<string, unknown>, "delivery_billing_mode") ?? "customer_pays")
      : plan_defaults.default_delivery_billing_mode;

    const base: CommercialResolveResult = {
      commission_type: commissionType,
      commission_rate: commissionRate,
      commission_rule_id: commissionRule?.id ?? null,
      assisted_fee_rate: assistedFeeRate,
      assisted_fee_rule_id: assistedFeeRule?.id ?? null,
      platform_fee_rate: platformFeeRate,
      platform_fee_rule_id: platformFeeRule?.id ?? null,
      delivery_billing_mode: deliveryBillingMode,
      delivery_billing_rule_id: deliveryBillingRule?.id ?? null,
      plan_id: planRow?.id != null ? String(planRow.id) : null,
      plan_code: planRow?.code != null ? String(planRow.code) : null,
      commercial_snapshot_version: 1,
      channel,
      resolution_source: "commercial_engine",
      plan_defaults,
    };

    if (options?.debug) {
      base.debug = {
        matched_rules: matches.map((r) => ({
          id: r.id,
          rule_type: r.rule_type,
          scope_type: r.scope_type,
          priority: r.priority,
          value: r.value,
          value_type: r.value_type,
        })),
        selected_rule_ids: selectedRuleIds,
        resolution_path: resolutionPath,
      };
    }

    return base;
  }

  private async getLegacyFallbackTerms(merchantId: string) {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_commercial_terms")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .or(`active_to.is.null,active_to.gte.${nowIso}`)
      .lte("active_from", nowIso)
      .order("active_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (
      data ?? {
        commission_type: "percentage",
        commission_rate: 0,
        assisted_fee_rate: 0,
        delivery_billing_mode: "customer_pays",
      }
    );
  }
}
