/**
 * Barber B2B Web Session consumer — GET/POST /integrations/DilMart/barber/web-session(/logout).
 * Closes the gap where verify_barber_web_session / BarberHandoffRepository.verifySession() had
 * zero production callers and the __Host-DilMart_store_bwt cookie was issued but never consumed.
 *
 * Pure unit tests against a fake repository (no DB) for the resolver + service; a static scan
 * proving verifySession() now has a real caller and cannot silently regress back to dead code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "reflect-metadata"; // required for Reflect.getMetadata reads of Nest's own route decorators below

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(here, "../src/modules/store-integration/barber-handoff");

const { resolveBarberWebSessionToken, BARBER_WEB_SESSION_COOKIE } = await import(
  "../dist/modules/store-integration/barber-handoff/barber-web-cookie.js"
);
const { BarberHandoffService } = await import(
  "../dist/modules/store-integration/barber-handoff/barber-handoff.service.js"
);
const { BarberHandoffError } = await import(
  "../dist/modules/store-integration/barber-handoff/barber-handoff.errors.js"
);

function sha256Hex(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function cookieHeader(token) {
  return `${BARBER_WEB_SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

// ── resolveBarberWebSessionToken (Origin-gated cookie extraction) ─────────────────────────────

test("resolveBarberWebSessionToken: no cookie at all -> none", () => {
  const r = resolveBarberWebSessionToken({});
  assert.equal(r.kind, "none");
});

test("resolveBarberWebSessionToken: Customer federated cookie present, Barber cookie absent -> none", () => {
  // The session endpoint must never accidentally authenticate off a Customer cookie name.
  const r = resolveBarberWebSessionToken({ cookie: "__Host-DilMart_store_frt=some-customer-refresh-token" });
  assert.equal(r.kind, "none");
});

// The env-derived default allowlist (FRONTEND_ORIGINS, falling back to http://localhost:8080) is
// exercised by exactly this one test — everything below injects an explicit originAllowed so the
// approved/rejected assertions don't depend on the process environment at all.
test("resolveBarberWebSessionToken: cookie present, Origin missing -> forbidden_origin (default env-derived allowlist)", () => {
  const r = resolveBarberWebSessionToken({ cookie: cookieHeader("tok123") });
  assert.equal(r.kind, "forbidden_origin");
});

const approvedOriginOnly = (o) => o === "https://store.DilMart.org";

test("resolveBarberWebSessionToken: cookie present, approved Origin -> present", () => {
  const r = resolveBarberWebSessionToken({ cookie: cookieHeader("tok123"), origin: "https://store.DilMart.org" }, approvedOriginOnly);
  assert.equal(r.kind, "present");
  assert.equal(r.token, "tok123");
});

test("resolveBarberWebSessionToken: cookie present, foreign/evil Origin -> forbidden_origin", () => {
  const r = resolveBarberWebSessionToken({ cookie: cookieHeader("tok123"), origin: "https://evil.example" }, approvedOriginOnly);
  assert.equal(r.kind, "forbidden_origin");
});

test("resolveBarberWebSessionToken: CSRF-style foreign-site credentialed request (cookie auto-attached, Origin from attacker page) -> rejected", () => {
  const r = resolveBarberWebSessionToken(
    { cookie: cookieHeader("stolen-looking-but-irrelevant"), origin: "https://attacker.example" },
    approvedOriginOnly,
  );
  assert.equal(r.kind, "forbidden_origin");
});

test("resolveBarberWebSessionToken: injected originAllowed override is honored (explicit allowlist, not env default)", () => {
  const r = resolveBarberWebSessionToken(
    { cookie: cookieHeader("tok123"), origin: "https://store.DilMart.org" },
    (o) => o === "https://store.DilMart.org",
  );
  assert.equal(r.kind, "present");
});

// ── BarberHandoffService.checkWebSession / logoutWebSession ───────────────────────────────────

const ALLOWED_ORIGIN = "http://localhost:8080"; // default allow-listed fallback host, no env mutation needed
const RAW_TOKEN = "raw-session-token-value-should-never-reach-the-repo";

function fakeConfig(overrides = {}) {
  return { handoffEnabled: overrides.handoffEnabled ?? true };
}

function makeService({ verifySessionResult, contactFields, revoked, audited } = {}) {
  const calls = { verifySession: [], revoke: [], audit: [], contactFields: [] };
  const repo = {
    verifySession: async (hash) => {
      calls.verifySession.push(hash);
      if (verifySessionResult === undefined) {
        return { linkedProfileId: "lp1", DilMartUserId: "u1", DilMartBarbershopId: "b1", role: "OWNER" };
      }
      return verifySessionResult;
    },
    getLinkedProfileContactFields: async (id) => {
      calls.contactFields.push(id);
      return contactFields ?? { displayName: "Ali", phone: "+9647700000000", city: "Baghdad", businessType: "salon" };
    },
    revokeSessionsForUser: async (userId) => {
      calls.revoke.push(userId);
      return revoked ?? 1;
    },
    writeAudit: async (input) => {
      calls.audit.push(input);
    },
  };
  const svc = new BarberHandoffService(fakeConfig(), /* assertions */ {}, repo, /* productVisibility */ {});
  return Object.assign(svc, { __calls: calls });
}

