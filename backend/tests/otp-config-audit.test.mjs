/**
 * Tests for the read-only OTP configuration audit tool.
 *
 * The tool exists so an operator can run it inside a Render shell and paste the output
 * into a review packet. That only works if two things hold: the verdict is honest, and no
 * secret value can ever reach the output. Both are asserted here.
 *
 * Nothing in this file sends a message or touches a network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(backendRoot, "scripts", "audit-otp-config.mjs");

const SECRET_VALUES = {
  OTP_WHATSAPP_ACCESS_TOKEN: "TOKENVALUE-must-never-be-printed",
  OTP_HMAC_SECRET: "HMACVALUE-must-never-be-printed",
  OTP_TOKEN_SECRET: "TOKENSECRET-must-never-be-printed",
  OTP_REQUEST_HANDLE_SECRET: "HANDLEVALUE-must-never-be-printed",
};

const FULL_CONFIG = {
  NODE_ENV: "production",
  OTP_PROVIDER: "whatsapp",
  OTP_WHATSAPP_MODE: "live",
  OTP_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  OTP_WHATSAPP_TEMPLATE_NAME: "DilMart_auth_code",
  OTP_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
  OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
  OTP_WHATSAPP_API_VERSION: "v21.0",
  OTP_WHATSAPP_TIMEOUT_MS: "12000",
  OTP_TTL_SECONDS: "300",
  OTP_RESEND_SECONDS: "60",
  OTP_MAX_ATTEMPTS: "5",
  ...SECRET_VALUES,
};

/** Runs the audit with a clean env and captures output plus exit code. */
function runAudit(overrides) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ...overrides,
  };
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT], {
      cwd: backendRoot,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("an unconfigured environment reports LEVEL 0 — FAILED and exits non-zero", () => {
  const { code, stdout } = runAudit({});
  assert.equal(code, 1);
  assert.match(stdout, /LEVEL 0 — FAILED/);
  assert.match(stdout, /OTP_PROVIDER\s+MISSING/);
});

test("a fully configured environment reports LEVEL 0 — CONFIG SHAPE VALID and exits zero", () => {
  const { code, stdout } = runAudit(FULL_CONFIG);
  assert.equal(code, 0);
  assert.match(stdout, /LEVEL 0 — CONFIG SHAPE VALID/);
  assert.match(stdout, /all three pairwise distinct\s+YES/);
});

test("no secret value ever appears in the output", () => {
  for (const overrides of [FULL_CONFIG, {}]) {
    const { stdout } = runAudit(overrides);
    for (const value of Object.values(SECRET_VALUES)) {
      assert.ok(!stdout.includes(value), `audit output leaked a secret value`);
    }
    assert.ok(!stdout.includes("must-never-be-printed"));
  }
});

test("secrets are reported as presence only, never with a shape hint", () => {
  const { stdout } = runAudit(FULL_CONFIG);
  // A secret line must be exactly SET, never SET (something).
  for (const key of Object.keys(SECRET_VALUES)) {
    const line = stdout.split("\n").find((l) => l.trim().startsWith(key));
    assert.ok(line, `${key} missing from the report`);
    assert.match(line.trim(), new RegExp(`^${key}\\s+SET$`));
  }
});

test("reusing one secret across purposes is reported as a failure", () => {
  const { code, stdout } = runAudit({
    ...FULL_CONFIG,
    OTP_REQUEST_HANDLE_SECRET: FULL_CONFIG.OTP_HMAC_SECRET,
  });
  assert.equal(code, 1);
  assert.match(stdout, /all three pairwise distinct\s+NO — MUST DIFFER/);
  assert.match(stdout, /LEVEL 0 — FAILED/);
});

test("a fake provider in production is reported as a failure", () => {
  const { code, stdout } = runAudit({ ...FULL_CONFIG, OTP_PROVIDER: "fake" });
  assert.equal(code, 1);
  assert.match(stdout, /OTP_PROVIDER_FORBIDDEN_IN_PRODUCTION/);
  assert.match(stdout, /LEVEL 0 — FAILED/);
});

test("malformed values are reported as INVALID FORMAT rather than silently accepted", () => {
  const { stdout } = runAudit({
    ...FULL_CONFIG,
    OTP_WHATSAPP_PHONE_NUMBER_ID: "not-digits",
    OTP_WHATSAPP_API_VERSION: "21",
    OTP_WHATSAPP_TIMEOUT_MS: "50",
    OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_SOMETHING_ELSE",
  });
  for (const key of [
    "OTP_WHATSAPP_PHONE_NUMBER_ID",
    "OTP_WHATSAPP_API_VERSION",
    "OTP_WHATSAPP_TIMEOUT_MS",
    "OTP_WHATSAPP_TEMPLATE_TYPE",
  ]) {
    const line = stdout.split("\n").find((l) => l.trim().startsWith(key));
    assert.match(line, /INVALID FORMAT/, `${key} was not flagged`);
  }
});

test("the verdict never claims delivery", () => {
  const { stdout } = runAudit(FULL_CONFIG);

  // No claim-shaped statement may appear. The word itself is allowed inside the
  // disclaimer and in the assertDeliveryReady() label, neither of which asserts that a
  // message reached anyone.
  const CLAIMS = [
    /\bwas delivered\b/i,
    /\bmessage delivered\b/i,
    /\bdelivery confirmed\b/i,
    /\bsuccessfully delivered\b/i,
    // The verdict line has the form "LEVEL n — ...". Only level 0 may ever be awarded
    // here; the plain phrase "levels 3-4" inside the disclaimer is not a verdict.
    /LEVEL\s*[1-5]\s*—/i,
  ];
  for (const claim of CLAIMS) {
    assert.ok(!claim.test(stdout), `audit output made a delivery claim: ${claim}`);
  }

  // And the disclaimer must actually be present, so a reader cannot mistake LEVEL 0 for
  // proof of delivery.
  assert.match(stdout, /does NOT mean the Meta API was called/i);
  assert.match(stdout, /levels 3-4 need a delivery webhook, which/i);
});
