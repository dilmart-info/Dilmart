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
import { MerchantDashboardController } from "../dist/modules/merchants/merchant-dashboard.controller.js";
import { MerchantsService } from "../dist/modules/merchants/merchants.service.js";
import { LegacyMerchantDashboardQueryDto } from "../dist/modules/merchants/merchants.dto.js";
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
    products: [
      { id: "prod-a-1", merchant_id: STORE_A, name: "عطر ليالي بغداد", is_active: true, stock: 15, low_stock_threshold: 5 },
      { id: "prod-a-2", merchant_id: STORE_A, name: "بخور مريم", is_active: true, stock: 2, low_stock_threshold: 5 },
      { id: "prod-a-3", merchant_id: STORE_A, name: "منتج ملغى", is_active: false, stock: 0, low_stock_threshold: 5 },
      { id: "prod-b-1", merchant_id: STORE_B, name: "قهوة البصرة", is_active: true, stock: 50, low_stock_threshold: 10 },
    ],
    orders: [
      { id: "ord-a-1", merchant_id: STORE_A, order_number: "BAG-101", status: "delivered", total: 45000, created_at: todayIso },
      { id: "ord-a-2", merchant_id: STORE_A, order_number: "BAG-102", status: "preparing", total: 25000, created_at: todayIso },
      { id: "ord-b-1", merchant_id: STORE_B, order_number: "BAS-201", status: "delivered", total: 60000, created_at: todayIso },
    ],
    order_items: [
      {
        product_id: "prod-a-1",
        product_name: "عطر ليالي بغداد",
        quantity: 3,
        price: 15000,
        orders: { merchant_id: STORE_A, status: "delivered" },
        created_at: todayIso,
      },
    ],
    merchant_settings: [
      { merchant_id: STORE_A, default_low_stock_threshold: 5 },
      { merchant_id: STORE_B, default_low_stock_threshold: 10 },
    ],
  };

  const supabaseMock = {
    from: (table) => {
      let filters = [];
      let selectedCols = "*";
      let isMaybeSingle = false;
      let limitCount = null;
      let orderCol = null;
      let orderAsc = true;

      const builder = {
        select: (cols, opts = {}) => {
          selectedCols = cols;
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
        in: (col, vals) => {
          filters.push({ type: "in", col, vals });
          return builder;
        },
        order: (col, opts = {}) => {
          orderCol = col;
          orderAsc = opts.ascending ?? true;
          return builder;
        },
        limit: (n) => {
          limitCount = n;
          return builder;
        },
        maybeSingle: () => {
          isMaybeSingle = true;
          return builder;
        },
        then: async (resolve) => {
          let rows = [...(state[table] || [])];

          for (const f of filters) {
            if (f.type === "eq") {
              if (f.col.startsWith("orders.")) {
                const subCol = f.col.split(".")[1];
                rows = rows.filter((r) => r.orders && r.orders[subCol] === f.val);
              } else {
                rows = rows.filter((r) => r[f.col] === f.val);
              }
            } else if (f.type === "gte") {
              rows = rows.filter((r) => r[f.col] >= f.val);
            } else if (f.type === "in") {
              if (f.col.startsWith("orders.")) {
                const subCol = f.col.split(".")[1];
                rows = rows.filter((r) => r.orders && f.vals.includes(r.orders[subCol]));
              } else {
                rows = rows.filter((r) => f.vals.includes(r[f.col]));
              }
            }
          }

          if (orderCol) {
            rows.sort((a, b) => {
              const valA = a[orderCol];
              const valB = b[orderCol];
              if (valA < valB) return orderAsc ? -1 : 1;
              if (valA > valB) return orderAsc ? 1 : -1;
              return 0;
            });
          }

          if (limitCount !== null) {
            rows = rows.slice(0, limitCount);
          }

          if (isMaybeSingle) {
            return resolve({ data: rows[0] || null, error: null });
          }

          return resolve({ data: rows, count: rows.length, error: null });
        },
      };

      return builder;
    },
  };

  const scopeResolverMock = {
    resolveMerchantScope: async (merchantId, actorRole, actorId) => {
      if (!actorRole || !actorId) return null;
      if (actorRole === "super_admin" || actorRole === "admin") {
        return merchantId || null;
      }
      const membership = state.merchant_users.find(
        (mu) => mu.user_id === actorId && (!merchantId || mu.merchant_id === merchantId),
      );
      return membership ? membership.merchant_id : null;
    },
  };

  const merchantsService = new MerchantsService(
    { client: supabaseMock },
    scopeResolverMock,
  );

  return { state, merchantsService };
}

