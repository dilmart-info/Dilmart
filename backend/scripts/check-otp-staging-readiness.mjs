/**
 * OTP staging readiness gate — READ ONLY. Connects to nothing.
 *
 * Its whole purpose is to make it hard to point a smoke test at production by accident.
 * It inspects environment presence and shape only, prints no values, and refuses anything
 * that looks like a production target.
 *
 *   OTP_ENVIRONMENT=staging node scripts/check-otp-staging-readiness.mjs
 *
 * Exit 0 means the environment *claims* to be a correctly shaped staging target. It is not
 * evidence that Supabase, Render or Meta are configured, and it is not permission to send a
 * real message — that still needs the explicit gate in the task brief.
 */
const failures = [];
const warnings = [];
const passes = [];

const raw = (key) => process.env[key]?.trim() ?? "";
const present = (key) => raw(key).length > 0;

function fail(message) {
  failures.push(message);
}
function pass(message) {
  passes.push(message);
}

/** Anything that identifies the live deployment. Values are compared, never printed. */
const PRODUCTION_MARKERS = [
  "store.DilMart.org",
  "ztplxqlthuqkuktbznbo",
  "DilMart-store-backend.onrender.com",
];

// ── 1. The environment must declare itself as staging ────────────────────────
const environment = raw("OTP_ENVIRONMENT").toLowerCase();
if (environment !== "staging") {
  fail(
    environment
      ? `OTP_ENVIRONMENT must be "staging" — refusing to run against "${environment}"`
      : 'OTP_ENVIRONMENT is not set. Set it to "staging" on the staging service only.',
  );
} else {
  pass("OTP_ENVIRONMENT=staging");
}

// ── 2. No production target may appear anywhere in the OTP configuration ─────
const URL_KEYS = [
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "PUBLIC_BACKEND_URL",
  "SITE_URL",
  "OTP_HOOK_URL",
];

let productionMarkerSeen = false;
for (const key of URL_KEYS) {
  const value = raw(key).toLowerCase();
  if (!value) continue;
  for (const marker of PRODUCTION_MARKERS) {
    if (value.includes(marker)) {
      productionMarkerSeen = true;
      // The marker name is safe to show; the full URL is not printed.
      fail(`${key} points at a production resource — staging must be fully isolated`);
    }
  }
}
if (!productionMarkerSeen) pass("no production host or project ref found in the OTP URLs");

if (!present("SUPABASE_URL")) {
  fail("SUPABASE_URL is not set — the staging Supabase project URL is required");
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(raw("SUPABASE_URL"))) {
  fail("SUPABASE_URL is not a well-formed Supabase project URL");
} else {
  pass("SUPABASE_URL is a well-formed, non-production Supabase project URL");
}

// ── 3. Provider must be the real WhatsApp channel ────────────────────────────
const provider = raw("OTP_PROVIDER").toLowerCase();
if (provider !== "whatsapp") {
  fail(
    provider
      ? `OTP_PROVIDER must be "whatsapp" for a staging smoke — got "${provider}"`
      : "OTP_PROVIDER is not set",
  );
} else {
  pass("OTP_PROVIDER=whatsapp");
}

const mode = raw("OTP_WHATSAPP_MODE").toLowerCase();
if (!["sandbox", "live"].includes(mode)) {
  fail('OTP_WHATSAPP_MODE must be "sandbox" or "live"');
} else {
  pass(`OTP_WHATSAPP_MODE=${mode}`);
}

// ── 4. WhatsApp channel variables ────────────────────────────────────────────
const WHATSAPP_KEYS = [
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

if (present("OTP_WHATSAPP_API_VERSION") && !/^v\d+\.\d+$/.test(raw("OTP_WHATSAPP_API_VERSION"))) {
  fail("OTP_WHATSAPP_API_VERSION must look like v<major>.<minor>");
}

// ── 5. Hook configuration ────────────────────────────────────────────────────
if (!present("SUPABASE_AUTH_HOOK_SECRET")) {
  fail("SUPABASE_AUTH_HOOK_SECRET is not set — the Send SMS hook cannot verify signatures");
} else {
  pass("SUPABASE_AUTH_HOOK_SECRET is present");
}

if (present("SUPABASE_AUTH_HOOK_TIMEOUT_MS")) {
  const timeout = Number(raw("SUPABASE_AUTH_HOOK_TIMEOUT_MS"));
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 4500) {
    fail("SUPABASE_AUTH_HOOK_TIMEOUT_MS must be between 1000 and 4500");
  } else {
    pass(`SUPABASE_AUTH_HOOK_TIMEOUT_MS=${timeout}ms, inside Supabase's hook budget`);
  }
} else {
  warnings.push("SUPABASE_AUTH_HOOK_TIMEOUT_MS unset — the 4000ms default applies");
}

// ── 6. Secrets present and pairwise distinct ─────────────────────────────────
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
  const distinct = new Set(values).size === values.length;
  if (!distinct) fail("the four secrets must be pairwise distinct");
  else pass("all four secrets are present and pairwise distinct");
}

// ── 7. Phone registration must stay closed ───────────────────────────────────
const phoneRegistration = raw("VITE_AUTH_PHONE_REGISTRATION_ENABLED").toLowerCase();
if (["1", "true", "yes", "on"].includes(phoneRegistration)) {
  fail(
    "VITE_AUTH_PHONE_REGISTRATION_ENABLED is enabled — it must stay false until the phone " +
      "identity audit is reviewed and a fresh decision is taken",
  );
} else {
  pass("phone registration remains disabled");
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log("OTP staging readiness — read only, nothing was contacted\n");

for (const line of passes) console.log(`  OK    ${line}`);
for (const line of warnings) console.log(`  WARN  ${line}`);
for (const line of failures) console.log(`  FAIL  ${line}`);

console.log("");
if (failures.length) {
  console.log(`  STAGING READINESS — FAILED (${failures.length} blocking)`);
  console.log("");
  console.log("  Nothing may be smoke-tested against this environment.");
  process.exit(1);
}

console.log("  STAGING READINESS — PASS");
console.log("");
console.log("  This confirms the environment declares itself staging, is isolated from the");
console.log("  production host and project, and carries a well-shaped OTP configuration.");
console.log("  It does NOT confirm Supabase, Render or Meta are actually configured, and it");
console.log("  is NOT authorization to send a real message.");
console.log("");
process.exit(0);
