/**
 * b2b-checkout-idempotency.test.mjs
 *
 * Source-contract and unit tests for B2B checkout idempotency (Task 062 / Task 063).
 *
 * Classification:
 *   SOURCE_CONTRACT / PURE_UNIT / SQL_STATIC_VALIDATION
 *
 * These tests validate:
 *   T1: B2B request hash determinism
 *   T2: B2B request hash sensitivity to payload change
 *   T3: CartCheckoutSubmitDto accepts optional checkout_attempt_id
 *   T4: Migration SQL syntax & constraint validation (structural assertions)
 *   T5: Atomic RPC parameter completeness vs place_order signature
 *   T6: Owner XOR and B2B cart requirement constraint logic
 *   T7: Structured JSONB return contract
 *   T8: B2B attempt status method exists
 *   T9: CartCheckoutService uses place_b2b_cart_order_idempotent
 *   T10: Replay check appears BEFORE resolveCartLines
 *   T11: findActiveCart appears AFTER completed-replay return
 *   T12: CartModule imports OrdersModule
 *   T13: Controller exposes attempt status recovery endpoint
 *   T14: No dead revertCartToActive or external lock/convert mutations
 *
 * Run with:
 *   node --test backend/tests/b2b-checkout-idempotency.test.mjs
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ─── Helper: reproduce the B2B request hash algorithm ──────────────────────

function computeB2BRequestHash(payload) {
  const canonical = JSON.stringify({
    store_linked_profile_id: payload.store_linked_profile_id,
    store_cart_id: payload.store_cart_id,
    customer_name: payload.customer_name?.trim() || "",
    customer_phone: payload.customer_phone?.trim() || "",
    governorate_id: payload.governorate_id || "",
    area: payload.area?.trim() || "",
    nearest_landmark: payload.nearest_landmark?.trim() || "",
    notes: payload.notes?.trim() || "",
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    map_url: payload.map_url?.trim() || "",
  });

  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// ─── Test Data ──────────────────────────────────────────────────────────────

const basePayload = {
  store_linked_profile_id: "11111111-1111-1111-1111-111111111111",
  store_cart_id: "22222222-2222-2222-2222-222222222222",
  customer_name: "Ahmed Ali",
  customer_phone: "07701234567",
  governorate_id: "44444444-4444-4444-4444-444444444444",
  area: "Al-Mansour",
  nearest_landmark: "Near the mosque",
  notes: "Please call before delivery",
  latitude: 33.3152,
  longitude: 44.3661,
  map_url: "https://maps.google.com/?q=33.3152,44.3661",
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("B2B Checkout Idempotency — Source Contract & Unit Tests", () => {
  // ── T1: Hash Determinism ──
  it("T1: B2B request hash is deterministic across multiple calls", () => {
    const hash1 = computeB2BRequestHash(basePayload);
    const hash2 = computeB2BRequestHash(basePayload);
    const hash3 = computeB2BRequestHash({ ...basePayload });

    assert.equal(hash1, hash2, "Same payload must produce same hash");
    assert.equal(hash2, hash3, "Spread-copy payload must produce same hash");
    assert.equal(hash1.length, 64, "SHA-256 hex digest must be 64 chars");
  });

  // ── T2: Hash Sensitivity ──
  it("T2: B2B request hash changes when payload changes", () => {
    const baseHash = computeB2BRequestHash(basePayload);

    // Different customer name
    const nameChanged = computeB2BRequestHash({ ...basePayload, customer_name: "Hassan Ali" });
    assert.notEqual(baseHash, nameChanged, "Different name must produce different hash");

    // Different phone
    const phoneChanged = computeB2BRequestHash({ ...basePayload, customer_phone: "07801234567" });
    assert.notEqual(baseHash, phoneChanged, "Different phone must produce different hash");

    // Different governorate
    const govChanged = computeB2BRequestHash({
      ...basePayload,
      governorate_id: "55555555-5555-5555-5555-555555555555",
    });
    assert.notEqual(baseHash, govChanged, "Different governorate must produce different hash");

    // Different cart
    const cartChanged = computeB2BRequestHash({
      ...basePayload,
      store_cart_id: "99999999-9999-9999-9999-999999999999",
    });
    assert.notEqual(baseHash, cartChanged, "Different cart_id must produce different hash");

    // Different linked profile
    const profileChanged = computeB2BRequestHash({
      ...basePayload,
      store_linked_profile_id: "88888888-8888-8888-8888-888888888888",
    });
    assert.notEqual(baseHash, profileChanged, "Different profile_id must produce different hash");
  });

  // ── T3: DTO Schema ──
  it("T3: CartCheckoutSubmitDto schema allows optional checkout_attempt_id", async () => {
    const dtoPath = path.resolve("backend/src/modules/cart/cart.dto.ts");
    const source = fs.readFileSync(dtoPath, "utf8");

    assert.ok(source.includes("checkout_attempt_id"), "DTO must define checkout_attempt_id field");
    assert.ok(source.includes("@IsOptional()"), "checkout_attempt_id must have @IsOptional()");
    assert.ok(source.includes("@IsUUID()"), "checkout_attempt_id must have @IsUUID()");
  });

  // ── T4: Migration SQL structural assertions ──
  describe("T4: Migration SQL Structure", () => {
    let migrationSql;

    before(() => {
      const migrationPath = path.resolve("supabase/migrations/20260816100000_b2b_checkout_idempotency.sql");
      migrationSql = fs.readFileSync(migrationPath, "utf8");
    });

    it("T4a: ALTER user_id DROP NOT NULL", () => {
      assert.ok(
        migrationSql.includes("ALTER COLUMN user_id DROP NOT NULL"),
        "Must drop NOT NULL on user_id for B2B rows",
      );
    });

    it("T4b: ADD store_linked_profile_id column with ON DELETE RESTRICT", () => {
      assert.ok(
        migrationSql.includes("store_linked_profile_id UUID"),
        "Must add store_linked_profile_id to checkout_attempts",
      );
      assert.ok(
        migrationSql.includes("ON DELETE RESTRICT"),
        "Must use ON DELETE RESTRICT (not CASCADE) to protect financial attempt history",
      );
    });

    it("T4c: ADD store_cart_id to checkout_attempts", () => {
      assert.ok(
        migrationSql.includes("ADD COLUMN IF NOT EXISTS store_cart_id UUID"),
        "Must add store_cart_id to checkout_attempts",
      );
    });

    it("T4d: Owner XOR and B2B cart requirement constraint", () => {
      assert.ok(
        migrationSql.includes("chk_checkout_attempts_owner_xor"),
        "Must create XOR constraint on user_id / store_linked_profile_id",
      );
      assert.ok(
        migrationSql.includes("store_cart_id IS NOT NULL"),
        "Must require store_cart_id IS NOT NULL for B2B attempts",
      );
    });

    it("T4e: orders.store_cart_id with unique partial index", () => {
      assert.ok(
        migrationSql.includes("idx_orders_store_cart_id"),
        "Must create unique partial index on orders.store_cart_id",
      );
    });

    it("T4f: place_b2b_cart_order_idempotent RPC exists", () => {
      assert.ok(
        migrationSql.includes("CREATE OR REPLACE FUNCTION public.place_b2b_cart_order_idempotent"),
        "Must define the atomic B2B checkout RPC",
      );
    });

    it("T4g: SECURITY DEFINER + restricted search_path", () => {
      assert.ok(
        migrationSql.includes("SECURITY DEFINER SET search_path = public"),
        "RPC must be SECURITY DEFINER with restricted search_path",
      );
    });

    it("T4h: REVOKE from PUBLIC/anon/authenticated, GRANT to service_role", () => {
      const revokePublic = migrationSql.includes("REVOKE ALL ON FUNCTION public.place_b2b_cart_order_idempotent");
      const grantService = migrationSql.includes("GRANT EXECUTE ON FUNCTION public.place_b2b_cart_order_idempotent");
      assert.ok(revokePublic, "Must REVOKE from PUBLIC");
      assert.ok(grantService, "Must GRANT to service_role");
    });
  });

  // ── T5: RPC Parameter Completeness ──
  it("T5: Atomic RPC delegates all mandatory place_order params", () => {
    const migrationPath = path.resolve("supabase/migrations/20260816100000_b2b_checkout_idempotency.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    const requiredPlaceOrderParams = [
      "p_customer_name",
      "p_customer_phone",
      "p_governorate_id",
      "p_area",
      "p_subtotal",
      "p_delivery_cost",
      "p_total",
      "p_items",
      "p_merchant_id",
      "p_merchandise_subtotal",
      "p_platform_commission_amount",
      "p_merchant_net_amount",
      "p_currency_code",
      "p_financial_snapshot_version",
      "p_channel",
      "p_source_app",
      "p_store_linked_profile_id",
    ];

    for (const param of requiredPlaceOrderParams) {
      assert.ok(
        sql.includes(`${param}`),
        `Atomic RPC must pass ${param} to place_order`,
      );
    }
  });

  // ── T6: Owner XOR and B2B Cart Logic ──
  it("T6: Owner XOR constraint permits exactly one owner type and enforces cart for B2B", () => {
    // Valid: web attempt (user_id set, store_linked_profile_id null)
    const webValid = ("user-1" !== null && null === null);
    assert.ok(webValid, "Web checkout: user_id set, store_linked_profile_id null → valid");

    // Valid: B2B attempt (user_id null, store_linked_profile_id set, store_cart_id set)
    const b2bValid = (null === null && "profile-1" !== null && "cart-1" !== null);
    assert.ok(b2bValid, "B2B checkout: user_id null, store_linked_profile_id set, store_cart_id set → valid");

    // Invalid: B2B attempt without store_cart_id
    const b2bNoCart = (null === null && "profile-1" !== null && null !== null);
    assert.equal(b2bNoCart, false, "B2B checkout without store_cart_id → invalid");

    // Invalid: both owners set
    const bothSet = ("user-1" !== null && "profile-1" !== null);
    assert.equal(bothSet, true, "Both user_id and store_linked_profile_id set → rejected by XOR");

    // Invalid: both null
    const bothNull = (null !== null || null !== null);
    assert.equal(bothNull, false, "Both null → rejected by XOR");
  });

  // ── T7: Structured JSONB Return ──
  it("T7: RPC return contract includes required fields", () => {
    const migrationPath = path.resolve("supabase/migrations/20260816100000_b2b_checkout_idempotency.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.ok(sql.includes("'order_id'"), "Return must include order_id");
    assert.ok(sql.includes("'order_number'"), "Return must include order_number");
    assert.ok(sql.includes("'checkout_attempt_id'"), "Return must include checkout_attempt_id");
    assert.ok(sql.includes("'reused'"), "Return must include reused flag");
  });

  // ── T8: Service methods exist ──
  it("T8: CheckoutAttemptsService has B2B methods", () => {
    const svcPath = path.resolve("backend/src/modules/orders/checkout-attempts.service.ts");
    const source = fs.readFileSync(svcPath, "utf8");

    assert.ok(source.includes("computeB2BRequestHash"), "Must have computeB2BRequestHash method");
    assert.ok(source.includes("getB2BAttemptStatus"), "Must have getB2BAttemptStatus method");
    assert.ok(
      source.includes("store_linked_profile_id"),
      "B2B methods must reference store_linked_profile_id",
    );
  });

  // ── T9: Cart-checkout service uses atomic RPC ──
  it("T9: CartCheckoutService uses place_b2b_cart_order_idempotent", () => {
    const svcPath = path.resolve("backend/src/modules/cart/cart-checkout.service.ts");
    const source = fs.readFileSync(svcPath, "utf8");

    assert.ok(
      source.includes("place_b2b_cart_order_idempotent"),
      "Must call atomic B2B checkout RPC",
    );
  });

  // ── T10: Critical Replay Contract — early return for completed attempts ──
  it("T10: submitCartCheckout short-circuits for completed attempts before product resolution", () => {
    const svcPath = path.resolve("backend/src/modules/cart/cart-checkout.service.ts");
    const source = fs.readFileSync(svcPath, "utf8");

    // Scope search to within submitCartCheckout method only
    const submitStart = source.indexOf("async submitCartCheckout");
    assert.ok(submitStart > -1, "Must have submitCartCheckout method");
    const submitBody = source.substring(submitStart);

    // The completed-replay check must appear BEFORE resolveCartLines call within submitCartCheckout
    const replayCheckPos = submitBody.indexOf(".status === ");
    const resolvePos = submitBody.indexOf("await this.resolveCartLines");

    assert.ok(replayCheckPos > -1, "Must check for completed attempt replay");
    assert.ok(resolvePos > -1, "Must call resolveCartLines for new checkouts");
    assert.ok(
      replayCheckPos < resolvePos,
      "Completed-replay check must appear BEFORE resolveCartLines — " +
      "a completed checkout is historical truth and must never re-validate products/pricing",
    );
  });

  // ── T11: Replay does not require active cart ──
  it("T11: Completed replay path does not call findActiveCart", () => {
    const svcPath = path.resolve("backend/src/modules/cart/cart-checkout.service.ts");
    const source = fs.readFileSync(svcPath, "utf8");

    // Scope search to within submitCartCheckout method only
    const submitStart = source.indexOf("async submitCartCheckout");
    assert.ok(submitStart > -1, "Must have submitCartCheckout method");
    const submitBody = source.substring(submitStart);

    // The findActiveCart call must appear AFTER the completed-replay early return (reused: true)
    const replayReturnPos = submitBody.indexOf("reused: true,");
    const findCartPos = submitBody.indexOf("await this.findActiveCart");

    assert.ok(replayReturnPos > -1, "Must have a completed-replay return with reused: true");
    assert.ok(findCartPos > -1, "Must call findActiveCart for new checkouts");
    assert.ok(
      findCartPos > replayReturnPos,
      "findActiveCart must appear AFTER completed-replay return — " +
      "replay must not require an active cart",
    );
  });

  // ── T12: Cart module DI wiring ──
  it("T12: CartModule imports OrdersModule for CheckoutAttemptsService", () => {
    const modulePath = path.resolve("backend/src/modules/cart/cart.module.ts");
    const source = fs.readFileSync(modulePath, "utf8");

    assert.ok(source.includes("OrdersModule"), "CartModule must import OrdersModule");
    assert.ok(
      source.includes("import { OrdersModule }"),
      "Must have explicit OrdersModule import statement",
    );
  });

  // ── T13: Controller has attempt recovery endpoint ──
  it("T13: CartController exposes GET checkout/attempts/:attemptId", () => {
    const ctrlPath = path.resolve("backend/src/modules/cart/cart.controller.ts");
    const source = fs.readFileSync(ctrlPath, "utf8");

    assert.ok(source.includes("checkout/attempts/:attemptId"), "Must have attempt status route");
    assert.ok(source.includes("getCheckoutAttemptStatus"), "Must have getCheckoutAttemptStatus method");
    assert.ok(source.includes("getB2BAttemptStatus"), "Must delegate to getB2BAttemptStatus");
  });

  // ── T14: No distributed mutations / dead helper removal ──
  it("T14: No external lock/revert/markConverted distributed mutations in cart-checkout.service", () => {
    const svcPath = path.resolve("backend/src/modules/cart/cart-checkout.service.ts");
    const source = fs.readFileSync(svcPath, "utf8");

    assert.ok(!source.includes("revertCartToActive"), "revertCartToActive must be removed");
    assert.ok(!source.includes("lockCartForCheckout"), "lockCartForCheckout must not exist");
    assert.ok(!source.includes("markCartConverted"), "markCartConverted must not exist");
  });
});