// ── 1. DTO VALIDATION TESTS ──

test("DTO: LegacyMerchantDashboardQueryDto requires merchant_id with UUID v4", async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  // Missing merchant_id
  await assert.rejects(
    () => pipe.transform({}, { type: "query", metatype: LegacyMerchantDashboardQueryDto }),
    (err) => err instanceof BadRequestException,
  );

  // Non-UUID string
  await assert.rejects(
    () => pipe.transform({ merchant_id: "not-a-uuid" }, { type: "query", metatype: LegacyMerchantDashboardQueryDto }),
    (err) => err instanceof BadRequestException,
  );

  // Valid UUID v4 passes
  const valid = await pipe.transform({ merchant_id: STORE_A }, { type: "query", metatype: LegacyMerchantDashboardQueryDto });
  assert.equal(valid.merchant_id, STORE_A);
});

// ── 2. SERVICE LAYER CONTRACT & AUTHORITY TESTS ──

test("Service: getMyMerchantDashboard rejects missing requestedMerchantId without fallback", async () => {
  const { merchantsService } = makeHarness();
  await assert.rejects(
    () => merchantsService.getMyMerchantDashboard({ actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER }, undefined),
    (err) => err instanceof ForbiddenException && err.message.includes("Merchant id is required"),
  );
});

test("Service: getMyMerchantDashboard returns canonical payload with merchant_id for member", async () => {
  const { merchantsService } = makeHarness();
  const res = await merchantsService.getMyMerchantDashboard(
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
    STORE_A,
  );

  assert.equal(res.merchant_id, STORE_A);
  assert.equal(typeof res.products.total, "number");
  assert.equal(typeof res.orders.today, "number");
  assert.equal(res.products.total, 3);
  assert.equal(res.products.active, 2);
  assert.equal(res.products.inactive, 1);
  assert.equal(res.products.low_stock, 2); // prod-a-2 (stock 2) and prod-a-3 (stock 0) <= threshold 5
  assert.equal(res.orders.today, 2);
  assert.equal(res.orders.completed_7d, 1);
  assert.equal(res.orders.revenue_7d, 45000);
  assert.equal(res.top_products.length, 1);
  assert.equal(res.top_products[0].name, "عطر ليالي بغداد");
  assert.equal(res.low_stock_products.length, 2);
  assert.equal(res.low_stock_products[0].name, "منتج ملغى");
  assert.equal(res.low_stock_products[1].name, "بخور مريم");

  assert.equal(res.recent_orders.length, 2);
});

test("Service: getMyMerchantDashboard rejects non-member with 403", async () => {
  const { merchantsService } = makeHarness();
  await assert.rejects(
    () =>
      merchantsService.getMyMerchantDashboard(
        { actor_role: "merchant_owner", actor_id: USER_STORE_B_OWNER },
        STORE_A,
      ),
    (err) => err instanceof ForbiddenException,
  );
});

