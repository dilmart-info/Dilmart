/**
 * Marketplace + Cart source→surface resolution regression tests.
 *
 * Governed by DilMart-CUSTOMER-STORE-MASTER-001 §2.6 and
 * DilMart-CUSTOMER-STORE-DISCOVERY-001 (STORE-PR1).
 *
 * Proves:
 *  - The marketplace controller resolves a TRUSTED customer_app session to the
 *    customer_app surface (previously collapsed to web_store), and barber_app
 *    behaviour is unchanged.
 *  - An UNTRUSTED client cannot self-declare customer_app / barber_app via query.
 *  - The trusted surface comes from VERIFIED claims, not the raw header/query.
 *  - The cart service resolves the same source consistently with marketplace.
 *
 * No network, no DB. `MarketplaceService` and `StoreIntegrationService` are
 * captured/faked; `CartService` uses the runtime-accessible (TS-private) helper.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { MarketplaceController } = await import("../dist/modules/marketplace/marketplace.controller.js");
const { CartService } = await import("../dist/modules/cart/cart.service.js");
const { ProductVisibilityService } = await import("../dist/modules/store-integration/product-visibility.service.js");
const { resolveTrustedViewerContext } = await import("../dist/modules/store-integration/surface-resolver.js");

// ── Fakes ───────────────────────────────────────────────────────────────────

/** Captures the ViewerContext the controller passes into the service. */
function makeCapturingMarketplaceService() {
  const captured = {};
  const record = (name) => (ctx) => {
    captured[name] = ctx;
    return name === "getHome" ? {} : { items: [], total: 0, offset: 0, limit: 0 };
  };
  return {
    captured,
    getHome: record("getHome"),
    getBrands: record("getBrands"),
    getCategories: () => [],
  };
}

/** Fake integration service: returns preset claims for a specific header, else null. */
function makeIntegrationService(headerToClaims) {
  return {
    verifyStoreSessionHeader: (header) => headerToClaims[header] ?? null,
  };
}

const fakeRes = { setHeader() {} };

// ── 5.2 Marketplace regression ──────────────────────────────────────────────

test("5.2.1 verified barber_app session resolves to barber_app", () => {
  const svc = makeCapturingMarketplaceService();
  const integ = makeIntegrationService({
    "barber-token": { linkedProfileId: "lp", segment: "DilMart_APP_BARBER_OWNER", DilMartUserId: "u", sourceApp: "barber_app" },
  });
  const controller = new MarketplaceController(svc, integ);

  controller.getHome(fakeRes, "barber-token");

  assert.equal(svc.captured.getHome.surface, "barber_app");
  assert.equal(svc.captured.getHome.isTrusted, true);
});

test("5.2.2 verified customer_app session resolves to customer_app (was web_store)", () => {
  const svc = makeCapturingMarketplaceService();
  const integ = makeIntegrationService({
    "customer-token": { linkedProfileId: "lp", segment: "DilMart_APP_CUSTOMER", DilMartUserId: "u", sourceApp: "customer_app" },
  });
  const controller = new MarketplaceController(svc, integ);

  controller.getHome(fakeRes, "customer-token");

  assert.equal(svc.captured.getHome.surface, "customer_app");
  assert.equal(svc.captured.getHome.isTrusted, true);
  assert.equal(svc.captured.getHome.segment, "DilMart_APP_CUSTOMER");
});

test("5.2.3 a normal public web request (no header, no surface) resolves to web_store", () => {
  const svc = makeCapturingMarketplaceService();
  const controller = new MarketplaceController(svc, makeIntegrationService({}));

  controller.getHome(fakeRes, undefined);

  assert.equal(svc.captured.getHome.surface, "web_store");
  assert.equal(svc.captured.getHome.isTrusted, false);
});

test("5.2.4 a missing source does not resolve to customer_app", () => {
  const svc = makeCapturingMarketplaceService();
  const controller = new MarketplaceController(svc, makeIntegrationService({}));

  controller.getHome(fakeRes, undefined, undefined);

  assert.notEqual(svc.captured.getHome.surface, "customer_app");
  assert.equal(svc.captured.getHome.surface, "web_store");
});

test("5.2.5 an untrusted client cannot self-declare customer_app via query param", () => {
  const svc = makeCapturingMarketplaceService();
  const controller = new MarketplaceController(svc, makeIntegrationService({}));

  // No X-Store-Session header, but ?surface=customer_app.
  controller.getHome(fakeRes, undefined, "customer_app");

  assert.equal(svc.captured.getHome.surface, "web_store");
  assert.equal(svc.captured.getHome.isTrusted, false);
});

