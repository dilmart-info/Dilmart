import test from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { CustomerService } from "../dist/modules/customer/customer.service.js";
import { CustomerController } from "../dist/modules/customer/customer.controller.js";
import { SupabaseAdminService } from "../dist/modules/supabase-admin/supabase-admin.service.js";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

let app;
let baseUrl;
let mockProfiles = [];
let mockCustomerProfiles = [];
let updateProfileCallCount = 0;

function resetFixtures() {
  updateProfileCallCount = 0;
  mockProfiles = [
    {
      id: "customer-user-1",
      full_name: null,
      phone: "+9647701112233",
      email: "customer1@example.com",
      role: "customer",
      account_type: "customer",
    },
    {
      id: "customer-user-2",
      full_name: "Original Name",
      phone: "+9647709998877",
      email: null,
      role: "customer",
      account_type: "customer",
    },
  ];
  mockCustomerProfiles = [
    {
      user_id: "customer-user-1",
      full_name: "Legacy Stale Name In CustomerProfiles",
      phone: null,
      email: null,
    },
  ];
}

function createTestSupabaseAdmin() {
  const tokenToUser = {
    "token-customer": { id: "customer-user-1" },
    "token-customer-2": { id: "customer-user-2" },
  };

  const client = {
    auth: {
      async getUser(token) {
        const user = tokenToUser[token];
        if (!user) return { data: { user: null }, error: new Error("Invalid token") };
        return { data: { user }, error: null };
      },
    },
    from(table) {
      if (table === "profiles") {
        let filterColumn = null;
        let filterValue = null;
        let updateData = null;

        const builder = {
          select() { return builder; },
          update(data) {
            updateData = data;
            return builder;
          },
          eq(column, value) {
            filterColumn = column;
            filterValue = value;
            return builder;
          },
          async maybeSingle() {
            const row = mockProfiles.find((p) => p[filterColumn] === filterValue);
            if (updateData && row) {
              Object.assign(row, updateData);
            }
            return { data: row ? { ...row } : null, error: null };
          },
          async single() {
            return builder.maybeSingle();
          },
        };
        return builder;
      }

      if (table === "customer_profiles") {
        let filterColumn = null;
        let filterValue = null;
        const builder = {
          select() { return builder; },
          eq(column, value) {
            filterColumn = column;
            filterValue = value;
            return builder;
          },
          async maybeSingle() {
            const row = mockCustomerProfiles.find((cp) => cp[filterColumn] === filterValue);
            return { data: row ? { ...row } : null, error: null };
          },
        };
        return builder;
      }

      return {
        select() { return this; },
        eq() { return this; },
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
    createTokenScopedClient() { return client; },
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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, text, json };
}

test("Customer Profile Canonical Authority & HTTP Validation Suite", async (suite) => {
  // Boot NestJS application once with AppModule
  await suite.test("0. Boot NestJS HTTP server with real ValidationPipe", async () => {
    resetFixtures();
    const { AppModule } = await import("../dist/app.module.js");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseAdminService)
      .useValue(createTestSupabaseAdmin())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    await app.listen(0);

    const server = app.getHttpServer();
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    assert.ok(baseUrl.includes("127.0.0.1"));

    // Track calls to customerService.updateProfile
    const customerService = app.get(CustomerService);
    const originalUpdateProfile = customerService.updateProfile.bind(customerService);
    customerService.updateProfile = async (...args) => {
      updateProfileCallCount++;
      return originalUpdateProfile(...args);
    };
  });

  await suite.test("1. HTTP: GET /api/customer/profile returns identity strictly from profiles, ignoring customer_profiles", async () => {
    resetFixtures();
    const res = await request(
      "/api/customer/profile",
      { Authorization: "Bearer token-customer" },
      "GET"
    );

    assert.equal(res.status, 200);
    assert.equal(res.json.user_id, "customer-user-1");
    assert.equal(res.json.full_name, null, "Must read profiles.full_name (null), NOT customer_profiles ('Legacy Stale Name')");
    assert.equal(res.json.phone, "+9647701112233");
    assert.equal(res.json.email, "customer1@example.com");
  });

  await suite.test("2. HTTP: Real ValidationPipe rejects forbidden fields with HTTP 400 and NEVER invokes service", async (t) => {
    const forbiddenPayloads = [
      { name: "role", payload: { full_name: "Ali Hussein", role: "admin" } },
      { name: "phone", payload: { full_name: "Ali Hussein", phone: "07700000000" } },
      { name: "email", payload: { full_name: "Ali Hussein", email: "hacker@evil.com" } },
      { name: "account_type", payload: { full_name: "Ali Hussein", account_type: "provisional_customer" } },
      { name: "user_id", payload: { full_name: "Ali Hussein", user_id: "other-user" } },
      { name: "arbitrary_extra_field", payload: { full_name: "Ali Hussein", random_field: "malicious" } },
    ];

    for (const { name, payload } of forbiddenPayloads) {
      await t.test(`Rejects forbidden field: ${name}`, async () => {
        resetFixtures();
        const initialCallCount = updateProfileCallCount;

        const res = await request(
          "/api/customer/profile",
          { Authorization: "Bearer token-customer" },
          "PATCH",
          payload
        );

        assert.equal(res.status, 400, `Expected HTTP 400 for forbidden field ${name}, got ${res.status}: ${res.text}`);
        assert.equal(
          updateProfileCallCount,
          initialCallCount,
          `Service must NOT be invoked when ValidationPipe rejects forbidden field ${name}`
        );
      });
    }
  });

  await suite.test("3. HTTP: Whitespace normalization before 2-100 character length contract", async (t) => {
    await t.test("Trims whitespace on 100-character name (raw 106 chars) -> passes validation (200 OK)", async () => {
      resetFixtures();
      const valid100Chars = "A".repeat(100);
      const rawPayload = `   ${valid100Chars}   `; // 106 characters raw

      const res = await request(
        "/api/customer/profile",
        { Authorization: "Bearer token-customer" },
        "PATCH",
        { full_name: rawPayload }
      );

      assert.equal(res.status, 200, `Expected HTTP 200, got ${res.status}: ${res.text}`);
      assert.equal(res.json.full_name, valid100Chars);
      assert.equal(res.json.full_name.length, 100);
    });

    await t.test("Trims whitespace on 1-character name (raw 5 chars) -> fails MinLength(2) with 400", async () => {
      resetFixtures();
      const res = await request(
        "/api/customer/profile",
        { Authorization: "Bearer token-customer" },
        "PATCH",
        { full_name: "  A  " }
      );

      assert.equal(res.status, 400);
    });

    await t.test("Whitespace-only name -> fails IsNotEmpty with 400", async () => {
      resetFixtures();
      const res = await request(
        "/api/customer/profile",
        { Authorization: "Bearer token-customer" },
        "PATCH",
        { full_name: "      " }
      );

      assert.equal(res.status, 400);
    });

    await t.test("Name exceeding 100 characters after trim -> fails MaxLength(100) with 400", async () => {
      resetFixtures();
      const res = await request(
        "/api/customer/profile",
        { Authorization: "Bearer token-customer" },
        "PATCH",
        { full_name: "  " + "A".repeat(101) + "  " }
      );

      assert.equal(res.status, 400);
    });
  });

  await suite.test("4. HTTP: Valid Arabic name update modifies profiles.full_name and preserves phone/email", async () => {
    resetFixtures();
    const res = await request(
      "/api/customer/profile",
      { Authorization: "Bearer token-customer" },
      "PATCH",
      { full_name: "   علي حسين البدري   " }
    );

    assert.equal(res.status, 200);
    assert.equal(res.json.full_name, "علي حسين البدري");
    assert.equal(res.json.phone, "+9647701112233", "Phone must remain untouched");
    assert.equal(res.json.email, "customer1@example.com", "Email must remain untouched");

    // Immediate GET confirms it was saved in profiles
    const getRes = await request(
      "/api/customer/profile",
      { Authorization: "Bearer token-customer" },
      "GET"
    );
    assert.equal(getRes.json.full_name, "علي حسين البدري");
  });

  await suite.test("5. HTTP: Valid English name update", async () => {
    resetFixtures();
    const res = await request(
      "/api/customer/profile",
      { Authorization: "Bearer token-customer-2" },
      "PATCH",
      { full_name: "John Doe" }
    );

    assert.equal(res.status, 200);
    assert.equal(res.json.full_name, "John Doe");
    assert.equal(res.json.phone, "+9647709998877");
    assert.equal(res.json.email, null);
  });

  await suite.test("6. Unit: Service-level defense-in-depth rejects unexpected runtime payload keys", async () => {
    resetFixtures();
    const service = app.get(CustomerService);

    // Call service directly with unexpected keys
    await assert.rejects(
      async () => service.updateProfile("customer-user-1", { full_name: "Valid", role: "admin" }),
      { name: "BadRequestException" }
    );

    await assert.rejects(
      async () => service.updateProfile("customer-user-1", { full_name: "Valid", phone: "12345" }),
      { name: "BadRequestException" }
    );

    await assert.rejects(
      async () => service.updateProfile("customer-user-1", { full_name: "Valid", extra: "field" }),
      { name: "BadRequestException" }
    );
  });

  await suite.test("99. Teardown HTTP server", async () => {
    if (app) {
      await app.close();
    }
  });
});
