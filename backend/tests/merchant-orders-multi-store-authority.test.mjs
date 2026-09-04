import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import {
  ValidationPipe,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { MerchantsController } from "../dist/modules/merchants/merchants.controller.js";
import { MerchantsService } from "../dist/modules/merchants/merchants.service.js";
import { ListMerchantOrdersQueryDto } from "../dist/modules/merchants/merchants.dto.js";
import { OrdersService } from "../dist/modules/orders/orders.service.js";
import { RolesGuard } from "../dist/common/authz/roles.guard.js";
import { SupabaseActorResolverService } from "../dist/common/authz/supabase-actor-resolver.service.js";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const STORE_INACTIVE = "44444444-4444-4444-8444-444444444444";

const USER_STORE_A_OWNER = "user-store-a-owner";
const USER_STORE_A_MANAGER = "user-store-a-manager";
const USER_STORE_A_STAFF = "user-store-a-staff";
const USER_STORE_B_OWNER = "user-store-b-owner";
const USER_ADMIN = "user-admin";
const USER_CUSTOMER = "user-customer";

function makeHarness() {
  const now = new Date();
  const todayIso = now.toISOString();

  const state = {
    merchants: [
      { id: STORE_A, status: "active", display_name: "متجر بغداد" },
      { id: STORE_B, status: "active", display_name: "متجر البصرة" },
      { id: STORE_INACTIVE, status: "suspended", display_name: "متجر موقوف" },
    ],
    merchant_users: [
      { user_id: USER_STORE_A_OWNER, merchant_id: STORE_A, role: "owner" },
      { user_id: USER_STORE_A_MANAGER, merchant_id: STORE_A, role: "manager" },
      { user_id: USER_STORE_A_STAFF, merchant_id: STORE_A, role: "staff" },
      { user_id: USER_STORE_B_OWNER, merchant_id: STORE_B, role: "owner" },
    ],
    orders: [
      {
        id: "ord-a-1",
        order_number: "BAG-101",
        merchant_id: STORE_A,
        status: "delivered",
        subtotal: 40000,
        discount: 0,
        delivery_cost: 5000,
        total: 45000,
        channel: "web",
        payment_method: "cod",
        merchant_notes: null,
        merchant_decision_status: "accepted",
        customer_name: "علي كريم",
        customer_phone: "07701234567",
        address: "حي الكرادة شارع 14",
        created_at: todayIso,
        updated_at: todayIso,
        governorates: { name: "بغداد" },
      },
      {
        id: "ord-a-2",
        order_number: "BAG-102",
        merchant_id: STORE_A,
        status: "preparing",
        subtotal: 25000,
        discount: 2000,
        delivery_cost: 5000,
        total: 28000,
        channel: "store",
        payment_method: "zain_cash",
        merchant_notes: "تجهيز سريع",
        merchant_decision_status: "accepted",
        customer_name: "سارة حسين",
        customer_phone: "07809876543",
        address: "حي المنصور",
        created_at: todayIso,
        updated_at: todayIso,
        governorates: { name: "بغداد" },
      },
      {
        id: "ord-a-3",
        order_number: "BAG-103",
        merchant_id: STORE_A,
        status: "new",
        subtotal: 15000,
        discount: 0,
        delivery_cost: 5000,
        total: 20000,
        channel: "web",
        payment_method: "cod",
        merchant_notes: null,
        merchant_decision_status: "pending",
        customer_name: "مهند طه",
        customer_phone: "07501112233",
        address: "حي الجامعة",
        created_at: todayIso,
        updated_at: todayIso,
        governorates: { name: "بغداد" },
      },
      {
        id: "ord-b-1",
        order_number: "BAS-201",
        merchant_id: STORE_B,
        status: "delivered",
        subtotal: 55000,
        discount: 0,
        delivery_cost: 5000,
        total: 60000,
        channel: "web",
        payment_method: "cod",
        merchant_notes: null,
        merchant_decision_status: "accepted",
        customer_name: "فاطمة حيدر",
        customer_phone: "07709998877",
        address: "العشار شارع الوطن",
        created_at: todayIso,
        updated_at: todayIso,
        governorates: { name: "البصرة" },
      },
    ],
  };

  const supabaseMock = {
    from: (table) => {
      let filters = [];
      let isMaybeSingle = false;
      let orderCol = null;
      let orderAsc = true;
      let rangeFrom = null;
      let rangeTo = null;

      const builder = {
        select: (cols, opts = {}) => {
          return builder;
        },
        eq: (col, val) => {
          filters.push({ type: "eq", col, val });
          return builder;
        },
        gte: (col, val) => {
          filters.push({ type: "gte", col, val });
          return builder;
        },
        lte: (col, val) => {
          filters.push({ type: "lte", col, val });
          return builder;
        },
        or: (condition) => {
          filters.push({ type: "or", condition });
          return builder;
        },
        order: (col, opts = {}) => {
          orderCol = col;
          orderAsc = opts.ascending ?? true;
          return builder;
        },
        range: (from, to) => {
          rangeFrom = from;
          rangeTo = to;
          return builder;
        },
        maybeSingle: async () => {
          isMaybeSingle = true;
          const res = await builder.then();
          return { data: res.data ? res.data[0] ?? null : null, error: null };
        },
        then: async (resolve) => {
          let rows = [...(state[table] ?? [])];

          for (const f of filters) {
            if (f.type === "eq") {
              rows = rows.filter((r) => r[f.col] === f.val);
            } else if (f.type === "gte") {
              rows = rows.filter((r) => r[f.col] >= f.val);
            } else if (f.type === "lte") {
              rows = rows.filter((r) => r[f.col] <= f.val);
            } else if (f.type === "or") {
              // Parse order_number.ilike.%term%
              const match = f.condition.match(/order_number\.ilike\.%(.+)%/);
              if (match) {
                const term = match[1].toLowerCase();
                rows = rows.filter((r) => r.order_number?.toLowerCase().includes(term));
              }
            }
          }

          const totalCount = rows.length;

          if (orderCol) {
            rows.sort((a, b) => {
              if (a[orderCol] < b[orderCol]) return orderAsc ? -1 : 1;
              if (a[orderCol] > b[orderCol]) return orderAsc ? 1 : -1;
              return 0;
            });
          }

          if (rangeFrom !== null && rangeTo !== null) {
            rows = rows.slice(rangeFrom, rangeTo + 1);
          }

          const result = { data: rows, error: null, count: totalCount };
          if (resolve) return resolve(result);
          return result;
        },
      };

      return builder;
    },
  };

  const supabaseAdmin = { client: supabaseMock };
  const scopeResolver = {
    resolveMerchantScope: async (merchantId, actorRole, actorId) => {
      if (!merchantId) return null;
      return merchantId;
    },
  };

  const merchantsService = new MerchantsService(supabaseAdmin, scopeResolver);
  const ordersService = new OrdersService(
    supabaseAdmin,
    scopeResolver,
    null,
    null,
    null,
    null,
    null,
  );

  return { state, merchantsService, ordersService };
}

test("1. Store A Owner retrieves Store A orders successfully with canonical envelope", async () => {
  const { merchantsService } = makeHarness();
  const res = await merchantsService.listMerchantOrders(
    STORE_A,
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
    { limit: 50 },
  );

  assert.equal(res.merchant_id, STORE_A);
  assert.equal(Array.isArray(res.orders), true);
  assert.equal(res.orders.length, 3);
  assert.equal(res.total, 3);
  assert.equal(res.limit, 50);
  assert.equal(res.offset, 0);

  // Verify fields of first order
  const first = res.orders[0];
  assert.ok(first.id);
  assert.ok(first.order_number);
  assert.equal(first.merchant_id, STORE_A);
  assert.ok(typeof first.total === "number");
  assert.ok(first.created_at);
});

test("2. Store A Manager and Staff can read Store A orders", async () => {
  const { merchantsService } = makeHarness();

  const managerRes = await merchantsService.listMerchantOrders(
    STORE_A,
    { actor_role: "merchant_manager", actor_id: USER_STORE_A_MANAGER },
    {},
  );
  assert.equal(managerRes.orders.length, 3);

  const staffRes = await merchantsService.listMerchantOrders(
    STORE_A,
    { actor_role: "merchant_staff", actor_id: USER_STORE_A_STAFF },
    {},
  );
  assert.equal(staffRes.orders.length, 3);
});

test("3. Cross-Store IDOR blocked: Store A Owner cannot view Store B orders", async () => {
  const { merchantsService } = makeHarness();

  await assert.rejects(
    async () => {
      await merchantsService.listMerchantOrders(
        STORE_B,
        { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
        {},
      );
    },
    (err) => {
      assert.ok(err instanceof ForbiddenException);
      assert.match(err.message, /Merchant scope is not allowed/);
      return true;
    },
  );
});

test("4. Cross-Store IDOR blocked: Store B Owner cannot view Store A orders", async () => {
  const { merchantsService } = makeHarness();

  await assert.rejects(
    async () => {
      await merchantsService.listMerchantOrders(
        STORE_A,
        { actor_role: "merchant_owner", actor_id: USER_STORE_B_OWNER },
        {},
      );
    },
    (err) => {
      assert.ok(err instanceof ForbiddenException);
      assert.match(err.message, /Merchant scope is not allowed/);
      return true;
    },
  );
});

test("5. Inactive / Suspended Store orders access rejected", async () => {
  const { state, merchantsService } = makeHarness();
  state.merchant_users.push({
    user_id: "user-inactive-owner",
    merchant_id: STORE_INACTIVE,
    role: "owner",
  });

  await assert.rejects(
    async () => {
      await merchantsService.listMerchantOrders(
        STORE_INACTIVE,
        { actor_role: "merchant_owner", actor_id: "user-inactive-owner" },
        {},
      );
    },
    (err) => {
      assert.ok(err instanceof ForbiddenException);
      assert.match(err.message, /Merchant is not active/);
      return true;
    },
  );
});

test("6. Customer role cannot access merchant orders", async () => {
  const { merchantsService } = makeHarness();

  await assert.rejects(
    async () => {
      await merchantsService.listMerchantOrders(
        STORE_A,
        { actor_role: "authenticated", actor_id: USER_CUSTOMER },
        {},
      );
    },
    (err) => {
      assert.ok(err instanceof ForbiddenException);
      assert.match(err.message, /Orders read access is not permitted/);
      return true;
    },
  );
});

test("7. Platform admin can read any merchant orders", async () => {
  const { merchantsService } = makeHarness();

  const res = await merchantsService.listMerchantOrders(
    STORE_A,
    { actor_role: "admin", actor_id: USER_ADMIN },
    {},
  );

  assert.equal(res.merchant_id, STORE_A);
  assert.equal(res.orders.length, 3);
});

test("8. Strict PII stripping: returned orders never contain customer phone or address", async () => {
  const { merchantsService } = makeHarness();

  const res = await merchantsService.listMerchantOrders(
    STORE_A,
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
    {},
  );

  for (const o of res.orders) {
    assert.equal("customer_phone" in o, false);
    assert.equal("customer_name" in o, false);
    assert.equal("address" in o, false);
    assert.equal("area" in o, false);
  }
});

test("9. Filter by status works correctly", async () => {
  const { merchantsService } = makeHarness();

  const res = await merchantsService.listMerchantOrders(
    STORE_A,
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
    { status: "delivered" },
  );

  assert.equal(res.orders.length, 1);
  assert.equal(res.orders[0].status, "delivered");
  assert.equal(res.orders[0].order_number, "BAG-101");
});

test("10. Search by order number works correctly", async () => {
  const { merchantsService } = makeHarness();

  const res = await merchantsService.listMerchantOrders(
    STORE_A,
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
    { search: "102" },
  );

  assert.equal(res.orders.length, 1);
  assert.equal(res.orders[0].order_number, "BAG-102");
});

test("11. Legacy listOrdersForMerchant rejects missing merchant_id (no silent fallback)", async () => {
  const { ordersService } = makeHarness();

  await assert.rejects(
    async () => {
      await ordersService.listOrders({
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
        merchant_id: undefined,
      });
    },
    (err) => {
      assert.ok(err instanceof ForbiddenException);
      assert.match(err.message, /Merchant id is required/);
      return true;
    },
  );
});

// ── HTTP Boundary Setup ──

const tokenMap = {
  "token-store-a-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_A_OWNER },
  "token-store-a-manager": { ok: true, actorRole: "merchant_manager", actorId: USER_STORE_A_MANAGER },
  "token-store-a-staff": { ok: true, actorRole: "merchant_staff", actorId: USER_STORE_A_STAFF },
  "token-store-b-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_B_OWNER },
  "token-admin": { ok: true, actorRole: "super_admin", actorId: USER_ADMIN },
  "token-customer": { ok: true, actorRole: "customer", actorId: USER_CUSTOMER },
};

const authHeader = (tok) => (tok ? { Authorization: `Bearer ${tok}` } : {});

let appInstance;
let baseUrl;

before(async () => {
  const { merchantsService } = makeHarness();
  const moduleRef = await Test.createTestingModule({
    controllers: [MerchantsController],
    providers: [
      { provide: MerchantsService, useValue: merchantsService },
      {
        provide: SupabaseActorResolverService,
        useValue: {
          resolve: async (token) => {
            const mapped = tokenMap[token];
            if (mapped) return { ...mapped, actorToken: token };
            return { ok: false, reason: "invalid_token" };
          },
        },
      },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();

  appInstance = moduleRef.createNestApplication();
  appInstance.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await appInstance.listen(0);
  const server = appInstance.getHttpServer();
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (appInstance) {
    await appInstance.close();
  }
});

test("12. Real NestJS HTTP Boundary: ParseUUIDPipe rejects malformed merchant ID with 400", async () => {
  const res = await fetch(`${baseUrl}/merchants/invalid-not-uuid/orders`, {
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.message, /Validation failed/);
});

test("13. Real NestJS HTTP Boundary: Whitelist validation rejects non-whitelisted query params with 400", async () => {
  const res = await fetch(
    `${baseUrl}/merchants/${STORE_A}/orders?unknown_injected_param=evil`,
    { headers: authHeader("token-store-a-owner") },
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.message[0], /property unknown_injected_param should not exist/);
});

test("14. Real NestJS HTTP Boundary: Valid request returns 200 with canonical envelope", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/orders?limit=10`, {
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.merchant_id, STORE_A);
  assert.equal(body.orders.length, 3);
  assert.equal(body.total, 3);
  assert.equal(body.limit, 10);
  assert.equal(body.offset, 0);
});

test("15. Real NestJS HTTP Boundary: Cross-store IDOR via HTTP returns 403", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_B}/orders`, {
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(res.status, 403);
});

test("16. Real NestJS HTTP Boundary: Customer token via HTTP returns 403", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/orders`, {
    headers: authHeader("token-customer"),
  });
  assert.equal(res.status, 403);
});
