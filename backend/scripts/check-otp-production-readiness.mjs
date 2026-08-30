/**
 * OTP production dark-launch readiness gate — READ ONLY.
 *
 * The staging gate refuses production. This is its opposite: it refuses anything that is
 * *not* production, because a "production readiness" pass obtained against some other
 * environment is worse than no pass at all.
 *
 *   OTP_ENVIRONMENT=production node scripts/check-otp-production-readiness.mjs
 *
 * With SUPABASE_SERVICE_ROLE_KEY present it additionally probes for the durable delivery
 * table, its RPC, and the profile trigger. That probe is the only network activity in this
 * file, it is read-only, and its absence downgrades those checks to WARN rather than
 * inventing a pass.
 *
 * A PASS means the configuration is shaped correctly for a dark launch: nothing enabled,
 * nothing exposed, everything present. It is NOT authorization to send a real message, and
 * it is NOT evidence that any message was ever delivered.
 */
import { createClient } from "@supabase/supabase-js";

const failures = [];
const warnings = [];
const passes = [];

const raw = (key) => process.env[key]?.trim() ?? "";
const present = (key) => raw(key).length > 0;
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);
const pass = (m) => passes.push(m);

/** The real production identifiers. Compared, never printed. */
const PRODUCTION_SUPABASE_REF = "ztplxqlthuqkuktbznbo";
const PRODUCTION_BACKEND_HOST = "DilMart-store-backend.onrender.com";
const PRODUCTION_STOREFRONT_HOST = "store.DilMart.org";

// ── 1. This must actually be production ─────────────────────────────────────
const environment = raw("OTP_ENVIRONMENT").toLowerCase();
if (environment !== "production") {
  fail(
    environment
      ? `OTP_ENVIRONMENT is "${environment}" — this gate only certifies production`
      : "OTP_ENVIRONMENT is not set",
  );
} else {
  pass("OTP_ENVIRONMENT=production");
}

// ── 2. Exact production targets ─────────────────────────────────────────────
const supabaseUrl = raw("SUPABASE_URL").toLowerCase();
if (!supabaseUrl) {
  fail("SUPABASE_URL is not set");
} else if (!supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
  fail("SUPABASE_URL is not the production Supabase project");
} else {
  pass("SUPABASE_URL is the production Supabase project");
}

const backendUrl = raw("PUBLIC_BACKEND_URL").toLowerCase();
if (!backendUrl) {
  warn("PUBLIC_BACKEND_URL is not set — the backend host could not be confirmed");
} else if (!backendUrl.includes(PRODUCTION_BACKEND_HOST)) {
  fail("PUBLIC_BACKEND_URL is not the production backend host");
} else {
  pass("PUBLIC_BACKEND_URL is the production backend host");
}

const siteUrl = raw("SITE_URL").toLowerCase();
const origins = raw("FRONTEND_ORIGINS").toLowerCase();
if (siteUrl.includes(PRODUCTION_STOREFRONT_HOST) || origins.includes(PRODUCTION_STOREFRONT_HOST)) {
  pass("the production storefront host is configured");
} else {
  warn("the production storefront host was not found in SITE_URL or FRONTEND_ORIGINS");
}

// ── 3. Provider ─────────────────────────────────────────────────────────────
//
// A dark launch wants the channel *configured* but not *armed*. Both states are acceptable
// here and they are reported differently, because "disabled" is the safe resting state and
// "whatsapp" means a real send is one authorized request away.
const provider = raw("OTP_PROVIDER").toLowerCase();
if (provider === "disabled") {
  pass("OTP_PROVIDER=disabled — the channel is configured but cannot send");
} else if (provider === "whatsapp") {
  warn("OTP_PROVIDER=whatsapp — the channel is ARMED. A hook call will send a real message.");
} else if (provider === "fake" || provider === "test") {
  fail(`OTP_PROVIDER=${provider} is forbidden in production`);
} else {
  fail(provider ? `OTP_PROVIDER=${provider} is not recognised` : "OTP_PROVIDER is not set");
}

