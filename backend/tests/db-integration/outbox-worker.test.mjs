import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

test("PR-2: Notification Outbox Worker Concurrency & Recovery (Database Integration Suite)", async (t) => {
  const supabase = getTestClient();

  const setupCustomer = async () => {
    const phone = "+96477" + Math.floor(10000000 + Math.random() * 90000000);
    const email = `outbox-user-${crypto.randomBytes(4).toString("hex")}@example.com`;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      phone,
      password: "password123",
      email_confirm: true,
      phone_confirm: true,
    });

    if (authError) throw authError;
    const customerId = authData.user.id;

    await supabase.from("profiles").update({
      full_name: "Customer User",
      phone,
    }).eq("id", customerId);

    return customerId;
  };

  await t.test("concurrent workers and recovery on crash", async () => {
    const customerId = await setupCustomer();
    const eventKey = "test-event-outbox:" + crypto.randomUUID();

    // 1. Insert an outbox event
    const { data: outboxItem, error: outboxErr } = await supabase.from("notification_outbox").insert({
      id: crypto.randomUUID(),
      event_key: eventKey,
      recipient_type: "customer",
      recipient_id: customerId,
      title: "Test Event",
      message: "Testing outbox worker concurrency",
      status: "pending",
      next_attempt_at: new Date(Date.now() - 60000).toISOString(),
    }).select().single();

    assert.equal(outboxErr, null, outboxErr?.message);

    const { data: dbItem, error: dbItemErr } = await supabase.from("notification_outbox").select("*").eq("id", outboxItem.id).single();
    if (dbItemErr) throw dbItemErr;
    console.log("DB_CHECK_ITEM:", JSON.stringify(dbItem));

    // 2. Simulate Worker 1 and Worker 2 running concurrently to claim the batch
    const worker1 = "worker-node-1";
    const worker2 = "worker-node-2";

    const [claim1, claim2] = await Promise.all([
      supabase.rpc("claim_notification_outbox_batch", {
        p_worker_id: worker1,
        p_limit: 10,
      }),
      supabase.rpc("claim_notification_outbox_batch", {
        p_worker_id: worker2,
        p_limit: 10,
      }),
    ]);

    if (claim1.error) throw new Error("claim1 failed: " + claim1.error.message);
    if (claim2.error) throw new Error("claim2 failed: " + claim2.error.message);

    const claimed1 = claim1.data || [];
    const claimed2 = claim2.data || [];

    // Other suites may leave pending merchant-new-order-push outbox rows; only assert
    // exclusivity for this test's event_key.
    const our1 = claimed1.filter((row) => row.event_key === eventKey);
    const our2 = claimed2.filter((row) => row.event_key === eventKey);
    const totalClaimed = our1.length + our2.length;
    assert.equal(totalClaimed, 1, "Exactly one worker must claim the pending outbox event");

    const winningWorker = our1.length > 0 ? worker1 : worker2;
    const winningData = our1.length > 0 ? our1[0] : our2[0];
    assert.equal(winningData.event_key, eventKey);

    // 3. Simulate "Crash after notification insert"
    // Insert into user_notifications (which succeeds)
    const { error: notifErr } = await supabase.from("user_notifications").insert({
      user_id: customerId,
      title: winningData.title,
      message: winningData.message,
      source_event_key: winningData.event_key,
    });
    assert.equal(notifErr, null, notifErr?.message);

    // But the worker CRASHES here without updating the outbox item to "processed".
    // The outbox item remains status = 'processing'.
    const { data: beforeRecover } = await supabase.from("notification_outbox").select("*").eq("id", outboxItem.id).single();
    assert.equal(beforeRecover.status, "processing");

    // 4. Force/simulate time passing (locked_at is older than 5 minutes)
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    await supabase.from("notification_outbox").update({
      locked_at: sixMinutesAgo,
    }).eq("id", outboxItem.id);

    // 5. Worker 3 claims again (recovery phase)
    const worker3 = "worker-node-3";
    const { data: recoverClaim } = await supabase.rpc("claim_notification_outbox_batch", {
      p_worker_id: worker3,
      p_limit: 10,
    });

    const recoveredOurs = (recoverClaim || []).filter((row) => row.id === outboxItem.id);
    assert.ok(recoveredOurs.length === 1, "Worker 3 must recover the stale processing event");
    assert.equal(recoveredOurs[0].id, outboxItem.id);

    // 6. Worker 3 processes it. Since it tries to insert the notification, it gets a duplicate key violation.
    const { error: insertErr } = await supabase.from("user_notifications").insert({
      user_id: customerId,
      title: recoveredOurs[0].title,
      message: recoveredOurs[0].message,
      source_event_key: recoveredOurs[0].event_key,
    });

    assert.ok(insertErr && insertErr.message.includes("duplicate key"), "Must violate unique index constraint");

    // 7. Worker 3 updates status to 'processed'
    const { error: processedErr } = await supabase.from("notification_outbox").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", outboxItem.id);

    assert.equal(processedErr, null, processedErr?.message);

    // 8. Confirm final status is 'processed' and only 1 notification exists
    const { data: finalOutbox } = await supabase.from("notification_outbox").select("*").eq("id", outboxItem.id).single();
    assert.equal(finalOutbox.status, "processed");

    const { data: finalNotifs } = await supabase.from("user_notifications").select("*").eq("source_event_key", eventKey);
    assert.equal(finalNotifs.length, 1, "Only one notification must exist in user_notifications table");
  });
});
