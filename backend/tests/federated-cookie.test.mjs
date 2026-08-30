/**
 * STORE-PR5 §Phase E — web HttpOnly refresh cookie + channel/CSRF resolution (no server).
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.3, §16.1.
 *
 * Proves the security-bearing pure logic: cookie attributes (__Host- ⇒ HttpOnly/Secure/SameSite=Lax/
 * Path=/, no Domain, Max-Age from committed lifetime), single-channel enforcement (body+cookie ⇒
 * ambiguous), and cookie-CSRF (cookie requires an allowed Origin).
 *
 * Runs against compiled dist/. `npm run build` first.
 */
import test from "node:test";
import assert from "node:assert/strict";

const A = (p) => `../dist/${p}`;

const {
  FEDERATED_REFRESH_COOKIE,
  buildRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
  resolveFederatedTokenSource,
} = await import(A("modules/auth/federated/federated-cookie.js"));
const { parseAllowedOrigins, isAllowedOrigin } = await import(A("common/http/allowed-origins.js"));

const ALLOW = new Set(["https://store.DilMart.org"]);
const originAllowed = (o) => !!o && ALLOW.has(o);

test("cookie name is the host-locked __Host- prefix", () => {
  assert.equal(FEDERATED_REFRESH_COOKIE, "__Host-DilMart_store_frt");
});

test("buildRefreshCookie: HttpOnly + Secure + SameSite=Lax + Path=/ + Max-Age; NO Domain", () => {
  const c = buildRefreshCookie("tok-abc", 2592000);
  assert.match(c, /^__Host-DilMart_store_frt=tok-abc/);
  assert.match(c, /; HttpOnly/);
  assert.match(c, /; Secure/);
  assert.match(c, /; SameSite=Lax/);
  assert.match(c, /; Path=\//);
  assert.match(c, /; Max-Age=2592000/);
  assert.ok(!/Domain=/i.test(c), "must not set a Domain attribute");
});

test("buildRefreshCookie: Max-Age tracks the committed lifetime (not hardcoded 30d)", () => {
  assert.match(buildRefreshCookie("t", 600), /; Max-Age=600/);
  assert.match(buildRefreshCookie("t", -5), /; Max-Age=0/); // negative clamps to 0
});

test("buildRefreshCookie: url-encodes the token value", () => {
  assert.match(buildRefreshCookie("a b/c", 60), /=a%20b%2Fc;/);
});

test("clearRefreshCookie: Max-Age=0, still HttpOnly+Secure+Path", () => {
  const c = clearRefreshCookie();
  assert.match(c, /^__Host-DilMart_store_frt=;/);
  assert.match(c, /; Max-Age=0/);
  assert.match(c, /; HttpOnly/);
  assert.match(c, /; Secure/);
});

test("readRefreshCookie: extracts value among several cookies; null when absent/empty", () => {
  assert.equal(readRefreshCookie("a=1; __Host-DilMart_store_frt=xyz; b=2"), "xyz");
  assert.equal(readRefreshCookie("a=1; b=2"), null);
  assert.equal(readRefreshCookie(undefined), null);
  assert.equal(readRefreshCookie("__Host-DilMart_store_frt="), null);
  assert.equal(readRefreshCookie("__Host-DilMart_store_frt=a%20b"), "a b");
});

test("resolve: body token only → native", () => {
  const s = resolveFederatedTokenSource({}, { refreshToken: "body-tok" }, originAllowed);
  assert.deepEqual(s, { kind: "native", token: "body-tok" });
});

test("resolve: cookie + allowed Origin → web", () => {
  const s = resolveFederatedTokenSource(
    { cookie: "__Host-DilMart_store_frt=cook", origin: "https://store.DilMart.org" },
    {},
    originAllowed,
  );
  assert.deepEqual(s, { kind: "web", token: "cook" });
});

test("resolve: cookie + foreign Origin → forbidden_origin (CSRF)", () => {
  const s = resolveFederatedTokenSource(
    { cookie: "__Host-DilMart_store_frt=cook", origin: "https://evil.example" },
    {},
    originAllowed,
  );
  assert.equal(s.kind, "forbidden_origin");
});

test("resolve: cookie + missing Origin → forbidden_origin (missing is not allowed)", () => {
  const s = resolveFederatedTokenSource({ cookie: "__Host-DilMart_store_frt=cook" }, {}, originAllowed);
  assert.equal(s.kind, "forbidden_origin");
});

test("resolve: body AND cookie → ambiguous (single-channel enforcement)", () => {
  const s = resolveFederatedTokenSource(
    { cookie: "__Host-DilMart_store_frt=cook", origin: "https://store.DilMart.org" },
    { refreshToken: "body-tok" },
    originAllowed,
  );
  assert.equal(s.kind, "ambiguous");
});

test("resolve: neither → none", () => {
  assert.deepEqual(resolveFederatedTokenSource({}, {}, originAllowed), { kind: "none" });
});

test("allowed-origins: exact match only, no wildcard", () => {
  const env = { FRONTEND_ORIGINS: "https://store.DilMart.org, https://staging.DilMart.org" };
  assert.deepEqual(parseAllowedOrigins(env), ["https://store.DilMart.org", "https://staging.DilMart.org"]);
  assert.equal(isAllowedOrigin("https://store.DilMart.org", env), true);
  assert.equal(isAllowedOrigin("https://evil.example", env), false);
  assert.equal(isAllowedOrigin(undefined, env), false);
});
