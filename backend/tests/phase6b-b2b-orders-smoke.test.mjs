import test from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

const databaseData = {
  orders: [
    {
      id: "order-1",
      order_number: "DUK-260630-1001",
      status: "pending",
      delivery_status: "pending",
      payment_method: "cod",
      payment_status: "unpaid",
      subtotal: 100000,
      delivery_cost: 5000,
      discount: 0,
      total: 105000,
      customer_name: "Hussein Barber",
      customer_phone: "07701234567",
      store_linked_profile_id: "profile-barber-1",
      channel: "barber_app_checkout",
      area: "Mansour",
      created_at: new Date().toISOString(),
      governorate_id: "gov-baghdad",
    },
    {
      id: "order-2",
      order_number: "DUK-260630-1002",
      status: "delivered",
      delivery_status: "delivered",
      payment_method: "cod",
      payment_status: "paid",
      subtotal: 200000,
      delivery_cost: 5000,
      discount: 0,
      total: 205000,
      customer_name: "Hussein Barber",
      customer_phone: "07701234567",
      store_linked_profile_id: "profile-barber-1",
      channel: "barber_app_checkout",
      area: "Mansour",
      created_at: new Date().toISOString(),
      governorate_id: "gov-baghdad",
    },
    {
      id: "order-other",
      order_number: "DUK-260630-2001",
      status: "pending",
      delivery_status: "pending",
      payment_method: "cod",
      payment_status: "unpaid",
      subtotal: 50000,
      delivery_cost: 5000,
      discount: 0,
      total: 55000,
      customer_name: "Ali Barber",
      customer_phone: "07701112223",
      store_linked_profile_id: "profile-other-2",
      channel: "barber_app_checkout",
      area: "Karrada",
      created_at: new Date().toISOString(),
      governorate_id: "gov-baghdad",
    },
    {
      id: "order-web",
      order_number: "DUK-260630-3001",
      status: "pending",
      delivery_status: "pending",
      payment_method: "cod",
      payment_status: "unpaid",
      subtotal: 30000,
      delivery_cost: 5000,
      discount: 0,
      total: 35000,
      customer_name: "Zainab Client",
      customer_phone: "07709998887",
      store_linked_profile_id: "profile-barber-1",
      channel: "web_checkout",
      area: "Karrada",
      created_at: new Date().toISOString(),
      governorate_id: "gov-baghdad",
    }
  ],
  order_items: [
    {
      id: "item-1",
      order_id: "order-1",
      product_id: "prod-1",
      product_name: "Shampoo Pro",
      price: 50000,
      quantity: 2,
    }
  ],
  products: [
    {
      id: "prod-1",
      images: ["https://example.com/shampoo.png"],
    }
  ],
  governorates: [
    {
      id: "gov-baghdad",
      name: "بغداد",
    }
  ]
};

function createFakeSupabaseClient() {
  class Builder {
    constructor(table) {
      this.table = table;
      this.filters = {};
      this._single = false;
      this._maybeSingle = false;
    }
    select() { return this; }
    order() { return this; }
    limit() { return this; }
    eq(column, value) { this.filters[column] = value; return this; }
    single() { this._single = true; return this; }
    maybeSingle() { this._maybeSingle = true; return this; }

    _rows() {
      let rows = databaseData[this.table] ?? [];
      if (this.filters.store_linked_profile_id) {
        rows = rows.filter(r => r.store_linked_profile_id === this.filters.store_linked_profile_id);
      }
      if (this.filters.channel) {
        rows = rows.filter(r => r.channel === this.filters.channel);
      }
      if (this.filters.id) {
        rows = rows.filter(r => r.id === this.filters.id);
      }
      if (this.filters.order_id) {
        rows = rows.filter(r => r.order_id === this.filters.order_id);
      }

      // Attach joins
      if (this.table === "orders") {
        rows = rows.map(order => {
          const gov = databaseData.governorates.find(g => g.id === order.governorate_id);
          const items = databaseData.order_items
            .filter(item => item.order_id === order.id)
            .map(item => {
              const prod = databaseData.products.find(p => p.id === item.product_id);
              return { ...item, products: prod };
            });
          return {
            ...order,
            governorates: gov,
            order_items: items,
          };
        });
      }

      return rows;
    }

    async _result() {
      const rows = this._rows();
      if (this._single || this._maybeSingle) {
        return { data: rows[0] ?? null, error: null, count: rows.length };
      }
      return { data: rows, error: null, count: rows.length };
    }

    then(resolve, reject) {
      return this._result().then(resolve, reject);
    }
  }

  return {
    from(table) {
      return new Builder(table);
    }
  };
}

