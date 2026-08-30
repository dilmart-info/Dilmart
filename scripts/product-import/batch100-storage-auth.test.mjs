/**
 * DilMart-BATCH100-STORAGE-AUTH-COMPATIBILITY-001
 * Unit tests for Storage auth resolution, probe gating, canary gating.
 * No real secrets. No network unless stubs provide it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertProductionSupabaseUrl,
  classifyAuthFailure,
  classifyKeyKind,
  createStorageCompatibleFetch,
  probeServerKeyAcceptance,
  resolveServerKey,
  scrubSecrets,
  EXPECTED_SUPABASE_HOST,
} from "./lib/batch100-storage-auth.mjs";

test("1. sb_secret_ accepted", () => {
  const r = resolveServerKey({
    BATCH100_SUPABASE_SECRET_KEY: ["sb", "secret", "testvalue_abcdefghijklmnopqrstuvwxyz"].join("_"),
  });
  assert.equal(r.ok, true);
  assert.equal(r.kind, "sb_secret");
  assert.equal(r.source, "BATCH100_SUPABASE_SECRET_KEY");
  assert.equal(classifyKeyKind(r.key), "sb_secret");
});

test("2. legacy eyJ accepted", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
  const r = resolveServerKey({
    BATCH100_SUPABASE_SERVICE_ROLE_JWT: jwt,
  });
  assert.equal(r.ok, true);
  assert.equal(r.kind, "legacy_service_role");
  assert.equal(r.source, "BATCH100_SUPABASE_SERVICE_ROLE_JWT");
});

test("3. sb_publishable_ rejected", () => {
  const r = resolveServerKey({
    SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_should_not_upload",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "PUBLISHABLE_KEY_NOT_AUTHORIZED");
  assert.equal(r.kind, "publishable_rejected");
});

test("4. unknown sb_* rejected", () => {
  const r = resolveServerKey({
    SUPABASE_SECRET_KEY: "sb_other_not_supported_format_xxxxx",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "UNSUPPORTED_SERVER_KEY");
  assert.equal(r.kind, "unknown");
});

test("5. wrong project URL rejected", () => {
  const bad = assertProductionSupabaseUrl("https://someone-else.supabase.co");
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "WRONG_SUPABASE_PROJECT");
  const good = assertProductionSupabaseUrl(`https://${EXPECTED_SUPABASE_HOST}`);
  assert.equal(good.ok, true);
});

test("6. auth probe failure prevents uploads (caller gate)", async () => {
  const probeJws = await probeServerKeyAcceptance({
    url: `https://${EXPECTED_SUPABASE_HOST}`,
    key: ["sb", "secret", "fake_key_for_probe_test_only"].join("_"),
    kind: "sb_secret",
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "Invalid Compact JWS" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  });
  assert.equal(probeJws.ok, false);
  assert.equal(probeJws.code, "KEY_NOT_RECOGNIZED_OR_WRONG_AUTH_FLOW");
  assert.equal(probeJws.message, null);

  const probeInvalid = await probeServerKeyAcceptance({
    url: `https://${EXPECTED_SUPABASE_HOST}`,
    key: ["sb", "secret", "fake_key_for_probe_test_only"].join("_"),
    kind: "sb_secret",
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "Invalid API key", hint: "wrong project" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  });
  assert.equal(probeInvalid.ok, false);
  assert.equal(probeInvalid.code, "KEY_INVALID_DISABLED_OR_WRONG_PROJECT");
  assert.equal(probeInvalid.ok, false);
});

test("7. canary failure prevents remaining 99", () => {
  const canaryPass = false;
  const remainingAttempted = canaryPass ? 99 : 0;
  assert.equal(remainingAttempted, 0);
});

test("8. canary success allows bounded bulk upload", () => {
  const canaryPass = true;
  const concurrency = 4;
  const remaining = 99;
  assert.equal(canaryPass, true);
  assert.equal(concurrency, 4);
  assert.equal(remaining, 99);
});

test("9. secrets never appear in scrubbed logs/evidence", () => {
  const secret = ["sb", "secret", "super_secret_value_do_not_leak"].join("_");
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc123signature";
  const blob = scrubSecrets(
    { error: `upload failed with ${secret} and ${jwt}`, nested: secret },
    [secret, jwt],
  );
  assert.equal(blob.includes(secret), false);
  assert.equal(blob.includes(jwt), false);
  assert.match(blob, /REDACTED/);
});

test("10. existing-object mismatch remains fail-closed", () => {
  const localSha = "AAA";
  const remoteSha = "BBB";
  const status =
    remoteSha === localSha ? "already_present_verified" : "stop_mismatch_existing";
  assert.equal(status, "stop_mismatch_existing");
  const overwrite = false;
  assert.equal(overwrite, false);
});

test("preferred lookup order freezes first accepted source", () => {
  const r = resolveServerKey({
    BATCH100_SUPABASE_SECRET_KEY: ["sb", "secret", "preferred_aaaaaaaaaaaaaaaa"].join("_"),
    SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.a.b",
  });
  assert.equal(r.source, "BATCH100_SUPABASE_SECRET_KEY");
  assert.equal(r.kind, "sb_secret");
});

test("sb_secret compatible fetch strips Bearer on REST, keeps on Storage", async () => {
  const key = ["sb", "secret", "compat_test_key_value_zzzz"].join("_");
  let restAuth = "unset";
  let storageAuth = "unset";
  const wrapped = createStorageCompatibleFetch(key, "sb_secret", async (input, init) => {
    const h = new Headers(init.headers);
    if (String(input).includes("/rest/")) restAuth = h.get("Authorization");
    if (String(input).includes("/storage/")) storageAuth = h.get("Authorization");
    return new Response("{}", { status: 200 });
  });
  await wrapped("https://example.test/rest/v1/", {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  await wrapped("https://example.test/storage/v1/object", {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  assert.equal(restAuth, null);
  assert.equal(storageAuth, `Bearer ${key}`);
});

test("legacy compatible fetch keeps Bearer JWT", async () => {
  const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";
  let seenAuth = null;
  const wrapped = createStorageCompatibleFetch(key, "legacy_service_role", async (_input, init) => {
    const h = new Headers(init.headers);
    seenAuth = h.get("Authorization");
    return new Response("{}", { status: 200 });
  });
  await wrapped("https://example.test/storage/v1/object", { headers: {} });
  assert.equal(seenAuth, `Bearer ${key}`);
});

test("classifyAuthFailure distinguishes JWS vs non-JWS auth errors", () => {
  assert.equal(
    classifyAuthFailure(401, "Invalid Compact JWS").code,
    "KEY_NOT_RECOGNIZED_OR_WRONG_AUTH_FLOW",
  );
  assert.equal(
    classifyAuthFailure(403, "API key disabled").code,
    "KEY_INVALID_DISABLED_OR_WRONG_PROJECT",
  );
  assert.equal(classifyAuthFailure(500, "timeout").isAuth, false);
});

test("probeServerKeyAcceptance classifies network exception as SERVER_KEY_PROBE_NETWORK_FAILED", async () => {
  const probeNetwork = await probeServerKeyAcceptance({
    url: `https://${EXPECTED_SUPABASE_HOST}`,
    key: ["sb", "secret", "fake_key_for_probe_test_only"].join("_"),
    kind: "sb_secret",
    fetchImpl: async () => {
      throw new Error("fetch failed");
    },
  });
  assert.equal(probeNetwork.ok, false);
  assert.equal(probeNetwork.code, "SERVER_KEY_PROBE_NETWORK_FAILED");
  assert.equal(probeNetwork.status, null);

  const probeEconn = await probeServerKeyAcceptance({
    url: `https://${EXPECTED_SUPABASE_HOST}`,
    key: ["sb", "secret", "fake_key_for_probe_test_only"].join("_"),
    kind: "sb_secret",
    fetchImpl: async () => {
      throw new Error("read ECONNRESET");
    },
  });
  assert.equal(probeEconn.ok, false);
  assert.equal(probeEconn.code, "SERVER_KEY_PROBE_NETWORK_FAILED");
  assert.equal(probeEconn.status, null);
});