function makeDisabledService() {
  const calls = { verifySession: [] };
  const repo = {
    verifySession: async (hash) => {
      calls.verifySession.push(hash);
      return null;
    },
    getLinkedProfileContactFields: async () => null,
    revokeSessionsForUser: async () => 0,
    writeAudit: async () => {},
  };
  const svc = new BarberHandoffService(fakeConfig({ handoffEnabled: false }), {}, repo, {});
  return Object.assign(svc, { __calls: calls });
}

test("checkWebSession: feature disabled -> throws STORE_INTEGRATION_DISABLED, never touches the repo", async () => {
  const svc = makeDisabledService();
  await assert.rejects(
    () => svc.checkWebSession({ cookie: cookieHeader("x"), origin: ALLOWED_ORIGIN }),
    (e) => e instanceof BarberHandoffError && e.code === "STORE_INTEGRATION_DISABLED",
  );
  assert.equal(svc.__calls.verifySession.length, 0);
});

test("checkWebSession: no cookie -> unauthenticated", async () => {
  const svc = makeService();
  const result = await svc.checkWebSession({ origin: ALLOWED_ORIGIN });
  assert.deepEqual(result, { status: "unauthenticated" });
  assert.equal(svc.__calls.verifySession.length, 0);
});

test("checkWebSession: cookie present but Origin not approved -> unauthenticated, DB never consulted (fail closed before verify)", async () => {
  const svc = makeService();
  const result = await svc.checkWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: "https://evil.example" });
  assert.deepEqual(result, { status: "unauthenticated" });
  assert.equal(svc.__calls.verifySession.length, 0, "must not call verifySession for a forbidden-origin cookie");
});

test("checkWebSession: unknown/expired/revoked token (repo returns null) -> unauthenticated", async () => {
  const svc = makeService({ verifySessionResult: null });
  const result = await svc.checkWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN });
  assert.deepEqual(result, { status: "unauthenticated" });
});

function makeThrowingVerifyService() {
  const repo = {
    verifySession: async () => {
      throw new Error("db unavailable");
    },
    getLinkedProfileContactFields: async () => null,
    revokeSessionsForUser: async () => 0,
    writeAudit: async () => {},
  };
  return new BarberHandoffService(fakeConfig(), {}, repo, {});
}

test("checkWebSession: repo verify throws -> STORE_UNAVAILABLE, never a silent unauthenticated", async () => {
  const svc = makeThrowingVerifyService();
  await assert.rejects(
    () => svc.checkWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN }),
    (e) => e instanceof BarberHandoffError && e.code === "STORE_UNAVAILABLE",
  );
});

test("checkWebSession: non-OWNER/BARBER role from repo (defensive) -> unauthenticated, never surfaced as authenticated", async () => {
  const svc = makeService({
    verifySessionResult: { linkedProfileId: "lp1", DilMartUserId: "u1", DilMartBarbershopId: "b1", role: "CUSTOMER" },
  });
  const result = await svc.checkWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN });
  assert.deepEqual(result, { status: "unauthenticated" });
});