// ── 4. WhatsApp configuration shape ─────────────────────────────────────────
const WHATSAPP_KEYS = [
  "OTP_WHATSAPP_MODE",
  "OTP_WHATSAPP_PHONE_NUMBER_ID",
  "OTP_WHATSAPP_ACCESS_TOKEN",
  "OTP_WHATSAPP_TEMPLATE_NAME",
  "OTP_WHATSAPP_TEMPLATE_LANGUAGE",
  "OTP_WHATSAPP_TEMPLATE_TYPE",
  "OTP_WHATSAPP_API_VERSION",
];
const missingWhatsApp = WHATSAPP_KEYS.filter((key) => !present(key));
if (missingWhatsApp.length) {
  fail(`missing WhatsApp configuration: ${missingWhatsApp.join(", ")}`);
} else {
  pass("all WhatsApp channel variables are present");
}

if (present("OTP_WHATSAPP_MODE") && !["sandbox", "live"].includes(raw("OTP_WHATSAPP_MODE").toLowerCase())) {
  fail('OTP_WHATSAPP_MODE must be "sandbox" or "live"');
}
if (present("OTP_WHATSAPP_API_VERSION") && !/^v\d+\.\d+$/.test(raw("OTP_WHATSAPP_API_VERSION"))) {
  fail("OTP_WHATSAPP_API_VERSION must look like v<major>.<minor>");
}

const TEMPLATE_TYPES = ["AUTH_COPY_CODE", "AUTH_ONE_TAP", "AUTH_GENERIC", "AUTH_COPY_CODE_EXPIRY"];
if (present("OTP_WHATSAPP_TEMPLATE_TYPE") && !TEMPLATE_TYPES.includes(raw("OTP_WHATSAPP_TEMPLATE_TYPE"))) {
  fail("OTP_WHATSAPP_TEMPLATE_TYPE is not one of the supported authentication template types");
}

// ── 5. Secrets ──────────────────────────────────────────────────────────────
const SECRET_KEYS = [
  "OTP_HMAC_SECRET",
  "OTP_TOKEN_SECRET",
  "OTP_REQUEST_HANDLE_SECRET",
  "SUPABASE_AUTH_HOOK_SECRET",
];
const missingSecrets = SECRET_KEYS.filter((key) => !present(key));
if (missingSecrets.length) {
  fail(`missing secrets: ${missingSecrets.join(", ")}`);
} else {
  const values = SECRET_KEYS.map((key) => raw(key));
  if (new Set(values).size !== values.length) fail("the four secrets must be pairwise distinct");
  else pass("all four secrets are present and pairwise distinct");
}

// ── 6. Hook timeout ─────────────────────────────────────────────────────────
if (present("SUPABASE_AUTH_HOOK_TIMEOUT_MS")) {
  const timeout = Number(raw("SUPABASE_AUTH_HOOK_TIMEOUT_MS"));
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 4500) {
    fail("SUPABASE_AUTH_HOOK_TIMEOUT_MS must be between 1000 and 4500");
  } else {
    pass(`SUPABASE_AUTH_HOOK_TIMEOUT_MS=${timeout}ms, inside Supabase's hook budget`);
  }
} else {
  warn("SUPABASE_AUTH_HOOK_TIMEOUT_MS unset — the 4000ms default applies");
}

// ── 7. Durable idempotency is mandatory ─────────────────────────────────────
const durableFlag = raw("OTP_DURABLE_IDEMPOTENCY_REQUIRED").toLowerCase();
if (["true", "1", "yes"].includes(durableFlag)) {
  pass("OTP_DURABLE_IDEMPOTENCY_REQUIRED=true");
} else {
  fail(
    "OTP_DURABLE_IDEMPOTENCY_REQUIRED must be true in production — without it a restart " +
      "can double-send a real message",
  );
}

// ── 8. Feature flags: nothing is enabled in a dark launch ───────────────────
const truthy = (value) => ["1", "true", "yes", "on"].includes(value);

if (truthy(raw("VITE_AUTH_PHONE_REGISTRATION_ENABLED").toLowerCase())) {
  fail("VITE_AUTH_PHONE_REGISTRATION_ENABLED must stay false — the phone identity audit is unresolved");
} else {
  pass("phone registration remains disabled");
}

const OTP_FLAGS = [
  "VITE_AUTH_EMAIL_OTP_ENABLED",
  "VITE_AUTH_PHONE_OTP_ENABLED",
  "VITE_AUTH_PHONE_LINKING_ENABLED",
];
const enabledFlags = OTP_FLAGS.filter((key) => truthy(raw(key).toLowerCase()));
if (enabledFlags.length === 0) {
  pass("every OTP surface flag is off — this is a dark launch");
} else {
  // Not a failure: enabling one is the whole point of the eventual controlled test. But it
  // must never happen by accident, so it is reported loudly.
  warn(`OTP surface flags ENABLED: ${enabledFlags.join(", ")} — this is no longer a dark launch`);
}

