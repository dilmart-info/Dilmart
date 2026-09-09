import test from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { CustomerService } from "../dist/modules/customer/customer.service.js";
import { SupabaseAdminService } from "../dist/modules/supabase-admin/supabase-admin.service.js";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

let app;
let baseUrl;

// Test state fixtures
let mockProfiles = [];
let mockOrders = [];
let mockOrderReturns = [];
let mockOrderCancellations = [];
let mockCustomerAddresses = [];
let mockAccountDeletionRequests = [];
let mockAuthUsers = {};

// Spies
let signOutCalls = [];
let deleteUserCalls = [];
let getUserByIdCalls = [];
let rpcCalls = [];

function resetFixtures() {
  signOutCalls = [];
  deleteUserCalls = [];
  getUserByIdCalls = [];
  rpcCalls = [];

  mockProfiles = [
    {
      id: "customer-uuid-1",
      full_name: "Customer One",
      phone: "+9647701112233",
      email: "cust1@example.com",
      role: "customer",
    },
    {
      id: "customer-with-active-orders",
      full_name: "Customer Active",
      phone: "+9647702223344",
      email: "active@example.com",
      role: "customer",
    },
    {
      id: "admin-uuid-1",
      full_name: "Admin User",
      phone: "+9647709998877",
      email: "admin@example.com",
      role: "admin",
    },
  ];

  mockAuthUsers = {
    "customer-uuid-1": { id: "customer-uuid-1", email: "cust1@example.com", phone: "+9647701112233" },
    "customer-with-active-orders": { id: "customer-with-active-orders", email: "active@example.com", phone: "+9647702223344" },
    "admin-uuid-1": { id: "admin-uuid-1", email: "admin@example.com", phone: "+9647709998877" },
  };

  mockOrders = [
    {
      id: "order-101",
      order_number: "DUK-260909-0001",
      user_id: "customer-uuid-1",
      customer_name: "Customer One",
      customer_phone: "+9647701112233",
      nearest_landmark: "Al-Mansour Mall",
      notes: "Please call upon arrival",
      subtotal: 50000,
      delivery_cost: 5000,
      discount: 0,
      total: 55000,
      status: "delivered",
      delivery_status: "delivered",
      merchant_id: "merchant-1",
      created_at: "2026-09-01T10:00:00Z",
    },
    {
      id: "order-active-1",
      order_number: "DUK-260909-0002",
      user_id: "customer-with-active-orders",
      customer_name: "Customer Active",
      customer_phone: "+9647702223344",
      status: "preparing",
      delivery_status: "assigned_to_company",
      subtotal: 30000,
      delivery_cost: 5000,
      total: 35000,
    },
  ];

  mockOrderCancellations = [
    {
      id: "cancel-1",
      order_id: "order-101",
      user_id: "customer-uuid-1",
      reason_code: "accidental_order",
      status: "completed",
      notes: "Initial cancellation record",
    },
  ];

  mockOrderReturns = [
    {
      id: "return-1",
      order_id: "order-101",
      customer_id: "customer-uuid-1",
      reason_code: "defective_item",
      status: "completed",
      refund_status: "manual_completed",
      refund_amount: 15000,
      reason_details: "Minor defect on arrival",
      evidence_urls: ["https://example.com/photo.jpg"],
    },
  ];

  mockCustomerAddresses = [
    {
      id: "addr-1",
      user_id: "customer-uuid-1",
      recipient_name: "Customer One",
      recipient_phone: "+9647701112233",
      area: "Al-Mansour",
    },
  ];

  mockAccountDeletionRequests = [];
}