test("checkWebSession: valid cookie + approved Origin -> authenticated, safe identity only, raw token never reaches the repo (hash only)", async () => {
  const svc = makeService();
  const result = await svc.checkWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN });
  assert.equal(result.status, "authenticated");
  assert.deepEqual(result.barber, {
    linkedProfileId: "lp1",
    DilMartUserId: "u1",
    DilMartBarbershopId: "b1",
    role: "OWNER",
    displayName: "Ali",
    shopName: null,
    phone: "+9647700000000",
    city: "Baghdad",
    businessType: "salon",
  });
  assert.equal(svc.__calls.verifySession.length, 1);
  assert.equal(svc.__calls.verifySession[0], sha256Hex(RAW_TOKEN), "repo must receive the SHA-256 hash, not the raw token");
  assert.notEqual(svc.__calls.verifySession[0], RAW_TOKEN);
});

test("checkWebSession: authenticated response body never carries a token/hash/session field", async () => {
  const svc = makeService();
  const result = await svc.checkWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN });
  const flat = JSON.stringify(result);
  assert.ok(!/session_token_hash|sessionTokenHash|"token"|assertion|Authorization/i.test(flat), `response leaked a sensitive field: ${flat}`);
});

test("logoutWebSession: feature disabled -> throws STORE_INTEGRATION_DISABLED", async () => {
  const svc = makeDisabledService();
  await assert.rejects(() => svc.logoutWebSession({ cookie: cookieHeader("x"), origin: ALLOWED_ORIGIN }), (e) => e instanceof BarberHandoffError && e.code === "STORE_INTEGRATION_DISABLED");
});

test("logoutWebSession: no cookie -> unauthenticated, no revoke attempted", async () => {
  const svc = makeService();
  const result = await svc.logoutWebSession({ origin: ALLOWED_ORIGIN });
  assert.deepEqual(result, { status: "unauthenticated" });
  assert.equal(svc.__calls.revoke.length, 0);
});

test("logoutWebSession: forbidden Origin -> unauthenticated, no revoke attempted (CSRF-safe no-op)", async () => {
  const svc = makeService();
  const result = await svc.logoutWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: "https://evil.example" });
  assert.deepEqual(result, { status: "unauthenticated" });
  assert.equal(svc.__calls.revoke.length, 0);
});

test("logoutWebSession: valid cookie + approved Origin -> revokes the user's active session(s) and writes an audit event, then reports unauthenticated", async () => {
  const svc = makeService();
  const result = await svc.logoutWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN });
  assert.deepEqual(result, { status: "unauthenticated" });
  assert.deepEqual(svc.__calls.revoke, ["u1"]);
  assert.equal(svc.__calls.audit.length, 1);
  assert.equal(svc.__calls.audit[0].eventType, "HANDOFF_SESSION_LOGOUT");
  assert.equal(svc.__calls.verifySession[0], sha256Hex(RAW_TOKEN));
});

test("logoutWebSession: unknown token -> no revoke attempted (nothing to revoke, still idempotent-safe)", async () => {
  const svc = makeService({ verifySessionResult: null });
  const result = await svc.logoutWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN });
  assert.deepEqual(result, { status: "unauthenticated" });
  assert.equal(svc.__calls.revoke.length, 0);
});

test("logoutWebSession: repo verify throws -> STORE_UNAVAILABLE, never a false 'logged out'", async () => {
  const svc = makeThrowingVerifyService();
  await assert.rejects(
    () => svc.logoutWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN }),
    (e) => e instanceof BarberHandoffError && e.code === "STORE_UNAVAILABLE",
  );
});

test("logoutWebSession: revoke RPC throws (verify succeeded) -> STORE_UNAVAILABLE, never a false 'logged out' while the session is still ACTIVE", async () => {
  const calls = { verifySession: [], revoke: [] };
  const repo = {
    verifySession: async (hash) => {
      calls.verifySession.push(hash);
      return { linkedProfileId: "lp1", DilMartUserId: "u1", DilMartBarbershopId: "b1", role: "OWNER" };
    },
    revokeSessionsForUser: async (userId) => {
      calls.revoke.push(userId);
      throw new Error("db unavailable");
    },
    writeAudit: async () => {},
    getLinkedProfileContactFields: async () => null,
  };
  const svc = new BarberHandoffService(fakeConfig(), {}, repo, {});
  await assert.rejects(
    () => svc.logoutWebSession({ cookie: cookieHeader(RAW_TOKEN), origin: ALLOWED_ORIGIN }),
    (e) => e instanceof BarberHandoffError && e.code === "STORE_UNAVAILABLE",
  );
  assert.equal(calls.revoke.length, 1, "revoke must actually have been attempted before failing");
});

