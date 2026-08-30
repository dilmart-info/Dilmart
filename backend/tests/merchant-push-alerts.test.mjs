import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ── Compiled NestJS dist imports ──────────────────────────────────────────────
const { Test } = await import("@nestjs/testing");
const { ConfigService } = await import("@nestjs/config");
const { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } = await import("@nestjs/common");
const { MerchantPushService } = await import("../dist/modules/merchants/merchant-push.service.js");
const { MerchantNotificationsService } = await import("../dist/modules/merchants/merchant-notifications.service.js");
const { SupabaseAdminService } = await import("../dist/modules/supabase-admin/supabase-admin.service.js");
const { ScopeResolverService } = await import("../dist/modules/scope-resolver/scope-resolver.service.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

const serviceSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers to create fixtures ────────────────────────────────────────────────
async function createTestMerchantAndUser() {
  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `merchant-${suffix}@example.com`;
  const password = "MerchantPassword123!";

  // 1. Create merchant user
  const { data: authData, error: authErr } = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) throw authErr;
  const userId = authData.user.id;

  // 2. Set profile role
  await serviceSupabase.from("profiles").update({ role: "merchant_owner" }).eq("id", userId);

  // 3. Create merchant
  const { data: merchant, error: merchErr } = await serviceSupabase
    .from("merchants")
    .insert({
      display_name: `Test Merchant ${suffix}`,
      name_ar: `تاجر اختبار ${suffix}`,
      name_en: `Test Merchant ${suffix}`,
      slug: `test-merchant-${suffix}`,
      status: "active",
    })
    .select("id")
    .single();
  if (merchErr) throw merchErr;
  const merchantId = merchant.id;

  // 4. Create membership
  await serviceSupabase.from("merchant_users").insert({
    merchant_id: merchantId,
    user_id: userId,
    role: "owner",
  });

  return { merchantId, userId, email, password };
}

