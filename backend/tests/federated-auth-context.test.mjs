/**
 * STORE-PR5 §Phase A — source-aware /auth/context (AuthService.getContext) unit tests (no DB).
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.4 (dual ActorContext), §9.5, §14 (context contract).
 *
 * Proves the CONTRACT layer distinguishes the two identity sources without any DB mutation:
 *  - a federated DilMart customer is always customer/commerce, never provisional/claim_required, and
 *    never leaks linkedProfileId/DilMartUserId/sessionFamilyId/sessionVersion/tokens;
 *  - a Supabase customer/provisional/merchant keeps its exact pre-PR5 shape + new capability flags.
 *
 * Runs against compiled dist/. `npm run build` first (the npm script does this).
 */
import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const A = (p) => `../dist/${p}`;

/**
 * Minimal chainable fake of SupabaseAdminService. Each table maps to a `{ data, error }` payload.
 * The `.eq()` result is BOTH awaitable (merchant_users does `await ...eq(...)`) and exposes
 * `.maybeSingle()` (profiles / customer_phone_identities).
 */
function fakeAdmin(tables) {
  const seen = { queried: [] };
  const admin = {
    client: {
      from(table) {
        seen.queried.push(table);
        const payload = tables[table] ?? { data: null, error: null };
        const result = {
          eq() { return result; },
          maybeSingle: async () => payload,
          then: (resolve) => resolve(payload),
        };
        return { select: () => result };
      },
    },
  };
  admin.__seen = seen;
  return admin;
}

async function makeService(tables) {
  const { AuthService } = await import(A("modules/auth/auth.service.js"));
  return new AuthService(fakeAdmin(tables));
}

const FED_CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const SB_CUSTOMER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const FEDERATED_ACTOR = {
  actorRole: "customer",
  actorId: FED_CUSTOMER_ID,
  actorEmail: "verified@DilMart.example",
  actorPhone: "+9647700000000",
  authSource: "DilMart_federated",
  linkedProfileId: "22222222-2222-2222-2222-222222222222",
  DilMartUserId: "33333333-3333-3333-3333-333333333333",
  sessionFamilyId: "44444444-4444-4444-4444-444444444444",
  sessionVersion: 1,
};

// ── Federated context ────────────────────────────────────────────────────────

test("federated: role pinned to customer; commerce capability; logout-all; no merchant", async () => {
  const svc = await makeService({
    profiles: { data: { id: FED_CUSTOMER_ID, role: "customer", full_name: "Fed Customer", email: null, phone: null, address: null, points: 5, account_type: "provisional_customer" }, error: null },
  });
  const ctx = await svc.getContext(FEDERATED_ACTOR);

  assert.equal(ctx.authSource, "DilMart_federated");
  assert.equal(ctx.activeRole, "customer");
  assert.deepEqual(ctx.roles, ["customer"]);
  assert.equal(ctx.merchant, null);
  assert.deepEqual(ctx.merchant_memberships, []);
  assert.equal(ctx.user.id, FED_CUSTOMER_ID);
  assert.equal(ctx.user.email, "verified@DilMart.example");
  assert.equal(ctx.user.phone, "+9647700000000");
  assert.deepEqual(ctx.capabilities, {
    customerCommerce: true,
    phoneIdentity: false,
    accountClaim: false,
    passwordManagement: false,
    federatedLogoutAll: true,
  });
});

test("federated: NEVER provisional/claim_required even if shadow profile says provisional", async () => {
  const svc = await makeService({
    profiles: { data: { id: FED_CUSTOMER_ID, role: "customer", account_type: "provisional_customer" }, error: null },
  });
  const ctx = await svc.getContext(FEDERATED_ACTOR);

  assert.equal(ctx.claim_required, false);
  assert.equal(ctx.profile.claim_required, false);
  assert.notEqual(ctx.account_type, "provisional_customer");
  assert.equal(ctx.account_type, "DilMart_federated_customer");
  assert.equal(ctx.capabilities.accountClaim, false);
});