// ── Regression: verifySession() must have a REAL production caller (prevents dead code again) ─

test("regression: BarberHandoffRepository.verifySession() is actually called from the service (not dead code)", () => {
  const serviceSrc = readFileSync(join(SRC_DIR, "barber-handoff.service.ts"), "utf8");
  const callSites = serviceSrc.match(/this\.repo\.verifySession\(/g) ?? [];
  assert.ok(callSites.length >= 2, "expected verifySession() to be called from both checkWebSession and logoutWebSession");
});

test("regression: the dedicated web-session controller registers both the session-check and logout routes", () => {
  const controllerSrc = readFileSync(join(SRC_DIR, "barber-web-session.controller.ts"), "utf8");
  assert.ok(/@Get\("web-session"\)/.test(controllerSrc), "GET web-session route must exist");
  assert.ok(/@Post\("web-session\/logout"\)/.test(controllerSrc), "POST web-session/logout route must exist");
});

test("regression: web-session endpoints never read the Authorization header (cookie-only, unlike prepare)", () => {
  const controllerSrc = readFileSync(join(SRC_DIR, "barber-web-session.controller.ts"), "utf8");
  const webSessionBlockMatch = controllerSrc.match(/async webSession\([\s\S]*?\n  \}/);
  const logoutBlockMatch = controllerSrc.match(/async webSessionLogout\([\s\S]*?\n  \}/);
  assert.ok(webSessionBlockMatch && logoutBlockMatch, "expected to locate both handler bodies");
  for (const block of [webSessionBlockMatch[0], logoutBlockMatch[0]]) {
    assert.ok(!/@Headers\("authorization"\)/i.test(block), "must not bind the Authorization header on the cookie-based session endpoints");
  }
});

// ── Behavior-level route-path proof (Blocker 1): reads Nest's OWN decorator metadata off the
// compiled controllers — not a regex over source text — so it proves the exact path Nest's router
// will actually register, the same mechanism that caused the live P1 mismatch (a shared
// @Controller prefix silently changing the effective path of routes defined on a sibling class).
test("behavior: BarberWebSessionController registers GET/POST at the exact contract path the frontend calls", async () => {
  const { PATH_METADATA } = await import("@nestjs/common/constants.js");
  const { BarberWebSessionController } = await import(
    "../dist/modules/store-integration/barber-handoff/barber-web-session.controller.js"
  );

  const controllerPath = Reflect.getMetadata(PATH_METADATA, BarberWebSessionController);
  const getPath = Reflect.getMetadata(PATH_METADATA, BarberWebSessionController.prototype.webSession);
  const postPath = Reflect.getMetadata(PATH_METADATA, BarberWebSessionController.prototype.webSessionLogout);

  const fullGet = `/${[controllerPath, getPath].filter(Boolean).join("/")}`.replace(/\/+/g, "/");
  const fullPost = `/${[controllerPath, postPath].filter(Boolean).join("/")}`.replace(/\/+/g, "/");

  assert.equal(fullGet, "/integrations/DilMart/barber/web-session");
  assert.equal(fullPost, "/integrations/DilMart/barber/web-session/logout");
});

test("behavior: BarberHandoffController's prepare/redeem routes are untouched by the web-session split", async () => {
  const { PATH_METADATA } = await import("@nestjs/common/constants.js");
  const { BarberHandoffController } = await import(
    "../dist/modules/store-integration/barber-handoff/barber-handoff.controller.js"
  );

  const controllerPath = Reflect.getMetadata(PATH_METADATA, BarberHandoffController);
  const preparePath = Reflect.getMetadata(PATH_METADATA, BarberHandoffController.prototype.prepare);
  const redeemPath = Reflect.getMetadata(PATH_METADATA, BarberHandoffController.prototype.redeem);

  assert.equal(`/${controllerPath}/${preparePath}`, "/integrations/DilMart/barber/handoff/prepare");
  assert.equal(`/${controllerPath}/${redeemPath}`, "/integrations/DilMart/barber/handoff/redeem");
  // The now-removed session methods must not still live on this controller.
  assert.equal(BarberHandoffController.prototype.webSession, undefined);
  assert.equal(BarberHandoffController.prototype.webSessionLogout, undefined);
});
