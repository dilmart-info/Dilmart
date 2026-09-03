import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import {
  ValidationPipe,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { MerchantsController } from "../dist/modules/merchants/merchants.controller.js";
import { MerchantsService } from "../dist/modules/merchants/merchants.service.js";
import { MerchantPushController } from "../dist/modules/merchants/merchant-push.controller.js";
import { MerchantPushService } from "../dist/modules/merchants/merchant-push.service.js";
import {
  GetMerchantSettingsQueryDto,
  PatchMerchantSettingsDto,
  UpsertMerchantSettingsDto,
} from "../dist/modules/merchants/merchants.dto.js";
import {
  ExplicitRegisterPushSubscriptionDto,
  ExplicitTestPushSubscriptionDto,
  ListPushSubscriptionsQueryDto,
} from "../dist/modules/merchants/merchant-push.dto.js";
import { RolesGuard } from "../dist/common/authz/roles.guard.js";
import { SupabaseActorResolverService } from "../dist/common/authz/supabase-actor-resolver.service.js";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const STORE_EMPTY = "33333333-3333-4333-8333-333333333333";
const STORE_INACTIVE = "44444444-4444-4444-8444-444444444444";

const USER_STORE_A_OWNER = "user-store-a-owner";
const USER_STORE_A_MANAGER = "user-store-a-manager";
const USER_STORE_A_STAFF = "user-store-a-staff";
const USER_STORE_B_OWNER = "user-store-b-owner";
const USER_ADMIN = "user-admin";

const SUB_A_OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUB_A_STAFF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUB_B_OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeHarness() {
  const state = {
    merchants: [
      { id: STORE_A, status: "active", display_name: "متجر بغداد", logo_url: "https://example.com/logo-a.png" },
      { id: STORE_B, status: "active", display_name: "متجر البصرة", logo_url: "https://example.com/logo-b.png" },
      { id: STORE_EMPTY, status: "active", display_name: "متجر جديد بدون إعدادات", logo_url: null },
      { id: STORE_INACTIVE, status: "suspended", display_name: "متجر موقوف", logo_url: null },
    ],
    merchant_users: [
      { user_id: USER_STORE_A_OWNER, merchant_id: STORE_A, role: "owner" },
      { user_id: USER_STORE_A_MANAGER, merchant_id: STORE_A, role: "manager" },
      { user_id: USER_STORE_A_STAFF, merchant_id: STORE_A, role: "staff" },
      { user_id: USER_STORE_B_OWNER, merchant_id: STORE_B, role: "owner" },
      { user_id: USER_STORE_A_OWNER, merchant_id: STORE_EMPTY, role: "owner" },
    ],
    merchant_settings: [
      {
        merchant_id: STORE_A,
        contact_phone: "07701111111",
        whatsapp_phone: "07701111112",
        support_email: "support@store-a.example.com",
        city: "بغداد",
        address: "شارع فلسطين",
        delivery_notes: "تسليم باليد",
        push_enabled: true,
        sound_enabled: true,
        sound_repeat_interval_seconds: 15,
        sound_max_duration_seconds: 300,
      },
      {
        merchant_id: STORE_B,
        contact_phone: "07802222222",
        whatsapp_phone: "07802222223",
        support_email: "support@store-b.example.com",
        city: "البصرة",
        address: "العشار",
        delivery_notes: "التسليم صباحاً",
        push_enabled: false,
        sound_enabled: false,
        sound_repeat_interval_seconds: 30,
        sound_max_duration_seconds: 180,
      },
    ],
    merchant_push_subscriptions: [
      {
        id: SUB_A_OWNER,
        merchant_id: STORE_A,
        user_id: USER_STORE_A_OWNER,
        endpoint: "https://push.example.com/sub/a-owner",
        p256dh_key: "p256dh-a-owner",
        auth_key: "auth-a-owner",
        device_label: "owner-phone",
        user_agent: "Mozilla/5.0 (iPhone)",
        status: "active",
        created_at: "2026-06-01T10:00:00Z",
        updated_at: "2026-06-01T10:00:00Z",
      },
      {
        id: SUB_A_STAFF,
        merchant_id: STORE_A,
        user_id: USER_STORE_A_STAFF,
        endpoint: "https://push.example.com/sub/a-staff",
        p256dh_key: "p256dh-a-staff",
        auth_key: "auth-a-staff",
        device_label: "staff-tablet",
        user_agent: "Mozilla/5.0 (Android)",
        status: "active",
        created_at: "2026-06-02T10:00:00Z",
        updated_at: "2026-06-02T10:00:00Z",
      },
      {
        id: SUB_B_OWNER,
        merchant_id: STORE_B,
        user_id: USER_STORE_B_OWNER,
        endpoint: "https://push.example.com/sub/b-owner",
        p256dh_key: "p256dh-b-owner",
        auth_key: "auth-b-owner",
        device_label: "b-owner-laptop",
        user_agent: "Mozilla/5.0 (Macintosh)",
        status: "active",
        created_at: "2026-06-03T10:00:00Z",
        updated_at: "2026-06-03T10:00:00Z",
      },
    ],
  };

  const supabaseMock = {
    from: (table) => {
      let filters = [];
      let selectedCols = "*";
      let isSingle = false;
      let isMaybeSingle = false;
      let orderCol = null;
      let orderAsc = true;
      let upsertPayload = null;
      let deleteOp = false;

      const builder = {
        select: (cols) => {
          selectedCols = cols;
          return builder;
        },
        eq: (col, val) => {
          filters.push({ col, val });
          return builder;
        },
        order: (col, opts = {}) => {
          orderCol = col;
          orderAsc = opts.ascending ?? true;
          return builder;
        },
        single: () => {
          isSingle = true;
          return builder;
        },
        maybeSingle: () => {
          isMaybeSingle = true;
          return builder;
        },
        upsert: (payload, opts) => {
          upsertPayload = payload;
          return builder;
        },
        delete: () => {
          deleteOp = true;
          return builder;
        },
        then: async (resolve) => {
          let rows = [...(state[table] || [])];
          for (const f of filters) {
            rows = rows.filter((r) => r[f.col] === f.val);
          }

          if (table === "merchants" && selectedCols.includes("merchant_settings")) {
            rows = rows.map((r) => {
              const ms = state.merchant_settings.filter((s) => s.merchant_id === r.id);
              return { ...r, merchant_settings: ms };
            });
          }

          if (deleteOp) {
            state[table] = (state[table] || []).filter(
              (r) => !filters.every((f) => r[f.col] === f.val),
            );
            return resolve({ data: null, error: null });
          }

          if (upsertPayload) {
            const conflictKey = "merchant_id,endpoint";
            const existingIdx = (state[table] || []).findIndex(
              (r) =>
                r.merchant_id === upsertPayload.merchant_id &&
                r.endpoint === upsertPayload.endpoint,
            );
            const row = {
              id: existingIdx >= 0 ? state[table][existingIdx].id : "gen-sub-" + Date.now(),
              ...upsertPayload,
            };
            if (existingIdx >= 0) {
              state[table][existingIdx] = row;
            } else {
              state[table].push(row);
            }
            return resolve({ data: row, error: null });
          }

          if (isSingle) {
            if (rows.length === 0) {
              return resolve({ data: null, error: { message: "Row not found", code: "PGRST116" } });
            }
            return resolve({ data: rows[0], error: null });
          }
          if (isMaybeSingle) {
            return resolve({ data: rows[0] || null, error: null });
          }
          return resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
    rpc: (rpcName, params) => {
      if (rpcName === "upsert_merchant_settings_atomic") {
        const patch = params.p_patch || params.p_settings || {};
        const mid = params.p_merchant_id;
        let existing = state.merchant_settings.find((s) => s.merchant_id === mid);
        if (!existing) {
          existing = { merchant_id: mid };
          state.merchant_settings.push(existing);
        }
        Object.assign(existing, patch);
        const mRow = state.merchants.find((m) => m.id === mid);
        if (mRow && patch.logo_url !== undefined) {
          mRow.logo_url = patch.logo_url;
        }
        return Promise.resolve({
          data: {
            ...existing,
            logo_url: mRow?.logo_url ?? null,
            updated_at: new Date().toISOString(),
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${rpcName}` } });
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

  const pushService = new MerchantPushService(
    { client: supabaseMock },
    scopeResolverMock,
  );

  return { state, merchantsService, pushService };
}

// ── 1. DTO VALIDATION TESTS ──

test("DTO: PatchMerchantSettingsDto forbids injected merchant_id in request body", async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
  await assert.rejects(
    () =>
      pipe.transform(
        {
          merchant_id: STORE_B,
          contact_phone: "07701234567",
        },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );
});

test("DTO: PatchMerchantSettingsDto enforces length and type constraints on strings", async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
  await assert.rejects(
    () =>
      pipe.transform(
        { contact_phone: "a".repeat(51) },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  await assert.rejects(
    () =>
      pipe.transform(
        { city: "a".repeat(101) },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );
});

test("DTO: PatchMerchantSettingsDto enforces bounds on sound interval (5-120) and duration (30-1800)", async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
  await assert.rejects(
    () =>
      pipe.transform(
        { sound_repeat_interval_seconds: 3 },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  await assert.rejects(
    () =>
      pipe.transform(
        { sound_repeat_interval_seconds: 150 },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  await assert.rejects(
    () =>
      pipe.transform(
        { sound_max_duration_seconds: 10 },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  await assert.rejects(
    () =>
      pipe.transform(
        { sound_max_duration_seconds: 3600 },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );
});

test("DTO: ExplicitRegisterPushSubscriptionDto and ExplicitTestPushSubscriptionDto forbid body merchant_id", async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
  await assert.rejects(
    () =>
      pipe.transform(
        {
          merchant_id: STORE_B,
          endpoint: "https://example.com/ep",
          keys: { p256dh: "k1", auth: "k2" },
        },
        { type: "body", metatype: ExplicitRegisterPushSubscriptionDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  await assert.rejects(
    () =>
      pipe.transform(
        {
          merchant_id: STORE_B,
          subscription_id: SUB_A_OWNER,
        },
        { type: "body", metatype: ExplicitTestPushSubscriptionDto },
      ),
    (err) => err instanceof BadRequestException,
  );
});

test("UUID: ParseUUIDPipe rejects non-UUID strings", async () => {
  const uuidPipe = new ParseUUIDPipe({ version: "4" });
  await assert.rejects(
    () => uuidPipe.transform("not-a-valid-uuid", { type: "param" }),
    (err) => err instanceof BadRequestException,
  );
});

// ── 2. SETTINGS SERVICE DIRECT TESTS ──

test("Authority: Settings canonical contract for existing store", async () => {
  const { merchantsService } = makeHarness();
  const resStoreA = await merchantsService.getMerchantSettingsExplicit(STORE_A, {
    actor_role: "merchant_owner",
    actor_id: USER_STORE_A_OWNER,
  });
  assert.equal(resStoreA.merchant_id, STORE_A);
  assert.equal(resStoreA.settings_exists, true);
  assert.ok(resStoreA.settings);
  assert.equal(resStoreA.settings.contact_phone, "07701111111");
  assert.equal(resStoreA.settings.logo_url, "https://example.com/logo-a.png");
  assert.equal(resStoreA.settings.push_enabled, true);
});

test("Authority: Settings canonical contract for non-existent row (settings_exists: false, settings: null)", async () => {
  const { merchantsService } = makeHarness();
  const resStoreEmpty = await merchantsService.getMerchantSettingsExplicit(STORE_EMPTY, {
    actor_role: "merchant_owner",
    actor_id: USER_STORE_A_OWNER,
  });
  assert.equal(resStoreEmpty.merchant_id, STORE_EMPTY);
  assert.equal(resStoreEmpty.settings_exists, false);
  assert.equal(resStoreEmpty.settings, null, "Non-existent settings row must return settings: null");
});

test("Authority: Cross-store denial on settings read", async () => {
  const { merchantsService } = makeHarness();
  await assert.rejects(
    () =>
      merchantsService.getMerchantSettingsExplicit(STORE_B, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );
});

test("Authority: Inactive/suspended merchant denied settings access", async () => {
  const { merchantsService } = makeHarness();
  await assert.rejects(
    () =>
      merchantsService.getMerchantSettingsExplicit(STORE_INACTIVE, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );
});

test("Authority: Staff permitted GET settings but rejected from PATCH settings", async () => {
  const { merchantsService } = makeHarness();
  const resStaff = await merchantsService.getMerchantSettingsExplicit(STORE_A, {
    actor_role: "merchant_staff",
    actor_id: USER_STORE_A_STAFF,
  });
  assert.equal(resStaff.merchant_id, STORE_A);
  assert.equal(resStaff.settings_exists, true);

  await assert.rejects(
    () =>
      merchantsService.patchMerchantSettingsExplicit(
        STORE_A,
        { contact_phone: "07709999999" },
        { actor_role: "merchant_staff", actor_id: USER_STORE_A_STAFF },
      ),
    (err) => err instanceof ForbiddenException,
    "Staff must be rejected from settings PATCH",
  );
});

test("Authority: Owner permitted PATCH settings returning canonical snapshot", async () => {
  const { merchantsService } = makeHarness();
  const patchRes = await merchantsService.patchMerchantSettingsExplicit(
    STORE_A,
    { contact_phone: "07708888888", logo_url: "https://example.com/new-logo.png" },
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
  );
  assert.equal(patchRes.merchant_id, STORE_A);
  assert.equal(patchRes.settings_exists, true);
  assert.equal(patchRes.settings?.contact_phone, "07708888888");
  assert.equal(patchRes.settings?.logo_url, "https://example.com/new-logo.png");
});

test("Legacy: Merchant roles rejected from legacy settings GET and POST", async () => {
  const { merchantsService } = makeHarness();
  await assert.rejects(
    () =>
      merchantsService.getMerchantSettings(STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );
  await assert.rejects(
    () =>
      merchantsService.upsertMerchantSettings(
        { merchant_id: STORE_A, contact_phone: "07701111111" },
        { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
      ),
    (err) => err instanceof ForbiddenException,
  );
});

test("Legacy: Admin allowed on legacy settings GET", async () => {
  const { merchantsService } = makeHarness();
  const adminLegacyRes = await merchantsService.getMerchantSettings(STORE_A, {
    actor_role: "super_admin",
    actor_id: USER_ADMIN,
  });
  assert.ok(adminLegacyRes);
});

// ── 3. PUSH SERVICE DIRECT TESTS ──

test("Push: Device list safe projection omits endpoint, keys, and user_id", async () => {
  const { pushService } = makeHarness();
  const ownerList = await pushService.listSubscriptionsExplicit(STORE_A, {
    actorRole: "merchant_owner",
    actorId: USER_STORE_A_OWNER,
  });
  assert.equal(ownerList.merchant_id, STORE_A);
  assert.equal(ownerList.scope, "store");
  assert.equal(ownerList.devices.length, 2);
  for (const d of ownerList.devices) {
    assert.equal("endpoint" in d, false, "endpoint must not leak");
    assert.equal("p256dh_key" in d, false, "p256dh_key must not leak");
    assert.equal("auth_key" in d, false, "auth_key must not leak");
    assert.equal("user_id" in d, false, "user_id must not leak");
  }
});

test("Push: Staff device listing scoped to own devices only", async () => {
  const { pushService } = makeHarness();
  const staffList = await pushService.listSubscriptionsExplicit(STORE_A, {
    actorRole: "merchant_staff",
    actorId: USER_STORE_A_STAFF,
  });
  assert.equal(staffList.merchant_id, STORE_A);
  assert.equal(staffList.scope, "own");
  assert.equal(staffList.devices.length, 1);
  assert.equal(staffList.devices[0].id, SUB_A_STAFF);
  assert.equal(staffList.devices[0].is_own, true);
});

test("Push: Cross-store subscription listing denied with 403", async () => {
  const { pushService } = makeHarness();
  await assert.rejects(
    () =>
      pushService.listSubscriptionsExplicit(STORE_B, {
        actorRole: "merchant_owner",
        actorId: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );
});

test("Push: Non-disclosing 404 when staff deletes another user device in same store", async () => {
  const { pushService } = makeHarness();
  await assert.rejects(
    () =>
      pushService.deleteSubscriptionExplicit(STORE_A, SUB_A_OWNER, {
        actorRole: "merchant_staff",
        actorId: USER_STORE_A_STAFF,
      }),
    (err) => err instanceof NotFoundException,
  );
});

test("Push: Non-disclosing 404 when deleting cross-store device", async () => {
  const { pushService } = makeHarness();
  await assert.rejects(
    () =>
      pushService.deleteSubscriptionExplicit(STORE_A, SUB_B_OWNER, {
        actorRole: "merchant_owner",
        actorId: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException,
  );
});

test("Push: Non-disclosing 404 when deleting non-existent device", async () => {
  const { pushService } = makeHarness();
  await assert.rejects(
    () =>
      pushService.deleteSubscriptionExplicit(STORE_A, "99999999-9999-4999-8999-999999999999", {
        actorRole: "merchant_owner",
        actorId: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException,
  );
});

test("Push: Staff can delete own device", async () => {
  const { pushService } = makeHarness();
  const delStaffRes = await pushService.deleteSubscriptionExplicit(STORE_A, SUB_A_STAFF, {
    actorRole: "merchant_staff",
    actorId: USER_STORE_A_STAFF,
  });
  assert.equal(delStaffRes.deleted_id, SUB_A_STAFF);
  assert.equal(delStaffRes.success, true);
});

// ── 4. REAL NESTJS HTTP SERVER BOUNDARY SUITE ──

let appInstance = null;
let baseUrl = null;

const tokenMap = {
  "token-store-a-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_A_OWNER },
  "token-store-a-manager": { ok: true, actorRole: "merchant_manager", actorId: USER_STORE_A_MANAGER },
  "token-store-a-staff": { ok: true, actorRole: "merchant_staff", actorId: USER_STORE_A_STAFF },
  "token-store-b-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_B_OWNER },
  "token-admin": { ok: true, actorRole: "super_admin", actorId: USER_ADMIN },
  "token-customer": { ok: true, actorRole: "customer", actorId: "user-cust-1" },
};

const authHeader = (tok) => (tok ? { Authorization: `Bearer ${tok}` } : {});

before(async () => {
  const { merchantsService, pushService } = makeHarness();
  const moduleRef = await Test.createTestingModule({
    controllers: [MerchantsController, MerchantPushController],
    providers: [
      { provide: MerchantsService, useValue: merchantsService },
      { provide: MerchantPushService, useValue: pushService },
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

test("HTTP: GET /merchants/:id/settings missing token returns 403", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`);
  assert.equal(res.status, 403);
});

test("HTTP: GET /merchants/:id/settings with customer role returns 403", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
    headers: authHeader("token-customer"),
  });
  assert.equal(res.status, 403);
});

test("HTTP: GET /merchants/:id/settings invalid UUID returns 400", async () => {
  const res = await fetch(`${baseUrl}/merchants/invalid-uuid/settings`, {
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(res.status, 400);
});

test("HTTP: GET /merchants/:id/settings staff allowed with canonical contract", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
    headers: authHeader("token-store-a-staff"),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.merchant_id, STORE_A);
  assert.equal(json.settings_exists, true);
  assert.ok(json.settings);
});

test("HTTP: GET /merchants/:id/settings cross-store denied with 403", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_B}/settings`, {
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(res.status, 403);
});

test("HTTP: PATCH /merchants/:id/settings staff forbidden with 403", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeader("token-store-a-staff"),
    },
    body: JSON.stringify({ contact_phone: "07705555555" }),
  });
  assert.equal(res.status, 403);
});

test("HTTP: PATCH /merchants/:id/settings body with merchant_id rejected with 400", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeader("token-store-a-owner"),
    },
    body: JSON.stringify({ merchant_id: STORE_B, contact_phone: "07705555555" }),
  });
  assert.equal(res.status, 400);
});

test("HTTP: PATCH /merchants/:id/settings valid owner update returns canonical contract", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeader("token-store-a-owner"),
    },
    body: JSON.stringify({ contact_phone: "07706666666", city: "بغداد الرصافة" }),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.merchant_id, STORE_A);
  assert.equal(json.settings_exists, true);
  assert.equal(json.settings?.contact_phone, "07706666666");
});

test("HTTP: Legacy /merchants/settings rejected for merchant roles with 403", async () => {
  const resGet = await fetch(`${baseUrl}/merchants/settings?merchant_id=${STORE_A}`, {
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(resGet.status, 403);

  const resPost = await fetch(`${baseUrl}/merchants/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader("token-store-a-owner"),
    },
    body: JSON.stringify({ merchant_id: STORE_A, contact_phone: "07707777777" }),
  });
  assert.equal(resPost.status, 403);
});

test("HTTP: Legacy /merchants/settings allowed for admin with 200", async () => {
  const res = await fetch(`${baseUrl}/merchants/settings?merchant_id=${STORE_A}`, {
    headers: authHeader("token-admin"),
  });
  assert.equal(res.status, 200);
});

test("HTTP: Push subscriptions list staff scoped to own", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/push-subscriptions`, {
    headers: authHeader("token-store-a-staff"),
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.scope, "own");
});

test("HTTP: Push foreign device deletion returns non-disclosing 404", async () => {
  const res = await fetch(`${baseUrl}/merchants/${STORE_A}/push-subscriptions/${SUB_B_OWNER}`, {
    method: "DELETE",
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(res.status, 404);
});

test("HTTP: Legacy /merchant/push-subscriptions rejected for merchant roles with 403", async () => {
  const res = await fetch(`${baseUrl}/merchant/push-subscriptions?merchant_id=${STORE_A}`, {
    headers: authHeader("token-store-a-owner"),
  });
  assert.equal(res.status, 403);
});