test("federated: no internal federated identifiers or tokens leak into the response", async () => {
  const svc = await makeService({ profiles: { data: { id: FED_CUSTOMER_ID, role: "customer" }, error: null } });
  const ctx = await svc.getContext(FEDERATED_ACTOR);
  const flat = JSON.stringify(ctx);

  for (const secret of [
    FEDERATED_ACTOR.linkedProfileId,
    FEDERATED_ACTOR.DilMartUserId,
    FEDERATED_ACTOR.sessionFamilyId,
  ]) {
    assert.ok(!flat.includes(secret), `response must not contain ${secret}`);
  }
  assert.ok(!("linkedProfileId" in ctx));
  assert.ok(!("DilMartUserId" in ctx));
  assert.ok(!("sessionFamilyId" in ctx));
  assert.ok(!("sessionVersion" in ctx));
  assert.ok(!("actorToken" in ctx));
  assert.ok(!("refreshToken" in ctx));
});

test("federated: works even when no shadow profile row is found (synthesizes customer profile)", async () => {
  const svc = await makeService({ profiles: { data: null, error: null } });
  const ctx = await svc.getContext(FEDERATED_ACTOR);
  assert.equal(ctx.activeRole, "customer");
  assert.equal(ctx.profile.id, FED_CUSTOMER_ID);
  assert.equal(ctx.profile.role, "customer");
  assert.equal(ctx.capabilities.customerCommerce, true);
});

// ── Supabase context (regression + new capabilities) ─────────────────────────

test("supabase customer: preserves fields + adds customer capabilities; no logout-all", async () => {
  const svc = await makeService({
    profiles: { data: { id: SB_CUSTOMER_ID, role: "customer", full_name: "Direct", email: "d@e.f", phone: "+9647711111111", address: "A", points: 12, account_type: "customer" }, error: null },
    customer_phone_identities: { data: { phone_normalized: "+9647711111111", is_verified: true }, error: null },
  });
  const ctx = await svc.getContext({ actorId: SB_CUSTOMER_ID, authSource: "supabase", actorEmail: "d@e.f", actorPhone: "+9647711111111" });

  assert.equal(ctx.authSource, "supabase");
  assert.equal(ctx.activeRole, "customer");
  assert.equal(ctx.claim_required, false);
  assert.deepEqual(ctx.capabilities, {
    customerCommerce: true,
    phoneIdentity: true,
    accountClaim: true,
    passwordManagement: true,
    federatedLogoutAll: false,
  });
});

test("supabase provisional customer: claim_required true when phone unverified", async () => {
  const svc = await makeService({
    profiles: { data: { id: SB_CUSTOMER_ID, role: "customer", account_type: "provisional_customer" }, error: null },
    customer_phone_identities: { data: null, error: null },
  });
  const ctx = await svc.getContext({ actorId: SB_CUSTOMER_ID, authSource: "supabase" });
  assert.equal(ctx.claim_required, true);
  assert.equal(ctx.capabilities.accountClaim, true);
  assert.equal(ctx.capabilities.federatedLogoutAll, false);
});

test("supabase merchant: no customer-commerce capabilities", async () => {
  const svc = await makeService({
    profiles: { data: { id: SB_CUSTOMER_ID, role: "merchant_owner", account_type: null }, error: null },
    customer_phone_identities: { data: null, error: null },
    merchant_users: { data: [{ merchant_id: "m1", role: "owner", merchants: { id: "m1", status: "active", display_name: "Shop", slug: "shop" } }], error: null },
  });
  const ctx = await svc.getContext({ actorId: SB_CUSTOMER_ID, authSource: "supabase" });
  assert.equal(ctx.activeRole, "merchant_owner");
  assert.deepEqual(ctx.capabilities, {
    customerCommerce: false,
    phoneIdentity: false,
    accountClaim: false,
    passwordManagement: false,
    federatedLogoutAll: false,
  });
});

test("guest passthrough: no actor id → anonymous context, all capabilities off, authSource null", async () => {
  const svc = await makeService({});
  const ctx = await svc.getContext({});
  assert.equal(ctx.authSource, null);
  assert.equal(ctx.activeRole, null);
  assert.deepEqual(ctx.roles, []);
  assert.deepEqual(ctx.capabilities, {
    customerCommerce: false,
    phoneIdentity: false,
    accountClaim: false,
    passwordManagement: false,
    federatedLogoutAll: false,
  });
});
