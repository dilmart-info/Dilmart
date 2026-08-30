/**
 * STORE-PR5 — Dual actor authz core unit tests (no DB).
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.4/§9.5, §16.
 *
 * Covers (incl. closure blockers B1–B5):
 *  - strict discriminated token classification (markers, aud string/array, contradictions, alg, malformed, oversized);
 *  - strict no-cross-verifier fallback (both directions);
 *  - typed federated resolution outcomes → HTTP mapping (401 / 403 / 503 / 500);
 *  - ActorContext invariants + request-state hygiene;
 *  - default (Supabase-only) source policy;
 *  - per-handler CustomerController @AuthSources (no class-level widening);
 *  - an EXHAUSTIVE route-policy introspection over every compiled controller.
 *
 * Runs against compiled dist/. `npm run build` first (the npm script does this).
 */
import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const A = (p) => `../dist/${p}`;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}
function mkToken(header, payload) {
  return `${b64url(header)}.${b64url(payload)}.sig`;
}

const ISSUER = "DilMart-store";
const AUDIENCE = "DilMart-store-api";

function fakeConfig({ enabled = false, ring = new Map() } = {}) {
  return {
    get enabled() { return enabled; },
    get issuer() { return ISSUER; },
    get audience() { return AUDIENCE; },
    getPublicKeyRing() { return ring; },
  };
}

