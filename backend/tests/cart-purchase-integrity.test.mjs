import test from "node:test";
import assert from "node:assert/strict";

const { ProductVisibilityService } = await import(
  "../dist/modules/store-integration/product-visibility.service.js"
);
const { ProductPurchaseEligibilityService } = await import(
  "../dist/modules/store-integration/product-purchase-eligibility.service.js"
);

const visibilityService = new ProductVisibilityService();
const eligibilityService = new ProductPurchaseEligibilityService(visibilityService);

const approvedOwnerClaims = {
  linkedProfileId: "lp-owner-001",
  DilMartUserId: "user-owner-001",
  sourceApp: "barber_app",
  role: "OWNER",
  segment: "DilMart_APP_BARBER_OWNER",
  businessType: "men_barbershop",
  salonVerified: true,
  isTrusted: true,
};

const pendingOwnerClaims = {
  linkedProfileId: "lp-owner-002",
  DilMartUserId: "user-owner-002",
  sourceApp: "barber_app",
  role: "OWNER",
  segment: "DilMart_APP_BARBER_OWNER",
  businessType: "men_barbershop",
  salonVerified: false,
  isTrusted: true,
};

const barberClaims = {
  linkedProfileId: "lp-barber-001",
  DilMartUserId: "user-barber-001",
  sourceApp: "barber_app",
  role: "BARBER",
  segment: "DilMart_APP_BARBER_STAFF",
  businessType: "men_barbershop",
  salonVerified: false,
  isTrusted: true,
};

const productsDb = {
  "prod-normal-retail": {
    id: "prod-normal-retail",
    name: "Normal Retail Product",
    price: 15000,
    discount_price: null,
    stock: 50,
    is_active: true,
    is_published: true,
    visibility_status: "public",
    visible_in: ["all"],
    target_audience: ["all"],
    business_type_tags: ["all"],
    requires_verified_salon: false,
    purchase_mode: ["retail"],
    min_order_qty: 1,
    max_order_qty: 20,
    merchant_id: "merch-001",
  },
  "prod-unpublished": {
    id: "prod-unpublished",
    name: "Unpublished Draft Product",
    price: 25000,
    discount_price: null,
    stock: 50,
    is_active: true,
    is_published: false,
    visibility_status: "public",
    visible_in: ["all"],
    target_audience: ["all"],
    business_type_tags: ["all"],
    requires_verified_salon: false,
    purchase_mode: ["retail"],
    merchant_id: "merch-001",
  },
  "prod-private": {
    id: "prod-private",
    name: "Private Product",
    price: 30000,
    discount_price: null,
    stock: 50,
    is_active: true,
    is_published: true,
    visibility_status: "private",
    visible_in: ["all"],
    target_audience: ["all"],
    business_type_tags: ["all"],
    requires_verified_salon: false,
    purchase_mode: ["retail"],
    merchant_id: "merch-001",
  },
  "prod-quote-only": {
    id: "prod-quote-only",
    name: "Heavy Salon Chair (Quote Only)",
    price: 500000,
    discount_price: null,
    stock: 10,
    is_active: true,
    is_published: true,
    visibility_status: "public",
    visible_in: ["all"],
    target_audience: ["all"],
    business_type_tags: ["all"],
    requires_verified_salon: false,
    purchase_mode: ["quote_request"],
    merchant_id: "merch-001",
  },
  "prod-verified-salon-only": {
    id: "prod-verified-salon-only",
    name: "Restricted Professional Hair Treatment",
    price: 80000,
    discount_price: null,
    stock: 20,
    is_active: true,
    is_published: true,
    visibility_status: "public",
    visible_in: ["all"],
    target_audience: ["salon_owner", "professional_buyer"],
    business_type_tags: ["all"],
    requires_verified_salon: true,
    purchase_mode: ["b2b"],
    merchant_id: "merch-001",
  },
  "prod-inactive-merchant": {
    id: "prod-inactive-merchant",
    name: "Product from Suspended Merchant",
    price: 20000,
    discount_price: null,
    stock: 20,
    is_active: true,
    is_published: true,
    visibility_status: "public",
    visible_in: ["all"],
    target_audience: ["all"],
    business_type_tags: ["all"],
    requires_verified_salon: false,
    purchase_mode: ["retail"],
    merchant_id: "merch-suspended",
  },
  "prod-mixed-unknown-mode": {
    id: "prod-mixed-unknown-mode",
    name: "Product with Corrupted/Unknown Mode",
    price: 18000,
    discount_price: null,
    stock: 30,
    is_active: true,
    is_published: true,
    visibility_status: "public",
    visible_in: ["all"],
    target_audience: ["all"],
    business_type_tags: ["all"],
    requires_verified_salon: false,
    purchase_mode: ["retail", "UNKNOWN_CORRUPTED_MODE"],
    merchant_id: "merch-001",
  },
};

