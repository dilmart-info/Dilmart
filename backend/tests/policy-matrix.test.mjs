import test from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

let app;
let baseUrl;

function createGuardTestSupabaseClient() {
  const tokenToUser = {
    "token-admin": { id: "admin-user" },
    "token-customer": { id: "customer-user" },
    "token-merchant-a": { id: "merchant-user-a" },
    "token-merchant-b": { id: "merchant-user-b" },
  };
  const profiles = [
    { id: "admin-user", role: "admin" },
    { id: "customer-user", role: "customer" },
    { id: "merchant-user-a", role: "merchant_owner" },
    { id: "merchant-user-b", role: "merchant_owner" },
  ];
  const memberships = {
    "merchant-user-a": ["merchant-a"],
    "merchant-user-b": ["merchant-b"],
  };

  return {
    async rpc(name, params) {
      if (name === "merchant_customer_summary") {
        return {
          data: {
            items: [
              { customer_ref: "عميل #A1B2", phone_masked: "****4567", orders: 3, spent: 75000, last_order_at: "2026-06-08" },
            ],
            total: 1,
            limit: 50,
            offset: 0,
            has_more: false,
          },
          error: null,
        };
      }
      return { data: [], error: null };
    },
    auth: {
      async getUser(token) {
        const user = tokenToUser[token];
        if (!user) return { data: { user: null }, error: new Error("Invalid token") };
        return { data: { user }, error: null };
      },
    },
    from(table) {
      if (table === "profiles") {
        let profileId;
        return {
          select() { return this; },
          eq(column, value) {
            if (column === "id") profileId = value;
            return this;
          },
          async maybeSingle() {
            return { data: profiles.find((p) => p.id === profileId) ?? null, error: null };
          },
        };
      }
      if (table === "merchant_users") {
        let userId;
        let merchantId;
        return {
          select() { return this; },
          eq(column, value) {
            if (column === "user_id") userId = value;
            if (column === "merchant_id") merchantId = value;
            return this;
          },
          limit() { return this; },
          async maybeSingle() {
            const owned = memberships[userId] ?? [];
            if (merchantId) {
              if (owned.includes(merchantId)) {
                return { data: { merchant_id: merchantId }, error: null };
              }
              return { data: null, error: null };
            }
            if (owned.length > 0) {
              return { data: { merchant_id: owned[0] }, error: null };
            }
            return { data: null, error: null };
          },
        };
      }
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
        limit() { return this; },
      };
    },
  };
}

function createGuardTestSupabaseAdmin() {
  const client = createGuardTestSupabaseClient();
  return {
    client,
    projectRef: "example",
    async probeDatabase() {
      return { ok: true };
    },
    async resolveUserFromAccessToken(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user;
    },
    createTokenScopedClient() {
      return createGuardTestSupabaseClient();
    },
  };
}

function createMerchantMembershipClient(fixtures) {
  return {
    from(table) {
      if (table !== "merchant_users") {
        throw new Error(`Unsupported table in fixture client: ${table}`);
      }
      let userId;
      let merchantId;
      return {
        select() {
          return this;
        },
        eq(column, value) {
          if (column === "user_id") userId = value;
          if (column === "merchant_id") merchantId = value;
          return this;
        },
        limit() {
          return this;
        },
        async maybeSingle() {
          const merchants = fixtures[userId] ?? [];
          if (merchantId) {
            if (merchants.includes(merchantId)) {
              return { data: { merchant_id: merchantId }, error: null };
            }
            return { data: null, error: null };
          }
          if (merchants.length > 0) {
            return { data: { merchant_id: merchants[0] }, error: null };
          }
          return { data: null, error: null };
        },
      };
    },
  };
}

async function request(path, headers = {}, method = "GET", body = null) {
  const fetchOptions = { method, headers };
  if (body) {
    fetchOptions.headers = { "Content-Type": "application/json", ...headers };
    fetchOptions.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, fetchOptions);
  const text = await res.text();
  return { status: res.status, text };
}

test("boot app once", async () => {
  const { AppModule } = await import("../dist/app.module.js");
  const { SupabaseAdminService } = await import("../dist/modules/supabase-admin/supabase-admin.service.js");
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SupabaseAdminService)
    .useValue(createGuardTestSupabaseAdmin())
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0);

  const server = app.getHttpServer();
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  assert.ok(baseUrl.includes("127.0.0.1"));
});

test("guard blocks missing actor role on admin route", async () => {
  const res = await request("/api/admin/analytics/overview");
  assert.equal(res.status, 403);
});

test("guard blocks executive governance route without auth", async () => {
  const res = await request("/api/admin/analytics/executive");
  assert.equal(res.status, 403);
});

test("guard blocks invalid role on scoped routes", async () => {
  const res = await request("/api/inventory", { authorization: "Bearer token-customer" });
  assert.equal(res.status, 403);
});

