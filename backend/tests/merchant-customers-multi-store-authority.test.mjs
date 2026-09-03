import assert from "node:assert/strict";
import test from "node:test";
import {
  ValidationPipe,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { MerchantsController } from "../dist/modules/merchants/merchants.controller.js";
import { MerchantsService } from "../dist/modules/merchants/merchants.service.js";
import { AdminController } from "../dist/modules/admin/admin.controller.js";
import { AdminService } from "../dist/modules/admin/admin.service.js";
import { AdminCustomersService } from "../dist/modules/admin/admin-customers.service.js";
import { ListMerchantCustomersQueryDto } from "../dist/modules/merchants/merchants.dto.js";
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

const RAW_FIXTURE_NAME = "أحمد كاظم البغدادي";
const RAW_FIXTURE_EMAIL = "ahmed.baghdad@example.com";
const RAW_FIXTURE_PHONE = "+9647701234567";

function makeHarness() {
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
    profiles: [
      {
        id: "prof-1",
        full_name: "عميل أدمن عام",
        email: "platform.cust@example.com",
        phone: "+9647809999999",
        role: "customer",
        created_at: "2026-06-01T10:00:00Z",
      },
    ],
    rpcCalls: [],
    rpcResponses: {},
  };

  const fakeClient = {
    from(table) {
      const filters = {};
      const queryObj = {
        select(_cols, opts) {
          queryObj._countExact = opts?.count === "exact";
          return queryObj;
        },
        eq(col, val) {
          filters[col] = val;
          return queryObj;
        },
        in(col, vals) {
          filters[`${col}_in`] = vals;
          return queryObj;
        },
        order() {
          return queryObj;
        },
        range(from, to) {
          queryObj._range = { from, to };
          return queryObj;
        },
        limit(n) {
          queryObj._limit = n;
          return queryObj;
        },
        async maybeSingle() {
          const rows = state[table] || [];
          const match = rows.find((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            return true;
          });
          return { data: match || null, error: null };
        },
        async then(resolve) {
          const rows = state[table] || [];
          const matches = rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (k.endsWith("_in")) {
                const actualKey = k.replace("_in", "");
                if (!v.includes(r[actualKey])) return false;
              } else if (r[k] !== v) {
                return false;
              }
            }
            return true;
          });
          resolve({ data: matches, count: matches.length, error: null });
        },
      };
      return queryObj;
    },
    async rpc(name, params) {
      state.rpcCalls.push({ name, params });
      if (state.rpcResponses[name] !== undefined) {
        return state.rpcResponses[name];
      }
      if (name === "merchant_customer_summary") {
        return {
          data: {
            items: [
              {
                customer_ref: "عميل #A1B2",
                phone_masked: "****4567",
                orders: 3,
                spent: 45000,
                last_order_at: "2026-06-10T12:00:00Z",
              },
            ],
            total: 1,
            limit: params.p_limit,
            offset: params.p_offset,
            has_more: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const fakeSupabaseAdmin = { client: fakeClient };
  const fakeScopeResolver = {
    async resolveMerchantScope(requestedMerchantId, actorRole, actorId) {
      if (actorRole === "super_admin" || actorRole === "admin") {
        return requestedMerchantId;
      }
      if (!actorId || !requestedMerchantId) return undefined;
      const m = state.merchant_users.find(
        (u) => u.user_id === actorId && u.merchant_id === requestedMerchantId,
      );
      return m?.merchant_id;
    },
  };

  const merchantsService = new MerchantsService(fakeSupabaseAdmin, fakeScopeResolver);
  const adminCustomersService = new AdminCustomersService(fakeSupabaseAdmin, fakeScopeResolver);
  const adminService = {
    getScopedCustomers: (params) => adminCustomersService.getScopedCustomers(params),
  };

  return { merchantsService, adminCustomersService, adminService, state };
}

// ── 1. Unit & Validation Authority ──
test("1. DTO & Validation Authority — ListMerchantCustomersQueryDto validation rules", async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  // Valid query params
  const valid = await pipe.transform(
    { search: "عميل", page: "2", limit: "25" },
    { type: "query", metatype: ListMerchantCustomersQueryDto },
  );
  assert.equal(valid.search, "عميل");
  assert.equal(valid.page, 2);
  assert.equal(valid.limit, 25);

  // Rejects non-whitelisted/injected params
  await assert.rejects(
    () =>
      pipe.transform(
        { search: "test", malicious_param: "hacked" },
        { type: "query", metatype: ListMerchantCustomersQueryDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  // Rejects invalid page number (page < 1)
  await assert.rejects(
    () =>
      pipe.transform(
        { page: "0" },
        { type: "query", metatype: ListMerchantCustomersQueryDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  // Rejects search query exceeding 100 characters
  await assert.rejects(
    () =>
      pipe.transform(
        { search: "a".repeat(101) },
        { type: "query", metatype: ListMerchantCustomersQueryDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  // ParseUUIDPipe rejects malformed merchant UUID
  const uuidPipe = new ParseUUIDPipe({ version: "4" });
  await assert.rejects(
    () => uuidPipe.transform("not-a-valid-uuid", { type: "param" }),
    (err) => err instanceof BadRequestException,
  );
});

test("2. Scope Resolver & Missing Merchant ID — rejects missing or invalid actor and target", async () => {
  const { merchantsService } = makeHarness();

  // Missing actor context
  await assert.rejects(
    () => merchantsService.listMerchantCustomers(STORE_A, undefined),
    (err) => err instanceof ForbiddenException && err.message.includes("Actor identity and role are required"),
  );

  // Actor role without actor_id
  await assert.rejects(
    () => merchantsService.listMerchantCustomers(STORE_A, { actor_role: "merchant_owner" }),
    (err) => err instanceof ForbiddenException && err.message.includes("Actor identity and role are required"),
  );

  // Actor role with empty actor_id
  await assert.rejects(
    () => merchantsService.listMerchantCustomers(STORE_A, { actor_role: "merchant_owner", actor_id: "   " }),
    (err) => err instanceof ForbiddenException && err.message.includes("Actor identity and role are required"),
  );

  // Empty or invalid merchantId
  await assert.rejects(
    () => merchantsService.listMerchantCustomers("", { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER }),
    (err) => err instanceof ForbiddenException && err.message.includes("Merchant id is required"),
  );

  // Unknown role
  await assert.rejects(
    () =>
      merchantsService.listMerchantCustomers(STORE_A, {
        actor_role: "hacker_role",
        actor_id: "hacker-1",
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Customer read access is not permitted"),
  );
});

test("3. Exact Membership & Inactive Status — rejects cross-store and inactive merchants", async () => {
  const { merchantsService } = makeHarness();

  // Cross-store: User of Store B requesting Store A
  await assert.rejects(
    () =>
      merchantsService.listMerchantCustomers(STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_B_OWNER,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Merchant scope is not allowed"),
  );

  // Suspended merchant
  await assert.rejects(
    () =>
      merchantsService.listMerchantCustomers(STORE_INACTIVE, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );
});

test("4. Role Aliases Authority — supports case-insensitive aliases", async () => {
  const { merchantsService, state } = makeHarness();

  const aliases = [
    { role: "owner", userId: USER_STORE_A_OWNER },
    { role: "OWNER", userId: USER_STORE_A_OWNER },
    { role: "merchant_owner", userId: USER_STORE_A_OWNER },
    { role: "MERCHANT_OWNER", userId: USER_STORE_A_OWNER },
    { role: "manager", userId: USER_STORE_A_MANAGER },
    { role: "merchant_manager", userId: USER_STORE_A_MANAGER },
    { role: "staff", userId: USER_STORE_A_STAFF },
    { role: "merchant_staff", userId: USER_STORE_A_STAFF },
  ];

  for (const a of aliases) {
    state.rpcCalls.length = 0;
    const res = await merchantsService.listMerchantCustomers(
      STORE_A,
      { actor_role: a.role, actor_id: a.userId },
      { page: 1, limit: 10 },
    );
    assert.equal(res.merchant_id, STORE_A);
    assert.equal(res.items.length, 1);
    assert.equal(res.hasMore, false);
    assert.equal(state.rpcCalls[0].name, "merchant_customer_summary");
  }
});

test("5. RPC Argument Verification — correctly passes p_search, p_limit, and computed p_offset", async () => {
  const { merchantsService, state } = makeHarness();

  state.rpcCalls.length = 0;
  await merchantsService.listMerchantCustomers(
    STORE_A,
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
    { search: "  عميل #1234  ", page: 3, limit: 25 },
  );

  assert.equal(state.rpcCalls.length, 1);
  const rpc = state.rpcCalls[0];
  assert.equal(rpc.params.p_merchant_id, STORE_A);
  assert.equal(rpc.params.p_limit, 25);
  assert.equal(rpc.params.p_offset, 50); // (page 3 - 1) * 25 = 50
  assert.ok(rpc.params.p_search.includes("عميل"));
});

test("6. Structural RPC Validation — rejects malformed payload without converting to empty state", async () => {
  const { merchantsService, state } = makeHarness();

  // Case A: RPC returns null data
  state.rpcResponses["merchant_customer_summary"] = { data: null, error: null };
  await assert.rejects(
    () =>
      merchantsService.listMerchantCustomers(STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ServiceUnavailableException && err.message.includes("Malformed customer summary payload"),
  );

  // Case B: RPC returns missing items array
  state.rpcResponses["merchant_customer_summary"] = {
    data: { total: 10, limit: 50, offset: 0, has_more: false },
    error: null,
  };
  await assert.rejects(
    () =>
      merchantsService.listMerchantCustomers(STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ServiceUnavailableException && err.message.includes("Malformed customer summary items"),
  );

  // Case C: RPC returns negative total
  state.rpcResponses["merchant_customer_summary"] = {
    data: { items: [], total: -5, limit: 50, offset: 0, has_more: false },
    error: null,
  };
  await assert.rejects(
    () =>
      merchantsService.listMerchantCustomers(STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ServiceUnavailableException && err.message.includes("total"),
  );

  // Case D: Item has invalid/missing customer_ref
  state.rpcResponses["merchant_customer_summary"] = {
    data: {
      items: [{ phone_masked: "****1234", orders: 1, spent: 100, last_order_at: "2026-06-01T00:00:00Z" }],
      total: 1,
      limit: 50,
      offset: 0,
      has_more: false,
    },
    error: null,
  };
  await assert.rejects(
    () =>
      merchantsService.listMerchantCustomers(STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ServiceUnavailableException && err.message.includes("Invalid customer_ref"),
  );

  // Case E: Item has invalid date
  state.rpcResponses["merchant_customer_summary"] = {
    data: {
      items: [{ customer_ref: "عميل #1", phone_masked: "****1234", orders: 1, spent: 100, last_order_at: "not-a-date" }],
      total: 1,
      limit: 50,
      offset: 0,
      has_more: false,
    },
    error: null,
  };
  await assert.rejects(
    () =>
      merchantsService.listMerchantCustomers(STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ServiceUnavailableException && err.message.includes("Invalid last_order_at"),
  );
});

test("7. Privacy Contract & PII Exclusion — raw customer names, emails, and full phones never leak", async () => {
  const { merchantsService, state } = makeHarness();

  // Inject a response and verify strictly
  state.rpcResponses["merchant_customer_summary"] = {
    data: {
      items: [
        {
          customer_ref: "عميل #9999",
          phone_masked: "****4567",
          orders: 2,
          spent: 25000,
          last_order_at: "2026-06-01T12:00:00Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
      has_more: false,
    },
    error: null,
  };

  const res = await merchantsService.listMerchantCustomers(
    STORE_A,
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
  );

  const jsonString = JSON.stringify(res);

  // 1. Verify exact returned camelCase keys
  assert.equal(res.merchant_id, STORE_A);
  assert.equal(typeof res.hasMore, "boolean");
  assert.equal("has_more" in res, false, "HTTP layer must not expose has_more");

  // 2. Structural PII keys check
  const item = res.items[0];
  assert.equal("full_name" in item, false, "must not expose full_name");
  assert.equal("customer_name" in item, false, "must not expose customer_name");
  assert.equal("email" in item, false, "must not expose email");
  assert.equal("phone" in item, false, "must not expose raw phone");
  assert.equal("customer_phone" in item, false, "must not expose customer_phone");

  // 3. Raw fixture values must never appear in the JSON string
  assert.equal(jsonString.includes(RAW_FIXTURE_NAME), false);
  assert.equal(jsonString.includes(RAW_FIXTURE_EMAIL), false);
  assert.equal(jsonString.includes(RAW_FIXTURE_PHONE), false);
});

// ── 8. Real NestJS HTTP Server Boundary ──
test("8. REAL NESTJS HTTP SERVER BOUNDARY: app.listen(0), real fetch, ValidationPipe, RolesGuard, and Route Separation", async (t) => {
  const { merchantsService, adminService, state } = makeHarness();

  const tokenMap = {
    "token-store-a-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_A_OWNER },
    "token-store-a-manager": { ok: true, actorRole: "merchant_manager", actorId: USER_STORE_A_MANAGER },
    "token-store-a-staff": { ok: true, actorRole: "merchant_staff", actorId: USER_STORE_A_STAFF },
    "token-store-b-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_B_OWNER },
    "token-admin": { ok: true, actorRole: "super_admin", actorId: USER_ADMIN },
    "token-customer": { ok: true, actorRole: "customer", actorId: "user-cust-1" },
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [MerchantsController, AdminController],
    providers: [
      {
        provide: MerchantsService,
        useValue: merchantsService,
      },
      {
        provide: AdminService,
        useValue: adminService,
      },
      {
        provide: SupabaseActorResolverService,
        useValue: {
          resolve: async (token) => {
            const mapped = tokenMap[token];
            if (mapped) {
              return { ...mapped, actorToken: token };
            }
            return { ok: false, reason: "invalid_token" };
          },
        },
      },
      {
        provide: APP_GUARD,
        useClass: RolesGuard,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();

  await app.listen(0);
  const port = app.getHttpServer().address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await app.close();
  });

  const authHeader = (tok) => (tok ? { Authorization: `Bearer ${tok}` } : {});

  // ── ROUTE 1: GET /merchants/:id/customers ──
  {
    // A. Missing bearer token => HTTP 403
    const resNoToken = await fetch(`${baseUrl}/merchants/${STORE_A}/customers`);
    assert.equal(resNoToken.status, 403, "missing token must return HTTP 403");

    // B. Invalid bearer token => HTTP 403
    const resBadToken = await fetch(`${baseUrl}/merchants/${STORE_A}/customers`, {
      headers: authHeader("invalid-token"),
    });
    assert.equal(resBadToken.status, 403, "invalid token must return HTTP 403");

    // C. Customer token => HTTP 403
    const resCust = await fetch(`${baseUrl}/merchants/${STORE_A}/customers`, {
      headers: authHeader("token-customer"),
    });
    assert.equal(resCust.status, 403, "customer role must return HTTP 403");

    // D. Invalid UUID param => HTTP 400 (ParseUUIDPipe)
    const resBadUuid = await fetch(`${baseUrl}/merchants/invalid-uuid/customers`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resBadUuid.status, 400, "invalid UUID param must return HTTP 400");

    // E. Disallowed/unknown query param => HTTP 400 (forbidNonWhitelisted)
    const resBadQuery = await fetch(`${baseUrl}/merchants/${STORE_A}/customers?unknown_field=injected`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resBadQuery.status, 400, "unknown query param must return HTTP 400");

    // E2. Search parameter exceeding 100 characters => HTTP 400 and RPC NOT called
    const rpcCallsBefore = state.rpcCalls.length;
    const resOverlongSearch = await fetch(
      `${baseUrl}/merchants/${STORE_A}/customers?search=${"x".repeat(101)}`,
      { headers: authHeader("token-store-a-owner") },
    );
    assert.equal(resOverlongSearch.status, 400, "search > 100 chars must return HTTP 400");
    assert.equal(state.rpcCalls.length, rpcCallsBefore, "RPC must not be invoked when search > 100 chars");

    // F. Store A owner accesses Store A => HTTP 200
    const resOwnerA = await fetch(`${baseUrl}/merchants/${STORE_A}/customers?page=1&limit=20`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resOwnerA.status, 200, "Store A owner accessing Store A must return HTTP 200");
    const bodyOwnerA = await resOwnerA.json();
    assert.equal(bodyOwnerA.merchant_id, STORE_A);
    assert.equal(bodyOwnerA.hasMore, false);
    assert.equal(Array.isArray(bodyOwnerA.items), true);

    // G. Store A staff accesses Store A => HTTP 200 (read-only allowed)
    const resStaffA = await fetch(`${baseUrl}/merchants/${STORE_A}/customers`, {
      headers: authHeader("token-store-a-staff"),
    });
    assert.equal(resStaffA.status, 200, "Store A staff accessing Store A must return HTTP 200");

    // H. Store B owner accesses Store A => HTTP 403 (Cross-store rejection)
    const resOwnerCross = await fetch(`${baseUrl}/merchants/${STORE_A}/customers`, {
      headers: authHeader("token-store-b-owner"),
    });
    assert.equal(resOwnerCross.status, 403, "Cross-store access must return HTTP 403");
  }

  // ── ROUTE 2: GET /admin/customers transition & separation ──
  {
    // A. Platform admin can access /admin/customers => HTTP 200
    const resAdmin = await fetch(`${baseUrl}/admin/customers`, {
      headers: authHeader("token-admin"),
    });
    assert.equal(resAdmin.status, 200, "platform admin must still access /admin/customers");

    // B. Merchant owner CANNOT access /admin/customers => HTTP 403 (Separation verified)
    const resMerchantOnAdmin = await fetch(`${baseUrl}/admin/customers?merchant_id=${STORE_A}`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resMerchantOnAdmin.status, 403, "merchant_owner must be rejected from /admin/customers");

    // C. Merchant manager CANNOT access /admin/customers => HTTP 403
    const resManagerOnAdmin = await fetch(`${baseUrl}/admin/customers?merchant_id=${STORE_A}`, {
      headers: authHeader("token-store-a-manager"),
    });
    assert.equal(resManagerOnAdmin.status, 403, "merchant_manager must be rejected from /admin/customers");

    // D. Merchant staff CANNOT access /admin/customers => HTTP 403
    const resStaffOnAdmin = await fetch(`${baseUrl}/admin/customers?merchant_id=${STORE_A}`, {
      headers: authHeader("token-store-a-staff"),
    });
    assert.equal(resStaffOnAdmin.status, 403, "merchant_staff must be rejected from /admin/customers");
  }
});
