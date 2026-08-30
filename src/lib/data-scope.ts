export type DataScope =
  | { kind: "platform"; scope: "platform" }
  | { kind: "merchant"; scope: "merchant"; merchantId: string };

export function platformScope(): DataScope {
  return { kind: "platform", scope: "platform" };
}

export function merchantScope(merchantId: string): DataScope {
  return { kind: "merchant", scope: "merchant", merchantId };
}

export function applyScope<T extends { eq: (column: string, value: unknown) => T }>(
  query: T,
  scope: DataScope,
  merchantColumn = "merchant_id",
): T {
  if (scope.scope === "platform") return query;
  return query.eq(merchantColumn, scope.merchantId);
}

export function attachScopeToPayload<T extends Record<string, unknown>>(
  payload: T,
  scope: DataScope,
  merchantColumn = "merchant_id",
): T {
  if (scope.scope === "platform") return payload;

  const existing = payload[merchantColumn];
  if (existing && existing !== scope.merchantId) {
    throw new Error("Payload merchant mismatch for scoped write.");
  }

  return { ...payload, [merchantColumn]: scope.merchantId };
}