test("guard blocks protected orders route without bearer token", async () => {
  const res = await request("/api/orders");
  assert.equal(res.status, 403);
});

test("guard blocks protected products route without bearer token", async () => {
  const res = await request("/api/products");
  assert.equal(res.status, 403);
});

test("guard blocks protected admin customers route without bearer token", async () => {
  const res = await request("/api/admin/customers");
  assert.equal(res.status, 403);
});

test("scope resolver matrix: allow/deny across core services", async () => {
  const fixtures = {
    "merchant-actor-a": ["merchant-a"],
    "merchant-actor-b": ["merchant-b"],
    "merchant-actor-multi": ["merchant-a", "merchant-b"],
  };

  const mockSupabaseAdmin = {
    client: createMerchantMembershipClient(fixtures),
  };

  const { ScopeResolverService } = await import("../dist/modules/scope-resolver/scope-resolver.service.js");
  const scopeResolver = new ScopeResolverService(mockSupabaseAdmin);

  const adminResolved = await scopeResolver.resolveMerchantScope("merchant-a", "admin", undefined);
  assert.equal(adminResolved, "merchant-a");

  const superAdminResolved = await scopeResolver.resolveMerchantScope("merchant-a", "super_admin", undefined);
  assert.equal(superAdminResolved, "merchant-a");

  const merchantResolved = await scopeResolver.resolveMerchantScope("merchant-a", "merchant_owner", "merchant-actor-a");
  assert.equal(merchantResolved, "merchant-a");

  const merchantFallback = await scopeResolver.resolveMerchantScope(undefined, "merchant_owner", "merchant-actor-multi");
  assert.equal(merchantFallback, "merchant-a");

  await assert.rejects(
    () => scopeResolver.resolveMerchantScope("merchant-a", "merchant_owner", undefined),
    /Missing actor identity/i,
  );

  await assert.rejects(
    () => scopeResolver.resolveMerchantScope("merchant-a", "merchant_owner", "merchant-actor-b"),
    /Merchant scope is not allowed/i,
  );

  // 1. customer cannot resolve merchant scope
  await assert.rejects(
    () => scopeResolver.resolveMerchantScope("merchant-a", "customer", "customer-user"),
    /Merchant scope resolution is not permitted/i,
  );

  // 2. agent cannot resolve merchant scope
  await assert.rejects(
    () => scopeResolver.resolveMerchantScope("merchant-a", "agent", "agent-user"),
    /Merchant scope resolution is not permitted/i,
  );

  // 3. invalid/empty role cannot resolve merchant scope
  await assert.rejects(
    () => scopeResolver.resolveMerchantScope("merchant-a", undefined, "some-user"),
    /Merchant scope resolution is not permitted/i,
  );
  await assert.rejects(
    () => scopeResolver.resolveMerchantScope("merchant-a", "guest", "guest-user"),
    /Merchant scope resolution is not permitted/i,
  );
});

test("HTTP: client spoofing actor_role/actor_id in query parameter does not elevate privileges", async () => {
  // A customer tries to call admin analytics by passing actor_role=admin in query
  const res1 = await request("/api/admin/analytics/overview?actor_role=admin&actor_id=admin-user", {
    authorization: "Bearer token-customer",
  });
  assert.equal(res1.status, 403);
});

test("HTTP: client spoofing actor_role/actor_id in request body does not elevate privileges", async () => {
  // A customer tries to call create manual order (admin route) by passing spoofed role in body
  const res = await request(
    "/api/orders/manual",
    { authorization: "Bearer token-customer" },
    "POST",
    {
      customer_name: "Test Spoof",
      customer_phone: "07700000000",
      governorate_id: "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1",
      area: "Baghdad",
      delivery_cost: 5000,
      items: [],
      actor_role: "admin",
      actor_id: "admin-user",
    }
  );
  assert.equal(res.status, 403);
});

test("HTTP: merchant user cannot access another merchant via merchant_id query param", async () => {
  // merchant-user-a tries to get scoped customers of merchant-b
  const res = await request("/api/admin/customers?merchant_id=merchant-b", {
    authorization: "Bearer token-merchant-a",
  });
  assert.equal(res.status, 403);
});

test("HTTP: admin/super_admin filtering by merchant_id remains functional", async () => {
  const res = await request("/api/admin/customers?merchant_id=merchant-a", {
    authorization: "Bearer token-admin",
  });
  assert.equal(res.status, 200);
});

test("HTTP: customer/self routes do not rely on client-supplied user identity", async () => {
  const res = await request("/api/customer/profile?actor_id=admin-user&user_id=admin-user", {
    authorization: "Bearer token-customer",
  });
  assert.equal(res.status, 200);
  const data = JSON.parse(res.text);
  assert.equal(data.user_id, "customer-user");
});

test("shutdown app", async () => {
  if (app) {
    await app.close();
  }
  assert.ok(true);
});
