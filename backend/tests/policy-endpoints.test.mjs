import test from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

function createFakeSupabaseClient() {
  const tokenToUser = {
    "token-merchant-a": { id: "merchant-user-a" },
    "token-merchant-b": { id: "merchant-user-b" },
    "token-admin": { id: "admin-user" },
  };

  const memberships = {
    "merchant-user-a": ["merchant-a"],
    "merchant-user-b": ["merchant-b"],
  };

  const products = [
    { id: "p1", name: "Clipper", merchant_id: "merchant-a", stock: 5, low_stock_threshold: 2, is_active: true },
    { id: "p2", name: "Scissors", merchant_id: "merchant-b", stock: 8, low_stock_threshold: 3, is_active: true },
  ];

  const orders = [
    { customer_name: "Ali", customer_phone: "077000000", total: 12000, created_at: new Date().toISOString(), merchant_id: "merchant-a" },
  ];

  const profiles = [
    { id: "merchant-user-a", role: "merchant_owner", full_name: "Merchant A", phone: "077000001", created_at: new Date().toISOString() },
    { id: "merchant-user-b", role: "merchant_owner", full_name: "Merchant B", phone: "077000002", created_at: new Date().toISOString() },
    { id: "admin-user", role: "admin", full_name: "Admin", phone: "077000003", created_at: new Date().toISOString() },
    { id: "u1", role: "customer", full_name: "Ali", phone: "077000000", created_at: new Date().toISOString() },
  ];

  class Builder {
    constructor(table) {
      this.table = table;
      this.filters = {};
      this._single = false;
      this._maybeSingle = false;
    }
    select() { return this; }
    order() { return this; }
    ilike() { return this; }
    in() { return this; }
    update() { return this; }
    insert() { return this; }
    upsert() { return this; }
    delete() { return this; }
    limit() { return this; }
    eq(column, value) { this.filters[column] = value; return this; }
    single() { this._single = true; return this; }
    maybeSingle() { this._maybeSingle = true; return this; }
    range() { return this; }

    _rows() {
      if (this.table === "merchant_users") {
        const userId = this.filters.user_id;
        const requestedMerchantId = this.filters.merchant_id;
        const owned = memberships[userId] ?? [];
        const rows = requestedMerchantId
          ? owned.filter((m) => m === requestedMerchantId).map((merchant_id) => ({ merchant_id }))
          : owned.map((merchant_id) => ({ merchant_id }));
        return rows;
      }
      if (this.table === "products") {
        let rows = [...products];
        if (this.filters.merchant_id) rows = rows.filter((r) => r.merchant_id === this.filters.merchant_id);
        if (this.filters.id) rows = rows.filter((r) => r.id === this.filters.id);
        return rows;
      }
      if (this.table === "orders") {
        let rows = [...orders];
        if (this.filters.merchant_id) rows = rows.filter((r) => r.merchant_id === this.filters.merchant_id);
        return rows;
      }
      if (this.table === "profiles") {
        let rows = [...profiles];
        if (this.filters.id) rows = rows.filter((r) => r.id === this.filters.id);
        return rows;
      }
      return [];
    }

    async _result() {
      const rows = this._rows();
      if (this._single || this._maybeSingle) {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    }

    then(resolve, reject) {
      return this._result().then(resolve, reject);
    }
  }

  return {
    auth: {
      async getUser(token) {
        const user = tokenToUser[token];
        if (!user) {
          return { data: { user: null }, error: new Error("Invalid token") };
        }
        return { data: { user }, error: null };
      },
    },
    from(table) {
      return new Builder(table);
    },
    async rpc() {
      return { data: { ok: true }, error: null };
    },
  };
}

function createFakeSupabaseAdmin() {
  const client = createFakeSupabaseClient();
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
      return createFakeSupabaseClient();
    },
  };
}

let app;
let baseUrl;

async function get(path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, text: await res.text() };
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

test("boot app with fake supabase", async () => {
  const { AppModule } = await import("../dist/app.module.js");
  const { SupabaseAdminService } = await import("../dist/modules/supabase-admin/supabase-admin.service.js");

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SupabaseAdminService)
    .useValue(createFakeSupabaseAdmin())
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0);
  const addr = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
  assert.ok(baseUrl);
});

test("merchant can access own products scope", async () => {
  const res = await get("/api/products?merchant_id=merchant-a", {
    authorization: "Bearer token-merchant-a",
  });
  assert.equal(res.status, 200);
});

test("merchant denied on foreign products scope", async () => {
  const res = await get("/api/products?merchant_id=merchant-b", {
    authorization: "Bearer token-merchant-a",
  });
  assert.equal(res.status, 403);
});

test("merchant denied on legacy admin customers route", async () => {
  const res = await get("/api/admin/customers?merchant_id=merchant-a", {
    authorization: "Bearer token-merchant-a",
  });
  assert.equal(res.status, 403);
});

test("merchant denied on foreign scoped customers", async () => {
  const res = await get("/api/admin/customers?merchant_id=merchant-b", {
    authorization: "Bearer token-merchant-a",
  });
  assert.equal(res.status, 403);
});

test("admin can access global customers without merchant scope", async () => {
  const res = await get("/api/admin/customers", {
    authorization: "Bearer token-admin",
  });
  assert.equal(res.status, 200);
});

test("uploads require bearer token", async () => {
  const minimalJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
  const res = await post(
    "/api/uploads/products/image",
    {
      file_name: "x.jpg",
      content_type: "image/jpeg",
      base64_data: minimalJpeg,
    },
    {},
  );
  assert.equal(res.status, 403);
});

test("categories create requires bearer token", async () => {
  const res = await post("/api/categories", {
    name: "Test",
    slug: `test-${Date.now()}`,
    sort_order: 0,
  });
  assert.equal(res.status, 403);
});

test("shutdown app", async () => {
  if (app) await app.close();
  assert.ok(true);
});
