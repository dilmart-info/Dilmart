import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

test("PR-4: Returns, Refunds, and Cancellation Reviews (Database Integration Suite)", async (t) => {
  const supabase = getTestClient();

  const setupOrderAndReturn = async (initialStatus = "approved") => {
    const phone = "+96477" + Math.floor(10000000 + Math.random() * 90000000);
    const email = `refund-user-${crypto.randomBytes(4).toString("hex")}@example.com`;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      phone,
      password: "password123",
      email_confirm: true,
      phone_confirm: true,
    });

    if (authError) throw authError;
    const customerId = authData.user.id;

    const { error: profErr } = await supabase.from("profiles").update({
      full_name: "Customer User",
      phone,
    }).eq("id", customerId);
    if (profErr) throw profErr;

    const merchantId = crypto.randomUUID();
    const { error: merchErr } = await supabase.from("merchants").insert({
      id: merchantId,
      name_ar: "Test Merchant",
      name_en: "Test Merchant",
      display_name: "Test Merchant",
      slug: "test-merchant-" + crypto.randomBytes(4).toString("hex"),
      status: "active",
    });
    if (merchErr) throw merchErr;

    const orderId = crypto.randomUUID();
    const { error: orderErr } = await supabase.from("orders").insert({
      id: orderId,
      order_number: "ORD-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      customer_name: "Customer User",
      customer_phone: phone,
      area: "المنصور",
      subtotal: 15000,
      delivery_cost: 0,
      total: 15000,
      user_id: customerId,
      merchant_id: merchantId,
      status: "delivered",
      delivery_status: "delivered",
    });
    if (orderErr) throw orderErr;

    const returnRequestId = crypto.randomUUID();
    const { data: retReq, error } = await supabase.from("order_return_requests").insert({
      id: returnRequestId,
      order_id: orderId,
      customer_id: customerId,
      merchant_id: merchantId,
      reason_code: "defective_product",
      status: initialStatus,
    }).select().single();

    if (error) throw error;
    return { customerId, merchantId, orderId, returnRequestId };
  };

  await t.test("review_return_request_atomic handles status transitions and creates outbox events", async () => {
    const { returnRequestId, customerId } = await setupOrderAndReturn("pending_review");

    // 1. Transition pending_review -> approved
    const { data: res1, error: err1 } = await supabase.rpc("review_return_request_atomic", {
      p_return_request_id: returnRequestId,
      p_decision: "approve",
      p_actor_id: customerId,
      p_admin_notes: "Approved return request",
      p_merchant_notes: "",
      p_expected_merchant_id: null,
    });
    assert.equal(err1, null, err1?.message);
    assert.equal(res1.success, true);
    assert.equal(res1.status, "approved");

    // 2. Transition approved -> awaiting_item
    const { data: res2, error: err2 } = await supabase.rpc("review_return_request_atomic", {
      p_return_request_id: returnRequestId,
      p_decision: "awaiting_item",
      p_actor_id: customerId,
      p_admin_notes: "Awaiting customer item shipment",
      p_merchant_notes: "",
      p_expected_merchant_id: null,
    });
    assert.equal(err2, null, err2?.message);
    assert.equal(res2.success, true);
    assert.equal(res2.status, "awaiting_item");

    // Check outbox
    const { data: outbox } = await supabase
      .from("notification_outbox")
      .select("*")
      .eq("event_key", `return-review:${returnRequestId}:awaiting_item`)
      .single();
    assert.ok(outbox, "Should insert outbox notification on transition");
  });

  await t.test("mark_return_item_received_atomic updates request status, order status and delivery_events", async () => {
    const { returnRequestId, orderId, customerId } = await setupOrderAndReturn("awaiting_item");

    const { data: res, error } = await supabase.rpc("mark_return_item_received_atomic", {
      p_request_id: returnRequestId,
      p_actor_id: customerId,
      p_notes: "Checked item in warehouse",
    });

    assert.equal(error, null, error?.message);
    assert.equal(res.success, true);
    assert.equal(res.status, "item_received");

    // Verify request
    const { data: req } = await supabase.from("order_return_requests").select("*").eq("id", returnRequestId).single();
    assert.equal(req.status, "item_received");
    assert.ok(req.received_at, "received_at must be populated");

    // Verify order
    const { data: order } = await supabase.from("orders").select("status, delivery_status").eq("id", orderId).single();
    assert.equal(order.status, "returned");
    assert.equal(order.delivery_status, "returned");

    // Verify delivery_events
    const { data: events } = await supabase.from("delivery_events").select("*").eq("order_id", orderId);
    assert.ok(events.length > 0, "Should insert transition delivery event");
    assert.equal(events[0].event_type, "returned");
  });

  await t.test("complete_return_refund_atomic verifies positive amount, total limit, and idempotency", async () => {
    const { returnRequestId, orderId, customerId } = await setupOrderAndReturn("awaiting_item");

    const { error: markErr } = await supabase.rpc("mark_return_item_received_atomic", {
      p_request_id: returnRequestId,
      p_actor_id: customerId,
      p_notes: "Checked item in warehouse",
    });
    if (markErr) throw markErr;

    // 1. Negative amount fails
    const { error: errNeg } = await supabase.rpc("complete_return_refund_atomic", {
      p_request_id: returnRequestId,
      p_refund_amount: -500,
      p_refund_reference: "REF-12345",
      p_notes: "Refund negative",
    });
    assert.ok(errNeg, "Negative refund amount must fail check constraint");

    // 2. Amount exceeding order total fails
    const { error: errExceed } = await supabase.rpc("complete_return_refund_atomic", {
      p_request_id: returnRequestId,
      p_refund_amount: 20000, // Order total is 15000
      p_refund_reference: "REF-123456",
      p_notes: "Refund exceeding total",
    });
    assert.ok(errExceed, "Refund exceeding order total must fail");

    // 3. Successful refund completion
    const refundRef = "REF-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const { data: res, error: errSuccess } = await supabase.rpc("complete_return_refund_atomic", {
      p_request_id: returnRequestId,
      p_refund_amount: 15000,
      p_refund_reference: refundRef,
      p_notes: "Refund complete",
    });

    assert.equal(errSuccess, null, errSuccess?.message);
    assert.equal(res.success, true);
    assert.equal(res.status, "completed");

    // 4. Idempotency test (same amount and reference)
    const { data: resIdempotent, error: errIdempotent } = await supabase.rpc("complete_return_refund_atomic", {
      p_request_id: returnRequestId,
      p_refund_amount: 15000,
      p_refund_reference: refundRef,
      p_notes: "Refund complete retry",
    });
    assert.equal(errIdempotent, null, errIdempotent?.message);
    assert.equal(resIdempotent.success, true);
    assert.equal(resIdempotent.already_completed, true);

    // 5. Calling complete refund with DIFFERENT reference or amount fails
    const { error: errDifferent } = await supabase.rpc("complete_return_refund_atomic", {
      p_request_id: returnRequestId,
      p_refund_amount: 14000,
      p_refund_reference: refundRef + "-DIFF",
      p_notes: "Refund complete with different amount",
    });
    assert.ok(errDifferent, "Refusing completion with different amounts/references after completed");
  });

  await t.test("enforces unique refund_reference constraint across return requests", async () => {
    const setup1 = await setupOrderAndReturn("awaiting_item");
    const setup2 = await setupOrderAndReturn("awaiting_item");

    const { error: markErr1 } = await supabase.rpc("mark_return_item_received_atomic", {
      p_request_id: setup1.returnRequestId,
      p_actor_id: setup1.customerId,
      p_notes: "Item 1 received",
    });
    if (markErr1) throw markErr1;

    const { error: markErr2 } = await supabase.rpc("mark_return_item_received_atomic", {
      p_request_id: setup2.returnRequestId,
      p_actor_id: setup2.customerId,
      p_notes: "Item 2 received",
    });
    if (markErr2) throw markErr2;

    const duplicateRef = "REF-DUPLICATE-99";

    const { error: err1 } = await supabase.rpc("complete_return_refund_atomic", {
      p_request_id: setup1.returnRequestId,
      p_refund_amount: 10000,
      p_refund_reference: duplicateRef,
      p_notes: "Refund 1",
    });
    assert.equal(err1, null, err1?.message);

    const { error: err2 } = await supabase.rpc("complete_return_refund_atomic", {
      p_request_id: setup2.returnRequestId,
      p_refund_amount: 12000,
      p_refund_reference: duplicateRef,
      p_notes: "Refund 2",
    });
    assert.ok(err2, "Duplicate refund reference must violate unique constraint/raise exception");
  });

  await t.test("review_return_request_atomic enforces merchant scope matching", async () => {
    const { returnRequestId, merchantId, customerId } = await setupOrderAndReturn("pending_review");

    // 1. Reviewing with different merchant_id fails
    const wrongMerchantId = crypto.randomUUID();
    const { data: resWrong, error: errWrong } = await supabase.rpc("review_return_request_atomic", {
      p_return_request_id: returnRequestId,
      p_decision: "approve",
      p_actor_id: customerId,
      p_admin_notes: "Approved by wrong merchant",
      p_merchant_notes: "",
      p_expected_merchant_id: wrongMerchantId,
    });
    assert.ok(errWrong, "Should fail with different merchant scope");
    assert.ok(errWrong.message.includes("MERCHANT_SCOPE_MISMATCH"), `Expected MERCHANT_SCOPE_MISMATCH error, got: ${errWrong?.message}`);

    // Verify request state is unchanged (still pending_review)
    const { data: req } = await supabase.from("order_return_requests").select("status").eq("id", returnRequestId).single();
    assert.equal(req.status, "pending_review");

    // 2. Reviewing with correct merchant_id succeeds
    const { data: resCorrect, error: errCorrect } = await supabase.rpc("review_return_request_atomic", {
      p_return_request_id: returnRequestId,
      p_decision: "approve",
      p_actor_id: customerId,
      p_admin_notes: "Approved by correct merchant",
      p_merchant_notes: "",
      p_expected_merchant_id: merchantId,
    });
    assert.equal(errCorrect, null, errCorrect?.message);
    assert.equal(resCorrect.success, true);
    assert.equal(resCorrect.status, "approved");
  });
});