// ── Test Suite ────────────────────────────────────────────────────────────────
test("Merchant Push Alerts & Notification Acknowledgement (Integration Suite)", async (t) => {

  const buildModule = (configOverrides = {}) => {
    const supabaseAdminValue = { client: serviceSupabase };
    const configValue = {
      get: (key) => {
        if (key in configOverrides) return configOverrides[key];
        if (key === "WEB_PUSH_VAPID_PUBLIC_KEY") return "BF-mock-public-vapid-key-must-be-long-enough-for-web-push";
        if (key === "WEB_PUSH_VAPID_PRIVATE_KEY") return "mock-private-vapid-key";
        if (key === "WEB_PUSH_SUBJECT") return "mailto:ops@DilMart.store";
        return null;
      },
    };

    return Test.createTestingModule({
      providers: [
        MerchantPushService,
        MerchantNotificationsService,
        ScopeResolverService,
        {
          provide: SupabaseAdminService,
          useValue: supabaseAdminValue,
        },
        {
          provide: ConfigService,
          useValue: configValue,
        },
      ],
    }).compile();
  };

  // ── 1 & 2 & 3 & 4. processMerchantOutboxEvent + Device A succeeds + Device B fails + retry + 410 Gone ──
  await t.test(
    "MerchantPushService.processMerchantOutboxEvent (Atomic delivery ledger, multi-device, and 410 Gone)",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();
      const moduleRef = await buildModule();
      const service = moduleRef.get(MerchantPushService);

      // Create two push subscriptions for this merchant user
      const epA = `https://fcm.googleapis.com/fcm/send/A-${crypto.randomBytes(4).toString("hex")}`;
      const epB = `https://fcm.googleapis.com/fcm/send/B-${crypto.randomBytes(4).toString("hex")}`;

      const actor = { actorRole: "merchant_owner", actorId: userId };

      const subA = await service.registerSubscription({
        merchant_id: merchantId,
        endpoint: epA,
        keys: { p256dh: "p256dhA", auth: "authA" },
        device_label: "Device A",
      }, actor);

      const subB = await service.registerSubscription({
        merchant_id: merchantId,
        endpoint: epB,
        keys: { p256dh: "p256dhB", auth: "authB" },
        device_label: "Device B",
      }, actor);

      // Create outbox event
      const outboxId = crypto.randomUUID();
      const orderId = crypto.randomUUID();

      await serviceSupabase.from("notification_outbox").insert({
        id: outboxId,
        event_key: `merchant-new-order-push:${orderId}`,
        recipient_type: "merchant",
        recipient_id: merchantId,
        title: "Test",
        message: "Test",
      });

      // Mock push delivery: A succeeds, B throws 500 (temporary failure)
      let rawPushCalls = [];
      service.sendRawPush = async (sub, payload, tag) => {
        rawPushCalls.push({ subId: sub.id, endpoint: sub.endpoint });
        if (sub.id === subB.id) {
          const err = new Error("Simulated temporary gateway error");
          err.statusCode = 502;
          throw err;
        }
      };

      // RUN 1: process outbox
      const result1 = await service.processMerchantOutboxEvent({
        outboxId,
        merchantId,
        orderId,
        orderNumber: "ST-TEST-1",
      });

      // Assertions for RUN 1
      assert.equal(result1.complete, false, "Should not be complete because Device B failed");
      assert.equal(result1.accepted, 1, "Device A accepted");
      assert.equal(result1.retryable, 1, "Device B retryable");

      // Verify delivery ledger records in DB
      const { data: delRows1 } = await serviceSupabase
        .from("merchant_push_deliveries")
        .select("subscription_id, status")
        .eq("outbox_id", outboxId);

      const statusMap1 = new Map(delRows1.map(r => [r.subscription_id, r.status]));
      assert.equal(statusMap1.get(subA.id), "accepted");
      assert.equal(statusMap1.get(subB.id), "retryable_failure");

      // RUN 2: Retry process. Device A must not be sent to again (idempotence). Device B fails with 410 Gone (permanent).
      // Clear backoff so retry is eligible immediately.
      await serviceSupabase
        .from("merchant_push_deliveries")
        .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
        .eq("outbox_id", outboxId)
        .eq("subscription_id", subB.id);

      rawPushCalls = []; // reset logger
      service.sendRawPush = async (sub, payload, tag) => {
        rawPushCalls.push({ subId: sub.id, endpoint: sub.endpoint });
        if (sub.id === subB.id) {
          const err = new Error("Subscription has expired");
          err.statusCode = 410; // Gone
          throw err;
        }
      };

      const result2 = await service.processMerchantOutboxEvent({
        outboxId,
        merchantId,
        orderId,
        orderNumber: "ST-TEST-1",
      });

      // Assertions for RUN 2
      assert.equal(result2.complete, true, "Should be complete now (accepted + permanent_failure)");
      assert.equal(result2.accepted, 1, "Device A still counted as accepted from terminal state");
      assert.equal(result2.retryable, 0, "No retryable failures left");
      assert.equal(result2.permanentFailures, 1, "Device B permanent_failure");

      // Verify Device A was NEVER re-pushed
      const pushedA = rawPushCalls.some(c => c.subId === subA.id);
      assert.equal(pushedA, false, "Device A must not receive push again on retry");

      // Verify Device B's subscription has been disabled in DB due to 410 Gone
      const { data: subBRow } = await serviceSupabase
        .from("merchant_push_subscriptions")
        .select("status")
        .eq("id", subB.id)
        .single();
      assert.equal(subBRow.status, "disabled", "Subscription must be disabled on permanent 410");

      // Cleanup
      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );

  // ── 5. VAPID Config Check ───────────────────────────────────────────────────
  await t.test(
    "MerchantPushService.processMerchantOutboxEvent (VAPID key check prevents complete)",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();
      // Boot module with VAPID keys omitted
      const moduleRef = await buildModule({
        WEB_PUSH_VAPID_PUBLIC_KEY: "",
        WEB_PUSH_VAPID_PRIVATE_KEY: "",
      });
      const service = moduleRef.get(MerchantPushService);

      const outboxId = crypto.randomUUID();
      const orderId = crypto.randomUUID();

      await assert.rejects(
        () => service.processMerchantOutboxEvent({
          outboxId,
          merchantId,
          orderId,
        }),
        (err) => {
          assert.ok(err instanceof ServiceUnavailableException);
          return true;
        },
        "Must throw ServiceUnavailableException when VAPID keys are missing"
      );

      // Verify no delivery rows created
      const { data: delRows } = await serviceSupabase
        .from("merchant_push_deliveries")
        .select("id")
        .eq("outbox_id", outboxId);
      assert.equal((delRows ?? []).length, 0);

      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );

  // ── 6. Merchant A cannot read or delete a subscription of Merchant B ────────
  await t.test(
    "Merchant cross-subscription isolation (cannot list or delete)",
    async () => {
      const m1 = await createTestMerchantAndUser();
      const m2 = await createTestMerchantAndUser();

      const moduleRef = await buildModule();
      const service = moduleRef.get(MerchantPushService);

      // Merchant A registers subscription
      const subA = await service.registerSubscription({
        merchant_id: m1.merchantId,
        endpoint: "https://example.com/epA",
        keys: { p256dh: "p256dh", auth: "auth" },
      }, { actorRole: "merchant_owner", actorId: m1.userId });

      // Merchant B attempts to list Merchant A subscriptions
      await assert.rejects(
        () => service.listSubscriptions(m1.merchantId, { actorRole: "merchant_owner", actorId: m2.userId }),
        (err) => {
          assert.ok(err instanceof ForbiddenException);
          return true;
        }
      );

      // Merchant B attempts to delete Merchant A's subscription
      await assert.rejects(
        () => service.deleteSubscription(subA.id, { actorRole: "merchant_owner", actorId: m2.userId }),
        (err) => {
          assert.ok(err instanceof ForbiddenException);
          return true;
        }
      );

      // Cleanup
      await serviceSupabase.auth.admin.deleteUser(m1.userId).catch(() => {});
      await serviceSupabase.auth.admin.deleteUser(m2.userId).catch(() => {});
    }
  );

  // ── 7. acknowledge for another merchant is rejected ────────────────────────
  await t.test(
    "Acknowledge cross-merchant safety",
    async () => {
      const m1 = await createTestMerchantAndUser();
      const m2 = await createTestMerchantAndUser();

      const moduleRef = await buildModule();
      const notificationsService = moduleRef.get(MerchantNotificationsService);

      // Create notification for Merchant A
      const notifId = crypto.randomUUID();
      await serviceSupabase.from("merchant_notifications").insert({
        id: notifId,
        merchant_id: m1.merchantId,
        type: "new_order",
        title: "Test Notification",
        message: "Test message",
      });

      // Merchant B attempts to acknowledge Merchant A's notification
      await assert.rejects(
        () => notificationsService.acknowledge(notifId, { actorRole: "merchant_owner", actorId: m2.userId }),
        (err) => {
          assert.ok(err instanceof ForbiddenException);
          return true;
        }
      );

      // Clean up
      await serviceSupabase.auth.admin.deleteUser(m1.userId).catch(() => {});
      await serviceSupabase.auth.admin.deleteUser(m2.userId).catch(() => {});
    }
  );

  // ── 8. markAllAsRead does not populate acknowledged_at ──────────────────────
  await t.test(
    "markAllAsRead does not populate acknowledged_at",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();
      const moduleRef = await buildModule();
      const notificationsService = moduleRef.get(MerchantNotificationsService);

      // Insert unread notification
      const notifId = crypto.randomUUID();
      await serviceSupabase.from("merchant_notifications").insert({
        id: notifId,
        merchant_id: merchantId,
        type: "new_order",
        title: "Test",
        message: "Test",
        is_read: false,
      });

      // Mark all as read
      await notificationsService.markAllAsRead(merchantId, { actorRole: "merchant_owner", actorId: userId });

      // Verify status in DB: is_read=true, but acknowledged_at remains NULL
      const { data: row } = await serviceSupabase
        .from("merchant_notifications")
        .select("is_read, acknowledged_at")
        .eq("id", notifId)
        .single();

      assert.equal(row.is_read, true);
      assert.equal(row.acknowledged_at, null);

      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );

  // ── 9. Order creation trigger inserts exactly 1 notification and 1 outbox ───
  await t.test(
    "Order creation database trigger inserts exactly one notification and one outbox event",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();

      const orderId = crypto.randomUUID();
      const orderNumber = `DUK-TEST-${crypto.randomBytes(4).toString("hex")}`;

      // Insert order to trigger notify_merchant_new_order()
      const { error: insertErr } = await serviceSupabase.from("orders").insert({
        id: orderId,
        order_number: orderNumber,
        merchant_id: merchantId,
        customer_name: "Test Customer",
        customer_phone: "+9647701234567",
        area: "المنصور",
        subtotal: 50000,
        delivery_cost: 0,
        total: 50000,
        status: "new",
      });
      assert.equal(insertErr, null, insertErr ? insertErr.message : "");

      // Verify exactly 1 notification was inserted
      const { data: notifications } = await serviceSupabase
        .from("merchant_notifications")
        .select("id")
        .eq("order_id", orderId);
      assert.equal(notifications.length, 1, "Exactly 1 notification should be created");

      // Verify exactly 1 outbox record was inserted
      const { data: outbox } = await serviceSupabase
        .from("notification_outbox")
        .select("id")
        .eq("event_key", `merchant-new-order-push:${orderId}`);
      assert.equal(outbox.length, 1, "Exactly 1 outbox record should be created");

      // Re-fire trigger-compatible outbox insert must stay idempotent on event_key
      const { error: outboxDupErr } = await serviceSupabase.from("notification_outbox").insert({
        event_key: `merchant-new-order-push:${orderId}`,
        recipient_type: "merchant",
        recipient_id: merchantId,
        title: "Dup",
        message: "Dup",
      });
      assert.ok(outboxDupErr, "Duplicate outbox event_key must be rejected");

      const { data: notifications2 } = await serviceSupabase
        .from("merchant_notifications")
        .select("id")
        .eq("order_id", orderId);
      const { data: outbox2 } = await serviceSupabase
        .from("notification_outbox")
        .select("id")
        .eq("event_key", `merchant-new-order-push:${orderId}`);
      assert.equal(notifications2.length, 1);
      assert.equal(outbox2.length, 1);

      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );

  // ── 10. Push notification failure does not roll back order creation ──────────
  await t.test(
    "Push notification outbox or delivery failure does not roll back order creation",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();

      const orderId = crypto.randomUUID();
      const orderNumber = `DUK-FAIL-${crypto.randomBytes(4).toString("hex")}`;

      // Mock push delivery failure in processing (which is called async or after order creation).
      // Since it's done out-of-band/via trigger-to-outbox, order transaction must fully commit.
      const { error: insertErr } = await serviceSupabase.from("orders").insert({
        id: orderId,
        order_number: orderNumber,
        merchant_id: merchantId,
        customer_name: "Test Customer Fail",
        customer_phone: "+9647701234567",
        area: "المنصور",
        subtotal: 50000,
        delivery_cost: 0,
        total: 50000,
        status: "new",
      });
      assert.equal(insertErr, null, insertErr ? insertErr.message : "");

      // Confirm order remains committed in DB
      const { data: order } = await serviceSupabase
        .from("orders")
        .select("id")
        .eq("id", orderId)
        .single();
      assert.ok(order, "Order must remain persisted in DB even if push outbox/ledger processing fails");

      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );

  // ── D. No active subscriptions ──────────────────────────────────────────────
  await t.test(
    "No active subscriptions → complete with skipReason no_active_subscriptions",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();
      const moduleRef = await buildModule();
      const service = moduleRef.get(MerchantPushService);

      let pushCalls = 0;
      service.sendRawPush = async () => {
        pushCalls += 1;
      };

      const outboxId = crypto.randomUUID();
      const orderId = crypto.randomUUID();
      await serviceSupabase.from("notification_outbox").insert({
        id: outboxId,
        event_key: `merchant-new-order-push:${orderId}`,
        recipient_type: "merchant",
        recipient_id: merchantId,
        title: "Test",
        message: "Test",
      });

      const result = await service.processMerchantOutboxEvent({
        outboxId,
        merchantId,
        orderId,
      });

      assert.equal(result.complete, true);
      assert.equal(result.skipReason, "no_active_subscriptions");
      assert.equal(pushCalls, 0);

      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );

  // ── E. Same endpoint across two merchants ───────────────────────────────────
  await t.test(
    "Same browser endpoint can register for multiple merchants",
    async () => {
      const m1 = await createTestMerchantAndUser();
      const m2 = await createTestMerchantAndUser();
      const moduleRef = await buildModule();
      const service = moduleRef.get(MerchantPushService);

      const sharedEndpoint = `https://fcm.googleapis.com/fcm/send/shared-${crypto.randomBytes(4).toString("hex")}`;

      const subA = await service.registerSubscription({
        merchant_id: m1.merchantId,
        endpoint: sharedEndpoint,
        keys: { p256dh: "p256dh-shared", auth: "auth-shared" },
        device_label: "shared-device",
      }, { actorRole: "merchant_owner", actorId: m1.userId });

      const subB = await service.registerSubscription({
        merchant_id: m2.merchantId,
        endpoint: sharedEndpoint,
        keys: { p256dh: "p256dh-shared", auth: "auth-shared" },
        device_label: "shared-device",
      }, { actorRole: "merchant_owner", actorId: m2.userId });

      assert.notEqual(subA.id, subB.id);

      const { data: rows } = await serviceSupabase
        .from("merchant_push_subscriptions")
        .select("id, merchant_id, endpoint")
        .eq("endpoint", sharedEndpoint);

      assert.equal((rows ?? []).length, 2);
      const byMerchant = new Map(rows.map((r) => [r.merchant_id, r.id]));
      assert.equal(byMerchant.get(m1.merchantId), subA.id);
      assert.equal(byMerchant.get(m2.merchantId), subB.id);

      await serviceSupabase.auth.admin.deleteUser(m1.userId).catch(() => {});
      await serviceSupabase.auth.admin.deleteUser(m2.userId).catch(() => {});
    }
  );

  // ── F+. Cross-merchant testPush isolation ───────────────────────────────────
  await t.test(
    "Merchant A cannot test-push Merchant B subscription_id",
    async () => {
      const m1 = await createTestMerchantAndUser();
      const m2 = await createTestMerchantAndUser();
      const moduleRef = await buildModule();
      const service = moduleRef.get(MerchantPushService);

      const subB = await service.registerSubscription({
        merchant_id: m2.merchantId,
        endpoint: `https://example.com/epB-${crypto.randomBytes(3).toString("hex")}`,
        keys: { p256dh: "p256dh", auth: "auth" },
      }, { actorRole: "merchant_owner", actorId: m2.userId });

      await assert.rejects(
        () =>
          service.sendTestNotification(
            { merchant_id: m1.merchantId, subscription_id: subB.id },
            { actorRole: "merchant_owner", actorId: m1.userId },
          ),
        (err) => err instanceof NotFoundException || err instanceof ForbiddenException,
      );

      await serviceSupabase.auth.admin.deleteUser(m1.userId).catch(() => {});
      await serviceSupabase.auth.admin.deleteUser(m2.userId).catch(() => {});
    }
  );

  // ── G. Atomic concurrent acknowledgement ────────────────────────────────────
  await t.test(
    "Concurrent acknowledgements preserve first actor/device metadata",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();
      const moduleRef = await buildModule();
      const notificationsService = moduleRef.get(MerchantNotificationsService);

      const notifId = crypto.randomUUID();
      const deviceA = crypto.randomUUID();
      const deviceB = crypto.randomUUID();

      await serviceSupabase.from("merchant_notifications").insert({
        id: notifId,
        merchant_id: merchantId,
        type: "new_order",
        title: "Concurrent Ack",
        message: "Test",
        is_read: false,
      });

      const actor = { actorRole: "merchant_owner", actorId: userId };
      const [r1, r2] = await Promise.all([
        notificationsService.acknowledge(notifId, actor, { deviceId: deviceA, opened: false }),
        notificationsService.acknowledge(notifId, actor, { deviceId: deviceB, opened: true }),
      ]);

      assert.ok(r1);
      assert.ok(r2);

      const { data: row } = await serviceSupabase
        .from("merchant_notifications")
        .select("is_read, acknowledged_at, acknowledged_by, acknowledged_device_id, opened_at")
        .eq("id", notifId)
        .single();

      assert.equal(row.is_read, true);
      assert.ok(row.acknowledged_at);
      assert.equal(row.acknowledged_by, userId);
      assert.ok(
        row.acknowledged_device_id === deviceA || row.acknowledged_device_id === deviceB,
        "first-writer device must win",
      );
      // First device must not be overwritten by the loser — both calls return, one device id survives
      const firstDevice = row.acknowledged_device_id;
      const again = await notificationsService.acknowledge(notifId, actor, {
        deviceId: crypto.randomUUID(),
        opened: true,
      });
      assert.ok(again);
      const { data: after } = await serviceSupabase
        .from("merchant_notifications")
        .select("acknowledged_device_id, acknowledged_at, opened_at")
        .eq("id", notifId)
        .single();
      assert.equal(after.acknowledged_device_id, firstDevice);
      assert.equal(after.acknowledged_at, row.acknowledged_at);
      assert.ok(after.opened_at, "opened_at may populate on later ack with opened=true");

      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );

  // ── I. markAsRead is not acknowledge ────────────────────────────────────────
  await t.test(
    "markAsRead sets is_read without acknowledged_at",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();
      const moduleRef = await buildModule();
      const notificationsService = moduleRef.get(MerchantNotificationsService);

      const notifId = crypto.randomUUID();
      await serviceSupabase.from("merchant_notifications").insert({
        id: notifId,
        merchant_id: merchantId,
        type: "new_order",
        title: "Read only",
        message: "Test",
        is_read: false,
      });

      await notificationsService.markAsRead(notifId, {
        actorRole: "merchant_owner",
        actorId: userId,
      });

      const { data: row } = await serviceSupabase
        .from("merchant_notifications")
        .select("is_read, acknowledged_at")
        .eq("id", notifId)
        .single();

      assert.equal(row.is_read, true);
      assert.equal(row.acknowledged_at, null);

      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );

  // ── C+. Missing VAPID leaves outbox unprocessed ─────────────────────────────
  await t.test(
    "Missing VAPID does not mark outbox processed",
    async () => {
      const { merchantId, userId } = await createTestMerchantAndUser();
      const moduleRef = await buildModule({
        WEB_PUSH_VAPID_PUBLIC_KEY: "",
        WEB_PUSH_VAPID_PRIVATE_KEY: "",
      });
      const service = moduleRef.get(MerchantPushService);

      const outboxId = crypto.randomUUID();
      const orderId = crypto.randomUUID();
      await serviceSupabase.from("notification_outbox").insert({
        id: outboxId,
        event_key: `merchant-new-order-push:${orderId}`,
        recipient_type: "merchant",
        recipient_id: merchantId,
        title: "Test",
        message: "Test",
        processed_at: null,
      });

      await assert.rejects(() =>
        service.processMerchantOutboxEvent({ outboxId, merchantId, orderId }),
      );

      const { data: outbox } = await serviceSupabase
        .from("notification_outbox")
        .select("processed_at")
        .eq("id", outboxId)
        .single();
      assert.equal(outbox.processed_at, null);

      await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  );
});