test("Service: getMyMerchantDashboard rejects inactive/suspended store with 403", async () => {
  const { merchantsService, state } = makeHarness();
  state.merchant_users.push({ user_id: USER_STORE_A_OWNER, merchant_id: STORE_INACTIVE, role: "owner" });

  await assert.rejects(
    () =>
      merchantsService.getMyMerchantDashboard(
        { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
        STORE_INACTIVE,
      ),
    (err) => err instanceof ForbiddenException && err.message.includes("not active"),
  );
});

// ── 3. REAL NESTJS HTTP SERVER BOUNDARY SUITE ──

let appInstance = null;
let baseUrl = null;

const tokenMap = {
  "token-store-a-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_A_OWNER },
  "token-store-a-manager": { ok: true, actorRole: "merchant_manager", actorId: USER_STORE_A_MANAGER },
  "token-store-a-staff": { ok: true, actorRole: "merchant_staff", actorId: USER_STORE_A_STAFF },
  "token-store-b-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_B_OWNER },
  "token-admin": { ok: true, actorRole: "super_admin", actorId: USER_ADMIN },
  "token-customer": { ok: true, actorRole: "customer", actorId: USER_CUSTOMER },
};

const authHeader = (tok) => (tok ? { Authorization: `Bearer ${tok}` } : {});

before(async () => {
  const { merchantsService } = makeHarness();
  const moduleRef = await Test.createTestingModule({
    controllers: [MerchantsController, MerchantDashboardController],
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
  const port = appInstance.getHttpServer().address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (appInstance) {
    await appInstance.close();
  }
});

// ── HTTP TESTS: EXPLICIT ROUTE GET /merchants/:id/dashboard ──

test("HTTP: GET /merchants/:id/dashboard returns 400 Bad Request on invalid UUID", async () => {
  const res = await fetch(`${baseUrl}/merchants/not-a-valid-uuid/dashboard`, {
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(res.status, 400);
});

test("HTTP: GET /merchants/:id/dashboard returns 403 for unauthenticated or customer", async () => {
  const noAuthRes = await fetch(`${baseUrl}/merchants/${STORE_A}/dashboard`);
  assert.equal(noAuthRes.status, 403);

  const custRes = await fetch(`${baseUrl}/merchants/${STORE_A}/dashboard`, {
    headers: authHeader("token-customer"),
  });
  assert.equal(custRes.status, 403);
});

test("HTTP: GET /merchants/:id/dashboard returns 200 with canonical merchant_id for Store A owner/manager/staff", async () => {
  for (const token of ["token-store-a-owner", "token-store-a-manager", "token-store-a-staff"]) {
    const res = await fetch(`${baseUrl}/merchants/${STORE_A}/dashboard`, {
      headers: authHeader(token),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.merchant_id, STORE_A);
    assert.equal(body.products.total, 3);
    assert.equal(body.orders.today, 2);
  }
});

test("HTTP: GET /merchants/:id/dashboard returns 403 when Store B owner attempts to access Store A", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/dashboard`, {
    headers: authHeader("token-store-b-owner"),
  });
  assert.equal(res.status, 403);
});

test("HTTP: GET /merchants/:id/dashboard returns 200 for platform admin", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/dashboard`, {
    headers: authHeader("token-admin"),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.merchant_id, STORE_A);
});

// ── HTTP TESTS: LEGACY ROUTE GET /merchant/dashboard RESTRICTIONS ──

test("HTTP: Legacy GET /merchant/dashboard rejects merchant roles with 403 Forbidden", async () => {
  for (const token of ["token-store-a-owner", "token-store-a-manager", "token-store-a-staff", "token-store-b-owner"]) {
    const res = await fetch(`${baseUrl}/merchant/dashboard?merchant_id=${STORE_A}`, {
      headers: authHeader(token),
    });
    assert.equal(res.status, 403);
  }
});

test("HTTP: Legacy GET /merchant/dashboard rejects admin call without merchant_id (no first-store fallback)", async () => {
  const res = await fetch(`${baseUrl}/merchant/dashboard`, {
    headers: authHeader("token-admin"),
  });
  assert.equal(res.status, 400); // ValidationPipe rejects missing required merchant_id
});

test("HTTP: Legacy GET /merchant/dashboard succeeds for admin when explicit merchant_id provided", async () => {
  const res = await fetch(`${baseUrl}/merchant/dashboard?merchant_id=${STORE_A}`, {
    headers: authHeader("token-admin"),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.merchant_id, STORE_A);
});