test("5.2.5b an untrusted client cannot self-declare barber_app via query param", () => {
  const svc = makeCapturingMarketplaceService();
  const controller = new MarketplaceController(svc, makeIntegrationService({}));

  controller.getHome(fakeRes, undefined, "barber_app");

  assert.equal(svc.captured.getHome.surface, "web_store");
  assert.equal(svc.captured.getHome.isTrusted, false);
});

test("5.2.6 existing barber visibility context is unchanged (full shape)", () => {
  const svc = makeCapturingMarketplaceService();
  const claims = {
    linkedProfileId: "lp",
    segment: "DilMart_APP_BARBER_OWNER",
    DilMartUserId: "u",
    DilMartBarbershopId: "shop",
    businessType: "mens_salon",
    sourceApp: "barber_app",
  };
  const controller = new MarketplaceController(svc, makeIntegrationService({ "b": claims }));

  controller.getBrands(fakeRes, "b");

  assert.deepEqual(svc.captured.getBrands, {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    businessType: "mens_salon",
    salonVerified: false,
    sourceApp: "barber_app",
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  });
});

test("5.2.7 customer_app context reaches customer segment/audience logic, not anonymous web", () => {
  const visibility = new ProductVisibilityService();
  const customerCtx = resolveTrustedViewerContext({
    linkedProfileId: "lp",
    segment: "DilMart_APP_CUSTOMER",
    DilMartUserId: "u",
    sourceApp: "customer_app",
  });
  // Reaches the customer segment branch (segment-based, from a trusted session)…
  assert.deepEqual(visibility.resolveAudienceFromViewerContext(customerCtx), ["customer"]);
  // …and is NOT the anonymous web surface.
  assert.equal(customerCtx.surface, "customer_app");
  assert.equal(customerCtx.isTrusted, true);
});

// ── 5.4 Integration-session trust ───────────────────────────────────────────

test("5.4 the trusted surface comes from VERIFIED claims, not the raw header/query", () => {
  const svc = makeCapturingMarketplaceService();
  // Header is present but verification FAILS (returns null) — plus a forged
  // ?surface=customer_app. Neither may promote the request.
  const controller = new MarketplaceController(svc, makeIntegrationService({ /* nothing verifies */ }));

  controller.getHome(fakeRes, "forged-or-expired-token", "customer_app");

  assert.equal(svc.captured.getHome.surface, "web_store");
  assert.equal(svc.captured.getHome.isTrusted, false);
});

// ── 5.3 Cart regression + consistency with marketplace ──────────────────────

/** CartService.claimsToViewerContext is TS-private → callable at runtime from JS. */
function cartCtx(claims) {
  const svc = new CartService({ client: {} });
  return svc.claimsToViewerContext(claims);
}

test("5.3.1 barber cart context remains barber_app", () => {
  const ctx = cartCtx({ linkedProfileId: "lp", segment: "DilMart_APP_BARBER_OWNER", DilMartUserId: "u", sourceApp: "barber_app" });
  assert.equal(ctx.surface, "barber_app");
});

test("5.3.2 customer cart context becomes customer_app", () => {
  const ctx = cartCtx({ linkedProfileId: "lp", segment: "DilMart_APP_CUSTOMER", DilMartUserId: "u", sourceApp: "customer_app" });
  assert.equal(ctx.surface, "customer_app");
});

test("5.3.3 public/store_web cart context remains web_store", () => {
  const ctx = cartCtx({ linkedProfileId: "lp", segment: "RETAIL_CUSTOMER", DilMartUserId: "u", sourceApp: "store_web" });
  assert.equal(ctx.surface, "web_store");
});

test("5.3.4 a missing/unsupported source cannot elevate the cart request", () => {
  const ctxUnknown = cartCtx({ linkedProfileId: "lp", segment: "RETAIL_CUSTOMER", DilMartUserId: "u", sourceApp: "totally_unknown" });
  assert.equal(ctxUnknown.surface, "web_store");
  const ctxMissing = cartCtx({ linkedProfileId: "lp", segment: "RETAIL_CUSTOMER", DilMartUserId: "u" });
  assert.equal(ctxMissing.surface, "web_store");
});

test("5.3.5 cart and marketplace resolve the same source identically", () => {
  for (const sourceApp of ["barber_app", "customer_app", "store_web", "admin"]) {
    const claims = { linkedProfileId: "lp", segment: "RETAIL_CUSTOMER", DilMartUserId: "u", sourceApp };
    assert.deepEqual(cartCtx(claims), resolveTrustedViewerContext(claims), `mismatch for ${sourceApp}`);
  }
});
