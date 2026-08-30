import test from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

const databaseData = {
  products: [
    {
      id: "prod-1",
      brand: "Wahl",
      name: "Clippers Pro Wahl",
      is_active: true,
      merchant_id: "merch-1",
      visible_in: ["barber_app", "all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      price: 150000,
    },
    {
      id: "prod-2",
      brand: "wahl",
      name: "Trimmer Wahl Gold",
      is_active: true,
      merchant_id: "merch-1",
      visible_in: ["barber_app", "all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      price: 120000,
    },
    {
      id: "prod-3",
      brand: "Moser",
      name: "Moser Professional",
      is_active: true,
      merchant_id: "merch-1",
      visible_in: ["barber_app", "all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      price: 90000,
    },
    {
      id: "prod-4",
      brand: "InactiveBrand",
      name: "Invisible Product",
      is_active: false,
      merchant_id: "merch-1",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      price: 50000,
    },
    {
      id: "prod-5",
      brand: "MerchantInactive",
      name: "Inactive Merchant Product",
      is_active: true,
      merchant_id: "merch-inactive",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      price: 60000,
    },
    {
      id: "prod-6",
      brand: "OnlyWebStore",
      name: "Web Store Only Product",
      is_active: true,
      merchant_id: "merch-1",
      visible_in: ["web_store"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      price: 70000,
    }
  ],
  merchants: [
    {
      id: "merch-1",
      status: "active",
    },
    {
      id: "merch-inactive",
      status: "inactive",
    }
  ]
};

function createFakeSupabaseClient() {
  class Builder {
    constructor(table) {
      this.table = table;
      this.filters = [];
    }
    select() { return this; }
    order() { return this; }
    limit() { return this; }
    range() { return this.then((res) => res); }
    eq(col, val) {
      this.filters.push({ type: "eq", col, val });
      return this;
    }
    neq(col, val) {
      this.filters.push({ type: "neq", col, val });
      return this;
    }
    not(col, op, val) {
      this.filters.push({ type: "not", col, op, val });
      return this;
    }
    gte(col, val) {
      this.filters.push({ type: "gte", col, val });
      return this;
    }
    lte(col, val) {
      this.filters.push({ type: "lte", col, val });
      return this;
    }
    ilike(col, val) {
      this.filters.push({ type: "ilike", col, val });
      return this;
    }
    contains(col, val) {
      this.filters.push({ type: "contains", col, val });
      return this;
    }
    or(expr) {
      this.filters.push({ type: "or", expr });
      return this;
    }

    _rows() {
      let rows = databaseData[this.table] ?? [];
      
      // Filter out products by join merchant status if select includes merchants!inner
      if (this.table === "products") {
        rows = rows.filter(r => {
          const merch = databaseData.merchants.find(m => m.id === r.merchant_id);
          return merch && merch.status === "active";
        });
      }

      for (const filter of this.filters) {
        if (filter.type === "eq") {
          if (filter.col === "is_active") {
            rows = rows.filter(r => r.is_active === filter.val);
          }
          if (filter.col === "requires_verified_salon") {
            rows = rows.filter(r => r.requires_verified_salon === filter.val);
          }
        }
        if (filter.type === "neq") {
          if (filter.col === "brand") {
            rows = rows.filter(r => r.brand !== filter.val);
          }
        }
        if (filter.type === "not") {
          if (filter.col === "brand" && filter.val === null) {
            rows = rows.filter(r => r.brand != null);
          }
        }
        if (filter.type === "gte") {
          if (filter.col === "price") {
            rows = rows.filter(r => r.price >= filter.val);
          }
        }
        if (filter.type === "lte") {
          if (filter.col === "price") {
            rows = rows.filter(r => r.price <= filter.val);
          }
        }
        if (filter.type === "ilike") {
          if (filter.col === "brand") {
            const queryVal = String(filter.val).toLowerCase();
            rows = rows.filter(r => String(r.brand).toLowerCase() === queryVal);
          }
        }
        if (filter.type === "contains") {
          if (filter.col === "business_type_tags") {
            rows = rows.filter(r => r.business_type_tags && r.business_type_tags.some(tag => filter.val.includes(tag)));
          }
        }
        if (filter.type === "or") {
          if (filter.expr.includes("visible_in")) {
            const match = filter.expr.match(/visible_in\.cs\.\{([^}]+)\}/g);
            if (match) {
              const targets = match.map(m => m.match(/\{([^}]+)\}/)[1]);
              rows = rows.filter(r => r.visible_in && r.visible_in.some(v => targets.includes(v)));
            }
          } else if (filter.expr.includes("business_type_tags")) {
            const match = filter.expr.match(/business_type_tags\.cs\.\{([^}]+)\}/g);
            if (match) {
              const targets = match.map(m => m.match(/\{([^}]+)\}/)[1]);
              rows = rows.filter(r => r.business_type_tags && r.business_type_tags.some(v => targets.includes(v)));
            }
          } else if (filter.expr.includes("target_audience")) {
            const match = filter.expr.match(/target_audience\.cs\.\{([^}]+)\}/g);
            if (match) {
              const targets = match.map(m => m.match(/\{([^}]+)\}/)[1]);
              rows = rows.filter(r => r.target_audience && r.target_audience.some(v => targets.includes(v)));
            }
          } else if (filter.expr.includes("name.ilike") && filter.expr.includes("brand.ilike")) {
            const parts = filter.expr.split(",");
            const nameSearchTerm = parts[0].split(".ilike.%")[1].slice(0, -1).toLowerCase();
            const brandSearchTerm = parts[1].split(".ilike.%")[1].slice(0, -1).toLowerCase();
            rows = rows.filter(r => 
              String(r.name).toLowerCase().includes(nameSearchTerm) || 
              String(r.brand).toLowerCase().includes(brandSearchTerm)
            );
          }
        }
      }
      return rows;
    }

    async _result() {
      const rows = this._rows();
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
    return null;
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

test("2. GET /marketplace/brands — returns unique active brands matching visibility rules", async () => {
  const res = await get("/marketplace/brands?surface=barber_app");
  assert.equal(res.status, 200);
  assert.ok(res.json);
  assert.ok(res.json.brands);
  
  const names = res.json.brands.map(b => b.name.toLowerCase());
  assert.equal(names.includes("wahl"), true);
  assert.equal(names.includes("moser"), true);
  assert.equal(names.includes("onlywebstore"), false);
  assert.equal(names.includes("inactivebrand"), false);
  assert.equal(names.includes("merchantinactive"), false);
});

test("3. GET /marketplace/products?brand=wahl — case-insensitive exact brand filtering", async () => {
  const res = await get("/marketplace/products?brand=wahl&surface=barber_app");
  assert.equal(res.status, 200);
  assert.ok(res.json);
  assert.equal(res.json.items.length, 2);
  const ids = res.json.items.map(p => p.id);
  assert.equal(ids.includes("prod-1"), true);
  assert.equal(ids.includes("prod-2"), true);
});

test("4. GET /marketplace/products?search=wahl — search by brand/name", async () => {
  const res = await get("/marketplace/products?search=wahl&surface=barber_app");
  assert.equal(res.status, 200);
  assert.ok(res.json);
  assert.equal(res.json.items.length, 2);
});

test("5. GET /marketplace/products?brand=wahl&search=trimmer — combined brand and search filters", async () => {
  const res = await get("/marketplace/products?brand=wahl&search=trimmer&surface=barber_app");
  assert.equal(res.status, 200);
  assert.ok(res.json);
  assert.equal(res.json.items.length, 1);
  assert.equal(res.json.items[0].id, "prod-2");
});

test("6. GET /marketplace/products?brand=wahl&min_price=130000&surface=barber_app — combined price range", async () => {
  const res = await get("/marketplace/products?brand=wahl&min_price=130000&surface=barber_app");
  assert.equal(res.status, 200);
  assert.ok(res.json);
  assert.equal(res.json.items.length, 1);
  assert.equal(res.json.items[0].id, "prod-1");
});

test("7. GET /marketplace/products?brand=nonexistent — nonexistent brand returns empty array safely", async () => {
  const res = await get("/marketplace/products?brand=nonexistent&surface=barber_app");
  assert.equal(res.status, 200);
  assert.ok(res.json);
  assert.equal(res.json.items.length, 0);
});

test("8. teardown", async () => {
  if (app) {
    await app.close();
  }
});
