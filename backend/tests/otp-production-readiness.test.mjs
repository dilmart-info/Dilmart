/**
 * The production dark-launch readiness gate.
 *
 * Run as a child process with a controlled environment, because that is how an operator
 * runs it. SUPABASE_SERVICE_ROLE_KEY is never supplied, so the database probe downgrades to
 * a warning and no network call is made.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "check-otp-production-readiness.mjs",
);

const PRODUCTION_SUPABASE = "https://ztplxqlthuqkuktbznbo.supabase.co";
const SECRET_VALUES = {
  OTP_HMAC_SECRET: "hmac-secret-value-aaaaaaaaaaaaaaaaaaaa",
  OTP_TOKEN_SECRET: "token-secret-value-bbbbbbbbbbbbbbbbbbb",
  OTP_REQUEST_HANDLE_SECRET: "handle-secret-value-ccccccccccccccccc",
  SUPABASE_AUTH_HOOK_SECRET: "whsec_ZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGQ=",
};
const ACCESS_TOKEN = "EAAG-fake-access-token-for-tests-only";

/** A dark-launch-ready production configuration, so each test perturbs exactly one thing. */
const readyEnv = () => ({
  OTP_ENVIRONMENT: "production",
  SUPABASE_URL: PRODUCTION_SUPABASE,
  PUBLIC_BACKEND_URL: "https://DilMart-store-backend.onrender.com",
  SITE_URL: "https://store.DilMart.org",
  OTP_PROVIDER: "disabled",
  OTP_WHATSAPP_MODE: "live",
  OTP_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  OTP_WHATSAPP_ACCESS_TOKEN: ACCESS_TOKEN,
  OTP_WHATSAPP_TEMPLATE_NAME: "DilMart_auth_otp",
  OTP_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
  OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
  OTP_WHATSAPP_API_VERSION: "v21.0",
  SUPABASE_AUTH_HOOK_TIMEOUT_MS: "4000",
  OTP_DURABLE_IDEMPOTENCY_REQUIRED: "true",
  VITE_AUTH_PHONE_REGISTRATION_ENABLED: "false",
  RENDER_BACKEND_ALWAYS_ON: "CONFIRMED",
  RENDER_AUTO_DEPLOY_PAUSED: "CONFIRMED",
  ...SECRET_VALUES,
});

function runGate(env) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
      encoding: "utf8",
    });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? "" };
  }
}

const withEnv = (overrides) => ({ ...readyEnv(), ...overrides });
const without = (key) => {
  const env = readyEnv();
  delete env[key];
  return env;
};

test("a dark-launch-ready production environment passes", () => {
  const { code, stdout } = runGate(readyEnv());
  assert.equal(code, 0, stdout);
  assert.match(stdout, /PRODUCTION DARK-LAUNCH READINESS — PASS/);
  assert.match(stdout, /NOT authorization to send a real message/);
});

test("an empty environment fails closed", () => {
  const { code, stdout } = runGate({});
  assert.equal(code, 1);
  assert.match(stdout, /PRODUCTION DARK-LAUNCH READINESS — FAILED/);
});

test("a non-production environment is refused", () => {
  for (const environment of ["staging", "development", "test"]) {
    const { code, stdout } = runGate(withEnv({ OTP_ENVIRONMENT: environment }));
    assert.equal(code, 1, `${environment} should not certify as production`);
    assert.match(stdout, /this gate only certifies production/);
  }
});

test("a Supabase project that is not production is refused", () => {
  const { code, stdout } = runGate(withEnv({ SUPABASE_URL: "https://stagingprojectref.supabase.co" }));
  assert.equal(code, 1);
  assert.match(stdout, /not the production Supabase project/);
});

test("a backend host that is not production is refused", () => {
  const { code, stdout } = runGate(withEnv({ PUBLIC_BACKEND_URL: "https://staging-backend.onrender.com" }));
  assert.equal(code, 1);
  assert.match(stdout, /not the production backend host/);
});

test("a fake or test provider is refused", () => {
  for (const provider of ["fake", "test"]) {
    const { code, stdout } = runGate(withEnv({ OTP_PROVIDER: provider }));
    assert.equal(code, 1, `${provider} must be forbidden in production`);
    assert.match(stdout, /is forbidden in production/);
  }
});

test("an armed whatsapp provider passes but is reported loudly", () => {
  const { code, stdout } = runGate(withEnv({ OTP_PROVIDER: "whatsapp" }));
  assert.equal(code, 0, stdout);
  assert.match(stdout, /WARN {2}OTP_PROVIDER=whatsapp — the channel is ARMED/);
});

