/**
 * Batch 2B.1 — the staging readiness gate must fail closed and must never print values.
 *
 * The script is run as a child process with a controlled environment, because that is
 * exactly how an operator will run it. No network is involved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "check-otp-staging-readiness.mjs",
);

const STAGING_SUPABASE = "https://stagingprojectref.supabase.co";
const SECRET_VALUES = {
  OTP_HMAC_SECRET: "hmac-secret-value-aaaaaaaaaaaaaaaaaaaa",
  OTP_TOKEN_SECRET: "token-secret-value-bbbbbbbbbbbbbbbbbbb",
  OTP_REQUEST_HANDLE_SECRET: "handle-secret-value-ccccccccccccccccc",
  SUPABASE_AUTH_HOOK_SECRET: "whsec_ZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGQ=",
};
const ACCESS_TOKEN = "EAAG-fake-access-token-for-tests-only";

/** A configuration that should pass, so each test can perturb exactly one thing. */
const readyEnv = () => ({
  OTP_ENVIRONMENT: "staging",
  SUPABASE_URL: STAGING_SUPABASE,
  OTP_PROVIDER: "whatsapp",
  OTP_WHATSAPP_MODE: "sandbox",
  OTP_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  OTP_WHATSAPP_ACCESS_TOKEN: ACCESS_TOKEN,
  OTP_WHATSAPP_TEMPLATE_NAME: "DilMart_auth_otp",
  OTP_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
  OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
  OTP_WHATSAPP_API_VERSION: "v21.0",
  SUPABASE_AUTH_HOOK_TIMEOUT_MS: "4000",
  VITE_AUTH_PHONE_REGISTRATION_ENABLED: "false",
  ...SECRET_VALUES,
});

/** Runs the gate with ONLY the given variables set, so the host env cannot leak in. */
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

test("a fully configured staging environment passes", () => {
  const { code, stdout } = runGate(readyEnv());
  assert.equal(code, 0, stdout);
  assert.match(stdout, /STAGING READINESS — PASS/);
  // A pass must still refuse to be read as permission to send.
  assert.match(stdout, /NOT authorization to send a real message/);
});

test("an empty environment fails closed", () => {
  const { code, stdout } = runGate({});
  assert.equal(code, 1);
  assert.match(stdout, /STAGING READINESS — FAILED/);
});

test("OTP_ENVIRONMENT=production is refused", () => {
  const { code, stdout } = runGate(withEnv({ OTP_ENVIRONMENT: "production" }));
  assert.equal(code, 1);
  assert.match(stdout, /OTP_ENVIRONMENT must be "staging"/);
});

test("a missing OTP_ENVIRONMENT is refused", () => {
  const { code, stdout } = runGate(without("OTP_ENVIRONMENT"));
  assert.equal(code, 1);
  assert.match(stdout, /OTP_ENVIRONMENT is not set/);
});

for (const [label, overrides] of [
  ["the production Supabase project ref", { SUPABASE_URL: "https://ztplxqlthuqkuktbznbo.supabase.co" }],
  ["the production storefront host", { SITE_URL: "https://store.DilMart.org" }],
  ["the production backend host", { PUBLIC_BACKEND_URL: "https://DilMart-store-backend.onrender.com" }],
  ["a production hook URL", { OTP_HOOK_URL: "https://store.DilMart.org/api/auth/hooks/supabase/send-sms" }],
]) {
  test(`${label} is refused`, () => {
    const { code, stdout } = runGate(withEnv(overrides));
    assert.equal(code, 1);
    assert.match(stdout, /points at a production resource/);
  });
}

test("a malformed Supabase URL is refused", () => {
  const { code, stdout } = runGate(withEnv({ SUPABASE_URL: "http://localhost:54321" }));
  assert.equal(code, 1);
  assert.match(stdout, /not a well-formed Supabase project URL/);
});

test("a non-whatsapp provider is refused", () => {
  for (const provider of ["fake", "disabled", "test"]) {
    const { code, stdout } = runGate(withEnv({ OTP_PROVIDER: provider }));
    assert.equal(code, 1, `${provider} should not be accepted`);
    assert.match(stdout, /OTP_PROVIDER must be "whatsapp"/);
  }
});

test("each missing WhatsApp variable is reported", () => {
  for (const key of [
    "OTP_WHATSAPP_PHONE_NUMBER_ID",
    "OTP_WHATSAPP_ACCESS_TOKEN",
    "OTP_WHATSAPP_TEMPLATE_NAME",
    "OTP_WHATSAPP_TEMPLATE_LANGUAGE",
    "OTP_WHATSAPP_TEMPLATE_TYPE",
    "OTP_WHATSAPP_API_VERSION",
  ]) {
    const { code, stdout } = runGate(without(key));
    assert.equal(code, 1, `${key} should be required`);
    assert.match(stdout, new RegExp(`missing WhatsApp configuration:.*${key}`));
  }
});

test("a missing hook secret is refused", () => {
  const { code, stdout } = runGate(without("SUPABASE_AUTH_HOOK_SECRET"));
  assert.equal(code, 1);
  assert.match(stdout, /SUPABASE_AUTH_HOOK_SECRET is not set/);
});

test("a hook timeout outside Supabase's budget is refused", () => {
  for (const timeout of ["5000", "9000", "500", "abc"]) {
    const { code, stdout } = runGate(withEnv({ SUPABASE_AUTH_HOOK_TIMEOUT_MS: timeout }));
    assert.equal(code, 1, `${timeout} should be rejected`);
    assert.match(stdout, /SUPABASE_AUTH_HOOK_TIMEOUT_MS must be between 1000 and 4500/);
  }
});

test("reused secrets are refused", () => {
  const shared = "the-same-secret-in-two-places-xxxxxxxx";
  const { code, stdout } = runGate(
    withEnv({ OTP_HMAC_SECRET: shared, OTP_TOKEN_SECRET: shared }),
  );
  assert.equal(code, 1);
  assert.match(stdout, /pairwise distinct/);
});

test("phone registration must stay disabled", () => {
  for (const value of ["true", "1", "yes", "on", "TRUE"]) {
    const { code, stdout } = runGate(withEnv({ VITE_AUTH_PHONE_REGISTRATION_ENABLED: value }));
    assert.equal(code, 1, `${value} should be treated as enabled`);
    assert.match(stdout, /VITE_AUTH_PHONE_REGISTRATION_ENABLED is enabled/);
  }
});

test("no secret or token value is ever printed", () => {
  // Both a passing and a failing run, since failure messages are the easy place to leak.
  const outputs = [
    runGate(readyEnv()).stdout,
    runGate(withEnv({ OTP_ENVIRONMENT: "production" })).stdout,
    runGate(withEnv({ SUPABASE_URL: "https://ztplxqlthuqkuktbznbo.supabase.co" })).stdout,
  ];

  for (const stdout of outputs) {
    assert.ok(stdout.length > 0);
    for (const value of [...Object.values(SECRET_VALUES), ACCESS_TOKEN, STAGING_SUPABASE]) {
      assert.ok(!stdout.includes(value), `a configured value leaked into the output`);
    }
  }
});

test("the gate makes no network request", async () => {
  // Structural check: the script must not reference any transport at all.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(SCRIPT, "utf8");
  for (const forbidden of ["fetch(", "http.request", "https.request", "node:http", "XMLHttpRequest"]) {
    assert.ok(!source.includes(forbidden), `the readiness gate must not use ${forbidden}`);
  }
});
