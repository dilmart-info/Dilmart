import assert from "node:assert/strict";
import test from "node:test";
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
        user_agent: "Mozilla/5.0 (iPad)",
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
        device_label: "store-b-pc",
        user_agent: "Mozilla/5.0 (Windows NT 10.0)",
        status: "active",
        created_at: "2026-06-03T10:00:00Z",
        updated_at: "2026-06-03T10:00:00Z",
      },
    ],
    rpcCalls: [],
  };

  const fakeClient = {
    from(table) {
      const filters = {};
      const queryObj = {
        select(_cols) {
          return queryObj;
        },
        eq(col, val) {
          filters[col] = val;
          return queryObj;
        },
        order(_col, _opts) {
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
          if (!match) return { data: null, error: null };
          const result = { ...match };
          if (table === "merchants") {
            const settings = state.merchant_settings.find((s) => s.merchant_id === match.id);
            result.merchant_settings = settings ? [settings] : [];
          }
          return { data: result, error: null };
        },
        async single() {
          const rows = state[table] || [];
          const match = rows.find((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            return true;
          });
          if (!match) return { data: null, error: new Error("Row not found") };
          const result = { ...match };
          if (table === "merchants") {
            const settings = state.merchant_settings.find((s) => s.merchant_id === match.id);
            result.merchant_settings = settings ? [settings] : [];
          }
          return { data: result, error: null };
        },
        upsert(row, _opts) {
          const rows = state[table] || [];
          const idx = rows.findIndex((r) => {
            if (table === "merchant_push_subscriptions") {
              return r.merchant_id === row.merchant_id && r.endpoint === row.endpoint;
            }
            return false;
          });
          const inserted = {
            id: row.id || `sub-gen-${Date.now()}`,
            created_at: new Date().toISOString(),
            ...row,
          };
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...inserted };
          } else {
            rows.push(inserted);
          }
          return {
            select() {
              return {
                async single() {
                  return { data: inserted, error: null };
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(col, val) {
              filters[col] = val;
              return {
                async eq(col2, val2) {
                  filters[col2] = val2;
                  const rows = state[table] || [];
                  const remaining = rows.filter((r) => {
                    return !(r[col] === val && r[col2] === val2);
                  });
                  state[table] = remaining;
                  return { error: null };
                },
              };
            },
          };
        },
        async then(resolve) {
          const rows = state[table] || [];
          const matches = rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            return true;
          });
          resolve({ data: matches.map((r) => ({ ...r })), error: null });
        },
      };
      return queryObj;
    },
    async rpc(name, params) {
      state.rpcCalls.push({ name, params });
      if (name === "upsert_merchant_settings_atomic") {
        const p_merchant_id = params.p_merchant_id;
        const p_patch = params.p_patch ?? params.p_settings ?? {};
        const s = typeof p_patch === "string" ? JSON.parse(p_patch) : p_patch;

        const rows = state.merchant_settings;
        const idx = rows.findIndex((r) => r.merchant_id === p_merchant_id);
        const updated = {
          merchant_id: p_merchant_id,
          contact_phone: s.contact_phone ?? null,
          whatsapp_phone: s.whatsapp_phone ?? null,
          support_email: s.support_email ?? null,
          city: s.city ?? null,
          address: s.address ?? null,
          delivery_notes: s.delivery_notes ?? null,
          push_enabled: s.push_enabled ?? true,
          sound_enabled: s.sound_enabled ?? true,
          sound_repeat_interval_seconds: s.sound_repeat_interval_seconds ?? 15,
          sound_max_duration_seconds: s.sound_max_duration_seconds ?? 300,
        };

        if (idx >= 0) {
          rows[idx] = updated;
        } else {
          rows.push(updated);
        }

        if (s.logo_url !== undefined) {
          const merch = state.merchants.find((m) => m.id === p_merchant_id);
          if (merch) {
            merch.logo_url = s.logo_url || null;
          }
        }

        return {
          data: {
            ...updated,
            logo_url: s.logo_url ?? null,
            updated_at: new Date().toISOString(),
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

  const fakeConfigService = {
    get(key) {
      if (key === "VAPID_PUBLIC_KEY") return "test-vapid-public-key";
      if (key === "VAPID_PRIVATE_KEY") return "test-vapid-private-key";
      if (key === "VAPID_SUBJECT") return "mailto:admin@dilmart.com";
      return null;
    },
  };

  const merchantsService = new MerchantsService(fakeSupabaseAdmin, fakeScopeResolver);
  const pushService = new MerchantPushService(fakeSupabaseAdmin, fakeScopeResolver, fakeConfigService);

  return { merchantsService, pushService, state };
}

// ── 1. DTO & Validation Bounds Suite ──
test("1. DTO VALIDATION: PatchMerchantSettingsDto, ExplicitRegisterPushSubscriptionDto, ExplicitTestPushSubscriptionDto", async () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  // A. PatchMerchantSettingsDto valid payload
  const validPatch = await pipe.transform(
    {
      contact_phone: "07701234567",
      whatsapp_phone: "07701234567",
      support_email: "test@example.com",
      city: "بغداد",
      address: "المنصور",
      delivery_notes: "تسليم عند الباب",
      logo_url: "https://example.com/logo.png",
      push_enabled: true,
      sound_enabled: true,
      sound_repeat_interval_seconds: 20,
      sound_max_duration_seconds: 120,
    },
    { type: "body", metatype: PatchMerchantSettingsDto },
  );
  assert.equal(validPatch.contact_phone, "07701234567");
  assert.equal(validPatch.sound_repeat_interval_seconds, 20);

  // B. PatchMerchantSettingsDto allows empty string to clear logo_url or email
  const emptyClear = await pipe.transform(
    {
      logo_url: "",
      support_email: "",
    },
    { type: "body", metatype: PatchMerchantSettingsDto },
  );
  assert.equal(emptyClear.logo_url, "");
  assert.equal(emptyClear.support_email, "");

  // C. Injected merchant_id in PatchMerchantSettingsDto MUST be rejected by forbidNonWhitelisted
  await assert.rejects(
    () =>
      pipe.transform(
        { merchant_id: STORE_B, contact_phone: "07701111111" },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
    "Passing merchant_id in PATCH body must be rejected",
  );

  // D. Disallowed protocol (javascript: or ftp:) in logo_url MUST be rejected
  await assert.rejects(
    () =>
      pipe.transform(
        { logo_url: "javascript:alert(1)" },
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  // E. Out-of-bounds sound settings rejected
  await assert.rejects(
    () =>
      pipe.transform(
        { sound_repeat_interval_seconds: 4 }, // min is 5
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );
  await assert.rejects(
    () =>
      pipe.transform(
        { sound_repeat_interval_seconds: 121 }, // max is 120
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );
  await assert.rejects(
    () =>
      pipe.transform(
        { sound_max_duration_seconds: 29 }, // min is 30
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );
  await assert.rejects(
    () =>
      pipe.transform(
        { sound_max_duration_seconds: 1801 }, // max is 1800
        { type: "body", metatype: PatchMerchantSettingsDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  // F. ExplicitRegisterPushSubscriptionDto: forbids injected merchant_id
  await assert.rejects(
    () =>
      pipe.transform(
        {
          merchant_id: STORE_B,
          endpoint: "https://push.example.com/sub/test",
          keys: { p256dh: "key1", auth: "auth1" },
        },
        { type: "body", metatype: ExplicitRegisterPushSubscriptionDto },
      ),
    (err) => err instanceof BadRequestException,
  );

  // G. ExplicitTestPushSubscriptionDto: forbids injected merchant_id
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

// ── 2. Settings Canonical Contract & Direct Service Authority Suite ──
test("2. SETTINGS SERVICE: Canonical contract, non-existent row, role bounds, exact scope", async () => {
  const { merchantsService } = makeHarness();

  // A. Canonical contract for existing store settings
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

  // B. Canonical contract for non-existent settings row (store exists, no settings row yet)
  const resStoreEmpty = await merchantsService.getMerchantSettingsExplicit(STORE_EMPTY, {
    actor_role: "merchant_owner",
    actor_id: USER_STORE_A_OWNER,
  });
  assert.equal(resStoreEmpty.merchant_id, STORE_EMPTY);
  assert.equal(resStoreEmpty.settings_exists, false);
  assert.equal(resStoreEmpty.settings, null, "Non-existent settings row must return settings: null");

  // C. Cross-store boundary: User belonging to Store A cannot read Store B settings
  await assert.rejects(
    () =>
      merchantsService.getMerchantSettingsExplicit(STORE_B, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );

  // D. Inactive/suspended merchant rejected
  await assert.rejects(
    () =>
      merchantsService.getMerchantSettingsExplicit(STORE_INACTIVE, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );

  // E. Staff CAN read settings
  const resStaff = await merchantsService.getMerchantSettingsExplicit(STORE_A, {
    actor_role: "merchant_staff",
    actor_id: USER_STORE_A_STAFF,
  });
  assert.equal(resStaff.merchant_id, STORE_A);
  assert.equal(resStaff.settings_exists, true);

  // F. Staff CANNOT patch settings (mutation authority restricted to owner/manager)
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

  // G. Owner CAN patch settings, returning canonical contract with settings_exists: true
  const patchRes = await merchantsService.patchMerchantSettingsExplicit(
    STORE_A,
    { contact_phone: "07708888888", logo_url: "https://example.com/new-logo.png" },
    { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
  );
  assert.equal(patchRes.merchant_id, STORE_A);
  assert.equal(patchRes.settings_exists, true);
  assert.equal(patchRes.settings?.contact_phone, "07708888888");
  assert.equal(patchRes.settings?.logo_url, "https://example.com/new-logo.png");

  // H. Legacy routes: merchant roles MUST be rejected with ForbiddenException
  await assert.rejects(
    () =>
      merchantsService.getMerchantSettings(STORE_A, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
    "Merchant owner must be rejected from legacy GET /merchants/settings",
  );
  await assert.rejects(
    () =>
      merchantsService.upsertMerchantSettings(
        { merchant_id: STORE_A, contact_phone: "07701111111" },
        { actor_role: "merchant_owner", actor_id: USER_STORE_A_OWNER },
      ),
    (err) => err instanceof ForbiddenException,
    "Merchant owner must be rejected from legacy POST /merchants/settings",
  );

  // I. Legacy routes: Admin with explicit merchant_id IS allowed
  const adminLegacyRes = await merchantsService.getMerchantSettings(STORE_A, {
    actor_role: "super_admin",
    actor_id: USER_ADMIN,
  });
  assert.ok(adminLegacyRes);
});

// ── 3. Push Subscriptions Scope & Non-Disclosing Security Suite ──
test("3. PUSH SERVICE: Safe device projections, staff isolation, non-disclosing 404", async () => {
  const { pushService } = makeHarness();

  // A. Owner listing: returns store scope, all store devices, without sensitive keys
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

  // B. Staff listing: returns own scope, only staff's device, with is_own = true
  const staffList = await pushService.listSubscriptionsExplicit(STORE_A, {
    actorRole: "merchant_staff",
    actorId: USER_STORE_A_STAFF,
  });
  assert.equal(staffList.merchant_id, STORE_A);
  assert.equal(staffList.scope, "own");
  assert.equal(staffList.devices.length, 1);
  assert.equal(staffList.devices[0].id, SUB_A_STAFF);
  assert.equal(staffList.devices[0].is_own, true);

  // C. Cross-store boundary: Owner of Store A cannot list Store B subscriptions
  await assert.rejects(
    () =>
      pushService.listSubscriptionsExplicit(STORE_B, {
        actorRole: "merchant_owner",
        actorId: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException,
  );

  // D. Non-disclosing 404: Staff deleting another user's device in the same store returns 404
  await assert.rejects(
    () =>
      pushService.deleteSubscriptionExplicit(STORE_A, SUB_A_OWNER, {
        actorRole: "merchant_staff",
        actorId: USER_STORE_A_STAFF,
      }),
    (err) => err instanceof NotFoundException,
    "Staff deleting foreign device must return 404 without disclosing existence",
  );

  // E. Non-disclosing 404: Deleting a device from Store B using Store A context returns 404
  await assert.rejects(
    () =>
      pushService.deleteSubscriptionExplicit(STORE_A, SUB_B_OWNER, {
        actorRole: "merchant_owner",
        actorId: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException,
    "Deleting cross-store device must return 404 without disclosing existence",
  );

  // F. Non-disclosing 404: Deleting non-existent device returns 404 (identical error shape)
  await assert.rejects(
    () =>
      pushService.deleteSubscriptionExplicit(STORE_A, "99999999-9999-4999-8999-999999999999", {
        actorRole: "merchant_owner",
        actorId: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof NotFoundException,
  );

  // G. Staff CAN delete their own device
  const delStaffRes = await pushService.deleteSubscriptionExplicit(STORE_A, SUB_A_STAFF, {
    actorRole: "merchant_staff",
    actorId: USER_STORE_A_STAFF,
  });
  assert.equal(delStaffRes.deleted_id, SUB_A_STAFF);
  assert.equal(delStaffRes.success, true);
});

// ── 4. Real NestJS HTTP Boundary Suite (app.listen(0)) ──
test("4. REAL NESTJS HTTP SERVER BOUNDARY: app.listen(0), real fetch, ValidationPipe, RolesGuard, ParseUUIDPipe", async (t) => {
  const { merchantsService, pushService } = makeHarness();

  const tokenMap = {
    "token-store-a-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_A_OWNER },
    "token-store-a-manager": { ok: true, actorRole: "merchant_manager", actorId: USER_STORE_A_MANAGER },
    "token-store-a-staff": { ok: true, actorRole: "merchant_staff", actorId: USER_STORE_A_STAFF },
    "token-store-b-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_B_OWNER },
    "token-admin": { ok: true, actorRole: "super_admin", actorId: USER_ADMIN },
    "token-customer": { ok: true, actorRole: "customer", actorId: "user-cust-1" },
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [MerchantsController, MerchantPushController],
    providers: [
      {
        provide: MerchantsService,
        useValue: merchantsService,
      },
      {
        provide: MerchantPushService,
        useValue: pushService,
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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(0);
  const port = app.getHttpServer().address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await app.close();
  });

  const authHeader = (tok) => (tok ? { Authorization: `Bearer ${tok}` } : {});

  // ── ROUTE 1: GET /merchants/:id/settings ──
  {
    // A. Missing token => 403
    const resNoToken = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`);
    assert.equal(resNoToken.status, 403);

    // B. Customer role => 403
    const resCust = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
      headers: authHeader("token-customer"),
    });
    assert.equal(resCust.status, 403);

    // C. Invalid UUID param => 400 (ParseUUIDPipe)
    const resBadUuid = await fetch(`${baseUrl}/merchants/invalid-uuid/settings`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resBadUuid.status, 400);

    // D. Staff allowed to read settings => 200 with canonical contract
    const resStaff = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
      headers: authHeader("token-store-a-staff"),
    });
    assert.equal(resStaff.status, 200);
    const staffJson = await resStaff.json();
    assert.equal(staffJson.merchant_id, STORE_A);
    assert.equal(staffJson.settings_exists, true);
    assert.ok(staffJson.settings);

    // E. Cross-store boundary => 403
    const resCross = await fetch(`${baseUrl}/merchants/${STORE_B}/settings`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resCross.status, 403);
  }

  // ── ROUTE 2: PATCH /merchants/:id/settings ──
  {
    // A. Staff forbidden from mutating settings => 403
    const resStaffPatch = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeader("token-store-a-staff"),
      },
      body: JSON.stringify({ contact_phone: "07705555555" }),
    });
    assert.equal(resStaffPatch.status, 403);

    // B. Injected merchant_id in PATCH body => 400 (ValidationPipe forbidNonWhitelisted)
    const resInjected = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeader("token-store-a-owner"),
      },
      body: JSON.stringify({ merchant_id: STORE_B, contact_phone: "07705555555" }),
    });
    assert.equal(resInjected.status, 400);

    // C. Valid Owner PATCH => 200 with canonical contract
    const resOwnerPatch = await fetch(`${baseUrl}/merchants/${STORE_A}/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeader("token-store-a-owner"),
      },
      body: JSON.stringify({ contact_phone: "07706666666", city: "بغداد الرصافة" }),
    });
    assert.equal(resOwnerPatch.status, 200);
    const patchJson = await resOwnerPatch.json();
    assert.equal(patchJson.merchant_id, STORE_A);
    assert.equal(patchJson.settings_exists, true);
    assert.equal(patchJson.settings?.contact_phone, "07706666666");
  }

  // ── ROUTE 3: LEGACY /merchants/settings LOCKDOWN ──
  {
    // A. Merchant owner rejected from legacy GET => 403
    const resLegacyGetOwner = await fetch(`${baseUrl}/merchants/settings?merchant_id=${STORE_A}`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resLegacyGetOwner.status, 403, "Merchant owner must be rejected from legacy GET /merchants/settings");

    // B. Merchant owner rejected from legacy POST => 403
    const resLegacyPostOwner = await fetch(`${baseUrl}/merchants/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader("token-store-a-owner"),
      },
      body: JSON.stringify({ merchant_id: STORE_A, contact_phone: "07707777777" }),
    });
    assert.equal(resLegacyPostOwner.status, 403, "Merchant owner must be rejected from legacy POST /merchants/settings");

    // C. Admin allowed on legacy GET => 200
    const resLegacyGetAdmin = await fetch(`${baseUrl}/merchants/settings?merchant_id=${STORE_A}`, {
      headers: authHeader("token-admin"),
    });
    assert.equal(resLegacyGetAdmin.status, 200);
  }

  // ── ROUTE 4: EXPLICIT PUSH /merchants/:id/push-subscriptions ──
  {
    // A. Staff lists subscriptions => 200 with own scope
    const resStaffList = await fetch(`${baseUrl}/merchants/${STORE_A}/push-subscriptions`, {
      headers: authHeader("token-store-a-staff"),
    });
    assert.equal(resStaffList.status, 200);
    const staffListJson = await resStaffList.json();
    assert.equal(staffListJson.scope, "own");

    // B. Cross-store device deletion returns non-disclosing 404
    const resCrossDelete = await fetch(`${baseUrl}/merchants/${STORE_A}/push-subscriptions/${SUB_B_OWNER}`, {
      method: "DELETE",
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resCrossDelete.status, 404, "Foreign device deletion must return 404");

    // C. Legacy push endpoint rejected for merchant owner => 403
    const resLegacyPush = await fetch(`${baseUrl}/merchant/push-subscriptions?merchant_id=${STORE_A}`, {
      headers: authHeader("token-store-a-owner"),
    });
    assert.equal(resLegacyPush.status, 403, "Merchant owner must be rejected from legacy /merchant/push-subscriptions");
  }
});