const merchantsDb = {
  "merch-001": { id: "merch-001", status: "active" },
  "merch-suspended": { id: "merch-suspended", status: "suspended" },
};

function simulateCartAdd(productId, quantity, claims) {
  const product = productsDb[productId];
  if (!product) return { status: 404, message: "Not found" };
  const merchant = merchantsDb[product.merchant_id];
  const merchantStatus = merchant?.status ?? null;

  const viewerCtx = {
    surface: "barber_app",
    segment: claims.segment,
    role: claims.role,
    businessType: claims.businessType,
    salonVerified: claims.salonVerified === true,
    sourceApp: claims.sourceApp,
    isTrusted: claims.isTrusted === true,
  };

  const eligibility = eligibilityService.evaluate(product, {
    channel: "barber_app",
    viewerContext: viewerCtx,
    merchantStatus,
    quantity,
  });

  if (!eligibility.eligible) {
    if (
      eligibility.code === "PRODUCT_NOT_ACTIVE" ||
      eligibility.code === "PRODUCT_NOT_PUBLISHED" ||
      eligibility.code === "PRODUCT_NOT_PUBLIC" ||
      eligibility.code === "VIEWER_NOT_ELIGIBLE"
    ) {
      return { status: 404, code: eligibility.code, message: eligibility.message };
    }
    if (
      eligibility.code === "QUANTITY_BELOW_MINIMUM" ||
      eligibility.code === "QUANTITY_ABOVE_MAXIMUM" ||
      eligibility.code === "INSUFFICIENT_STOCK"
    ) {
      return { status: 422, code: eligibility.code, message: eligibility.message };
    }
    return { status: 400, code: eligibility.code, message: eligibility.message };
  }

  return { status: 200, item: { product_id: product.id, quantity } };
}

function simulateB2BCheckout(cartItems, claims) {
  const viewerCtx = {
    surface: "barber_app",
    segment: claims.segment,
    role: claims.role,
    businessType: claims.businessType,
    salonVerified: claims.salonVerified === true,
    sourceApp: claims.sourceApp,
    isTrusted: claims.isTrusted === true,
  };

  const merchantIds = new Set();
  for (const item of cartItems) {
    const product = productsDb[item.product_id];
    if (!product) return { status: 400, message: "Product missing" };
    merchantIds.add(product.merchant_id);
  }

  if (merchantIds.size !== 1) {
    return { status: 400, message: "Multi-merchant cart not allowed" };
  }

  const merchantId = [...merchantIds][0];
  const merchant = merchantsDb[merchantId];
  if (!merchant || merchant.status !== "active") {
    return { status: 400, code: "MERCHANT_UNAVAILABLE", message: "Merchant inactive" };
  }

  for (const item of cartItems) {
    const product = productsDb[item.product_id];
    const eligibility = eligibilityService.evaluate(product, {
      channel: "barber_app",
      viewerContext: viewerCtx,
      merchantStatus: merchant.status,
      quantity: item.quantity,
    });

    if (!eligibility.eligible) {
      return { status: 400, code: eligibility.code, message: eligibility.message };
    }
  }

  return { status: 200, order_number: "ORD-TEST-001" };
}

function simulateWebCheckout(items) {
  const merchantIds = new Set();
  for (const item of items) {
    const product = productsDb[item.product_id];
    if (!product) return { status: 400, message: "Product missing" };
    merchantIds.add(product.merchant_id);
  }

  if (merchantIds.size !== 1) {
    return { status: 400, message: "Multi-merchant cart not allowed" };
  }

  const merchantId = [...merchantIds][0];
  const merchant = merchantsDb[merchantId];
  if (!merchant || merchant.status !== "active") {
    return { status: 400, code: "MERCHANT_UNAVAILABLE", message: "Merchant inactive" };
  }

  for (const item of items) {
    const product = productsDb[item.product_id];
    const eligibility = eligibilityService.evaluate(product, {
      channel: "web_store",
      merchantStatus: merchant.status,
      quantity: item.quantity,
    });

    if (!eligibility.eligible) {
      return { status: 400, code: eligibility.code, message: eligibility.message };
    }
  }

  return { status: 200, order_number: "WEB-ORD-001" };
}