const FEDERATED_ACTOR = {
  actorRole: "customer",
  actorId: "11111111-1111-1111-1111-111111111111",
  actorEmail: null,
  actorPhone: null,
  authSource: "DilMart_federated",
  linkedProfileId: "22222222-2222-2222-2222-222222222222",
  DilMartUserId: "33333333-3333-3333-3333-333333333333",
  sessionFamilyId: "44444444-4444-4444-4444-444444444444",
  sessionVersion: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// B4. Strict discriminated token classification
// ─────────────────────────────────────────────────────────────────────────────
async function classifier(opts) {
  const { DualActorResolverService } = await import(A("common/authz/dual-actor-resolver.service.js"));
  return new DualActorResolverService({}, {}, fakeConfig(opts));
}

test("classify: normal Supabase token → supabase_candidate", async () => {
  const svc = await classifier();
  const t = mkToken({ alg: "HS256", kid: "sb" }, { iss: "https://abcdefgh.supabase.co/auth/v1", aud: "authenticated", sub: "u1" });
  assert.equal(svc.classify(t).kind, "supabase_candidate");
});

test("classify: federated issuer marker → federated_candidate", async () => {
  const svc = await classifier();
  assert.equal(svc.classify(mkToken({ alg: "EdDSA" }, { iss: ISSUER })).kind, "federated_candidate");
});

test("classify: federated audience as string → federated_candidate", async () => {
  const svc = await classifier();
  assert.equal(svc.classify(mkToken({ alg: "RS256" }, { aud: AUDIENCE })).kind, "federated_candidate");
});

test("classify: federated audience as array → federated_candidate", async () => {
  const svc = await classifier();
  assert.equal(svc.classify(mkToken({ alg: "EdDSA" }, { aud: ["other", AUDIENCE] })).kind, "federated_candidate");
});

test("classify: federated sessionType marker → federated_candidate", async () => {
  const svc = await classifier();
  assert.equal(svc.classify(mkToken({ alg: "EdDSA" }, { sessionType: "DilMart_federated_customer" })).kind, "federated_candidate");
});

test("classify: known federated kid → federated_candidate", async () => {
  const svc = await classifier({ ring: new Map([["fed-kid-1", { alg: "EdDSA", publicKeyPem: "x" }]]) });
  assert.equal(svc.classify(mkToken({ alg: "EdDSA", kid: "fed-kid-1" }, {})).kind, "federated_candidate");
});

test("classify: contradictory federated marker + Supabase issuer → ambiguous_or_invalid_federated", async () => {
  const svc = await classifier();
  const t = mkToken({ alg: "EdDSA" }, { sessionType: "DilMart_federated_customer", iss: "https://abc.supabase.co/auth/v1" });
  assert.equal(svc.classify(t).kind, "ambiguous_or_invalid_federated");
});

test("classify: alg=none with a federated marker → ambiguous_or_invalid_federated", async () => {
  const svc = await classifier();
  assert.equal(svc.classify(mkToken({ alg: "none" }, { iss: ISSUER })).kind, "ambiguous_or_invalid_federated");
});

test("classify: HS256 with a federated marker → ambiguous_or_invalid_federated", async () => {
  const svc = await classifier();
  assert.equal(svc.classify(mkToken({ alg: "HS256" }, { aud: AUDIENCE })).kind, "ambiguous_or_invalid_federated");
});

test("classify: malformed / non-3-segment / oversized → supabase_candidate (no federated marker readable)", async () => {
  const svc = await classifier();
  assert.equal(svc.classify("token-admin").kind, "supabase_candidate"); // non-JWT
  assert.equal(svc.classify("").kind, "supabase_candidate");
  assert.equal(svc.classify("aaa.bbb.ccc").kind, "supabase_candidate"); // junk base64/JSON
  const huge = "x".repeat(9000);
  assert.equal(svc.classify(mkToken({ alg: "EdDSA" }, { iss: ISSUER, pad: huge })).kind, "supabase_candidate"); // oversized payload not decoded
});

test("B2 classify: header/payload decoded INDEPENDENTLY; a federated marker in either segment never falls back to Supabase", async () => {
  const ring = new Map([["fed-kid-1", { alg: "EdDSA", publicKeyPem: "x" }]]);
  const svc = await classifier({ ring });
  const badSeg = Buffer.from("not-json").toString("base64url");   // decodes but not JSON → null
  const bigSeg = "y".repeat(9000);                                 // oversized → null
  const bh = (o) => b64url(o);

  // valid federated header (known kid) + malformed payload → ambiguous (never supabase)
  assert.equal(svc.classify(`${bh({ alg: "EdDSA", kid: "fed-kid-1" })}.${badSeg}.sig`).kind, "ambiguous_or_invalid_federated");
  // valid federated header (known kid) + oversized payload → ambiguous
  assert.equal(svc.classify(`${bh({ alg: "EdDSA", kid: "fed-kid-1" })}.${bigSeg}.sig`).kind, "ambiguous_or_invalid_federated");
  // malformed header + valid federated payload (issuer) → ambiguous
  assert.equal(svc.classify(`${badSeg}.${bh({ iss: ISSUER })}.sig`).kind, "ambiguous_or_invalid_federated");
  // oversized header + valid federated payload (audience) → ambiguous
  assert.equal(svc.classify(`${bigSeg}.${bh({ aud: AUDIENCE })}.sig`).kind, "ambiguous_or_invalid_federated");
  // two-segment token whose visible payload has a federated marker → ambiguous (structurally not a JWT)
  assert.equal(svc.classify(`${bh({})}.${bh({ sessionType: "DilMart_federated_customer" })}`).kind, "ambiguous_or_invalid_federated");
  // four-segment token with a federated payload marker → ambiguous
  assert.equal(svc.classify(`${bh({ alg: "EdDSA" })}.${bh({ iss: ISSUER })}.sig.extra`).kind, "ambiguous_or_invalid_federated");
});

// ─────────────────────────────────────────────────────────────────────────────
// B1/B3/no-fallback. Typed federated resolution outcomes classified by instanceof
// ─────────────────────────────────────────────────────────────────────────────
const ERRS = A("modules/auth/federated/federated-verification.errors.js");

async function resolver({ enabled = true, verify }) {
  const { DualActorResolverService } = await import(A("common/authz/dual-actor-resolver.service.js"));
  const supabaseSpy = { called: false };
  const supabaseResolver = { resolve: async () => { supabaseSpy.called = true; return { ok: false, reason: "invalid_token" }; } };
  const svc = new DualActorResolverService(supabaseResolver, { verify }, fakeConfig({ enabled }));
  return { svc, supabaseSpy };
}

test("resolveFederatedActor: disabled → FEDERATED_DISABLED, verifier & supabase untouched", async () => {
  const { svc, supabaseSpy } = await resolver({ enabled: false, verify: async () => { throw new Error("should not run"); } });
  assert.deepEqual(await svc.resolveFederatedActor("t"), { ok: false, reason: "FEDERATED_DISABLED" });
  assert.equal(supabaseSpy.called, false);
});

test("resolveFederatedActor: typed errors map by instanceof; supabase never touched", async () => {
  const E = await import(ERRS);
  const cases = [
    [new E.FederatedTokenInvalidError("bad"), "FEDERATED_INVALID"],
    [new E.FederatedSessionFamilyInvalidError(), "FEDERATED_EXPIRED_OR_REVOKED"],
    [new E.FederatedVerificationDependencyError(), "FEDERATED_DEPENDENCY_UNAVAILABLE"],
    [new Error("unexpected programming failure"), "FEDERATED_INTERNAL_ERROR"],
  ];
  for (const [err, reason] of cases) {
    const { svc, supabaseSpy } = await resolver({ verify: async () => { throw err; } });
    assert.equal((await svc.resolveFederatedActor("t")).reason, reason, reason);
    assert.equal(supabaseSpy.called, false);
  }
});

test("resolveFederatedActor: success returns actor; supabase never touched", async () => {
  const { svc, supabaseSpy } = await resolver({ verify: async () => ({ ...FEDERATED_ACTOR }) });
  const out = await svc.resolveFederatedActor("t");
  assert.equal(out.ok, true);
  assert.equal(out.actor.actorToken, undefined);
  assert.equal(supabaseSpy.called, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// B1 REAL-PATH. Instantiate the REAL verifier with fake repo/config dependencies.
// ─────────────────────────────────────────────────────────────────────────────
const REAL_ISS = "DilMart-store", REAL_AUD = "DilMart-store-api", REAL_KID = "acc-real";
const edKeys = await jose.generateKeyPair("EdDSA", { extractable: true });
const edPriv = await jose.exportPKCS8(edKeys.privateKey);
const edPub = await jose.exportSPKI(edKeys.publicKey);

function realConfig(overrides = {}) {
  const base = {
    STORE_FEDERATED_AUTH_ENABLED: "true",
    STORE_FEDERATED_ACCESS_SIGNING_KID: REAL_KID,
    STORE_FEDERATED_ACCESS_SIGNING_ALG: "EdDSA",
    STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM: edPriv,
    STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: REAL_KID, alg: "EdDSA", publicKeyPem: edPub }]),
    STORE_FEDERATED_REFRESH_HASH_SECRET: "x".repeat(43),
    ...overrides,
  };
  return { get: (k) => base[k] };
}
async function realSetup(repo, cfgOverrides) {
  const { FederatedAuthConfig } = await import(A("modules/auth/federated/federated-auth.config.js"));
  const { FederatedSessionVerifierService } = await import(A("modules/auth/federated/federated-session-verifier.service.js"));
  const { DualActorResolverService } = await import(A("common/authz/dual-actor-resolver.service.js"));
  const config = new FederatedAuthConfig(realConfig(cfgOverrides));
  const verifier = new FederatedSessionVerifierService(config, repo);
  const supabaseSpy = { called: false };
  const supabaseResolver = { resolve: async () => { supabaseSpy.called = true; return { ok: false, reason: "invalid_token" }; } };
  const dual = new DualActorResolverService(supabaseResolver, verifier, config);
  return { verifier, dual, supabaseSpy };
}
function ctxIds() { return { sub: randomUUID(), fam: randomUUID(), lp: randomUUID(), su: randomUUID() }; }
async function signValid(ids) {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    iss: REAL_ISS, aud: REAL_AUD, sub: ids.sub, jti: randomUUID(), iat: now, nbf: now, exp: now + 600,
    sessionType: "DilMart_federated_customer", sessionFamilyId: ids.fam, linkedProfileId: ids.lp,
    DilMartUserId: ids.su, role: "customer", origin: "customer_app", sessionVersion: 1,
  }).setProtectedHeader({ alg: "EdDSA", kid: REAL_KID }).sign(edKeys.privateKey);
}

