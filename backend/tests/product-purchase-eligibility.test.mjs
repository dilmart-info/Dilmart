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

const baseProduct = {
  id: "prod-001",
  name: "Classic Barber Scissors",
  is_active: true,
  is_published: true,
  visibility_status: "public",
  visible_in: ["all"],
  target_audience: ["all"],
  business_type_tags: ["all"],
  requires_verified_salon: false,
  purchase_mode: ["retail"],
  stock: 100,
  min_order_qty: 1,
  max_order_qty: 50,
};

const approvedOwnerCtx = {
  surface: "barber_app",
  role: "OWNER",
  segment: "DilMart_APP_BARBER_OWNER",
  isTrusted: true,
  salonVerified: true,
};

const pendingOwnerCtx = {
  surface: "barber_app",
  role: "OWNER",
  segment: "DilMart_APP_BARBER_OWNER",
  isTrusted: true,
  salonVerified: false,
};

const barberCtx = {
  surface: "barber_app",
  role: "BARBER",
  segment: "DilMart_APP_BARBER_STAFF",
  isTrusted: true,
  salonVerified: false,
};

test("1. Normal public retail product -> Web ALLOW", () => {
  const res = eligibilityService.evaluate(baseProduct, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 2,
  });
  assert.equal(res.eligible, true);
});

test("2. Normal public retail product -> Barber App ALLOW", () => {
  const res = eligibilityService.evaluate(baseProduct, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 2,
  });
  assert.equal(res.eligible, true);
});

test("3. Unpublished product -> Web and Barber DENY", () => {
  const unpub = { ...baseProduct, is_published: false };
  const resWeb = eligibilityService.evaluate(unpub, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, false);
  assert.equal(resWeb.code, "PRODUCT_NOT_PUBLISHED");

  const resBarber = eligibilityService.evaluate(unpub, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, false);
  assert.equal(resBarber.code, "PRODUCT_NOT_PUBLISHED");
});

test("4. Private visibility_status -> Web and Barber DENY", () => {
  const priv = { ...baseProduct, visibility_status: "private" };
  const resWeb = eligibilityService.evaluate(priv, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, false);
  assert.equal(resWeb.code, "PRODUCT_NOT_PUBLIC");

  const resBarber = eligibilityService.evaluate(priv, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, false);
  assert.equal(resBarber.code, "PRODUCT_NOT_PUBLIC");
});

test("5. Archived visibility_status -> Web and Barber DENY", () => {
  const arch = { ...baseProduct, visibility_status: "archived" };
  const resWeb = eligibilityService.evaluate(arch, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, false);
  assert.equal(resWeb.code, "PRODUCT_NOT_PUBLIC");
});

test("6. Inactive product -> Web and Barber DENY", () => {
  const inact = { ...baseProduct, is_active: false };
  const res = eligibilityService.evaluate(inact, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "PRODUCT_NOT_ACTIVE");
});

