/**
 * Housekeeping for the durable Send SMS delivery ledger.
 *
 * Retires leases whose owner died, deletes finished rows past their expiry, and keeps
 * UNCERTAIN rows — the record of deliveries nobody can account for — for review.
 *
 * Deliberately a command rather than an in-process cron. The backend runs one instance
 * today; a scheduled job inside every pod would have every pod racing the same sweep, and
 * this is maintenance, not a hot path.
 *
 *   ALLOW_AUTH_HOOK_CLEANUP=true node scripts/cleanup-auth-hook-deliveries.mjs [--dry-run]
 *
 * Refuses to run without the gate, so it cannot fire by accident from a deploy script.
 * Prints counts only — never a webhook id, never a digest.
 */
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

if ((process.env.ALLOW_AUTH_HOOK_CLEANUP || "").trim().toLowerCase() !== "true") {
  console.error("Refusing to run: set ALLOW_AUTH_HOOK_CLEANUP=true to authorize this maintenance job.");
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error("Refusing to run: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const retentionDays = Number((process.env.AUTH_HOOK_UNCERTAIN_RETENTION_DAYS || "30").trim());
if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 365) {
  console.error("Refusing to run: AUTH_HOOK_UNCERTAIN_RETENTION_DAYS must be between 1 and 365.");
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });

if (dryRun) {
  // Read-only preview. Counts by state, nothing mutated.
  const { data, error } = await client.from("auth_hook_deliveries").select("state, expires_at, lease_expires_at");
  if (error) {
    console.error(`Cleanup preview failed (${error.code ?? "query"}).`);
    process.exit(1);
  }

  const now = Date.now();
  const counts = {};
  let staleLeases = 0;
  let expiredFinished = 0;
  for (const row of data ?? []) {
    counts[row.state] = (counts[row.state] ?? 0) + 1;
    if (row.state === "IN_FLIGHT" && row.lease_expires_at && Date.parse(row.lease_expires_at) < now) {
      staleLeases += 1;
    }
    if (
      (row.state === "SUCCEEDED" || row.state === "FAILED") &&
      Date.parse(row.expires_at) < now
    ) {
      expiredFinished += 1;
    }
  }

  console.log("Auth hook delivery ledger — dry run, nothing was changed\n");
  for (const [state, count] of Object.entries(counts).sort()) {
    console.log(`  ${state.padEnd(10)} ${count}`);
  }
  console.log(`\n  would retire ${staleLeases} expired lease(s) to UNCERTAIN`);
  console.log(`  would delete ${expiredFinished} finished row(s)`);
  process.exit(0);
}

const { data, error } = await client.rpc("cleanup_expired_auth_hook_deliveries", {
  p_uncertain_retention_days: retentionDays,
});

if (error) {
  console.error(`Cleanup failed (${error.code ?? "rpc"}).`);
  process.exit(1);
}

const row = Array.isArray(data) ? data[0] : data;
console.log("Auth hook delivery cleanup complete\n");
console.log(`  leases retired to UNCERTAIN  ${row?.leases_retired ?? 0}`);
console.log(`  finished rows deleted        ${row?.rows_deleted ?? 0}`);
console.log(`  UNCERTAIN rows kept          ${row?.uncertain_kept ?? 0}`);

if ((row?.uncertain_kept ?? 0) > 0) {
  console.log("\n  UNCERTAIN rows are deliveries whose outcome was never established.");
  console.log("  They are kept on purpose. Review them before assuming OTP delivery is healthy.");
}