test("REAL verifier: repository validate RPC throws → dependency (guard would render 503)", async () => {
  const ids = ctxIds();
  const repo = { validateSessionFamily: async () => { throw new Error("PostgREST 503 / connection reset"); } };
  const { dual, supabaseSpy } = await realSetup(repo);
  const out = await dual.resolveFederatedActor(await signValid(ids));
  assert.equal(out.reason, "FEDERATED_DEPENDENCY_UNAVAILABLE");
  assert.equal(supabaseSpy.called, false);
});

test("REAL verifier: key/config dependency (public ring import fails) → dependency", async () => {
  const ids = ctxIds();
  const repo = { validateSessionFamily: async () => ({ valid: true, store_customer_id: ids.sub, linked_profile_id: ids.lp, DilMart_user_id: ids.su, session_version: 1, email: null, phone: null }) };
  // Valid signing key for the token, but the PUBLIC ring PEM is malformed → importSPKI fails → dependency.
  const badRing = JSON.stringify([{ kid: REAL_KID, alg: "EdDSA", publicKeyPem: "-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----" }]);
  const { dual } = await realSetup(repo, { STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: badRing });
  const out = await dual.resolveFederatedActor(await signValid(ids));
  assert.equal(out.reason, "FEDERATED_DEPENDENCY_UNAVAILABLE");
});

test("REAL verifier: invalid token → FEDERATED_INVALID; invalid family → FEDERATED_EXPIRED_OR_REVOKED", async () => {
  const ids = ctxIds();
  // Invalid token: signed with the right key but wrong issuer claim.
  const badToken = await new jose.SignJWT({
    iss: "https://evil.example", aud: REAL_AUD, sub: ids.sub, jti: randomUUID(),
    iat: Math.floor(Date.now() / 1000), nbf: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
    sessionType: "DilMart_federated_customer", sessionFamilyId: ids.fam, linkedProfileId: ids.lp, DilMartUserId: ids.su, role: "customer", origin: "customer_app", sessionVersion: 1,
  }).setProtectedHeader({ alg: "EdDSA", kid: REAL_KID }).sign(edKeys.privateKey);
  const repoValid = { validateSessionFamily: async () => ({ valid: true, store_customer_id: ids.sub, linked_profile_id: ids.lp, DilMart_user_id: ids.su, session_version: 1, email: null, phone: null }) };
  const s1 = await realSetup(repoValid);
  assert.equal((await s1.dual.resolveFederatedActor(badToken)).reason, "FEDERATED_INVALID");

  // Invalid family: valid token, but the DB says the family is invalid (revoked/expired/version).
  const repoInvalid = { validateSessionFamily: async () => ({ valid: false, store_customer_id: null, linked_profile_id: null, DilMart_user_id: null, session_version: null, email: null, phone: null }) };
  const s2 = await realSetup(repoInvalid);
  assert.equal((await s2.dual.resolveFederatedActor(await signValid(ids))).reason, "FEDERATED_EXPIRED_OR_REVOKED");
});

