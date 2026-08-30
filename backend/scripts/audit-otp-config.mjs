/**
 * OTP configuration audit — READ ONLY. Sends nothing, writes nothing, changes nothing.
 *
 * Run it wherever the answer actually matters, which is inside the environment being
 * audited — a Render shell for production:
 *
 *   node scripts/audit-otp-config.mjs
 *
 * It reports presence and shape only. No secret, token, phone number or template value is
 * ever printed, so the output is safe to paste into a review packet.
 *
 * The verdict at the end is LEVEL 0 only: the configuration *shape* is valid. It does not
 * mean Meta was called, accepted anything, or delivered anything. Levels 1-5 need a real
 * dispatch and a delivery webhook.
 */
const provider = await import("../dist/modules/auth/whatsapp-otp.provider.js");
const delivery = await import("../dist/modules/auth/otp-delivery.service.js");
const challenge = await import("../dist/modules/auth/otp-challenge.service.js");

const { WhatsAppOtpProvider } = provider;
const { OtpDeliveryService } = delivery;
const { OtpChallengeService } = challenge;

const VARIABLES = [
  "NODE_ENV",
  "OTP_PROVIDER",
  "OTP_WHATSAPP_MODE",
  "OTP_WHATSAPP_PHONE_NUMBER_ID",
  "OTP_WHATSAPP_ACCESS_TOKEN",
  "OTP_WHATSAPP_TEMPLATE_NAME",
  "OTP_WHATSAPP_TEMPLATE_LANGUAGE",
  "OTP_WHATSAPP_TEMPLATE_TYPE",
  "OTP_WHATSAPP_API_VERSION",
  "OTP_WHATSAPP_TIMEOUT_MS",
  "OTP_HMAC_SECRET",
  "OTP_TOKEN_SECRET",
  "OTP_REQUEST_HANDLE_SECRET",
  "OTP_TTL_SECONDS",
  "OTP_RESEND_SECONDS",
  "OTP_MAX_ATTEMPTS",
  "SUPABASE_AUTH_HOOK_SECRET",
  "SUPABASE_AUTH_HOOK_TIMEOUT_MS",
];

/** Variables whose value must never influence the output beyond SET/MISSING. */
const SECRETS = new Set([
  "OTP_WHATSAPP_ACCESS_TOKEN",
  "OTP_HMAC_SECRET",
  "OTP_TOKEN_SECRET",
  "OTP_REQUEST_HANDLE_SECRET",
  "SUPABASE_AUTH_HOOK_SECRET",
]);

const TEMPLATE_TYPES = [
  "AUTH_COPY_CODE",
  "AUTH_ONE_TAP",
  "AUTH_GENERIC",
  "AUTH_COPY_CODE_NOBD",
  "AUTH_CC_NOBD",
  "AUTH_BODY_URL",
  "AUTH_ZERO_PARAM",
  "AUTH_COPY_CODE_EXPIRY",
];

const raw = (key) => process.env[key];

/** SET / MISSING / EMPTY / INVALID FORMAT — never the value itself. */
function classify(key) {
  const value = raw(key);
  if (value === undefined) return "MISSING";
  if (String(value).trim() === "") return "EMPTY";
  if (SECRETS.has(key)) return "SET";

  const trimmed = String(value).trim();
  switch (key) {
    case "NODE_ENV":
      return `SET (${trimmed})`;
    case "OTP_PROVIDER":
      return ["whatsapp", "fake", "test", "disabled"].includes(trimmed.toLowerCase())
        ? `SET (${trimmed.toLowerCase()})`
        : "INVALID FORMAT";
    case "OTP_WHATSAPP_MODE":
      return ["live", "sandbox", "disabled"].includes(trimmed.toLowerCase())
        ? `SET (${trimmed.toLowerCase()})`
        : "INVALID FORMAT";
    case "OTP_WHATSAPP_PHONE_NUMBER_ID":
      // Digits only. The id itself is not printed.
      return /^\d{5,}$/.test(trimmed) ? "SET (digits ok)" : "INVALID FORMAT";
    case "OTP_WHATSAPP_TEMPLATE_TYPE":
      return TEMPLATE_TYPES.includes(trimmed.toUpperCase())
        ? `SET (${trimmed.toUpperCase()})`
        : "INVALID FORMAT";
    case "OTP_WHATSAPP_API_VERSION":
      return /^v\d+\.\d+$/.test(trimmed) ? `SET (${trimmed})` : "INVALID FORMAT";
    case "OTP_WHATSAPP_TIMEOUT_MS": {
      const n = Number(trimmed);
      return Number.isFinite(n) && n >= 1000 && n <= 60000 ? `SET (${n}ms)` : "INVALID FORMAT";
    }
    case "SUPABASE_AUTH_HOOK_TIMEOUT_MS": {
      const n = Number(trimmed);
      // Must stay under Supabase's ~5s hook budget.
      return Number.isFinite(n) && n >= 1000 && n <= 4500 ? `SET (${n}ms)` : "INVALID FORMAT";
    }
    case "OTP_TTL_SECONDS":
    case "OTP_RESEND_SECONDS":
    case "OTP_MAX_ATTEMPTS": {
      const n = Number(trimmed);
      return Number.isFinite(n) && n > 0 ? `SET (${n})` : "INVALID FORMAT";
    }
    default:
      // Template name and language: presence only. Values are compared against Meta by a
      // human, and printing them here adds nothing.
      return "SET";
  }
}