test("Cart Add: Unpublished product UUID -> 404 DENY", () => {
  const res = simulateCartAdd("prod-unpublished", 1, approvedOwnerClaims);
  assert.equal(res.status, 404);
  assert.equal(res.code, "PRODUCT_NOT_PUBLISHED");
});

test("Cart Add: Private product UUID -> 404 DENY", () => {
  const res = simulateCartAdd("prod-private", 1, approvedOwnerClaims);
  assert.equal(res.status, 404);
  assert.equal(res.code, "PRODUCT_NOT_PUBLIC");
});

test("Cart Add: Quote-only product UUID -> 400 DENY", () => {
  const res = simulateCartAdd("prod-quote-only", 1, approvedOwnerClaims);
  assert.equal(res.status, 400);
  assert.equal(res.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("Cart Add: Inactive merchant product UUID -> 400 DENY", () => {
  const res = simulateCartAdd("prod-inactive-merchant", 1, approvedOwnerClaims);
  assert.equal(res.status, 400);
  assert.equal(res.code, "MERCHANT_UNAVAILABLE");
});

test("Cart Add: Mixed retail + unknown mode UUID -> 400 Fail Closed DENY", () => {
  const res = simulateCartAdd("prod-mixed-unknown-mode", 1, approvedOwnerClaims);
  assert.equal(res.status, 400);
  assert.equal(res.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("Cart Add: Verified-only product + Approved Owner -> 200 ALLOW", () => {
  const res = simulateCartAdd("prod-verified-salon-only", 1, approvedOwnerClaims);
  assert.equal(res.status, 200);
});

test("Cart Add: Verified-only product + Pending Owner -> 404 DENY", () => {
  const res = simulateCartAdd("prod-verified-salon-only", 1, pendingOwnerClaims);
  assert.equal(res.status, 404);
  assert.equal(res.code, "VIEWER_NOT_ELIGIBLE");
});

test("Cart Add: Verified-only product + Barber -> 404 DENY", () => {
  const res = simulateCartAdd("prod-verified-salon-only", 1, barberClaims);
  assert.equal(res.status, 404);
  assert.equal(res.code, "VIEWER_NOT_ELIGIBLE");
});

test("Web Checkout: Verified-only product UUID -> 400 DENY", () => {
  const res = simulateWebCheckout([{ product_id: "prod-verified-salon-only", quantity: 1 }]);
  assert.equal(res.status, 400);
  assert.equal(res.code, "VIEWER_NOT_ELIGIBLE");
});

test("Web Checkout: Quote-only product UUID -> 400 DENY", () => {
  const res = simulateWebCheckout([{ product_id: "prod-quote-only", quantity: 1 }]);
  assert.equal(res.status, 400);
  assert.equal(res.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("Web Checkout: Mixed retail + unknown mode UUID -> 400 Fail Closed DENY", () => {
  const res = simulateWebCheckout([{ product_id: "prod-mixed-unknown-mode", quantity: 1 }]);
  assert.equal(res.status, 400);
  assert.equal(res.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("TOCTOU Protection: Product becomes unpublished before checkout -> Checkout DENY", () => {
  const cartItems = [{ product_id: "prod-normal-retail", quantity: 1 }];
  
  // Initially valid
  const initialCheck = simulateB2BCheckout(cartItems, approvedOwnerClaims);
  assert.equal(initialCheck.status, 200);

  // Merchant unpublishes product before checkout execution
  productsDb["prod-normal-retail"].is_published = false;

  const toctouCheck = simulateB2BCheckout(cartItems, approvedOwnerClaims);
  assert.equal(toctouCheck.status, 400);
  assert.equal(toctouCheck.code, "PRODUCT_NOT_PUBLISHED");

  // Restore for subsequent tests
  productsDb["prod-normal-retail"].is_published = true;
});

test("TOCTOU Protection: Merchant suspended before checkout -> Checkout DENY", () => {
  const cartItems = [{ product_id: "prod-normal-retail", quantity: 1 }];

  // Merchant suspended
  merchantsDb["merch-001"].status = "suspended";

  const toctouCheck = simulateB2BCheckout(cartItems, approvedOwnerClaims);
  assert.equal(toctouCheck.status, 400);
  assert.equal(toctouCheck.code, "MERCHANT_UNAVAILABLE");

  // Restore
  merchantsDb["merch-001"].status = "active";
});