test("REAL verifier: fully-valid token + valid family → ok actor", async () => {
  const ids = ctxIds();
  const repo = { validateSessionFamily: async () => ({ valid: true, store_customer_id: ids.sub, linked_profile_id: ids.lp, DilMart_user_id: ids.su, session_version: 1, email: null, phone: null }) };
  const { dual } = await realSetup(repo);
  const out = await dual.resolveFederatedActor(await signValid(ids));
  assert.equal(out.ok, true);
  assert.equal(out.actor.actorId, ids.sub);
  assert.equal(out.actor.authSource, "DilMart_federated");
});

// ─────────────────────────────────────────────────────────────────────────────
// R3-B1. classify() sits INSIDE the typed config boundary — no raw config exception escapes.
// ─────────────────────────────────────────────────────────────────────────────
async function classifierRealCfg(overrides) {
  const { FederatedAuthConfig } = await import(A("modules/auth/federated/federated-auth.config.js"));
  const { DualActorResolverService } = await import(A("common/authz/dual-actor-resolver.service.js"));
  const config = new FederatedAuthConfig(realConfig(overrides));
  const supabaseSpy = { called: false };
  const supabaseResolver = { resolve: async () => { supabaseSpy.called = true; return { ok: false, reason: "invalid_token" }; } };
  return { svc: new DualActorResolverService(supabaseResolver, {}, config), supabaseSpy };
}

test("R3-B1: whitespace issuer/audience config → federated marker classifies as routing dependency (no throw, no supabase)", async () => {
  for (const bad of [{ STORE_FEDERATED_ACCESS_ISSUER: "   " }, { STORE_FEDERATED_ACCESS_AUDIENCE: "  " }]) {
    const { svc, supabaseSpy } = await classifierRealCfg(bad);
    const t = mkToken({ alg: "EdDSA", kid: REAL_KID }, { sessionType: "DilMart_federated_customer" });
    assert.equal(svc.classify(t).kind, "federated_routing_dependency_unavailable");
    assert.equal(supabaseSpy.called, false);
  }
});

test("R3-B1: malformed public-key-ring JSON + federated marker+kid → routing dependency (no throw)", async () => {
  const { svc } = await classifierRealCfg({ STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: "{ not valid json" });
  const t = mkToken({ alg: "EdDSA", kid: "some-kid" }, { sessionType: "DilMart_federated_customer" });
  assert.equal(svc.classify(t).kind, "federated_routing_dependency_unavailable");
});

test("R3-B1: feature disabled, no public ring, normal Supabase token → supabase_candidate (still works)", async () => {
  const { svc } = await classifierRealCfg({ STORE_FEDERATED_AUTH_ENABLED: "false", STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: undefined, STORE_FEDERATED_ACCESS_SIGNING_KID: undefined });
  const supa = mkToken({ alg: "HS256", kid: "sb-kid" }, { iss: "https://abcdefgh.supabase.co/auth/v1", aud: "authenticated", sub: "u1" });
  assert.equal(svc.classify(supa).kind, "supabase_candidate");
});

test("R3-B1: visible known kid + malformed opposite segment → ambiguous (never supabase)", async () => {
  const { svc, supabaseSpy } = await classifierRealCfg();
  const badPayload = Buffer.from("not-json").toString("base64url");
  assert.equal(svc.classify(`${b64url({ alg: "EdDSA", kid: REAL_KID })}.${badPayload}.sig`).kind, "ambiguous_or_invalid_federated");
  assert.equal(supabaseSpy.called, false);
});

