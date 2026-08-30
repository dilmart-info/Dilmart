/**
 * In-memory stand-in for the auth_hook_deliveries table and its RPCs.
 *
 * It mirrors the state machine in
 * supabase/migrations/20260731150000_auth_hook_durable_idempotency.sql so the service, the
 * hook and the cross-instance behaviour can be exercised without a database. Node is
 * single-threaded, so the "atomic" operations are naturally atomic here; what the fake
 * proves is that the *decisions* are correct, not that Postgres locks correctly.
 *
 * The SQL itself is unverified until the migration is applied somewhere. That is stated in
 * the closure report rather than papered over.
 */

/** Shared store — hand the same instance to two services to simulate two backend pods. */
export function createDeliveryTable() {
  return { rows: new Map(), clock: { now: Date.now() } };
}

const nowOf = (table) => table.clock.now;

/**
 * Builds a fake Supabase client exposing exactly the surface
 * AuthHookIdempotencyService uses: .rpc(name, args) and .from(...).select(...).eq(...).maybeSingle().
 */
export function createFakeSupabaseClient(table, options = {}) {
  const { failRpc = null } = options;

  const rpc = async (name, args) => {
    if (failRpc && (failRpc === true || failRpc === name)) {
      return { data: null, error: { code: "PGRST202", message: "function not found" } };
    }

    switch (name) {
      case "claim_auth_hook_delivery":
        return { data: [claim(table, args)], error: null };
      case "complete_auth_hook_delivery":
        return { data: transition(table, args, "SUCCEEDED"), error: null };
      case "fail_auth_hook_delivery":
        return { data: transition(table, args, "FAILED"), error: null };
      case "mark_auth_hook_delivery_uncertain":
        return { data: transition(table, args, "UNCERTAIN"), error: null };
      case "cleanup_expired_auth_hook_deliveries":
        return { data: [cleanup(table, args)], error: null };
      default:
        return { data: null, error: { code: "PGRST202", message: `unknown rpc ${name}` } };
    }
  };

  const from = (relation) => ({
    select: () => ({
      eq: (column, value) => ({
        maybeSingle: async () => {
          if (relation !== "auth_hook_deliveries" || column !== "webhook_id") {
            return { data: null, error: { code: "42P01" } };
          }
          const row = table.rows.get(value);
          return { data: row ? { state: row.state } : null, error: null };
        },
      }),
    }),
  });

  return { rpc, from };
}

function claim(table, args) {
  const {
    p_webhook_id: id,
    p_payload_digest: digest,
    p_owner_instance: owner,
    p_lease_seconds: lease = 30,
    p_ttl_seconds: ttl = 86400,
    p_max_attempts: maxAttempts = 3,
  } = args;

  const now = nowOf(table);
  const existing = table.rows.get(id);

  // Fast path: the insert wins.
  if (!existing) {
    table.rows.set(id, {
      webhook_id: id,
      payload_digest: digest,
      state: "IN_FLIGHT",
      owner_instance: owner,
      provider_message_id: null,
      attempt_count: 1,
      last_error_code: null,
      created_at: now,
      updated_at: now,
      started_at: now,
      completed_at: null,
      lease_expires_at: now + lease * 1000,
      expires_at: now + ttl * 1000,
    });
    return { status: "CLAIMED", attempt_count: 1, provider_message_id: null };
  }

  if (existing.payload_digest !== digest) {
    return { status: "CONFLICT", attempt_count: existing.attempt_count, provider_message_id: null };
  }

  if (existing.state === "SUCCEEDED") {
    return {
      status: "SUCCEEDED",
      attempt_count: existing.attempt_count,
      provider_message_id: existing.provider_message_id,
    };
  }

  if (existing.state === "UNCERTAIN") {
    return { status: "UNCERTAIN", attempt_count: existing.attempt_count, provider_message_id: null };
  }

  if (existing.state === "IN_FLIGHT") {
    if (existing.lease_expires_at !== null && existing.lease_expires_at > now) {
      return { status: "IN_FLIGHT", attempt_count: existing.attempt_count, provider_message_id: null };
    }
    // Lease died without a completion — the owner crashed or was redeployed mid-call.
    existing.state = "UNCERTAIN";
    existing.last_error_code = existing.last_error_code ?? "LEASE_EXPIRED";
    existing.owner_instance = null;
    existing.lease_expires_at = null;
    existing.updated_at = now;
    return { status: "UNCERTAIN", attempt_count: existing.attempt_count, provider_message_id: null };
  }

  // FAILED (or the reserved RECEIVED): nothing was delivered, bounded retry is safe.
  if (existing.attempt_count >= maxAttempts) {
    return { status: "EXHAUSTED", attempt_count: existing.attempt_count, provider_message_id: null };
  }

  existing.state = "IN_FLIGHT";
  existing.owner_instance = owner;
  existing.attempt_count += 1;
  existing.started_at = now;
  existing.completed_at = null;
  existing.lease_expires_at = now + lease * 1000;
  existing.expires_at = now + ttl * 1000;
  existing.updated_at = now;
  return { status: "CLAIMED", attempt_count: existing.attempt_count, provider_message_id: null };
}

function transition(table, args, target) {
  const { p_webhook_id: id, p_owner_instance: owner } = args;
  const row = table.rows.get(id);
  const now = nowOf(table);

  // Only the lease holder may move the row, and only out of IN_FLIGHT.
  if (!row || row.state !== "IN_FLIGHT" || row.owner_instance !== owner) return false;

  row.state = target;
  row.completed_at = now;
  row.lease_expires_at = null;
  row.updated_at = now;

  if (target === "SUCCEEDED") {
    row.provider_message_id = args.p_provider_message_id ?? null;
    row.last_error_code = null;
  } else {
    row.last_error_code = args.p_error_code ?? null;
  }
  return true;
}

function cleanup(table, args) {
  const retentionDays = args?.p_uncertain_retention_days ?? 30;
  const now = nowOf(table);
  let retired = 0;
  let deleted = 0;

  for (const row of table.rows.values()) {
    if (row.state === "IN_FLIGHT" && row.lease_expires_at !== null && row.lease_expires_at < now) {
      row.state = "UNCERTAIN";
      row.last_error_code = row.last_error_code ?? "LEASE_EXPIRED";
      row.owner_instance = null;
      row.lease_expires_at = null;
      row.updated_at = now;
      retired += 1;
    }
  }

  for (const [id, row] of [...table.rows]) {
    if ((row.state === "SUCCEEDED" || row.state === "FAILED") && row.expires_at < now) {
      table.rows.delete(id);
      deleted += 1;
    } else if (
      row.state === "UNCERTAIN" &&
      row.updated_at < now - retentionDays * 24 * 60 * 60 * 1000
    ) {
      table.rows.delete(id);
      deleted += 1;
    }
  }

  let kept = 0;
  for (const row of table.rows.values()) if (row.state === "UNCERTAIN") kept += 1;

  return { leases_retired: retired, rows_deleted: deleted, uncertain_kept: kept };
}

/** Minimal SupabaseAdminService substitute. */
export const fakeSupabaseAdmin = (client) => ({ client });

/**
 * A durable collaborator that reports the store as not required, so the hook keeps its
 * in-memory path. Used by the suites written before the ledger existed.
 */
export const inMemoryDurableStub = () => ({
  isRequired: () => false,
  instanceId: "test-in-memory",
});