test("missing durable idempotency is blocking", () => {
  for (const value of [undefined, "false", "0", ""]) {
    const env = value === undefined ? without("OTP_DURABLE_IDEMPOTENCY_REQUIRED") : withEnv({ OTP_DURABLE_IDEMPOTENCY_REQUIRED: value });
    const { code, stdout } = runGate(env);
    assert.equal(code, 1, `${String(value)} must not satisfy the durable requirement`);
    assert.match(stdout, /OTP_DURABLE_IDEMPOTENCY_REQUIRED must be true/);
  }
});

test("phone registration must stay disabled", () => {
  for (const value of ["true", "1", "yes", "on"]) {
    const { code, stdout } = runGate(withEnv({ VITE_AUTH_PHONE_REGISTRATION_ENABLED: value }));
    assert.equal(code, 1, `${value} should be treated as enabled`);
    assert.match(stdout, /VITE_AUTH_PHONE_REGISTRATION_ENABLED must stay false/);
  }
});

test("an enabled OTP surface flag warns that this is no longer a dark launch", () => {
  for (const key of [
    "VITE_AUTH_EMAIL_OTP_ENABLED",
    "VITE_AUTH_PHONE_OTP_ENABLED",
    "VITE_AUTH_PHONE_LINKING_ENABLED",
  ]) {
    const { code, stdout } = runGate(withEnv({ [key]: "true" }));
    assert.equal(code, 0, `${key} is a warning, not a failure`);
    assert.match(stdout, new RegExp(`OTP surface flags ENABLED: ${key}`));
  }
});

test("the Render confirmations are required", () => {
  for (const key of ["RENDER_BACKEND_ALWAYS_ON", "RENDER_AUTO_DEPLOY_PAUSED"]) {
    const { code, stdout } = runGate(without(key));
    assert.equal(code, 1, `${key} must be required`);
    assert.match(stdout, new RegExp(`${key}=CONFIRMED is required`));
  }
});

test("an unconfirmed Render value is not accepted as confirmation", () => {
  const { code } = runGate(withEnv({ RENDER_BACKEND_ALWAYS_ON: "probably" }));
  assert.equal(code, 1);
});

test("reused secrets are refused", () => {
  const shared = "the-same-secret-in-two-places-xxxxxxxx";
  const { code, stdout } = runGate(withEnv({ OTP_TOKEN_SECRET: shared, OTP_HMAC_SECRET: shared }));
  assert.equal(code, 1);
  assert.match(stdout, /pairwise distinct/);
});

test("an out-of-budget hook timeout is refused", () => {
  for (const timeout of ["5000", "300", "not-a-number"]) {
    const { code, stdout } = runGate(withEnv({ SUPABASE_AUTH_HOOK_TIMEOUT_MS: timeout }));
    assert.equal(code, 1, `${timeout} should be rejected`);
    assert.match(stdout, /must be between 1000 and 4500/);
  }
});

test("an unsupported template type is refused", () => {
  const { code, stdout } = runGate(withEnv({ OTP_WHATSAPP_TEMPLATE_TYPE: "MARKETING_BLAST" }));
  assert.equal(code, 1);
  assert.match(stdout, /supported authentication template types/);
});

test("no secret, token, url or project ref is ever printed", () => {
  const outputs = [
    runGate(readyEnv()).stdout,
    runGate({}).stdout,
    runGate(withEnv({ OTP_ENVIRONMENT: "staging" })).stdout,
    runGate(withEnv({ OTP_PROVIDER: "fake" })).stdout,
  ];

  for (const stdout of outputs) {
    assert.ok(stdout.length > 0);
    for (const value of [
      ...Object.values(SECRET_VALUES),
      ACCESS_TOKEN,
      PRODUCTION_SUPABASE,
      "ztplxqlthuqkuktbznbo",
      "123456789012345",
    ]) {
      assert.ok(!stdout.includes(value), `a configured value leaked into the output: ${value.slice(0, 12)}…`);
    }
  }
});

test("without service-role credentials the gate makes no network call", () => {
  // The only client construction is inside probeDatabase, which returns early without a key.
  const { stdout } = runGate(readyEnv());
  assert.match(stdout, /SUPABASE_SERVICE_ROLE_KEY not provided/);
  assert.doesNotMatch(stdout, /auth_hook_deliveries exists/);
});

test("the gate performs no write of any kind", () => {
  const source = readFileSync(SCRIPT, "utf8");
  for (const forbidden of [".insert(", ".update(", ".upsert(", ".delete(", "drop ", "alter "]) {
    assert.ok(!source.toLowerCase().includes(forbidden), `the gate must not contain ${forbidden}`);
  }
});
