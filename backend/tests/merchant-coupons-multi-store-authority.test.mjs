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
import { Test } from "@nestjs/testing";
import { CouponsService } from "../dist/modules/coupons/coupons.service.js";
import { CouponsController } from "../dist/modules/coupons/coupons.controller.js";
import {
  ListCouponsQueryDto,
  UpsertCouponDto,
  ValidateCouponDto,
} from "../dist/modules/coupons/coupons.dto.js";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const STORE_STRICT = "33333333-3333-4333-8333-333333333333";
const STORE_INACTIVE = "44444444-4444-4444-8444-444444444444";

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
        id: "c-11111111-1111-4111-8111-111111111111",
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
        id: "c-22222222-2222-4222-8222-222222222222",
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
      let orderCol = null;
      let orderAsc = true;
      let limitVal = null;
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
        order(col, { ascending = true } = {}) {
          orderCol = col;
          orderAsc = ascending;
          return builder;
        },
        limit(val) {
          limitVal = val;
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
            id: payload.id || `c-${Math.random().toString(36).slice(2, 10)}`,
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
            return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
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
      service.deleteCoupon("c-11111111-1111-4111-8111-111111111111", STORE_A, {
        actor_role: "merchant_staff",
        actor_id: USER_STORE_A_STAFF,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Staff role is not authorized"),
  );
});

test("4. Edit IDOR Closure — Store A owner cannot edit or transfer Store B's coupon", async () => {
  const { service, state } = makeHarness();

  const storeBCouponId = "c-22222222-2222-4222-8222-222222222222";

  // Store A owner attempts to update Store B's coupon by passing its ID
  await assert.rejects(
    () =>
      service.upsertCoupon({
        id: storeBCouponId,
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
  const storeBCoupon = state.coupons.find((c) => c.id === storeBCouponId);
  assert.equal(storeBCoupon.code, "BASRA5000");
  assert.equal(storeBCoupon.value, 5000);
});

test("5. Authoritative Deletion — proves actual row deletion; cross-store or missing returns 404", async () => {
  const { service, state } = makeHarness();

  // Cross-store delete: Store A owner attempts to delete Store B's coupon
  await assert.rejects(
    () =>
      service.deleteCoupon("c-22222222-2222-4222-8222-222222222222", STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException,
  );
  assert.equal(state.coupons.length, 2);

  // Missing coupon delete returns 404
  await assert.rejects(
    () =>
      service.deleteCoupon("c-non-existent-uuid-9999", STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException,
  );

  // Authorized delete: Store A owner deletes Store A's coupon
  const result = await service.deleteCoupon("c-11111111-1111-4111-8111-111111111111", STORE_A, {
    actor_role: "merchant_owner",
    actor_id: USER_STORE_A_OWNER,
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(state.coupons.length, 1);
  assert.equal(state.coupons[0].id, "c-22222222-2222-4222-8222-222222222222");
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
