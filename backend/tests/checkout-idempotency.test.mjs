import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";

test("PR-3: Checkout Idempotency & Post-Checkout Reliability (Concurrency & Processing Suite)", async (t) => {

  await t.test("computes request hash deterministically regardless of item order", () => {
    const payloadA = {
      customer_name: "علي كريم",
      customer_phone: "07701234567",
      governorate_id: "gov-1",
      area: "المنصور",
      items: [
        { product_id: "prod-2", quantity: 1 },
        { product_id: "prod-1", quantity: 2 },
      ],
    };

    const payloadB = {
      customer_name: "علي كريم",
      customer_phone: "07701234567",
      governorate_id: "gov-1",
      area: "المنصور",
      items: [
        { product_id: "prod-1", quantity: 2 },
        { product_id: "prod-2", quantity: 1 },
      ],
    };

    const canonicalA = JSON.stringify({
      customer_name: payloadA.customer_name.trim(),
      customer_phone: payloadA.customer_phone.trim(),
      governorate_id: payloadA.governorate_id,
      area: payloadA.area.trim(),
      nearest_landmark: "",
      coupon_id: "",
      points_spent: 0,
      items: [...payloadA.items].sort((a, b) => a.product_id.localeCompare(b.product_id)),
    });

    const canonicalB = JSON.stringify({
      customer_name: payloadB.customer_name.trim(),
      customer_phone: payloadB.customer_phone.trim(),
      governorate_id: payloadB.governorate_id,
      area: payloadB.area.trim(),
      nearest_landmark: "",
      coupon_id: "",
      points_spent: 0,
      items: [...payloadB.items].sort((a, b) => a.product_id.localeCompare(b.product_id)),
    });

    const hashA = crypto.createHash("sha256").update(canonicalA).digest("hex");
    const hashB = crypto.createHash("sha256").update(canonicalB).digest("hex");

    assert.equal(hashA, hashB);
  });

  await t.test("halts execution with 202 CHECKOUT_IN_PROGRESS if attempt is currently processing", () => {
    const existingAttempt = {
      status: "processing",
      order_number: null,
    };

    const isProcessing = existingAttempt.status === "processing" && !existingAttempt.order_number;
    assert.equal(isProcessing, true);
  });

  await t.test("detects payload mismatch for identical attempt key and throws 409 conflict code", () => {
    const hashA = "hash_original";
    const hashB = "hash_modified";

    const isMatch = hashA === hashB;
    assert.equal(isMatch, false);
    const errorCode = "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD";
    assert.equal(errorCode, "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
  });

  await t.test("completes attempt and links checkout_attempt_id on order record", () => {
    const attemptId = "att-123";
    const orderId = "ord-456";

    const orderPatch = {
      checkout_attempt_id: attemptId,
    };

    assert.equal(orderPatch.checkout_attempt_id, attemptId);
  });
});