console.log("OTP configuration audit — read only, no message is sent\n");
console.log("## Variables\n");
for (const key of VARIABLES) {
  console.log(`  ${key.padEnd(32)} ${classify(key)}`);
}

// ── Secret separation ────────────────────────────────────────────────────────
console.log("\n## Secret separation\n");
const hmac = raw("OTP_HMAC_SECRET")?.trim();
const token = raw("OTP_TOKEN_SECRET")?.trim();
const handle = raw("OTP_REQUEST_HANDLE_SECRET")?.trim();
const present = (v) => (v ? "present" : "MISSING");
console.log(`  OTP_HMAC_SECRET                  ${present(hmac)}`);
console.log(`  OTP_TOKEN_SECRET                 ${present(token)}`);
console.log(`  OTP_REQUEST_HANDLE_SECRET        ${present(handle)}`);
if (hmac && token && handle) {
  const distinct = hmac !== token && hmac !== handle && token !== handle;
  console.log(`  all three pairwise distinct      ${distinct ? "YES" : "NO — MUST DIFFER"}`);
} else {
  console.log("  all three pairwise distinct      NOT CHECKED (one or more missing)");
}

const hookSecret = raw("SUPABASE_AUTH_HOOK_SECRET")?.trim();
console.log(`  SUPABASE_AUTH_HOOK_SECRET        ${present(hookSecret)}`);
if (hookSecret && (hookSecret === hmac || hookSecret === token || hookSecret === handle)) {
  console.log("  hook secret distinct from OTP    NO — MUST DIFFER");
} else if (hookSecret) {
  console.log("  hook secret distinct from OTP    YES");
} else {
  console.log("  hook secret distinct from OTP    NOT CHECKED (missing)");
}
console.log(
  "  recipient-limit key              derived from SUPABASE_AUTH_HOOK_SECRET (no separate variable)",
);

// ── Provider config shape ────────────────────────────────────────────────────
console.log("\n## Provider configuration\n");
const configShim = { get: (key) => process.env[key] };
const whatsApp = new WhatsAppOtpProvider(configShim);
const validation = whatsApp.validateConfig();
console.log(`  WhatsAppOtpProvider.validateConfig()   ${validation.ok ? "OK" : "FAILED"}`);
if (!validation.ok) console.log(`    reason: ${validation.reason}`);

// ── Full readiness, exactly as the endpoints call it ─────────────────────────
console.log("\n## Readiness as the endpoints see it\n");
let readinessOk = true;
let readinessCode = null;
try {
  const deliveryService = new OtpDeliveryService(configShim, whatsApp);
  // Supabase is never touched by the readiness path.
  new OtpChallengeService({ client: {} }, deliveryService).assertDeliveryReady();
  console.log("  assertDeliveryReady()                 OK");
} catch (err) {
  readinessOk = false;
  readinessCode = err?.getResponse?.()?.code ?? err?.code ?? "UNKNOWN";
  console.log(`  assertDeliveryReady()                 FAILED (${readinessCode})`);
}

// ── Verdict ──────────────────────────────────────────────────────────────────
const level0 = validation.ok && readinessOk;
console.log("\n## Verdict\n");
console.log(`  ${level0 ? "LEVEL 0 — CONFIG SHAPE VALID" : "LEVEL 0 — FAILED"}`);
console.log("");
console.log("  LEVEL 0 means the configuration shape validates and the endpoints would");
console.log("  not reject on readiness. It does NOT mean the Meta API was called, that a");
console.log("  wamid came back, or that anything was sent or delivered.");
console.log("  Levels 1-2 need a real dispatch; levels 3-4 need a delivery webhook, which");
console.log("  does not exist yet; level 5 needs a human to confirm receipt.");
console.log("");

process.exit(level0 ? 0 : 1);