function createTestSupabaseAdmin() {
  const tokenMap = {
    "jwt-valid-customer-1": { id: "customer-uuid-1" },
    "jwt-active-orders": { id: "customer-with-active-orders" },
    "jwt-admin": { id: "admin-uuid-1" },
  };

  const client = {
    auth: {
      async getUser(token) {
        const user = tokenMap[token];
        if (!user || !mockAuthUsers[user.id]) {
          return { data: { user: null }, error: new Error("Invalid or revoked token") };
        }
        return { data: { user: mockAuthUsers[user.id] }, error: null };
      },
      admin: {
        async signOut(jwtToken, scope) {
          signOutCalls.push({ token: jwtToken, scope });
          return { data: null, error: null };
        },
        async deleteUser(userId, shouldSoftDelete) {
          deleteUserCalls.push({ userId, shouldSoftDelete });
          if (mockAuthUsers[userId]) {
            delete mockAuthUsers[userId];
          }
          return { data: { user: null }, error: null };
        },
        async getUserById(userId) {
          getUserByIdCalls.push({ userId });
          const user = mockAuthUsers[userId];
          if (!user) {
            return { data: { user: null }, error: new Error("User not found") };
          }
          return { data: { user }, error: null };
        },
      },
    },
    async rpc(funcName, params) {
      rpcCalls.push({ funcName, params });
      if (funcName === "anonymize_and_detach_customer") {
        const userId = params?.p_user_id;
        // Anonymize orders
        for (const order of mockOrders) {
          if (order.user_id === userId) {
            order.user_id = null;
            order.customer_name = "عميل سابق (حساب محذوف)";
            order.customer_phone = "0000000000";
            order.nearest_landmark = null;
            order.notes = null;
          }
        }
        // Anonymize cancellations
        for (const c of mockOrderCancellations) {
          if (c.user_id === userId) {
            c.user_id = null;
            c.notes = null;
          }
        }
        // Anonymize returns
        for (const r of mockOrderReturns) {
          if (r.customer_id === userId) {
            r.customer_id = null;
            r.reason_details = null;
            r.evidence_urls = null;
          }
        }
        // Delete addresses
        mockCustomerAddresses = mockCustomerAddresses.filter((a) => a.user_id !== userId);
        return { data: { ok: true, orders_detached: 1 }, error: null };
      }
      return { data: null, error: null };
    },
    from(table) {
      if (table === "profiles") {
        let filterId = null;
        const builder = {
          select() { return builder; },
          eq(col, val) {
            if (col === "id") filterId = val;
            return builder;
          },
          async maybeSingle() {
            const p = mockProfiles.find((x) => x.id === filterId);
            return { data: p ? { ...p } : null, error: null };
          },
          async single() { return builder.maybeSingle(); },
        };
        return builder;
      }

      if (table === "merchant_users") {
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          limit() { return builder; },
          async maybeSingle() { return { data: null, error: null }; },
        };
        return builder;
      }

      if (table === "orders") {
        let filterUserId = null;
        let inStatuses = null;
        const builder = {
          select() { return builder; },
          eq(col, val) {
            if (col === "user_id") filterUserId = val;
            return builder;
          },
          in(col, vals) {
            if (col === "status") inStatuses = vals;
            return builder;
          },
          limit() { return builder; },
          then(resolve, reject) {
            const matches = mockOrders.filter((o) => {
              if (filterUserId && o.user_id !== filterUserId) return false;
              if (inStatuses && !inStatuses.includes(o.status)) return false;
              return true;
            });
            return Promise.resolve({ data: matches, error: null }).then(resolve, reject);
          },
        };
        return builder;
      }

      if (table === "order_return_requests") {
        let filterCustId = null;
        let notInStatuses = false;
        const builder = {
          select() { return builder; },
          eq(col, val) {
            if (col === "customer_id") filterCustId = val;
            return builder;
          },
          not() {
            notInStatuses = true;
            return builder;
          },
          limit() { return builder; },
          then(resolve, reject) {
            const matches = mockOrderReturns.filter((r) => {
              if (filterCustId && r.customer_id !== filterCustId) return false;
              if (notInStatuses && ["rejected", "completed", "cancelled"].includes(r.status)) return false;
              return true;
            });
            return Promise.resolve({ data: matches, error: null }).then(resolve, reject);
          },
        };
        return builder;
      }

      if (table === "order_cancellation_requests") {
        let filterUserId = null;
        let statusVal = null;
        const builder = {
          select() { return builder; },
          eq(col, val) {
            if (col === "user_id") filterUserId = val;
            if (col === "status") statusVal = val;
            return builder;
          },
          limit() { return builder; },
          then(resolve, reject) {
            const matches = mockOrderCancellations.filter((c) => {
              if (filterUserId && c.user_id !== filterUserId) return false;
              if (statusVal && c.status !== statusVal) return false;
              return true;
            });
            return Promise.resolve({ data: matches, error: null }).then(resolve, reject);
          },
        };
        return builder;
      }

      if (table === "account_deletion_requests") {
        let filterUserId = null;
        let filterStatuses = null;
        let filterId = null;
        let notNullCol = null;
        let limitCount = null;

        const builder = {
          select() { return builder; },
          eq(col, val) {
            if (col === "user_id") filterUserId = val;
            if (col === "id") filterId = val;
            return builder;
          },
          in(col, vals) {
            if (col === "status") filterStatuses = vals;
            return builder;
          },
          not(col, op, val) {
            if (op === "is" && val === null) notNullCol = col;
            return builder;
          },
          order() { return builder; },
          limit(n) {
            limitCount = n;
            return builder;
          },
          then(resolve, reject) {
            let res = mockAccountDeletionRequests.filter((r) => {
              if (filterUserId && r.user_id !== filterUserId) return false;
              if (filterStatuses && !filterStatuses.includes(r.status)) return false;
              if (notNullCol && r[notNullCol] === null) return false;
              return true;
            });
            if (limitCount) res = res.slice(0, limitCount);
            return Promise.resolve({ data: res, error: null }).then(resolve, reject);
          },
          async maybeSingle() {
            const r = mockAccountDeletionRequests.find((x) => {
              if (filterUserId && x.user_id !== filterUserId) return false;
              if (filterStatuses && !filterStatuses.includes(x.status)) return false;
              if (filterId && x.id !== filterId) return false;
              if (notNullCol && x[notNullCol] === null) return false;
              return true;
            });
            return { data: r ? { ...r } : null, error: null };
          },
          insert(record) {
            const id = "del-req-" + (mockAccountDeletionRequests.length + 1);
            const row = { id, created_at: new Date().toISOString(), ...record };
            mockAccountDeletionRequests.push(row);
            return {
              select() {
                return {
                  async single() { return { data: { ...row }, error: null }; },
                };
              },
            };
          },
          update(patch) {
            return {
              eq(col, val) {
                if (col === "id") {
                  const target = mockAccountDeletionRequests.find((x) => x.id === val);
                  if (target) Object.assign(target, patch);
                }
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
        return builder;
      }

      return {
        select() { return this; },
        eq() { return this; },
        limit: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
    },
  };

  return {
    client,
    projectRef: "example",
    async probeDatabase() { return { ok: true }; },
    async resolveUserFromAccessToken(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user;
    },
    async revokeUserSession(token) {
      const res = await client.auth.admin.signOut(token, "global");
      return { ok: !res.error, error: res.error?.message };
    },
    async deleteAuthUser(id) {
      const res = await client.auth.admin.deleteUser(id, false);
      return { ok: !res.error, error: res.error?.message };
    },
    async verifyUserDeleted(id) {
      const { error } = await client.auth.admin.getUserById(id);
      return Boolean(error || !mockAuthUsers[id]);
    },
  };
}

async function request(path, headers = {}, method = "POST", body = null) {
  const fetchOptions = { method, headers };
  if (body !== null) {
    fetchOptions.headers = { "Content-Type": "application/json", ...headers };
    fetchOptions.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, fetchOptions);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}

test("Store Customer Account Deletion & Anonymization Engine Test Suite", async (suite) => {
  let mockSupabase;

  await suite.test("0. Boot NestJS Server with Customer and Auth Modules", async () => {
    resetFixtures();
    mockSupabase = createTestSupabaseAdmin();
    const { AppModule } = await import("../dist/app.module.js");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseAdminService)
      .useValue(mockSupabase)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    await app.listen(0);

    const addr = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    assert.ok(baseUrl.includes("127.0.0.1"));
  });

  await suite.test("1. Reject request without confirmation: HTTP 400", async () => {
    resetFixtures();
    const res = await request(
      "/api/customer/account/delete",
      { Authorization: "Bearer jwt-valid-customer-1" },
      "POST",
      { confirmed: false },
    );
    assert.equal(res.status, 400);
    assert.ok(res.text.includes("تأكيد") || res.text.includes("confirmed"));
  });

  await suite.test("2. Reject non-whitelisted payload fields like user_id: HTTP 400", async () => {
    resetFixtures();
    const res = await request(
      "/api/customer/account/delete",
      { Authorization: "Bearer jwt-valid-customer-1" },
      "POST",
      { confirmed: true, user_id: "attempted-override-uuid" },
    );
    assert.equal(res.status, 400);
    assert.ok(res.text.includes("user_id should not exist") || res.text.includes("property user_id should not exist"));
  });

  await suite.test("3. Reject admin and non-customer actors: HTTP 403", async () => {
    resetFixtures();
    const res = await request(
      "/api/customer/account/delete",
      { Authorization: "Bearer jwt-admin" },
      "POST",
      { confirmed: true },
    );
    assert.equal(res.status, 403);
    assert.ok(res.text.includes("مخصص لحسابات المتسوقين") || res.text.includes("المشرفين"));
  });

  await suite.test("4. Reject deletion when user has active orders in fulfillment: HTTP 400", async () => {
    resetFixtures();
    const res = await request(
      "/api/customer/account/delete",
      { Authorization: "Bearer jwt-active-orders" },
      "POST",
      { confirmed: true },
    );
    assert.equal(res.status, 400);
    assert.ok(res.text.includes("طلبات قيد التجهيز أو التوصيل"));
  });

  await suite.test("5. Successful Deletion: proves JWT signOut, deleteUser, getUserById verification, and PII anonymization", async () => {
    resetFixtures();
    const res = await request(
      "/api/customer/account/delete",
      { Authorization: "Bearer jwt-valid-customer-1" },
      "POST",
      { confirmed: true, reason: "No longer needed" },
    );

    assert.equal(res.status, 201, `Expected 201 Created or 200 OK, got ${res.status}: ${res.text}`);
    assert.equal(res.json?.ok, true);

    // 1. PROVE: signOut receives a JWT (the access token), NOT actorId
    assert.equal(signOutCalls.length, 1, "Expected signOut to be called once");
    assert.equal(signOutCalls[0].token, "jwt-valid-customer-1", "signOut must receive the access JWT");
    assert.notEqual(signOutCalls[0].token, "customer-uuid-1", "signOut must NOT receive actorId");
    assert.equal(signOutCalls[0].scope, "global", "signOut must use 'global' scope");

    // 2. PROVE: auth.admin.deleteUser(actorId, false) invoked server-side
    assert.equal(deleteUserCalls.length, 1, "Expected deleteUser to be called once");
    assert.equal(deleteUserCalls[0].userId, "customer-uuid-1");
    assert.equal(deleteUserCalls[0].shouldSoftDelete, false);

    // 3. PROVE: Completed deletion is verified by getUserById returning user-not-found
    assert.ok(getUserByIdCalls.length >= 1, "getUserById must be called for post-deletion verification");
    assert.equal(getUserByIdCalls[0].userId, "customer-uuid-1");

    // 4. PROVE: Transactional RPC anonymize_and_detach_customer was executed
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].funcName, "anonymize_and_detach_customer");
    assert.equal(rpcCalls[0].params.p_user_id, "customer-uuid-1");

    // 5. PROVE: Historical orders are detached & PII anonymized
    const order = mockOrders.find((o) => o.id === "order-101");
    assert.equal(order.user_id, null, "orders.user_id must be detached to NULL");
    assert.equal(order.customer_name, "عميل سابق (حساب محذوف)", "customer_name must be scrubbed");
    assert.equal(order.customer_phone, "0000000000", "customer_phone must be scrubbed");
    assert.equal(order.nearest_landmark, null, "nearest_landmark must be cleared");
    assert.equal(order.notes, null, "notes must be cleared");

    // 6. PROVE: Order amounts, invoices, products, and financial integrity remain intact
    assert.equal(order.subtotal, 50000, "Subtotal must be preserved");
    assert.equal(order.delivery_cost, 5000, "Delivery cost must be preserved");
    assert.equal(order.total, 55000, "Total must be preserved");
    assert.equal(order.merchant_id, "merchant-1", "Merchant association must be preserved");

    // 7. PROVE: Return & Cancellation records are preserved in anonymized form
    const ret = mockOrderReturns.find((r) => r.id === "return-1");
    assert.equal(ret.customer_id, null, "return.customer_id must be detached");
    assert.equal(ret.refund_amount, 15000, "refund_amount must be preserved");
    assert.equal(ret.refund_status, "manual_completed", "refund_status must be preserved");
    assert.equal(ret.reason_details, null, "personal return reason_details must be cleared");

    const cancel = mockOrderCancellations.find((c) => c.id === "cancel-1");
    assert.equal(cancel.user_id, null, "cancellation.user_id must be detached");
    assert.equal(cancel.status, "completed", "cancellation status must be preserved");

    // 8. PROVE: Addresses deleted
    assert.equal(mockCustomerAddresses.length, 0, "Addresses must be deleted");

    // 9. PROVE: account_deletion_requests state machine completed & user_id scrubbed to null
    assert.equal(mockAccountDeletionRequests.length, 1);
    const reqRow = mockAccountDeletionRequests[0];
    assert.equal(reqRow.status, "completed");
    assert.equal(reqRow.step, "auth_deleted");
    assert.equal(reqRow.user_id, null, "Raw user_id must be scrubbed to null on completion");
    assert.ok(reqRow.completed_at, "completed_at must be set");
  });

  await suite.test("6. Old bearer token is rejected after deletion", async () => {
    // Attempt request using the previously deleted user's token
    const res = await request(
      "/api/customer/profile",
      { Authorization: "Bearer jwt-valid-customer-1" },
      "GET",
    );
    assert.equal(res.status, 403, "Old bearer token must be rejected after deletion");
  });

  await suite.test("7. Partial-failure recovery: reconciliation resumes and completes unfinished deletion", async () => {
    resetFixtures();

    // Simulate an unfinished request where DB was anonymized but Auth deletion timed out
    mockAccountDeletionRequests.push({
      id: "del-req-partial-1",
      user_id: "customer-uuid-1",
      status: "failed",
      step: "db_anonymized",
      source: "app_customer",
      error_code: "AUTH_DELETE_FAILED",
      created_at: new Date(Date.now() - 300000).toISOString(),
    });

    // Run the reconciliation mechanism directly from CustomerService
    const customerService = app.get(CustomerService);
    const reconcileResult = await customerService.reconcilePendingAccountDeletions();

    assert.equal(reconcileResult.processed, 1, "Must find and process the failed deletion request");
    assert.equal(reconcileResult.completed, 1, "Must complete the unfinished deletion request");

    // Verify Auth user was deleted by the reconciler
    assert.equal(mockAuthUsers["customer-uuid-1"], undefined, "User must be removed from Auth");

    // Verify request row is now completed and user_id scrubbed
    const reqRow = mockAccountDeletionRequests.find((r) => r.id === "del-req-partial-1");
    assert.equal(reqRow.status, "completed");
    assert.equal(reqRow.step, "auth_deleted");
    assert.equal(reqRow.user_id, null, "Raw user_id must be scrubbed upon completion");
  });

  await suite.test("8. Teardown HTTP Server", async () => {
    await app.close();
  });
});