// ── 9. Render plan, supplied externally ─────────────────────────────────────
//
// Not discoverable from here. Render's free tier sleeps the service, and a sleeping backend
// answers a Supabase auth hook with a cold start that blows the five-second budget — the
// OTP silently never arrives. The operator confirms the plan; this only records that they did.
if (raw("RENDER_BACKEND_ALWAYS_ON").toUpperCase() === "CONFIRMED") {
  pass("RENDER_BACKEND_ALWAYS_ON confirmed by the operator");
} else {
  fail(
    "RENDER_BACKEND_ALWAYS_ON=CONFIRMED is required. A sleeping backend misses the hook " +
      "budget on cold start and the OTP never arrives.",
  );
}

if (raw("RENDER_AUTO_DEPLOY_PAUSED").toUpperCase() === "CONFIRMED") {
  pass("RENDER_AUTO_DEPLOY_PAUSED confirmed by the operator");
} else {
  fail("RENDER_AUTO_DEPLOY_PAUSED=CONFIRMED is required before pushing to main");
}

// ── 10. Database objects, when credentials allow ────────────────────────────
const serviceRoleKey = raw("SUPABASE_SERVICE_ROLE_KEY");

async function probeDatabase() {
  if (!serviceRoleKey || !supabaseUrl) {
    warn("SUPABASE_SERVICE_ROLE_KEY not provided — durable table and migration state unverified");
    return;
  }

  const client = createClient(raw("SUPABASE_URL"), serviceRoleKey, { auth: { persistSession: false } });

  // The delivery ledger. A count query touches no rows and returns no data.
  const { error: tableError } = await client
    .from("auth_hook_deliveries")
    .select("webhook_id", { count: "exact", head: true });

  if (tableError) {
    fail("auth_hook_deliveries is missing or unreadable — the durable idempotency migration is not applied");
  } else {
    pass("auth_hook_deliveries exists and is readable by the service role");
  }

  // The claim RPC. Called with a deliberately invalid argument so it validates and raises
  // without ever creating a row; only "function does not exist" is treated as missing.
  const { error: rpcError } = await client.rpc("claim_auth_hook_delivery", {
    p_webhook_id: "",
    p_payload_digest: "",
    p_owner_instance: "readiness-probe",
  });

  if (rpcError && (rpcError.code === "PGRST202" || /does not exist/i.test(rpcError.message ?? ""))) {
    fail("claim_auth_hook_delivery is missing — the durable idempotency migration is not applied");
  } else {
    // Any other error is the function rejecting an empty id, which proves it exists.
    pass("claim_auth_hook_delivery exists");
  }

  // The profile trigger migration: profiles.email must be nullable for phone-only signup.
  const { error: profileError } = await client.from("profiles").select("id", { count: "exact", head: true });
  if (profileError) {
    warn("profiles is unreadable — the phone-only signup migration state is unverified");
  } else {
    warn(
      "profiles is readable, but whether 20260731120000 (phone-only signup) is applied cannot " +
        "be determined without SQL access. Confirm with the preflight script.",
    );
  }
}

await probeDatabase();

// ── Report ──────────────────────────────────────────────────────────────────
console.log("OTP production dark-launch readiness — read only\n");

for (const line of passes) console.log(`  OK    ${line}`);
for (const line of warnings) console.log(`  WARN  ${line}`);
for (const line of failures) console.log(`  FAIL  ${line}`);

console.log("");
if (failures.length) {
  console.log(`  PRODUCTION DARK-LAUNCH READINESS — FAILED (${failures.length} blocking)`);
  console.log("");
  process.exit(1);
}

console.log("  PRODUCTION DARK-LAUNCH READINESS — PASS");
console.log("");
console.log("  This confirms the production configuration is correctly shaped for a dark");
console.log("  launch. It is NOT authorization to send a real message, and it is NOT");
console.log("  evidence that any OTP was ever delivered. A real send still requires the");
console.log("  consent and authorization gate in the operator runbook.");
console.log("");
process.exit(0);
