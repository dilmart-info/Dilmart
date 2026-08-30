/**
 * Canonical source→surface resolver — unit tests.
 *
 * Governed by DilMart-CUSTOMER-STORE-MASTER-001 §2.6 and
 * DilMart-CUSTOMER-STORE-DISCOVERY-001 (STORE-PR1).
 *
 * Proves the pure mapping used by BOTH the marketplace controller and the cart
 * service. No network, no DB — pure function assertions.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { resolveMarketplaceSurface, resolveTrustedViewerContext } = await import(
  "../dist/modules/store-integration/surface-resolver.js"
);

// ── 5.1 Pure mapping ────────────────────────────────────────────────────────

test("barber_app resolves to barber_app", () => {
  assert.equal(resolveMarketplaceSurface("barber_app"), "barber_app");
});

test("customer_app resolves to customer_app (the STORE-PR1 fix)", () => {
  assert.equal(resolveMarketplaceSurface("customer_app"), "customer_app");
});

test("store_web resolves to web_store", () => {
  assert.equal(resolveMarketplaceSurface("store_web"), "web_store");
});

test("admin resolves to web_store (not a shopping surface)", () => {
  assert.equal(resolveMarketplaceSurface("admin"), "web_store");
});

test("undefined resolves to web_store", () => {
  assert.equal(resolveMarketplaceSurface(undefined), "web_store");
});

test("null resolves to web_store", () => {
  assert.equal(resolveMarketplaceSurface(null), "web_store");
});

test("an unknown/out-of-type value fails safe to web_store", () => {
  // Claims are decoded from JSON, so a runtime value outside the SourceApp union
  // is possible. It must never be silently promoted to a privileged surface.
  assert.equal(resolveMarketplaceSurface("hacker_app"), "web_store");
  assert.equal(resolveMarketplaceSurface("web_store"), "web_store");
  assert.equal(resolveMarketplaceSurface(""), "web_store");
});

// ── resolveTrustedViewerContext ─────────────────────────────────────────────

test("trusted customer_app claims produce a trusted customer_app viewer context", () => {
  const ctx = resolveTrustedViewerContext({
    linkedProfileId: "lp-1",
    segment: "DilMart_APP_CUSTOMER",
    DilMartUserId: "u-1",
    sourceApp: "customer_app",
  });
  assert.deepEqual(ctx, {
    surface: "customer_app",
    segment: "DilMart_APP_CUSTOMER",
    businessType: undefined,
    salonVerified: false,
    sourceApp: "customer_app",
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  });
});

test("trusted barber_app claims produce the SAME context shape with fail-closed salonVerified", () => {
  const ctx = resolveTrustedViewerContext({
    linkedProfileId: "lp-2",
    segment: "DilMart_APP_BARBER_OWNER",
    DilMartUserId: "u-2",
    DilMartBarbershopId: "shop-1",
    businessType: "mens_salon",
    sourceApp: "barber_app",
  });
  assert.deepEqual(ctx, {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    businessType: "mens_salon",
    salonVerified: false,
    sourceApp: "barber_app",
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  });
});

test("trusted barber_app claims with salonVerified=true preserves verification", () => {
  const ctx = resolveTrustedViewerContext({
    linkedProfileId: "lp-3",
    segment: "DilMart_APP_BARBER_OWNER",
    DilMartUserId: "u-3",
    DilMartBarbershopId: "shop-2",
    businessType: "mens_salon",
    salonVerified: true,
    sourceApp: "barber_app",
  });
  assert.deepEqual(ctx, {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    businessType: "mens_salon",
    salonVerified: true,
    sourceApp: "barber_app",
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  });
});
