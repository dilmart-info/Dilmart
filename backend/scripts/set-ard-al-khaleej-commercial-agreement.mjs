#!/usr/bin/env node
/**
 * Idempotent operator script — set Ard Al Khaleej's (ارض الخليج) negotiated platform
 * commission to 12% through the Merchant Commercial Agreement admin API.
 *
 * Identifies the merchant by its stable slug ("arth-al-khaleg", per
 * docs/product-import/ard-al-khaleej/README.md) instead of a hardcoded UUID, so this script
 * still works even if the merchant row is ever recreated. It goes through the same guarded
 * admin API + `admin_schedule_merchant_commercial_term` RPC as the admin UI — no direct table
 * writes, no bypass of validation/overlap-prevention.
 *
 * SAFE BY DEFAULT: dry-run unless --execute is passed. Skips (idempotent no-op) if the merchant
 * already has a current explicit commission agreement at exactly 12%.
 *
 * This script is NOT run as part of this task/PR — it is prepared for a deliberate, separate
 * Production rollout step after merge, run by someone with an admin access token.
 *
 * Usage:
 *   STORE_API_BASE_URL=https://DilMart-store-backend.onrender.com/api \
 *   ADMIN_ACCESS_TOKEN=eyJ... \
 *   node backend/scripts/set-ard-al-khaleej-commercial-agreement.mjs [--execute] [--effective-from=2026-11-01]
 */

const MERCHANT_SLUG = "arth-al-khaleg";
const TARGET_COMMISSION_RATE = 12;

// Mirrors src/lib/baghdad-time.ts (kept in sync manually — separate build targets, no shared
// package between the frontend and backend/scripts in this repo). A bare "YYYY-MM-DD" here means
// "00:00 on that date in Asia/Baghdad" (Iraq is fixed UTC+3, no DST assumed), not UTC midnight —
// only a fully-qualified timestamp (with an explicit Z/offset) is taken as the operator's literal
// intent and parsed as-is.
const BAGHDAD_UTC_OFFSET = "+03:00";
function toEffectiveInstant(rawValue) {
  const bareDate = /^\d{4}-\d{2}-\d{2}$/.test(rawValue);
  const parsed = new Date(bareDate ? `${rawValue}T00:00:00${BAGHDAD_UTC_OFFSET}` : rawValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

const baseUrl = String(process.env.STORE_API_BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const token = process.env.ADMIN_ACCESS_TOKEN ?? process.env.ACCESS_TOKEN;
const execute = process.argv.includes("--execute");
const effectiveFromArg = process.argv.find((a) => a.startsWith("--effective-from="));
let effectiveFrom = new Date().toISOString();
if (effectiveFromArg) {
  const rawValue = effectiveFromArg.split("=")[1] ?? "";
  const converted = toEffectiveInstant(rawValue);
  if (converted === null) {
    console.error(`Invalid --effective-from value: "${rawValue}". Expected an ISO date, e.g. 2026-11-01.`);
    process.exit(1);
  }
  effectiveFrom = converted;
}

if (!token) {
  console.error("Set ADMIN_ACCESS_TOKEN (Supabase access token for a super_admin/admin user).");
  process.exit(1);
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

// 1. Resolve the merchant by slug — never hardcode the UUID.
const allMerchants = await api("/merchants");
const merchant = (Array.isArray(allMerchants) ? allMerchants : []).find((m) => m.slug === MERCHANT_SLUG);
if (!merchant) {
  console.error(`No merchant found with slug "${MERCHANT_SLUG}". Refusing to guess an id.`);
  process.exit(1);
}
console.log(`Resolved merchant: ${merchant.display_name ?? merchant.id} (id=${merchant.id}, status=${merchant.status})`);

// 2. Idempotency check — skip if already at the target rate.
const agreement = await api(`/admin/merchants/${merchant.id}/commercial-agreement`);
const currentRate = agreement.current?.commission?.value ?? null;
if (agreement.has_explicit_agreement && currentRate === TARGET_COMMISSION_RATE) {
  console.log(`Already set: current commission is ${currentRate}%. Nothing to do.`);
  process.exit(0);
}
console.log(
  agreement.has_explicit_agreement
    ? `Current commission: ${currentRate}%. Will schedule ${TARGET_COMMISSION_RATE}% effective ${effectiveFrom}.`
    : `No explicit agreement yet. Will create ${TARGET_COMMISSION_RATE}% effective ${effectiveFrom}.`,
);

// 3. Apply (or preview) the change. Only the commission field is touched — assisted/platform
//    fee and delivery billing mode are intentionally left as-is (not part of the 12% decision).
const payload = { commission_rate: TARGET_COMMISSION_RATE, effective_from: effectiveFrom };

if (!execute) {
  console.log("DRY RUN — no change applied. Re-run with --execute to apply.");
  console.log("Would POST:", JSON.stringify(payload, null, 2));
  process.exit(0);
}

const result = await api(`/admin/merchants/${merchant.id}/commercial-agreement`, {
  method: "POST",
  body: JSON.stringify(payload),
});
console.log("Applied. New agreement state:", JSON.stringify(result.current, null, 2));