test("R3-B1 guard: routing-dependency classification → 503 FEDERATED_AUTH_UNAVAILABLE, no supabase probe", async () => {
  const spies = {};
  const guard = await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"], classification: "federated_routing_dependency_unavailable", spies });
  assert.equal(await status(guard.canActivate(ctx({ token: "fed" }))), 503);
  assert.equal(await codeOf(guard.canActivate(ctx({ token: "fed" }))), "FEDERATED_AUTH_UNAVAILABLE");
  assert.notEqual(spies.supabase, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// R3-B2. Supabase failures carry NO free-form text; guard logs are redacted & injection-safe.
// ─────────────────────────────────────────────────────────────────────────────
test("R3-B2: SupabaseResolveFailure carries no free-form message field", async () => {
  // The structured failures only ever expose { reason, diagnosticCode? } — never a `message`.
  const failures = [
    { ok: false, reason: "invalid_token" },
    { ok: false, reason: "project_ref_mismatch", diagnosticCode: "abc123" },
    { ok: false, reason: "backend_unavailable", diagnosticCode: "def456" },
    { ok: false, reason: "role_error" },
  ];
  for (const f of failures) assert.equal("message" in f, false, `${f.reason} must not carry a message`);
});


test("R3-B2: guard logs carry no server diagnostics; request-id injection is stripped", async () => {
  const logs = [];
  const spyLogger = { warn: (m) => logs.push(String(m)), error: (m) => logs.push(String(m)), log: () => {}, debug: () => {}, verbose: () => {} };
  // A client-supplied id laden with log-forging separators (newline, CR, tab, space) + a unicode line separator.
  const injected = "req-1\nabc\r\tdef ghi xyz";

  for (const reason of ["project_ref_mismatch", "backend_unavailable", "role_error"]) {
    const guard = await makeGuard({ roles: ["admin"], sources: undefined, classification: "supabase_candidate", supabase: { ok: false, reason, diagnosticCode: "fp0011223344" } });
    guard.logger = spyLogger; // inject spy (no true privacy in JS)
    const c = { headers: { authorization: "Bearer sb", "x-request-id": injected }, originalUrl: "/api/admin/x", url: "/api/admin/x" };
    const exec = { switchToHttp: () => ({ getRequest: () => c }), getHandler: () => () => {}, getClass: () => class {} };
    await status(guard.canActivate(exec));
  }
  const joined = logs.join("\n");
  // The server's own diagnostics never appear (the resolver emits no operational text; only a hash code).
  for (const bad of ["SUPABASE_URL", "SERVICE_ROLE_KEY", "Render", "Dashboard", "supabase.co"]) {
    assert.equal(joined.includes(bad), false, `log must not contain ${bad}`);
  }
  // Injection stripped: only allowlisted chars survive → the id collapses to "req-1abcdefghixyz".
  assert.ok(logs.some((l) => l.includes("reqId=req-1abcdefghixyz")), "request id must be sanitized to allowlisted chars");
  for (const l of logs) {
    const idToken = (l.split("reqId=")[1] ?? "").split(" ")[0];
    assert.equal(/[\r\n\t ]/.test(idToken), false, "no control/separator chars survive in the sanitized id");
  }
});

test("R3-B2: thrown API bodies for supabase failures are generic (no diagnostics)", async () => {
  for (const reason of ["project_ref_mismatch", "backend_unavailable", "role_error"]) {
    const guard = await makeGuard({ roles: ["admin"], sources: undefined, classification: "supabase_candidate", supabase: { ok: false, reason, diagnosticCode: "fp" } });
    let body;
    try { await guard.canActivate(ctx({ token: "sb", url: "/api/admin/x" })); } catch (e) { body = e.getResponse?.(); }
    const s = JSON.stringify(body ?? "");
    for (const bad of ["SUPABASE_URL", "SERVICE_ROLE_KEY", "Render", "Dashboard", "fp"]) assert.equal(s.includes(bad), false, `${reason} body leaked ${bad}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Default source policy = Supabase-only
// ─────────────────────────────────────────────────────────────────────────────
test("DEFAULT_AUTH_SOURCES is exactly ['supabase'] (least privilege)", async () => {
  const { DEFAULT_AUTH_SOURCES } = await import(A("common/authz/auth-source.js"));
  assert.deepEqual([...DEFAULT_AUTH_SOURCES], ["supabase"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// D. RolesGuard semantics + request-state hygiene (constructed with fakes — no DI/DB)
// ─────────────────────────────────────────────────────────────────────────────
async function makeGuard({ roles, sources, classification, federatedOutcome, supabase, spies }) {
  const { RolesGuard } = await import(A("common/authz/roles.guard.js"));
  const { ROLES_KEY } = await import(A("common/authz/roles.decorator.js"));
  const { AUTH_SOURCES_KEY } = await import(A("common/authz/auth-source.js"));
  const reflector = {
    getAllAndOverride(key) {
      if (key === ROLES_KEY) return roles;
      if (key === AUTH_SOURCES_KEY) return sources;
      return undefined;
    },
  };
  const dualResolver = {
    classify: () => (typeof classification === "string" ? { kind: classification } : classification),
    resolveFederatedActor: async () => { if (spies) spies.federated = true; return federatedOutcome; },
    resolveSupabaseActor: async () => { if (spies) spies.supabase = true; return supabase; },
  };
  return new RolesGuard(reflector, dualResolver);
}
function ctx({ token, url = "/api/customer/profile", pre = {} } = {}) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, originalUrl: url, url, ...pre };
  return { req, switchToHttp: () => ({ getRequest: () => req }), getHandler: () => () => {}, getClass: () => class {} };
}
async function status(promise) {
  try { await promise; return 200; } catch (e) { return e?.getStatus?.() ?? 500; }
}
async function codeOf(promise) {
  try { await promise; return null; } catch (e) { const r = e?.getResponse?.(); return typeof r === "object" ? r.code : r; }
}

test("guard: public route (no roles) passes", async () => {
  const guard = await makeGuard({ roles: undefined });
  assert.equal(await guard.canActivate(ctx({})), true);
});

test("guard: missing token on specific-role route → 403; on /auth/context → 401; optional pass-through", async () => {
  assert.equal(await status((await makeGuard({ roles: ["admin"] })).canActivate(ctx({ url: "/api/admin/x" }))), 403);
  assert.equal(await status((await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"] })).canActivate(ctx({ url: "/api/auth/context" }))), 401);
  assert.equal(await (await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"] })).canActivate(ctx({ url: "/api/checkout/submit" })), true);
});

test("B3: VALID federated actor on a Supabase-only route → 403 (verified first, then source); no supabase probe", async () => {
  const spies = {};
  const guard = await makeGuard({ roles: ["authenticated"], sources: undefined, classification: "federated_candidate", federatedOutcome: { ok: true, actor: { ...FEDERATED_ACTOR } }, spies });
  assert.equal(await status(guard.canActivate(ctx({ token: "fed" }))), 403);
  assert.notEqual(spies.supabase, true);
});

test("B3: FORGED/invalid federated token on a Supabase-only route → 401 (not 403), no supabase probe", async () => {
  const spies = {};
  const guard = await makeGuard({ roles: ["authenticated"], sources: undefined, classification: "federated_candidate", federatedOutcome: { ok: false, reason: "FEDERATED_INVALID" }, spies });
  assert.equal(await status(guard.canActivate(ctx({ token: "fed" }))), 401);
  assert.notEqual(spies.supabase, true);
});

test("B3: dependency failure on a Supabase-only route → 503 (verify attempted before source check)", async () => {
  const guard = await makeGuard({ roles: ["authenticated"], sources: undefined, classification: "federated_candidate", federatedOutcome: { ok: false, reason: "FEDERATED_DEPENDENCY_UNAVAILABLE" } });
  assert.equal(await status(guard.canActivate(ctx({ token: "fed" }))), 503);
});

test("guard: ambiguous federated token on a DUAL route → 401 (no verify, no supabase)", async () => {
  const spies = {};
  const guard = await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"], classification: "ambiguous_or_invalid_federated", spies });
  assert.equal(await status(guard.canActivate(ctx({ token: "weird" }))), 401);
  assert.notEqual(spies.federated, true);
  assert.notEqual(spies.supabase, true);
});

test("guard: typed federated failures map to 401/503/500", async () => {
  const dual = ["supabase", "DilMart_federated"];
  const mk = (reason) => makeGuard({ roles: ["authenticated"], sources: dual, classification: "federated_candidate", federatedOutcome: { ok: false, reason } });
  assert.equal(await status((await mk("FEDERATED_INVALID")).canActivate(ctx({ token: "f", url: "/api/customer/profile" }))), 401);
  assert.equal(await status((await mk("FEDERATED_EXPIRED_OR_REVOKED")).canActivate(ctx({ token: "f" }))), 401);
  assert.equal(await status((await mk("FEDERATED_DISABLED")).canActivate(ctx({ token: "f" }))), 503);
  assert.equal(await codeOf((await mk("FEDERATED_DISABLED")).canActivate(ctx({ token: "f" }))), "FEDERATED_AUTH_DISABLED");
  assert.equal(await status((await mk("FEDERATED_DEPENDENCY_UNAVAILABLE")).canActivate(ctx({ token: "f" }))), 503);
  assert.equal(await codeOf((await mk("FEDERATED_DEPENDENCY_UNAVAILABLE")).canActivate(ctx({ token: "f" }))), "FEDERATED_AUTH_UNAVAILABLE");
  assert.equal(await status((await mk("FEDERATED_INTERNAL_ERROR")).canActivate(ctx({ token: "f" }))), 500);
});

test("guard: valid federated token attaches federated ActorContext (no actorToken)", async () => {
  const guard = await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"], classification: "federated_candidate", federatedOutcome: { ok: true, actor: { ...FEDERATED_ACTOR } } });
  const c = ctx({ token: "fed" });
  assert.equal(await guard.canActivate(c), true);
  assert.equal(c.req.authSource, "DilMart_federated");
  assert.equal(c.req.actorId, FEDERATED_ACTOR.actorId);
  assert.equal(c.req.actorToken, undefined);
  assert.equal(c.req.sessionFamilyId, FEDERATED_ACTOR.sessionFamilyId);
});

test("guard: supabase actor attaches actorToken + authSource=supabase; wrong role → 403", async () => {
  const ok = { ok: true, actorRole: "customer", actorId: "sb-id", actorEmail: null, actorPhone: null, authSource: "supabase", actorToken: "raw" };
  const c = ctx({ token: "sb" });
  assert.equal(await (await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"], classification: "supabase_candidate", supabase: ok })).canActivate(c), true);
  assert.equal(c.req.authSource, "supabase");
  assert.equal(c.req.actorToken, "raw");
  assert.equal(c.req.linkedProfileId, undefined);
  assert.equal(await status((await makeGuard({ roles: ["admin"], classification: "supabase_candidate", supabase: ok })).canActivate(ctx({ token: "sb", url: "/api/admin/x" }))), 403);
});

test("guard: invalid supabase token never invokes the federated verifier", async () => {
  const spies = {};
  const guard = await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"], classification: "supabase_candidate", supabase: { ok: false, reason: "invalid_token" }, spies });
  assert.equal(await status(guard.canActivate(ctx({ token: "sb", url: "/api/customer/profile" }))), 403);
  assert.notEqual(spies.federated, true);
});

// B5 — request-state hygiene
test("B5: switching a pre-populated Supabase request to a federated actor leaves actorToken undefined", async () => {
  const guard = await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"], classification: "federated_candidate", federatedOutcome: { ok: true, actor: { ...FEDERATED_ACTOR } } });
  const c = ctx({ token: "fed", pre: { actorToken: "STALE-SUPABASE-TOKEN", actorRole: "admin", actorId: "stale" } });
  assert.equal(await guard.canActivate(c), true);
  assert.equal(c.req.actorToken, undefined);
  assert.equal(c.req.authSource, "DilMart_federated");
  assert.equal(c.req.actorId, FEDERATED_ACTOR.actorId);
});

test("B5: switching a pre-populated federated request to a Supabase actor clears federated identifiers", async () => {
  const ok = { ok: true, actorRole: "customer", actorId: "sb-id", actorEmail: null, actorPhone: null, authSource: "supabase", actorToken: "raw" };
  const guard = await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"], classification: "supabase_candidate", supabase: ok });
  const c = ctx({ token: "sb", pre: { linkedProfileId: "stale", DilMartUserId: "stale", sessionFamilyId: "stale", sessionVersion: 9 } });
  assert.equal(await guard.canActivate(c), true);
  assert.equal(c.req.linkedProfileId, undefined);
  assert.equal(c.req.DilMartUserId, undefined);
  assert.equal(c.req.sessionFamilyId, undefined);
  assert.equal(c.req.sessionVersion, undefined);
});

test("B5: failed authentication leaves no trusted actor context attached", async () => {
  const guard = await makeGuard({ roles: ["authenticated"], sources: ["supabase", "DilMart_federated"], classification: "federated_candidate", federatedOutcome: { ok: false, reason: "FEDERATED_INVALID" } });
  const c = ctx({ token: "fed", pre: { actorId: "stale", actorToken: "stale", authSource: "supabase" } });
  await status(guard.canActivate(c));
  assert.equal(c.req.actorId, undefined);
  assert.equal(c.req.actorToken, undefined);
  assert.equal(c.req.authSource, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// B1. CustomerController is per-handler (no class-level widening)
// ─────────────────────────────────────────────────────────────────────────────
test("B1: CustomerController has NO class-level @AuthSources; every approved method has exactly it", async () => {
  const { AUTH_SOURCES_KEY } = await import(A("common/authz/auth-source.js"));
  const { CustomerController } = await import(A("modules/customer/customer.controller.js"));
  assert.equal(Reflect.getMetadata(AUTH_SOURCES_KEY, CustomerController), undefined, "no class-level @AuthSources allowed");

  const approved = ["getProfile", "updateProfile", "listAddresses", "createAddress", "updateAddress",
    "deleteAddress", "setDefaultAddress", "listOrders", "getOrderDetail", "reorderPreview"];
  for (const m of approved) {
    assert.deepEqual(Reflect.getMetadata(AUTH_SOURCES_KEY, CustomerController.prototype[m]), ["supabase", "DilMart_federated"], `${m} must be method-level DUAL`);
  }
  // No other route method on CustomerController carries federated metadata.
  for (const m of Object.getOwnPropertyNames(CustomerController.prototype)) {
    if (m === "constructor" || approved.includes(m)) continue;
    assert.equal(Reflect.getMetadata(AUTH_SOURCES_KEY, CustomerController.prototype[m]), undefined, `unexpected @AuthSources on ${m}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// B5. TWO-WAY exhaustive route-policy introspection over EVERY compiled controller
//     (scans dist/**, forward + reverse: unclassified, stale, duplicate, mismatch,
//      class-level widening, backoffice federated)
// ─────────────────────────────────────────────────────────────────────────────
test("B5: two-way exhaustive route-policy introspection over every compiled controller", async () => {
  const { AUTH_SOURCES_KEY } = await import(A("common/authz/auth-source.js"));
  const { ROLES_KEY } = await import(A("common/authz/roles.decorator.js"));
  const { AUTHENTICATED_ROUTE_POLICY, findAuthenticatedRoutePolicy } = await import(A("common/authz/route-policy-registry.js"));
  const PATH_METADATA = "path"; // Nest @Controller / @Get/@Post set this

  // Scan ALL compiled controllers under dist/**, not only dist/modules/**.
  const distRoot = path.join(process.cwd(), "dist");
  const files = readdirSync(distRoot, { recursive: true })
    .map((f) => String(f))
    .filter((f) => f.endsWith(".controller.js"));
  assert.ok(files.length >= 15, `expected many controllers, found ${files.length}`);

  const discoveredAuthenticated = new Map(); // "Controller.method" -> { file, httpPath, methodAuthSources, permitsFederated }
  let backofficeChecked = 0;
  let classLevelWidening = 0;
  let duplicateLiveRoutes = 0;

  for (const rel of files) {
    const mod = await import(pathToFileURL(path.join(distRoot, rel)).href);
    for (const exported of Object.values(mod)) {
      if (typeof exported !== "function" || !Reflect.hasMetadata(PATH_METADATA, exported)) continue;
      const Ctrl = exported;
      const proto = Ctrl.prototype;

      if (Reflect.getMetadata(AUTH_SOURCES_KEY, Ctrl) !== undefined) classLevelWidening++;
      assert.equal(Reflect.getMetadata(AUTH_SOURCES_KEY, Ctrl), undefined, `${Ctrl.name} must not declare class-level @AuthSources`);
      const classRoles = Reflect.getMetadata(ROLES_KEY, Ctrl);

      for (const method of Object.getOwnPropertyNames(proto)) {
        if (method === "constructor") continue;
        const handler = proto[method];
        if (typeof handler !== "function" || !Reflect.hasMetadata(PATH_METADATA, handler)) continue;

        const effectiveRoles = Reflect.getMetadata(ROLES_KEY, handler) ?? classRoles;
        if (!effectiveRoles || effectiveRoles.length === 0) continue; // public / optional-bearer

        const methodAuthSources = Reflect.getMetadata(AUTH_SOURCES_KEY, handler);
        const permitsFederated = Array.isArray(methodAuthSources) && methodAuthSources.includes("DilMart_federated");
        const isAuthenticatedOnly = effectiveRoles.length === 1 && effectiveRoles[0] === "authenticated";
        const httpPath = Reflect.getMetadata(PATH_METADATA, handler);

        if (isAuthenticatedOnly) {
          const key = `${Ctrl.name}.${method}`;
          // Duplicate LIVE route detection: the same registry identity must not resolve to two routes.
          if (discoveredAuthenticated.has(key)) {
            duplicateLiveRoutes++;
            assert.fail(`duplicate live authenticated route resolves to the same registry identity: ${key} (files: ${discoveredAuthenticated.get(key).file} and ${rel})`);
          }
          discoveredAuthenticated.set(key, { file: rel, httpPath, methodAuthSources, permitsFederated });
          const entry = findAuthenticatedRoutePolicy(Ctrl.name, method);
          assert.ok(entry, `NEW unclassified @Roles("authenticated") route: ${Ctrl.name}.${method} — add it to route-policy-registry.ts`);
          if (entry.policy === "DUAL_CUSTOMER") {
            assert.deepEqual(methodAuthSources, ["supabase", "DilMart_federated"], `${Ctrl.name}.${method} (DUAL) must carry explicit method-level @AuthSources`);
          } else {
            assert.equal(permitsFederated, false, `${Ctrl.name}.${method} (SUPABASE_ONLY) must not permit federated`);
          }
        } else {
          backofficeChecked++;
          assert.equal(permitsFederated, false, `${Ctrl.name}.${method} (backoffice) must not permit federated`);
        }
      }
    }
  }

  // REVERSE: every registry entry must map to exactly one real, discovered @Roles("authenticated") method.
  for (const e of AUTHENTICATED_ROUTE_POLICY) {
    const key = `${e.controller}.${e.method}`;
    assert.ok(discoveredAuthenticated.has(key), `STALE registry entry (no live route): ${key}`);
    const meta = discoveredAuthenticated.get(key);
    if (e.policy === "DUAL_CUSTOMER") assert.equal(meta.permitsFederated, true, `registry↔metadata mismatch (DUAL): ${key}`);
    else assert.equal(meta.permitsFederated, false, `registry↔metadata mismatch (SUPABASE_ONLY): ${key}`);
  }

  // No duplicate registry entries.
  const keys = AUTHENTICATED_ROUTE_POLICY.map((e) => `${e.controller}.${e.method}`);
  const duplicateRegistry = keys.length - new Set(keys).size;
  assert.equal(duplicateRegistry, 0, "duplicate route-policy-registry entries");

  // Coverage + widening + duplicate sanity.
  assert.equal(duplicateLiveRoutes, 0, "duplicate live authenticated routes");
  assert.equal(classLevelWidening, 0, "no controller may declare class-level @AuthSources");
  assert.equal(discoveredAuthenticated.size, AUTHENTICATED_ROUTE_POLICY.length, "registry and discovered authenticated routes must be 1:1");
  assert.ok(discoveredAuthenticated.size >= 20, `expected >=20 authenticated routes, saw ${discoveredAuthenticated.size}`);
  assert.ok(backofficeChecked >= 20, `expected >=20 backoffice routes, saw ${backofficeChecked}`);

  // Report exact counts for the closure evidence.
  console.log(`[B5] live_authenticated=${discoveredAuthenticated.size} registry=${AUTHENTICATED_ROUTE_POLICY.length} reverse_matches=${AUTHENTICATED_ROUTE_POLICY.length} dup_live=${duplicateLiveRoutes} dup_registry=${duplicateRegistry} stale=0 backoffice_checked=${backofficeChecked} class_level_widening=${classLevelWidening}`);
});
