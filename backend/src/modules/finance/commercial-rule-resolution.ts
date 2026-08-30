/**
 * M13-R: deterministic commercial rule resolution (pure, unit-testable).
 * Scope precedence: merchant > merchant_category > merchant_channel > category > channel > global.
 */

export type CommercialRuleType = "commission" | "assisted_fee" | "platform_fee" | "delivery_billing";
export type CommercialScopeType = "global" | "merchant" | "category" | "channel" | "merchant_category" | "merchant_channel";

export type RuleRow = {
  id: string;
  rule_type: CommercialRuleType;
  scope_type: CommercialScopeType;
  scope_reference_id?: string | null;
  priority?: number | null;
  value_type?: string | null;
  value?: number | null;
  conditions?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type ResolveContext = {
  merchant_id: string;
  channel?: string | null;
  order_value?: number;
  category_ids?: string[];
  effective_at?: string;
};

/** Lower number = higher precedence (wins over higher numbers). */
export const SCOPE_PRIORITY: Record<CommercialScopeType, number> = {
  merchant: 1,
  merchant_category: 2,
  merchant_channel: 3,
  category: 4,
  channel: 5,
  global: 6,
};

export function scopePriority(scopeType: CommercialScopeType): number {
  return SCOPE_PRIORITY[scopeType] ?? 99;
}

function createdAtDescTime(a: string | null | undefined, b: string | null | undefined): number {
  return new Date(String(b ?? 0)).getTime() - new Date(String(a ?? 0)).getTime();
}

/** Full deterministic ordering across mixed scopes (used only after tier filter in resolve). */
export function sortRulesDeterministic(candidates: RuleRow[]): RuleRow[] {
  return [...candidates].sort((a, b) => {
    const spA = scopePriority(a.scope_type);
    const spB = scopePriority(b.scope_type);
    if (spA !== spB) return spA - spB;
    const prA = Number(a.priority ?? 0);
    const prB = Number(b.priority ?? 0);
    if (prA !== prB) return prB - prA;
    return createdAtDescTime(a.created_at, b.created_at);
  });
}

function distinctCategoryCount(categoryIds?: string[]): number {
  const ids = (categoryIds ?? []).filter(Boolean);
  return new Set(ids).size;
}

function isCategoryLikeScope(st: CommercialScopeType): boolean {
  return st === "category" || st === "merchant_category";
}

export type RuleResolutionTrace = {
  rule_type: CommercialRuleType;
  tier_scope_priority: number | null;
  tier_count: number;
  tiebreak: "value_desc_then_priority" | "priority_desc_only";
  selected_rule_id: string | null;
};

/**
 * Step 1–6: filter is assumed done by caller. Among `candidates` (same rule_type, all matching context):
 * pick min scope tier, then tie-break inside tier only (never compare value across tiers).
 */
export function resolveWinningRuleForType(
  candidates: RuleRow[],
  context: Pick<ResolveContext, "category_ids">,
): { selected: RuleRow | null; trace: RuleResolutionTrace } {
  const ruleType = (candidates[0]?.rule_type ?? "commission") as CommercialRuleType;
  if (!candidates.length) {
    return {
      selected: null,
      trace: {
        rule_type: ruleType,
        tier_scope_priority: null,
        tier_count: 0,
        tiebreak: "priority_desc_only",
        selected_rule_id: null,
      },
    };
  }

  const minScope = Math.min(...candidates.map((r) => scopePriority(r.scope_type)));
  const tier = candidates.filter((r) => scopePriority(r.scope_type) === minScope);
  const multiCat = distinctCategoryCount(context.category_ids) > 1;
  const tierAllCategoryLike = tier.length > 0 && tier.every((r) => isCategoryLikeScope(r.scope_type));

  let sorted: RuleRow[];
  let tiebreak: RuleResolutionTrace["tiebreak"];
  if (multiCat && tierAllCategoryLike) {
    tiebreak = "value_desc_then_priority";
    sorted = [...tier].sort((a, b) => {
      const vd = Number(b.value ?? 0) - Number(a.value ?? 0);
      if (vd !== 0) return vd;
      const pr = Number(b.priority ?? 0) - Number(a.priority ?? 0);
      if (pr !== 0) return pr;
      return createdAtDescTime(a.created_at, b.created_at);
    });
  } else {
    tiebreak = "priority_desc_only";
    sorted = [...tier].sort((a, b) => {
      const pr = Number(b.priority ?? 0) - Number(a.priority ?? 0);
      if (pr !== 0) return pr;
      return createdAtDescTime(a.created_at, b.created_at);
    });
  }

  const selected = sorted[0] ?? null;
  return {
    selected,
    trace: {
      rule_type: ruleType,
      tier_scope_priority: minScope,
      tier_count: tier.length,
      tiebreak,
      selected_rule_id: selected?.id ?? null,
    },
  };
}

export function isHybridRule(rule: Pick<RuleRow, "value_type">): boolean {
  return String(rule.value_type ?? "").toLowerCase() === "hybrid";
}