test("7. Inactive merchant -> Web and Barber DENY", () => {
  const res = eligibilityService.evaluate(baseProduct, {
    channel: "web_store",
    merchantStatus: "suspended",
    quantity: 1,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "MERCHANT_UNAVAILABLE");
});

test("8. Verified-only product + Approved OWNER -> ALLOW", () => {
  const verifiedProd = { ...baseProduct, requires_verified_salon: true, purchase_mode: ["b2b"] };
  const res = eligibilityService.evaluate(verifiedProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(res.eligible, true);
});

test("9. Verified-only product + Pending OWNER -> DENY", () => {
  const verifiedProd = { ...baseProduct, requires_verified_salon: true, purchase_mode: ["b2b"] };
  const res = eligibilityService.evaluate(verifiedProd, {
    channel: "barber_app",
    viewerContext: pendingOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "VIEWER_NOT_ELIGIBLE");
});

test("10. Verified-only product + BARBER -> DENY", () => {
  const verifiedProd = { ...baseProduct, requires_verified_salon: true, purchase_mode: ["b2b"] };
  const res = eligibilityService.evaluate(verifiedProd, {
    channel: "barber_app",
    viewerContext: barberCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "VIEWER_NOT_ELIGIBLE");
});

test("11. Verified-only product + Web Customer Checkout -> DENY", () => {
  const verifiedProd = { ...baseProduct, requires_verified_salon: true, purchase_mode: ["retail"] };
  const res = eligibilityService.evaluate(verifiedProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "VIEWER_NOT_ELIGIBLE");
});

test("12. Quote-only product -> Web DENY & Barber DENY", () => {
  const quoteProd = { ...baseProduct, purchase_mode: ["quote_request"] };
  const resWeb = eligibilityService.evaluate(quoteProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, false);
  assert.equal(resWeb.code, "PURCHASE_MODE_NOT_ALLOWED");

  const resBarber = eligibilityService.evaluate(quoteProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, false);
  assert.equal(resBarber.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("13. Retail + Quote mixed modes -> Web ALLOW & Barber ALLOW", () => {
  const mixedProd = { ...baseProduct, purchase_mode: ["retail", "quote_request"] };
  const resWeb = eligibilityService.evaluate(mixedProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, true);

  const resBarber = eligibilityService.evaluate(mixedProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, true);
});

test("14. B2B + Quote mixed modes -> Web DENY & Barber ALLOW", () => {
  const b2bQuoteProd = { ...baseProduct, purchase_mode: ["b2b", "quote_request"] };
  const resWeb = eligibilityService.evaluate(b2bQuoteProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, false);
  assert.equal(resWeb.code, "PURCHASE_MODE_NOT_ALLOWED");

  const resBarber = eligibilityService.evaluate(b2bQuoteProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, true);
});

test("15. B2B mode only -> Web DENY & Barber ALLOW", () => {
  const b2bProd = { ...baseProduct, purchase_mode: ["b2b"] };
  const resWeb = eligibilityService.evaluate(b2bProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, false);
  assert.equal(resWeb.code, "PURCHASE_MODE_NOT_ALLOWED");

  const resBarber = eligibilityService.evaluate(b2bProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, true);
});

test("16. Wholesale mode only -> Web DENY & Barber ALLOW", () => {
  const wsProd = { ...baseProduct, purchase_mode: ["wholesale"] };
  const resWeb = eligibilityService.evaluate(wsProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, false);

  const resBarber = eligibilityService.evaluate(wsProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, true);
});

test("17. Unknown-only purchase mode -> Fail closed DENY", () => {
  const unknownProd = { ...baseProduct, purchase_mode: ["unknown_special_mode"] };
  const res = eligibilityService.evaluate(unknownProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "PURCHASE_MODE_NOT_ALLOWED");

  const emptyProd = { ...baseProduct, purchase_mode: [] };
  const resEmpty = eligibilityService.evaluate(emptyProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resEmpty.eligible, false);
  assert.equal(resEmpty.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("18. Mixed Retail + Unknown purchase mode -> Web & Barber Fail Closed DENY", () => {
  const mixedUnknownProd = { ...baseProduct, purchase_mode: ["retail", "UNKNOWN_MODE"] };
  const resWeb = eligibilityService.evaluate(mixedUnknownProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resWeb.eligible, false);
  assert.equal(resWeb.code, "PURCHASE_MODE_NOT_ALLOWED");

  const resBarber = eligibilityService.evaluate(mixedUnknownProd, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, false);
  assert.equal(resBarber.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("19. Mixed B2B + Unknown purchase mode -> Barber Fail Closed DENY", () => {
  const mixedB2BUnknown = { ...baseProduct, purchase_mode: ["b2b", "UNKNOWN_MODE"] };
  const resBarber = eligibilityService.evaluate(mixedB2BUnknown, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, false);
  assert.equal(resBarber.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("20. Mixed Wholesale + Future purchase mode -> Barber Fail Closed DENY", () => {
  const mixedWsUnknown = { ...baseProduct, purchase_mode: ["wholesale", "future_mode"] };
  const resBarber = eligibilityService.evaluate(mixedWsUnknown, {
    channel: "barber_app",
    viewerContext: approvedOwnerCtx,
    merchantStatus: "active",
    quantity: 1,
  });
  assert.equal(resBarber.eligible, false);
  assert.equal(resBarber.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("21. Quantity constraints: below min -> DENY", () => {
  const minProd = { ...baseProduct, min_order_qty: 5 };
  const res = eligibilityService.evaluate(minProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 3,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "QUANTITY_BELOW_MINIMUM");
});

test("22. Quantity constraints: above max -> DENY", () => {
  const maxProd = { ...baseProduct, max_order_qty: 10 };
  const res = eligibilityService.evaluate(maxProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 15,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "QUANTITY_ABOVE_MAXIMUM");
});

test("23. Stock constraints: above stock -> DENY", () => {
  const stockProd = { ...baseProduct, stock: 4 };
  const res = eligibilityService.evaluate(stockProd, {
    channel: "web_store",
    merchantStatus: "active",
    quantity: 5,
  });
  assert.equal(res.eligible, false);
  assert.equal(res.code, "INSUFFICIENT_STOCK");
});
