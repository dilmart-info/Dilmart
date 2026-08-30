/**
 * STORE-PR5 §Phase B — customer-resource ownership (cross-customer denial), no DB.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.5 (backend authority, actorId ownership).
 *
 * CustomerService scopes every read/write to the guard-verified `actorId` via service-role and
 * re-checks `row.user_id === actorId` on every id-addressed resource. The check is source-agnostic,
 * so proving it for arbitrary actor ids proves it for BOTH a Supabase and a federated customer:
 * Customer A can never reach Customer B's address or order (Definition of Done #4).
 *
 * Runs against compiled dist/. `npm run build` first.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const A = (p) => `../dist/${p}`;

/** Chainable fake: from(t).select().eq().eq()....maybeSingle() / awaitable, fixed payload per table. */
function fakeAdmin(tables) {
  return {
    client: {
      from(t) {
        const payload = tables[t] ?? { data: null, error: null };
        const r = { eq: () => r, order: () => r, limit: () => r, maybeSingle: async () => payload, then: (res) => res(payload) };
        return { select: () => r };
      },
    },
  };
}

async function makeService(tables) {
  const { CustomerService } = await import(A("modules/customer/customer.service.js"));
  return new CustomerService(fakeAdmin(tables));
}

const CUSTOMER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function assertForbidden(fn) {
  await assert.rejects(fn, (err) => {
    assert.equal(err?.constructor?.name, "ForbiddenException");
    return true;
  });
}

test("getOrderDetail: Customer A cannot read Customer B's order", async () => {
  const svc = await makeService({ orders: { data: { id: "o1", user_id: CUSTOMER_B, order_items: [] }, error: null } });
  await assertForbidden(() => svc.getOrderDetail(CUSTOMER_A, "o1"));
});

test("getOrderDetail: Customer A CAN read own order", async () => {
  const svc = await makeService({
    orders: { data: { id: "o1", user_id: CUSTOMER_A, order_number: "N1", status: "confirmed", total: 10, order_items: [] }, error: null },
  });
  const out = await svc.getOrderDetail(CUSTOMER_A, "o1");
  assert.equal(out.id, "o1");
  assert.equal(out.order_number, "N1");
});

test("updateAddress: Customer A cannot mutate Customer B's address", async () => {
  const svc = await makeService({ customer_addresses: { data: { id: "ad1", user_id: CUSTOMER_B, is_default: true }, error: null } });
  await assertForbidden(() => svc.updateAddress(CUSTOMER_A, "ad1", { recipient_phone: "+9647700000000", area: "X" }));
});

test("deleteAddress: Customer A cannot delete Customer B's address", async () => {
  const svc = await makeService({ customer_addresses: { data: { id: "ad1", user_id: CUSTOMER_B, is_default: false }, error: null } });
  await assertForbidden(() => svc.deleteAddress(CUSTOMER_A, "ad1"));
});

test("setDefaultAddress: Customer A cannot set-default Customer B's address", async () => {
  const svc = await makeService({ customer_addresses: { data: { id: "ad1", user_id: CUSTOMER_B }, error: null } });
  await assertForbidden(() => svc.setDefaultAddress(CUSTOMER_A, "ad1"));
});

test("missing actor id → Forbidden (no anonymous access)", async () => {
  const svc = await makeService({});
  await assertForbidden(() => svc.getProfile(undefined));
  await assertForbidden(() => svc.listAddresses(undefined));
  await assertForbidden(() => svc.getOrderDetail(undefined, "o1"));
});

test("non-existent resource is denied the same way as a foreign one (no existence oracle)", async () => {
  const svc = await makeService({ customer_addresses: { data: null, error: null }, orders: { data: null, error: null } });
  await assertForbidden(() => svc.updateAddress(CUSTOMER_A, "missing", { recipient_phone: "+9647700000000", area: "X" }));
  await assertForbidden(() => svc.getOrderDetail(CUSTOMER_A, "missing"));
});
