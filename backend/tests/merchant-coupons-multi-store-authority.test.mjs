import assert from "node:assert/strict";
import test from "node:test";
import {
  ValidationPipe,
  ParseUUIDPipe,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { CouponsService } from "../dist/modules/coupons/coupons.service.js";
import { CouponsController } from "../dist/modules/coupons/coupons.controller.js";
import {
  ListCouponsQueryDto,
  UpsertCouponDto,
  ValidateCouponDto,
} from "../dist/modules/coupons/coupons.dto.js";
import { RolesGuard } from "../dist/common/authz/roles.guard.js";
import { SupabaseActorResolverService } from "../dist/common/authz/supabase-actor-resolver.service.js";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const STORE_STRICT = "33333333-3333-4333-8333-333333333333";
const STORE_INACTIVE = "44444444-4444-4444-8444-444444444444";

const COUPON_A_ID = "c0000000-1111-4111-8111-111111111111";
const COUPON_B_ID = "c0000000-2222-4222-8222-222222222222";

const USER_STORE_A_OWNER = "user-store-a-owner";
const USER_STORE_A_MANAGER = "user-store-a-manager";
const USER_STORE_A_STAFF = "user-store-a-staff";
const USER_STORE_B_OWNER = "user-store-b-owner";
const USER_ADMIN = "user-admin";

function makeHarness() {
  const state = {
    merchants: [
      { id: STORE_A, status: "active", display_name: "متجر بغداد" },
      { id: STORE_B, status: "active", display_name: "متجر البصرة" },
      { id: STORE_STRICT, status: "active", display_name: "متجر صارم" },
      { id: STORE_INACTIVE, status: "pending", display_name: "متجر معلق" },
    ],
    merchant_users: [
      { user_id: USER_STORE_A_OWNER, merchant_id: STORE_A, role: "owner" },
      { user_id: USER_STORE_A_MANAGER, merchant_id: STORE_A, role: "manager" },
      { user_id: USER_STORE_A_STAFF, merchant_id: STORE_A, role: "staff" },
      { user_id: USER_STORE_B_OWNER, merchant_id: STORE_B, role: "owner" },
    ],
    merchant_policy_assignments: [
      { merchant_id: STORE_STRICT, profile_id: "strict" },
    ],
    coupons: [
      {
        id: COUPON_A_ID,
        code: "BAGHDAD10",
        discount_type: "percentage",
        value: 10,
        min_order_amount: 0,
        max_uses: 100,
        expires_at: "2026-12-31T23:59:59.000Z",
        is_active: true,
        merchant_id: STORE_A,
        created_at: "2026-05-01T10:00:00.000Z",
      },
      {
        id: COUPON_B_ID,
        code: "BASRA5000",
        discount_type: "fixed",
        value: 5000,
        min_order_amount: 25000,
        max_uses: 50,
        expires_at: "2026-11-30T23:59:59.000Z",
        is_active: true,
        merchant_id: STORE_B,
        created_at: "2026-05-02T10:00:00.000Z",
      },
    ],
    policyTableError: null,
  };

  const client = {
    from(table) {
      const filters = {};
      let isDelete = false;
      let isUpdate = false;
      let updatePayload = null;

      const builder = {
        select(_fields) {
          return builder;
        },
        eq(col, val) {
          filters[col] = val;
          return builder;
        },
        neq(col, val) {
          filters[`!${col}`] = val;
          return builder;
        },
        order(_col, { ascending = true } = {}) {
          return builder;
        },
        limit(_val) {
          return builder;
        },
        delete() {
          isDelete = true;
          return builder;
        },
        update(payload) {
          isUpdate = true;
          updatePayload = payload;
          return builder;
        },
        async insert(payload) {
          const row = {
            id: payload.id || `c0000000-${Math.random().toString(36).slice(2, 6)}-4000-8000-${Math.random().toString(36).slice(2, 14)}`,
            ...payload,
            created_at: new Date().toISOString(),
          };
          state[table].push(row);
          return { data: row, error: null };
        },
        async maybeSingle() {
          if (table === "merchant_policy_assignments" && state.policyTableError) {
            return { data: null, error: state.policyTableError };
          }
          const rows = state[table] || [];
          const matched = rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (k.startsWith("!")) {
                const realK = k.slice(1);
                if (r[realK] === v) return false;
              } else {
                if (r[k] !== v) return false;
              }
            }
            return true;
          });
          return { data: matched[0] || null, error: null };
        },
        then(resolve, reject) {
          const rows = state[table] || [];
          if (isDelete) {
            const deleted = [];
            const remaining = [];
            for (const r of rows) {
              let match = true;
              for (const [k, v] of Object.entries(filters)) {
                if (r[k] !== v) {
                  match = false;
                  break;
                }
              }
              if (match) {
                deleted.push(r);
              } else {
                remaining.push(r);
              }
            }
            state[table] = remaining;
            return Promise.resolve({ data: deleted, error: null }).then(resolve, reject);
          }

          if (isUpdate) {
            let updated = null;
            for (const r of rows) {
              let match = true;
              for (const [k, v] of Object.entries(filters)) {
                if (r[k] !== v) {
                  match = false;
                  break;
                }
              }
              if (match) {
                Object.assign(r, updatePayload);
                updated = r;
              }
            }
            return Promise.resolve({ data: updated ? [updated] : [], error: null }).then(resolve, reject);
          }

          const matched = rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (k.startsWith("!")) {
                const realK = k.slice(1);
                if (r[realK] === v) return false;
              } else {
                if (r[k] !== v) return false;
              }
            }
            return true;
          });

          return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
        },
      };

      return builder;
    },
    rpc(fn, args) {
      if (fn === "validate_coupon") {
        const found = state.coupons.find(
          (c) => c.code.toUpperCase() === String(args.p_code).toUpperCase(),
        );
        if (!found) {
          return Promise.resolve({ data: { valid: false, message: "الكوبون غير موجود" }, error: null });
        }
        return Promise.resolve({ data: { valid: true, coupon: found }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  const supabaseAdmin = { client };
  const service = new CouponsService(supabaseAdmin);
  const controller = new CouponsController(service);

  return { state, service, controller };
}

test("1. DTO & ValidationPipe boundaries — rejects invalid UUID, unknown properties, and bad values", async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  // Query DTO: rejects invalid UUID
  await assert.rejects(
    () => pipe.transform({ merchant_id: "not-a-uuid" }, { type: "query", metatype: ListCouponsQueryDto }),
    (err) => err instanceof BadRequestException,
  );

  // Query DTO: rejects unknown properties
  await assert.rejects(
    () => pipe.transform({ merchant_id: STORE_A, extra_field: "injected" }, { type: "query", metatype: ListCouponsQueryDto }),
    (err) => err instanceof BadRequestException,
  );

  // Upsert DTO: rejects percentage > 100
  const { service } = makeHarness();
  await assert.rejects(
    () =>
      service.upsertCoupon({
        code: "OVER100",
        discount_type: "percentage",
        value: 105,
        is_active: true,
        merchant_id: STORE_A,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof BadRequestException && err.message.includes("Percentage coupon value cannot exceed 100"),
  );

  // Upsert DTO: rejects negative min_order_amount
  await assert.rejects(
    () =>
      service.upsertCoupon({
        code: "NEGMIN",
        discount_type: "fixed",
        value: 5000,
        min_order_amount: -500,
        is_active: true,
        merchant_id: STORE_A,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof BadRequestException && err.message.includes("Minimum order amount cannot be negative"),
  );

  // ParseUUIDPipe on delete param
  const uuidPipe = new ParseUUIDPipe();
  await assert.rejects(
    () => uuidPipe.transform("invalid-uuid-string", { type: "param" }),
    (err) => err instanceof BadRequestException,
  );
});

test("2. Scope Resolver & Missing Merchant ID — rejects missing merchant_id without fallback", async () => {
  const { service } = makeHarness();

  // Missing merchant_id must throw BadRequestException (NO fallback to first store)
  await assert.rejects(
    () =>
      service.listCoupons({
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof BadRequestException && err.message.includes("Merchant ID is required"),
  );

  // Missing actor context must throw ForbiddenException
  await assert.rejects(
    () => service.listCoupons({ merchant_id: STORE_A }),
    (err) => err instanceof ForbiddenException,
  );

  // Unknown role must throw ForbiddenException
  await assert.rejects(
    () =>
      service.listCoupons({
        merchant_id: STORE_A,
        actor_role: "anonymous_viewer",
        actor_id: "user-1",
      }),
    (err) => err instanceof ForbiddenException,
  );

  // Non-member trying to access Store A must throw ForbiddenException
  await assert.rejects(
    () =>
      service.listCoupons({
        merchant_id: STORE_A,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_B_OWNER,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("not a member"),
  );

  // Suspended/pending merchant access must throw ForbiddenException
  await assert.rejects(
    () =>
      service.listCoupons({
        merchant_id: STORE_INACTIVE,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );
});

test("3. Role Authority Gating — staff can list coupons, but is strictly forbidden from upsert and delete", async () => {
  const { service } = makeHarness();

  // Staff can read Store A coupons
  const list = await service.listCoupons({
    merchant_id: STORE_A,
    actor_role: "merchant_staff",
    actor_id: USER_STORE_A_STAFF,
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].code, "BAGHDAD10");

  // Staff cannot create or update coupons
  await assert.rejects(
    () =>
      service.upsertCoupon({
        code: "STAFFCODE",
        discount_type: "fixed",
        value: 1000,
        is_active: true,
        merchant_id: STORE_A,
        actor_role: "merchant_staff",
        actor_id: USER_STORE_A_STAFF,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Staff role is not authorized"),
  );

  // Staff cannot delete coupons
  await assert.rejects(
    () =>
      service.deleteCoupon(COUPON_A_ID, STORE_A, {
        actor_role: "merchant_staff",
        actor_id: USER_STORE_A_STAFF,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Staff role is not authorized"),
  );
});

test("4. Edit IDOR Closure — Store A owner cannot edit or transfer Store B's coupon", async () => {
  const { service, state } = makeHarness();

  // Store A owner attempts to update Store B's coupon by passing its ID
  await assert.rejects(
    () =>
      service.upsertCoupon({
        id: COUPON_B_ID,
        code: "HIJACKED",
        discount_type: "fixed",
        value: 9999,
        is_active: true,
        merchant_id: STORE_A,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException && err.message.includes("Coupon not found"),
  );

  // Verify Store B's coupon was NOT mutated
  const storeBCoupon = state.coupons.find((c) => c.id === COUPON_B_ID);
  assert.equal(storeBCoupon.code, "BASRA5000");
  assert.equal(storeBCoupon.value, 5000);
});

test("5. Authoritative Deletion — proves actual row deletion; cross-store or missing returns 404", async () => {
  const { service, state } = makeHarness();

  // Cross-store delete: Store A owner attempts to delete Store B's coupon
  await assert.rejects(
    () =>
      service.deleteCoupon(COUPON_B_ID, STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException,
  );
  assert.equal(state.coupons.length, 2);

  // Missing coupon delete returns 404
  await assert.rejects(
    () =>
      service.deleteCoupon("99999999-9999-4999-8999-999999999999", STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException,
  );

  // Authorized delete: Store A owner deletes Store A's coupon
  const result = await service.deleteCoupon(COUPON_A_ID, STORE_A, {
    actor_role: "merchant_owner",
    actor_id: USER_STORE_A_OWNER,
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(state.coupons.length, 1);
  assert.equal(state.coupons[0].id, COUPON_B_ID);
});

test("6. Commercial Policy Enforcement — server enforces balanced & strict profiles, fails closed on DB error", async () => {
  const { service, state } = makeHarness();

  // Unassigned store (STORE_A) defaults to 'balanced': max discount 70%
  // Attempting 75% percentage discount must fail
  await assert.rejects(
    () =>
      service.upsertCoupon({
        code: "BALANCED75",
        discount_type: "percentage",
        value: 75,
        is_active: true,
        merchant_id: STORE_A,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof BadRequestException && err.message.includes("الحد الأقصى لخصم النسبة هو 70%"),
  );

  // Store with 'strict' policy (STORE_STRICT): max discount 50%, min order amount 5000
  // Attempting 60% percentage discount must fail
  state.merchant_users.push({ user_id: "user-strict", merchant_id: STORE_STRICT, role: "owner" });
  await assert.rejects(
    () =>
      service.upsertCoupon({
        code: "STRICT60",
        discount_type: "percentage",
        value: 60,
        is_active: true,
        merchant_id: STORE_STRICT,
        actor_role: "merchant_owner",
        actor_id: "user-strict",
      }),
    (err) => err instanceof BadRequestException && err.message.includes("الحد الأقصى لخصم النسبة هو 50%"),
  );

  // Attempting min order amount below strict limit (e.g. 2000 < 5000) must fail
  await assert.rejects(
    () =>
      service.upsertCoupon({
        code: "STRICTMIN",
        discount_type: "fixed",
        value: 1000,
        min_order_amount: 2000,
        is_active: true,
        merchant_id: STORE_STRICT,
        actor_role: "merchant_owner",
        actor_id: "user-strict",
      }),
    (err) => err instanceof BadRequestException && err.message.includes("الحد الأدنى للطلب يجب أن يكون 5000 د.ع أو أكثر"),
  );

  // Database error on policy assignment table must FAIL CLOSED (throw ServiceUnavailableException, NOT silently fall back)
  state.policyTableError = new Error("Connection refused to policy replica");
  await assert.rejects(
    () =>
      service.upsertCoupon({
        code: "POLICYFAIL",
        discount_type: "fixed",
        value: 1000,
        is_active: true,
        merchant_id: STORE_A,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ServiceUnavailableException && err.message.includes("السياسة التجارية للمتجر غير متاحة"),
  );
});

test("7. Global Code Uniqueness & RPC Validation — preserves unique code constraint and validateCoupon RPC", async () => {
  const { service } = makeHarness();

  // Duplicate code globally throws ConflictException with COUPON_CODE_EXISTS
  await assert.rejects(
    () =>
      service.upsertCoupon({
        code: "BAGHDAD10", // already exists
        discount_type: "fixed",
        value: 2000,
        is_active: true,
        merchant_id: STORE_B,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_B_OWNER,
      }),
    (err) => err instanceof ConflictException,
  );

  // Validating coupon via RPC
  const validRes = await service.validateCoupon({
    code: "BAGHDAD10",
    total: 50000,
    merchant_id: STORE_A,
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.coupon.code, "BAGHDAD10");

  const invalidRes = await service.validateCoupon({
    code: "NONEXISTENT",
    total: 50000,
  });
  assert.equal(invalidRes.valid, false);
  assert.equal(invalidRes.message, "الكوبون غير موجود");
});

test("8. Platform Admin Oversight — platform admin can list all coupons or manage platform-wide coupons", async () => {
  const { service } = makeHarness();

  // Admin lists all coupons across all merchants
  const allCoupons = await service.listCoupons({
    actor_role: "super_admin",
    actor_id: USER_ADMIN,
  });
  assert.equal(allCoupons.length, 2);

  // Admin lists specific merchant coupons
  const storeACoupons = await service.listCoupons({
    merchant_id: STORE_A,
    actor_role: "admin",
    actor_id: USER_ADMIN,
  });
  assert.equal(storeACoupons.length, 1);
  assert.equal(storeACoupons[0].merchant_id, STORE_A);

  // Admin creates a platform-wide coupon (merchant_id = null)
  const result = await service.upsertCoupon({
    code: "PLATFORM2026",
    discount_type: "fixed",
    value: 10000,
    is_active: true,
    merchant_id: null,
    actor_role: "super_admin",
    actor_id: USER_ADMIN,
  });
  assert.deepEqual(result, { ok: true });
});

test("9. REAL NESTJS HTTP SERVER BOUNDARY: app.listen(0), real fetch, Global ValidationPipe, RolesGuard, and UUIDs", async (t) => {
  const { service, state } = makeHarness();

  const tokenMap = {
    "token-store-a-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_A_OWNER },
    "token-store-a-manager": { ok: true, actorRole: "merchant_manager", actorId: USER_STORE_A_MANAGER },
    "token-store-a-staff": { ok: true, actorRole: "merchant_staff", actorId: USER_STORE_A_STAFF },
    "token-store-b-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_B_OWNER },
    "token-admin": { ok: true, actorRole: "super_admin", actorId: USER_ADMIN },
    "token-customer": { ok: true, actorRole: "customer", actorId: "user-cust-1" },
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [CouponsController],
    providers: [
      {
        provide: CouponsService,
        useValue: service,
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
  // EXACT production pipe from backend/src/main.ts
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(0);
  const port = app.getHttpServer().address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await app.close();
  });

  const authHeader = (tok) => (tok ? { Authorization: `Bearer ${tok}` } : {});

  // ── ROUTE 1: GET /coupons ──
  {
    // A. Missing bearer token => HTTP 403
    const resNoToken = await fetch(`${baseUrl}/coupons?merchant_id=${STORE_A}`);
    assert.equal(resNoToken.status, 403, "missing token must return HTTP 403");

    // B. Invalid bearer token => HTTP 403
    const resBadToken = await fetch(`${baseUrl}/coupons?merchant_id=${STORE_A}`, {
      headers: authHeader("totally-invalid-token"),
    });
    assert.equal(resBadToken.status, 403, "invalid token must return HTTP 403");

    // C. Customer token (unauthorized role) => HTTP 403
    const resCust = await fetch(`${baseUrl}/coupons?merchant_id=${STORE_A}`, {
      headers: authHeader("token-customer"),
    });
    assert.equal(resCust.status, 403, "customer role must return HTTP 403");

    // D. Malformed merchant_id UUID => HTTP 400 (ValidationPipe on ListCouponsQueryDto)
    const resBadUuid = await fetch(`${baseUrl}/coupons?merchant_id=not-a-uuid`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resBadUuid.status, 400, "malformed query UUID must return HTTP 400");

    // E. Staff reading Store A coupons => HTTP 200
    const resStaff = await fetch(`${baseUrl}/coupons?merchant_id=${STORE_A}`, {
      headers: authHeader("token-store-a-staff"),
    });
    assert.equal(resStaff.status, 200, "staff member can view coupons via HTTP 200");
    const staffData = await resStaff.json();
    assert.equal(Array.isArray(staffData), true);
    assert.equal(staffData.length, 1);
    assert.equal(staffData[0].code, "BAGHDAD10");

    // F. Cross-store access: Store B owner requesting Store A coupons => HTTP 403 (membership check in service)
    const resCross = await fetch(`${baseUrl}/coupons?merchant_id=${STORE_A}`, {
      headers: authHeader("token-store-b-owner"),
    });
    assert.equal(resCross.status, 403, "cross-store owner cannot list other store's coupons");
  }

  // ── ROUTE 2: POST /coupons ──
  {
    // A. Staff attempting to create coupon => HTTP 403 (RolesGuard rejects merchant_staff on POST)
    const resStaffPost = await fetch(`${baseUrl}/coupons`, {
      method: "POST",
      headers: { ...authHeader("token-store-a-staff"), "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "STAFFFAIL",
        discount_type: "percentage",
        value: 10,
        merchant_id: STORE_A,
      }),
    });
    assert.equal(resStaffPost.status, 403, "RolesGuard must reject merchant_staff on POST with HTTP 403");

    // B. Malformed payload: missing required code => HTTP 400
    const resNoCode = await fetch(`${baseUrl}/coupons`, {
      method: "POST",
      headers: { ...authHeader("token-store-a-owner"), "Content-Type": "application/json" },
      body: JSON.stringify({
        discount_type: "percentage",
        value: 10,
        merchant_id: STORE_A,
        is_active: true,
      }),
    });
    assert.equal(resNoCode.status, 400, "missing code must return HTTP 400");

    // C. Malformed payload: percentage value > 100 => HTTP 400
    const resOver100 = await fetch(`${baseUrl}/coupons`, {
      method: "POST",
      headers: { ...authHeader("token-store-a-owner"), "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "OVER100HTTP",
        discount_type: "percentage",
        value: 150,
        merchant_id: STORE_A,
        is_active: true,
      }),
    });
    assert.equal(resOver100.status, 400, "percentage > 100 must return HTTP 400");

    // D. Unknown fields in payload: production ValidationPipe whitelist strips unknown fields without failing
    // Proving exact production behavior (Directive 8)
    const resUnknownField = await fetch(`${baseUrl}/coupons`, {
      method: "POST",
      headers: { ...authHeader("token-store-a-owner"), "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "STRIPTEST",
        discount_type: "fixed",
        value: 2000,
        merchant_id: STORE_A,
        is_active: true,
        injected_malicious_column: "DROP TABLE coupons",
      }),
    });
    assert.equal(resUnknownField.status, 201, "production whitelist strips unknown fields and succeeds with 201");
    const createdCoupon = state.coupons.find((c) => c.code === "STRIPTEST");
    assert.ok(createdCoupon, "coupon must be created");
    assert.equal(createdCoupon.injected_malicious_column, undefined, "unknown field must be stripped");

    // E. Commercial policy limit violation: attempting 75% on Store A (balanced limit = 70%) => HTTP 400
    const resPolicyViolate = await fetch(`${baseUrl}/coupons`, {
      method: "POST",
      headers: { ...authHeader("token-store-a-owner"), "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "BALANCED75HTTP",
        discount_type: "percentage",
        value: 75,
        merchant_id: STORE_A,
        is_active: true,
      }),
    });
    assert.equal(resPolicyViolate.status, 400, "policy violation returns HTTP 400");

    // F. Commercial policy DB failure => HTTP 503 Service Unavailable (fails closed)
    state.policyTableError = new Error("DB Connection Error");
    const resPolicyFail = await fetch(`${baseUrl}/coupons`, {
      method: "POST",
      headers: { ...authHeader("token-store-a-owner"), "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "POLICYFAILHTTP",
        discount_type: "fixed",
        value: 1000,
        merchant_id: STORE_A,
        is_active: true,
      }),
    });
    assert.equal(resPolicyFail.status, 503, "policy DB failure must fail closed with HTTP 503");
    state.policyTableError = null;

    // G. Duplicate coupon code => HTTP 409 Conflict
    const resDup = await fetch(`${baseUrl}/coupons`, {
      method: "POST",
      headers: { ...authHeader("token-store-a-owner"), "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "BAGHDAD10", // already exists
        discount_type: "percentage",
        value: 15,
        merchant_id: STORE_A,
        is_active: true,
      }),
    });
    assert.equal(resDup.status, 409, "duplicate coupon code must return HTTP 409");

    // H. IDOR update attempt: Store A owner attempts to update Store B's coupon ID => HTTP 404
    const resIdor = await fetch(`${baseUrl}/coupons`, {
      method: "POST",
      headers: { ...authHeader("token-store-a-owner"), "Content-Type": "application/json" },
      body: JSON.stringify({
        id: COUPON_B_ID,
        code: "HIJACKHTTP",
        discount_type: "fixed",
        value: 5000,
        merchant_id: STORE_A,
        is_active: true,
      }),
    });
    assert.equal(resIdor.status, 404, "cross-store IDOR coupon update must return HTTP 404");
  }

  // ── ROUTE 3: DELETE /coupons/:id ──
  {
    // A. Staff attempting to delete coupon => HTTP 403 (RolesGuard rejects merchant_staff on DELETE)
    const resStaffDel = await fetch(`${baseUrl}/coupons/${COUPON_A_ID}?merchant_id=${STORE_A}`, {
      method: "DELETE",
      headers: authHeader("token-store-a-staff"),
    });
    assert.equal(resStaffDel.status, 403, "RolesGuard must reject merchant_staff on DELETE with HTTP 403");

    // B. Malformed UUID param in URL => HTTP 400 (ParseUUIDPipe on :id)
    const resBadParam = await fetch(`${baseUrl}/coupons/not-a-valid-uuid?merchant_id=${STORE_A}`, {
      method: "DELETE",
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resBadParam.status, 400, "ParseUUIDPipe must reject non-UUID param with HTTP 400");

    // C. Non-existent valid UUID coupon => HTTP 404
    const resMissing = await fetch(`${baseUrl}/coupons/88888888-8888-4888-8888-888888888888?merchant_id=${STORE_A}`, {
      method: "DELETE",
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resMissing.status, 404, "non-existent coupon deletion must return HTTP 404");

    // D. Cross-store deletion: Store A owner attempts to delete Store B's coupon => HTTP 404
    const resCrossDel = await fetch(`${baseUrl}/coupons/${COUPON_B_ID}?merchant_id=${STORE_A}`, {
      method: "DELETE",
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resCrossDel.status, 404, "cross-store coupon deletion must return HTTP 404");
    assert.ok(state.coupons.find((c) => c.id === COUPON_B_ID), "Store B's coupon must remain intact");

    // E. Authorized deletion: Store A owner deletes Store A's coupon => HTTP 200
    const resAuthDel = await fetch(`${baseUrl}/coupons/${COUPON_A_ID}?merchant_id=${STORE_A}`, {
      method: "DELETE",
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resAuthDel.status, 200, "authorized deletion must return HTTP 200");
    const delJson = await resAuthDel.json();
    assert.deepEqual(delJson, { ok: true });
    assert.equal(state.coupons.find((c) => c.id === COUPON_A_ID), undefined, "Store A coupon deleted");
  }
});
