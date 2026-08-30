/**
 * CLOSURE-A — Verified Salon Authorization Semantics Test Suite
 *
 * Tests:
 *  A. OWNER + approved salon (salonVerified=true) → verified-only product ALLOWED
 *  B. OWNER + pending salon (salonVerified=false) → verified-only product DENIED
 *  C. OWNER + rejected salon (salonVerified=false) → verified-only product DENIED
 *  D. OWNER + unapproved salon → normal product ALLOWED
 *  E. BARBER (even with salonVerified=true) → verified-only product DENIED
 *  F. Missing salonVerified claim → fails closed as unverified (DENIED)
 *  G. Client/untrusted query parameter attempts to claim verified status → ignored/DENIED
 *  H. Token tampering with salonVerified → signature validation fails
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const { ProductVisibilityService } = await import(
  "../dist/modules/store-integration/product-visibility.service.js"
);
const { StoreIntegrationService } = await import(
  "../dist/modules/store-integration/store-integration.service.js"
);
const { resolveTrustedViewerContext } = await import(
  "../dist/modules/store-integration/surface-resolver.js"
);

const SECRET = "test-store-integration-secret-32-chars-minimum";
const config = {
  get: (k) =>
    ({
      DilMart_INTEGRATION_SECRET: SECRET,
      STORE_SESSION_ISSUER: "DilMart-main",
      STORE_SESSION_AUDIENCE: "DilMart-store",
      STORE_SESSION_TTL_SECONDS: "900",
    }[k]),
};

function signBarberToken(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function fakeSupabaseAdmin(profileRow) {
  const chain = {
    upsert: () => chain,
    select: () => chain,
    single: async () => ({ data: profileRow, error: null }),
  };
  return { client: { from: () => chain } };
}

const visibilityService = new ProductVisibilityService();

const verifiedOnlyProduct = {
  id: "prod-verified-1",
  is_active: true,
  visible_in: ["barber_app", "all"],
  target_audience: ["salon_owner", "professional_buyer"],
  business_type_tags: ["men_barbershop", "all"],
  requires_verified_salon: true,
};

const normalProfessionalProduct = {
  id: "prod-normal-1",
  is_active: true,
  visible_in: ["barber_app", "all"],
  target_audience: ["salon_owner", "barber_staff", "professional_buyer"],
  business_type_tags: ["men_barbershop", "all"],
  requires_verified_salon: false,
};

test("Scenario A: OWNER + approved salon (salonVerified=true) → verified-only product ALLOWED", () => {
  const ctx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    role: "OWNER",
    businessType: "men_barbershop",
    salonVerified: true,
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  };

  assert.equal(visibilityService.isVerifiedSalonOwner(ctx), true);
  assert.equal(visibilityService.canProductBeShown(verifiedOnlyProduct, ctx), true);
  assert.equal(visibilityService.canProductBeShown(normalProfessionalProduct, ctx), true);
});

test("Scenario B: OWNER + pending salon (salonVerified=false) → verified-only product DENIED", () => {
  const ctx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    role: "OWNER",
    businessType: "men_barbershop",
    salonVerified: false,
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  };

  assert.equal(visibilityService.isVerifiedSalonOwner(ctx), false);
  assert.equal(visibilityService.canProductBeShown(verifiedOnlyProduct, ctx), false);
});

test("Scenario C: OWNER + rejected salon (salonVerified=false) → verified-only product DENIED", () => {
  const ctx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    role: "OWNER",
    businessType: "men_barbershop",
    salonVerified: false,
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  };

  assert.equal(visibilityService.isVerifiedSalonOwner(ctx), false);
  assert.equal(visibilityService.canProductBeShown(verifiedOnlyProduct, ctx), false);
});

test("Scenario D: OWNER + unapproved salon (salonVerified=false) → normal product ALLOWED", () => {
  const ctx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    role: "OWNER",
    businessType: "men_barbershop",
    salonVerified: false,
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  };

  assert.equal(visibilityService.canProductBeShown(normalProfessionalProduct, ctx), true);
});

test("Scenario E: BARBER (even if shop is approved) → verified-only product DENIED", () => {
  const ctx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_STAFF",
    role: "BARBER",
    businessType: "men_barbershop",
    salonVerified: true,
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  };

  // Even if salon is verified, BARBER role is not a salon owner
  assert.equal(visibilityService.isVerifiedSalonOwner(ctx), false);
  assert.equal(visibilityService.canProductBeShown(verifiedOnlyProduct, ctx), false);
  assert.equal(visibilityService.canProductBeShown(normalProfessionalProduct, ctx), true);
});

test("Scenario F: Missing salonVerified claim → fails closed as unverified (DENIED)", () => {
  const ctx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    role: "OWNER",
    businessType: "men_barbershop",
    // salonVerified is undefined (legacy / missing)
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  };

  assert.equal(visibilityService.isVerifiedSalonOwner(ctx), false);
  assert.equal(visibilityService.canProductBeShown(verifiedOnlyProduct, ctx), false);
  assert.equal(visibilityService.canProductBeShown(normalProfessionalProduct, ctx), true);
});

test("Scenario G: Client/untrusted query parameter attempts to claim verified status → ignored/DENIED", () => {
  // Untrusted public/client context without X-Store-Session
  const untrustedCtx = {
    surface: "web_store",
    segment: "VERIFIED_SALON_OWNER",
    role: "OWNER",
    salonVerified: true, // untrusted claim from query param
    isTrusted: false, // NOT trusted
    requiresVerifiedSalonCheck: false,
  };

  // Rule: Untrusted requests cannot pass verified salon check
  assert.equal(visibilityService.isVerifiedSalonOwner(untrustedCtx), false);
});

test("Scenario H: Token tampering with salonVerified → signature validation fails", () => {
  const svc = new StoreIntegrationService(fakeSupabaseAdmin(null), config);
  const now = Math.floor(Date.now() / 1000);
  
  // Create valid token with salonVerified: false
  const validToken = signBarberToken({
    iss: "DilMart-main",
    aud: "DilMart-store",
    iat: now,
    exp: now + 900,
    DilMartUserId: "u-fake",
    role: "OWNER",
    barbershopId: "shop-fake",
    salonVerified: false,
    sourceApp: "barber_app",
  });

  // Tamper token payload to set salonVerified: true
  const parts = validToken.split(".");
  const decodedPayload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
  decodedPayload.salonVerified = true;
  const tamperedPayloadB64 = Buffer.from(JSON.stringify(decodedPayload)).toString("base64url");
  const tamperedToken = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

  assert.throws(
    () => svc.verifyIntegrationToken(tamperedToken),
    /signature is invalid/
  );
});

test("End-to-End Exchange: signed token salonVerified claim flows to X-Store-Session and ViewerContext", async () => {
  const profileRow = {
    id: "lp-verified-10",
    segment: "DilMart_APP_BARBER_OWNER",
    DilMart_user_id: "u-10",
    DilMart_barbershop_id: "shop-10",
    business_type: "men_barbershop",
    display_name: "Owner 10",
    phone: "07701234567",
    city: "Baghdad",
  };

  const svc = new StoreIntegrationService(fakeSupabaseAdmin(profileRow), config);
  const now = Math.floor(Date.now() / 1000);

  // 1. Approved salon owner exchange
  const approvedToken = signBarberToken({
    iss: "DilMart-main",
    aud: "DilMart-store",
    iat: now,
    exp: now + 900,
    DilMartUserId: "u-10",
    role: "OWNER",
    barbershopId: "shop-10",
    salonVerified: true,
    sourceApp: "barber_app",
  });

  const exchangeRes = await svc.exchangeSession(approvedToken);
  assert.ok(exchangeRes.storeSessionToken);

  const claims = svc.verifyStoreSessionHeader(exchangeRes.storeSessionToken);
  assert.equal(claims.salonVerified, true);

  const viewerCtx = resolveTrustedViewerContext(claims);
  assert.equal(viewerCtx.salonVerified, true);
  assert.equal(visibilityService.isVerifiedSalonOwner(viewerCtx), true);
  assert.equal(visibilityService.canProductBeShown(verifiedOnlyProduct, viewerCtx), true);

  // 2. Pending salon owner exchange
  const pendingToken = signBarberToken({
    iss: "DilMart-main",
    aud: "DilMart-store",
    iat: now,
    exp: now + 900,
    DilMartUserId: "u-10",
    role: "OWNER",
    barbershopId: "shop-10",
    salonVerified: false,
    sourceApp: "barber_app",
  });

  const pendingExchangeRes = await svc.exchangeSession(pendingToken);
  const pendingClaims = svc.verifyStoreSessionHeader(pendingExchangeRes.storeSessionToken);
  assert.equal(pendingClaims.salonVerified, false);

  const pendingViewerCtx = resolveTrustedViewerContext(pendingClaims);
  assert.equal(pendingViewerCtx.salonVerified, false);
  assert.equal(visibilityService.isVerifiedSalonOwner(pendingViewerCtx), false);
  assert.equal(visibilityService.canProductBeShown(verifiedOnlyProduct, pendingViewerCtx), false);
  assert.equal(visibilityService.canProductBeShown(normalProfessionalProduct, pendingViewerCtx), true);
});

test("Marketplace Public & Segmented Visibility: verified-only products are excluded from anonymous web_store and pending owners", async () => {
  const { MarketplaceService } = await import(
    "../dist/modules/marketplace/marketplace.service.js"
  );

  const mockProductRow = {
    id: "p-verified-1",
    slug: "verified-salon-treatment",
    is_active: true,
    is_published: true,
    visibility_status: "public",
    visible_in: ["web_store", "barber_app", "all"],
    target_audience: ["salon_owner", "all"],
    business_type_tags: ["all"],
    requires_verified_salon: true,
    merchant_id: "m-1",
    merchants: { id: "m-1", status: "active" },
  };

  const mockPublicProductRow = {
    id: "p-public-1",
    slug: "public-hair-wax",
    is_active: true,
    is_published: true,
    visibility_status: "public",
    visible_in: ["web_store", "barber_app", "all"],
    target_audience: ["all"],
    business_type_tags: ["all"],
    requires_verified_salon: false,
    merchant_id: "m-1",
    merchants: { id: "m-1", status: "active" },
  };

  function createMockSupabase(rows) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      not: () => chain,
      or: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return { client: { from: () => chain } };
  }

  const fakeWhatsApp = { generateClickToChatUrl: () => "" };

  // 1. Anonymous web_store gets product by slug -> DENIED (null)
  const mpSvcVerified = new MarketplaceService(
    createMockSupabase([mockProductRow]),
    fakeWhatsApp
  );
  const anonRes = await mpSvcVerified.getProductBySlug("verified-salon-treatment", { surface: "web_store", isTrusted: false });
  assert.equal(anonRes, null, "anonymous web visitor cannot view verified-only product by slug");

  // 2. Pending owner gets product by slug -> DENIED (null)
  const pendingOwnerCtx = { surface: "barber_app", role: "OWNER", segment: "DilMart_APP_BARBER_OWNER", salonVerified: false, isTrusted: true };
  const pendingRes = await mpSvcVerified.getProductBySlug("verified-salon-treatment", pendingOwnerCtx);
  assert.equal(pendingRes, null, "pending owner cannot view verified-only product by slug");

  // 3. Approved owner gets product by slug -> ALLOWED
  const approvedOwnerCtx = { surface: "barber_app", role: "OWNER", segment: "DilMart_APP_BARBER_OWNER", salonVerified: true, isTrusted: true };
  const approvedRes = await mpSvcVerified.getProductBySlug("verified-salon-treatment", approvedOwnerCtx);
  assert.ok(approvedRes, "approved salon owner can view verified-only product by slug");
  assert.equal(approvedRes.id, "p-verified-1");

  // 4. Barber gets product by slug -> DENIED (null)
  const barberCtx = { surface: "barber_app", role: "BARBER", segment: "DilMart_APP_BARBER_STAFF", salonVerified: true, isTrusted: true };
  const barberRes = await mpSvcVerified.getProductBySlug("verified-salon-treatment", barberCtx);
  assert.equal(barberRes, null, "barber staff cannot view verified-only product even if shop is verified");

  // 5. Normal public product -> ALLOWED for anonymous web visitor
  const mpSvcPublic = new MarketplaceService(
    createMockSupabase([mockPublicProductRow]),
    fakeWhatsApp
  );
  const publicRes = await mpSvcPublic.getProductBySlug("public-hair-wax", { surface: "web_store", isTrusted: false });
  assert.ok(publicRes, "normal public product is viewable by anonymous web visitor");
  assert.equal(publicRes.id, "p-public-1");
});
