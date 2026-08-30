/**
 * STORE-PR3 — Barber integration regression (spec §2.2, §21.5).
 * Proves the existing Barber HMAC flow is UNCHANGED by the Customer Handoff work and that
 * the customer verifier is a fully separate code path (does not reuse the Barber secret or
 * verifyIntegrationToken). Closes the previously-zero direct coverage for the boundary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { StoreIntegrationService } = await import(
  "../dist/modules/store-integration/store-integration.service.js"
);
const { resolveMarketplaceSurface, resolveTrustedViewerContext } = await import(
  "../dist/modules/store-integration/surface-resolver.js"
);

const SECRET = "barber-integration-secret-value";
const config = { get: (k) => ({ DilMart_INTEGRATION_SECRET: SECRET, STORE_SESSION_ISSUER: "DilMart-main", STORE_SESSION_AUDIENCE: "DilMart-store", STORE_SESSION_TTL_SECONDS: "900" })[k] };

function fakeSupabaseAdmin(profileRow) {
  const chain = {
    upsert: () => chain,
    select: () => chain,
    single: async () => ({ data: profileRow, error: null }),
  };
  return { client: { from: () => chain } };
}

function signBarberToken(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

test("surface mapping is unchanged (barber_app→barber_app; others→web_store)", () => {
  assert.equal(resolveMarketplaceSurface("barber_app"), "barber_app");
  assert.equal(resolveMarketplaceSurface("customer_app"), "customer_app");
  assert.equal(resolveMarketplaceSurface("store_web"), "web_store");
  assert.equal(resolveMarketplaceSurface("admin"), "web_store");
  assert.equal(resolveMarketplaceSurface(undefined), "web_store");
});

test("X-Store-Session issue → verify round-trips (barber claims intact)", () => {
  const svc = new StoreIntegrationService(fakeSupabaseAdmin(null), config);
  const claims = { linkedProfileId: "lp-1", segment: "DilMart_APP_BARBER_OWNER", DilMartUserId: "u-1", businessType: "men_barbershop", sourceApp: "barber_app" };
  const { token } = svc.issueStoreSessionToken(claims);
  const verified = svc.verifyStoreSessionHeader(token);
  assert.equal(verified.linkedProfileId, "lp-1");
  assert.equal(verified.segment, "DilMart_APP_BARBER_OWNER");
  assert.equal(verified.sourceApp, "barber_app");
  const ctx = resolveTrustedViewerContext(verified);
  assert.equal(ctx.surface, "barber_app");
  assert.equal(ctx.isTrusted, true);
});

test("tampered X-Store-Session is rejected", () => {
  const svc = new StoreIntegrationService(fakeSupabaseAdmin(null), config);
  const { token } = svc.issueStoreSessionToken({ linkedProfileId: "lp", segment: "DilMart_APP_BARBER_OWNER", DilMartUserId: "u", sourceApp: "barber_app" });
  const tampered = token.slice(0, -3) + "aaa";
  assert.throws(() => svc.verifyStoreSessionHeader(tampered));
});

test("Barber session exchange still verifies the Main HMAC token and issues a session", async () => {
  const profile = { id: "lp-9", segment: "DilMart_APP_BARBER_OWNER", DilMart_user_id: "u-9", DilMart_barbershop_id: "shop-9", business_type: "men_barbershop", display_name: "Barber", phone: "0770", city: "Baghdad" };
  const svc = new StoreIntegrationService(fakeSupabaseAdmin(profile), config);
  const now = Math.floor(Date.now() / 1000);
  const token = signBarberToken({ iss: "DilMart-main", aud: "DilMart-store", iat: now, exp: now + 900, DilMartUserId: "u-9", role: "OWNER", barbershopId: "shop-9", sourceApp: "barber_app" });
  const res = await svc.exchangeSession(token);
  assert.ok(res.storeSessionToken);
  assert.equal(res.profile.DilMartUserId, "u-9");
  // The issued session re-verifies as a barber_app surface.
  const claims = svc.verifyStoreSessionHeader(res.storeSessionToken);
  assert.equal(resolveMarketplaceSurface(claims.sourceApp), "barber_app");
});

test("customer assertion verifier does NOT reuse the Barber secret / verifyIntegrationToken", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../src/modules/store-integration/customer-handoff/customer-handoff-assertion.service.ts"), "utf8");
  assert.ok(!/\.verifyIntegrationToken\s*\(/.test(src), "customer verifier must not CALL the Barber verifier");
  assert.ok(!src.includes("DilMart_INTEGRATION_SECRET"), "customer verifier must not use the Barber HMAC secret");
  assert.ok(src.includes("jose"), "customer verifier uses jose asymmetric verification");
});
