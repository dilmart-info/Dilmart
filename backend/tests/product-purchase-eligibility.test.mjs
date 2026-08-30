import test from "node:test";
import assert from "node:assert/strict";
import { ProductPurchaseEligibilityService } from "../dist/modules/store-integration/product-purchase-eligibility.service.js";
import { ProductVisibilityService } from "../dist/modules/store-integration/product-visibility.service.js";

const visibility = new ProductVisibilityService();
const eligibility = new ProductPurchaseEligibilityService(visibility);

const baseProduct = {
  id: "prod-1",
  name: "DILMART Test Product",
  is_active: true,
  is_published: true,
  visibility_status: "public",
  visible_in: ["web_store", "customer_app"],
  target_audience: ["all"],
  purchase_mode: ["retail"],
  stock: 50,
  min_order_qty: 1,
  max_order_qty: 10,
};

const baseContext = {
  channel: "web_store",
  merchantStatus: "active",
  quantity: 2,
};

test("1. valid active product + active merchant evaluates to eligible", () => {
  const result = eligibility.evaluate(baseProduct, baseContext);
  assert.equal(result.eligible, true);
  assert.equal(result.code, undefined);
});

test("2. inactive product (is_active: false) rejected fail-closed", () => {
  const result = eligibility.evaluate({ ...baseProduct, is_active: false }, baseContext);
  assert.equal(result.eligible, false);
  assert.equal(result.code, "PRODUCT_NOT_ACTIVE");
});

test("3. unpublished product (is_published: false) rejected", () => {
  const result = eligibility.evaluate({ ...baseProduct, is_published: false }, baseContext);
  assert.equal(result.eligible, false);
  assert.equal(result.code, "PRODUCT_NOT_PUBLISHED");
});

test("4. non-public visibility_status (private / archived) rejected", () => {
  const resPrivate = eligibility.evaluate({ ...baseProduct, visibility_status: "private" }, baseContext);
  assert.equal(resPrivate.eligible, false);
  assert.equal(resPrivate.code, "PRODUCT_NOT_PUBLIC");

  const resArchived = eligibility.evaluate({ ...baseProduct, visibility_status: "archived" }, baseContext);
  assert.equal(resArchived.eligible, false);
  assert.equal(resArchived.code, "PRODUCT_NOT_PUBLIC");
});

test("5. inactive merchant rejected", () => {
  const result = eligibility.evaluate(baseProduct, { ...baseContext, merchantStatus: "suspended" });
  assert.equal(result.eligible, false);
  assert.equal(result.code, "MERCHANT_UNAVAILABLE");
});

test("6. generic public web visibility vs customer_app visibility", () => {
  const webOnlyProduct = { ...baseProduct, visible_in: ["web_store"] };
  const customerAppOnlyProduct = { ...baseProduct, visible_in: ["customer_app"] };

  const webResult = eligibility.evaluate(webOnlyProduct, {
    ...baseContext,
    viewerContext: { surface: "web_store" },
  });
  assert.equal(webResult.eligible, true);

  const appResult = eligibility.evaluate(customerAppOnlyProduct, {
    ...baseContext,
    viewerContext: { surface: "customer_app" },
  });
  assert.equal(appResult.eligible, true);

  const mismatchResult = eligibility.evaluate(customerAppOnlyProduct, {
    ...baseContext,
    viewerContext: { surface: "web_store" },
  });
  assert.equal(mismatchResult.eligible, false);
  assert.equal(mismatchResult.code, "VIEWER_NOT_ELIGIBLE");
});

test("7. target audience allow / deny rules", () => {
  const businessProduct = { ...baseProduct, target_audience: ["business"] };

  // Standard customer viewer
  const custResult = eligibility.evaluate(businessProduct, {
    ...baseContext,
    viewerContext: { surface: "web_store" },
  });
  assert.equal(custResult.eligible, false);
  assert.equal(custResult.code, "VIEWER_NOT_ELIGIBLE");

  // Business segment viewer
  const bizResult = eligibility.evaluate(businessProduct, {
    ...baseContext,
    viewerContext: { surface: "web_store", segment: "business" },
  });
  assert.equal(bizResult.eligible, true);
});

test("8. retail, b2b, and wholesale purchase modes are directly purchasable", () => {
  for (const mode of ["retail", "b2b", "wholesale"]) {
    const res = eligibility.evaluate({ ...baseProduct, purchase_mode: [mode] }, baseContext);
    assert.equal(res.eligible, true, `Mode ${mode} should be purchasable`);
  }
});

test("9. quote_request purchase mode is NOT directly purchasable", () => {
  const res = eligibility.evaluate({ ...baseProduct, purchase_mode: ["quote_request"] }, baseContext);
  assert.equal(res.eligible, false);
  assert.equal(res.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("10. unknown purchase mode or empty purchase modes fail closed", () => {
  const unknownRes = eligibility.evaluate({ ...baseProduct, purchase_mode: ["invalid_custom"] }, baseContext);
  assert.equal(unknownRes.eligible, false);
  assert.equal(unknownRes.code, "PURCHASE_MODE_NOT_ALLOWED");

  const emptyRes = eligibility.evaluate({ ...baseProduct, purchase_mode: [] }, baseContext);
  assert.equal(emptyRes.eligible, false);
  assert.equal(emptyRes.code, "PURCHASE_MODE_NOT_ALLOWED");
});

test("11. minimum quantity enforcement", () => {
  const minProduct = { ...baseProduct, min_order_qty: 5 };
  const failRes = eligibility.evaluate(minProduct, { ...baseContext, quantity: 3 });
  assert.equal(failRes.eligible, false);
  assert.equal(failRes.code, "QUANTITY_BELOW_MINIMUM");

  const passRes = eligibility.evaluate(minProduct, { ...baseContext, quantity: 5 });
  assert.equal(passRes.eligible, true);
});

test("12. maximum quantity enforcement", () => {
  const maxProduct = { ...baseProduct, max_order_qty: 10 };
  const failRes = eligibility.evaluate(maxProduct, { ...baseContext, quantity: 15 });
  assert.equal(failRes.eligible, false);
  assert.equal(failRes.code, "QUANTITY_ABOVE_MAXIMUM");

  const passRes = eligibility.evaluate(maxProduct, { ...baseContext, quantity: 10 });
  assert.equal(passRes.eligible, true);
});

test("13. stock availability enforcement", () => {
  const stockProduct = { ...baseProduct, stock: 5 };
  const failRes = eligibility.evaluate(stockProduct, { ...baseContext, quantity: 6 });
  assert.equal(failRes.eligible, false);
  assert.equal(failRes.code, "INSUFFICIENT_STOCK");

  const passRes = eligibility.evaluate(stockProduct, { ...baseContext, quantity: 5 });
  assert.equal(passRes.eligible, true);
});

test("14. invalid quantity inputs rejected", () => {
  for (const badQty of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
    const res = eligibility.evaluate(baseProduct, { ...baseContext, quantity: badQty });
    assert.equal(res.eligible, false, `Quantity ${badQty} should be rejected`);
    assert.equal(res.code, "INVALID_QUANTITY");
  }
});