function createFakeSupabaseAdmin() {
  return {
    client: createFakeSupabaseClient(),
    projectRef: "example",
    async probeDatabase() { return { ok: true }; },
  };
}

const fakeStoreIntegrationService = {
  verifyStoreSessionHeader(token) {
    if (token === "valid-barber-session") {
      return {
        linkedProfileId: "profile-barber-1",
        segment: "barber",
        DilMartUserId: "user-barber-1",
        sourceApp: "barber_app",
        businessType: "salon",
      };
    }
    if (token === "valid-web-session") {
      return {
        linkedProfileId: "profile-web-1",
        segment: "customer",
        DilMartUserId: "user-web-1",
        sourceApp: "web_store",
        businessType: "consumer",
      };
    }
    if (token === "expired-session") {
      throw new UnauthorizedException("Store session has expired. Please re-exchange.");
    }
    return null; // invalid/malformed token
  }
};

let app;
let baseUrl;

async function get(path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  if (res.status === 200) {
    return { status: 200, json: await res.json(), text: "" };
  } else {
    return { status: res.status, json: null, text: await res.text() };
  }
}

test("1. boot NestJS app with mocked dependencies", async () => {
  const { AppModule } = await import("../dist/app.module.js");
  const { SupabaseAdminService } = await import("../dist/modules/supabase-admin/supabase-admin.service.js");
  const { StoreIntegrationService } = await import("../dist/modules/store-integration/store-integration.service.js");

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SupabaseAdminService)
    .useValue(createFakeSupabaseAdmin())
    .overrideProvider(StoreIntegrationService)
    .useValue(fakeStoreIntegrationService)
    .compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0);
  const addr = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
  assert.ok(baseUrl);
});

test("2. GET /orders/b2b/my-orders — valid session", async () => {
  const res = await get("/orders/b2b/my-orders", {
    "x-store-session": "valid-barber-session",
  });
  assert.equal(res.status, 200);
  assert.ok(res.json);
  assert.equal(res.json.orders.length, 2);
  assert.equal(res.json.orders[0].order_number, "DUK-260630-1001");
  assert.equal(res.json.orders[0].governorate_name, "بغداد");
  assert.equal(res.json.orders[0].area, "Mansour");
});

test("3. GET /orders/b2b/my-orders — missing session", async () => {
  const res = await get("/orders/b2b/my-orders", {});
  assert.equal(res.status, 401);
});

test("4. GET /orders/b2b/my-orders — invalid session", async () => {
  const res = await get("/orders/b2b/my-orders", {
    "x-store-session": "some-invalid-sig-token",
  });
  assert.equal(res.status, 401);
});

test("5. GET /orders/b2b/my-orders — web/customer session rejected (not barber_app)", async () => {
  const res = await get("/orders/b2b/my-orders", {
    "x-store-session": "valid-web-session",
  });
  assert.equal(res.status, 403);
});

test("6. GET /orders/b2b/:orderId — view own B2B order details", async () => {
  const res = await get("/orders/b2b/order-1", {
    "x-store-session": "valid-barber-session",
  });
  assert.equal(res.status, 200);
  assert.ok(res.json);
  assert.equal(res.json.order.order_number, "DUK-260630-1001");
  assert.equal(res.json.order.governorate_name, "بغداد");
  assert.equal(res.json.items.length, 1);
  assert.equal(res.json.items[0].product_name, "Shampoo Pro");
  assert.equal(res.json.items[0].image_url, "https://example.com/shampoo.png");
});

test("7. GET /orders/b2b/:orderId — accessing another profile's order returns 404", async () => {
  const res = await get("/orders/b2b/order-other", {
    "x-store-session": "valid-barber-session",
  });
  assert.equal(res.status, 404);
});

test("8. GET /orders/b2b/my-orders — check web_checkout orders are excluded", async () => {
  const res = await get("/orders/b2b/my-orders", {
    "x-store-session": "valid-barber-session",
  });
  assert.equal(res.status, 200);
  const webOrder = res.json.orders.find(o => o.id === "order-web");
  assert.equal(webOrder, undefined); // Should not find order-web since its channel is web_checkout
});

test("9. verify route order: b2b/my-orders is not caught by :id wildcard", async () => {
  const res = await get("/orders/b2b/my-orders", {
    "x-store-session": "valid-barber-session",
  });
  assert.equal(res.status, 200);
  assert.equal(Array.isArray(res.json.orders), true);
});

test("10. teardown", async () => {
  if (app) {
    await app.close();
  }
});
