import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveMarketplaceSurface,
  resolveViewerContext,
} from "../dist/modules/store-integration/surface-resolver.js";
import { ProductVisibilityService } from "../dist/modules/store-integration/product-visibility.service.js";

test("1. resolveMarketplaceSurface defaults to web_store", () => {
  assert.equal(resolveMarketplaceSurface(undefined), "web_store");
  assert.equal(resolveMarketplaceSurface(null), "web_store");
  assert.equal(resolveMarketplaceSurface(""), "web_store");
  assert.equal(resolveMarketplaceSurface("unknown"), "web_store");
  assert.equal(resolveMarketplaceSurface("web_store"), "web_store");
});

test("2. resolveMarketplaceSurface resolves customer_app", () => {
  assert.equal(resolveMarketplaceSurface("customer_app"), "customer_app");
});

test("3. resolveViewerContext builds correct marketplace viewer context", () => {
  const defaultCtx = resolveViewerContext();
  assert.equal(defaultCtx.surface, "web_store");
  assert.equal(defaultCtx.isTrusted, false);

  const customCtx = resolveViewerContext("customer_app", {
    segment: "business",
    businessType: "retail_store",
    isTrusted: true,
  });
  assert.equal(customCtx.surface, "customer_app");
  assert.equal(customCtx.segment, "business");
  assert.equal(customCtx.businessType, "retail_store");
  assert.equal(customCtx.isTrusted, true);
});

test("4. ProductVisibilityService resolves audience and filters correctly", () => {
  const service = new ProductVisibilityService();

  assert.deepEqual(service.resolveAudienceFromViewerContext(), ["customer", "all"]);
  assert.deepEqual(service.resolveAudienceFromViewerContext({ surface: "web_store" }), ["customer", "all"]);
  assert.deepEqual(
    service.resolveAudienceFromViewerContext({ surface: "web_store", segment: "business" }),
    ["business", "customer", "all"],
  );

  // Active product with 'all' audience and 'all' surface is visible everywhere
  assert.equal(
    service.canProductBeShown({
      is_active: true,
      visible_in: ["all"],
      target_audience: ["all"],
    }),
    true,
  );

  // Inactive product is never visible
  assert.equal(
    service.canProductBeShown({
      is_active: false,
      visible_in: ["all"],
      target_audience: ["all"],
    }),
    false,
  );

  // Unpublished product is not visible
  assert.equal(
    service.canProductBeShown({
      is_active: true,
      is_published: false,
      visible_in: ["all"],
      target_audience: ["all"],
    }),
    false,
  );

  // Private product is not visible
  assert.equal(
    service.canProductBeShown({
      is_active: true,
      visibility_status: "private",
      visible_in: ["all"],
      target_audience: ["all"],
    }),
    false,
  );

  // Surface restrictions
  assert.equal(
    service.canProductBeShown(
      { is_active: true, visible_in: ["web_store"] },
      { surface: "customer_app" },
    ),
    false,
  );
  assert.equal(
    service.canProductBeShown(
      { is_active: true, visible_in: ["customer_app"] },
      { surface: "customer_app" },
    ),
    true,
  );
});
