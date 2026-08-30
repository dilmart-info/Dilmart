/**
 * Merchant settings consistency / atomicity (DilMart-STORE-MERCHANT-SETTINGS-ATOMICITY-001).
 *
 * The write path used to be two independent statements — `merchant_settings.upsert()` followed by
 * `merchants.update({ logo_url })` — so the settings write could commit and the logo write then
 * fail, returning an error to a caller whose settings had already been saved. The read path issued
 * two independent `Promise.all` queries, so a write committing between them could combine old
 * settings with a newer logo.
 *
 * These tests pin, by counting every database operation rather than assuming:
 *   - POST issues exactly ONE atomic RPC, with no table writes and no follow-up read;
 *   - GET issues exactly ONE request after scope resolution;
 *   - the sparse-patch and logo null/undefined/empty-string semantics are unchanged;
 *   - the resolved merchant id — never the browser's — reaches the database;
 *   - both paths fail closed instead of inventing healthy-looking settings.
 *
 * Transactional rollback itself is proven against a real database in
 * backend/scripts/verify-merchant-settings-atomic-upsert.sql.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MerchantsService } from "../dist/modules/merchants/merchants.service.js";

const RPC_NAME = "upsert_merchant_settings_atomic";
const MERCHANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_MERCHANT_ID = "22222222-2222-4222-8222-222222222222";

/** Records every Supabase operation so call counts and shapes can be asserted, not assumed. */
function makeSupabaseSpy({ rpcHandlers = {}, merchantRow = undefined, merchantError = null } = {}) {
  const calls = { rpc: [], from: [], select: [], writes: [] };

  class Query {
    constructor(table) {
      this.table = table;
      calls.from.push(table);
    }
    select(columns) {
      calls.select.push({ table: this.table, columns });
      return this;
    }
    eq() {
      return this;
    }
    upsert(payload) {
      calls.writes.push({ table: this.table, op: "upsert", payload });
      return this;
    }
    update(payload) {
      calls.writes.push({ table: this.table, op: "update", payload });
      return this;
    }
    insert(payload) {
      calls.writes.push({ table: this.table, op: "insert", payload });
      return this;
    }
    async maybeSingle() {
      return { data: merchantRow === undefined ? null : merchantRow, error: merchantError };
    }
    then(resolve) {
      return resolve({ data: merchantRow === undefined ? [] : [merchantRow], error: merchantError });
    }
  }

  const client = {
    from: (table) => new Query(table),
    rpc: async (name, params) => {
      calls.rpc.push({ name, params });
      const handler = rpcHandlers[name];
      if (!handler) return { data: null, error: { message: `unexpected rpc ${name}` } };
      return handler(params);
    },
  };

  return { client, calls };
}

function makeService(spy, { resolveTo = MERCHANT_ID, onResolve } = {}) {
  return new MerchantsService(
    { client: spy.client },
    {
      resolveMerchantScope: async (id, role, actorId) => {
        if (onResolve) onResolve({ id, role, actorId });
        return resolveTo;
      },
    },
  );
}

function settingsRow(overrides = {}) {
  return {
    merchant_id: MERCHANT_ID,
    contact_phone: "0770",
    whatsapp_phone: null,
    support_email: null,
    city: "بغداد",
    address: "شارع ١",
    delivery_notes: null,
    order_auto_accept: false,
    default_low_stock_threshold: 5,
    push_enabled: true,
    sound_enabled: true,
    sound_repeat_interval_seconds: 15,
    sound_max_duration_seconds: 300,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-19T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return { ...settingsRow(), logo_url: "https://cdn.example/logo.png", ...overrides };
}

/* ────────────────────────────── GET — one statement, one snapshot ────────────────────────────── */

test("GET resolves merchant scope first and then issues exactly ONE database request", async () => {
  const seen = [];
  const spy = makeSupabaseSpy({ merchantRow: { logo_url: null, merchant_settings: settingsRow() } });
  const service = makeService(spy, { onResolve: (info) => seen.push(info) });

  await service.getMerchantSettings("browser-supplied", { actor_role: "merchant_owner", actor_id: "user-1" });

  assert.deepEqual(seen, [{ id: "browser-supplied", role: "merchant_owner", actorId: "user-1" }]);
  assert.deepEqual(spy.calls.from, ["merchants"], "one request, rooted at merchants");
  assert.equal(spy.calls.rpc.length, 0);
  assert.deepEqual(
    spy.calls.select.map((s) => s.columns),
    ["logo_url, merchant_settings(*)"],
    "the settings row is embedded, not fetched by a second query",
  );
  assert.deepEqual(spy.calls.writes, [], "a read must not write");
});

test("GET returns the settings row merged with the merchant logo", async () => {
  const spy = makeSupabaseSpy({
    merchantRow: { logo_url: "https://cdn.example/logo.png", merchant_settings: settingsRow() },
  });

  const result = await makeService(spy).getMerchantSettings(MERCHANT_ID);

  assert.equal(result.logo_url, "https://cdn.example/logo.png");
  assert.equal(result.merchant_id, MERCHANT_ID);
  // Every merchant_settings column survives, as with the previous `select("*")`.
  for (const key of [
    "contact_phone",
    "whatsapp_phone",
    "support_email",
    "city",
    "address",
    "delivery_notes",
    "order_auto_accept",
    "default_low_stock_threshold",
    "push_enabled",
    "sound_enabled",
    "sound_repeat_interval_seconds",
    "sound_max_duration_seconds",
    "created_at",
    "updated_at",
  ]) {
    assert.ok(key in result, `${key} must be preserved`);
  }
});

test("GET returns settings with a null logo when the merchant has none", async () => {
  const spy = makeSupabaseSpy({ merchantRow: { logo_url: null, merchant_settings: settingsRow() } });

  const result = await makeService(spy).getMerchantSettings(MERCHANT_ID);

  assert.equal(result.logo_url, null);
  assert.equal(result.city, "بغداد");
});

test("GET returns the logo alone when the merchant has no settings row", async () => {
  const spy = makeSupabaseSpy({
    merchantRow: { logo_url: "https://cdn.example/logo.png", merchant_settings: null },
  });

  const result = await makeService(spy).getMerchantSettings(MERCHANT_ID);

  assert.deepEqual(result, { logo_url: "https://cdn.example/logo.png" });
});

test("GET returns null when there are neither settings nor a usable logo", async () => {
  for (const logo of [null, ""]) {
    const spy = makeSupabaseSpy({ merchantRow: { logo_url: logo, merchant_settings: null } });
    const result = await makeService(spy).getMerchantSettings(MERCHANT_ID);
    assert.equal(result, null, `logo ${JSON.stringify(logo)} with no settings must return null`);
  }
});

test("GET returns null for a merchant that does not exist", async () => {
  const spy = makeSupabaseSpy({ merchantRow: null });

  const result = await makeService(spy).getMerchantSettings(MERCHANT_ID);

  assert.equal(result, null);
  assert.deepEqual(spy.calls.from, ["merchants"]);
});

test("GET tolerates an array-shaped embed as well as a to-one object", async () => {
  const spy = makeSupabaseSpy({ merchantRow: { logo_url: null, merchant_settings: [settingsRow()] } });

  const result = await makeService(spy).getMerchantSettings(MERCHANT_ID);

  assert.equal(result.merchant_id, MERCHANT_ID);
  assert.equal(result.logo_url, null);
});

test("GET propagates a database error instead of reporting an empty store", async () => {
  const spy = makeSupabaseSpy({ merchantError: { message: "connection lost" } });

  await assert.rejects(() => makeService(spy).getMerchantSettings(MERCHANT_ID));
});

test("GET refuses when merchant scope cannot be resolved, before touching the database", async () => {
  const spy = makeSupabaseSpy({});
  const service = makeService(spy, { resolveTo: null });

  await assert.rejects(
    () => service.getMerchantSettings(MERCHANT_ID),
    (error) => /Merchant id is required/.test(String(error?.message ?? error)),
  );
  assert.deepEqual(spy.calls.from, [], "no database access after a scope refusal");
  assert.equal(spy.calls.rpc.length, 0);
});

/* ─────────────────────────────── POST — one atomic RPC, no splits ─────────────────────────────── */

function makeUpsertSpy(handler) {
  return makeSupabaseSpy({
    rpcHandlers: {
      [RPC_NAME]: handler ?? (async () => ({ data: snapshot(), error: null })),
    },
  });
}

test("POST issues exactly ONE atomic RPC and no table statements", async () => {
  const spy = makeUpsertSpy();

  const result = await makeService(spy).upsertMerchantSettings({
    merchant_id: MERCHANT_ID,
    contact_phone: "0771",
    logo_url: "https://cdn.example/new.png",
  });

  assert.equal(spy.calls.rpc.length, 1, "exactly one RPC");
  assert.equal(spy.calls.rpc[0].name, RPC_NAME);
  assert.deepEqual(spy.calls.from, [], "no merchant_settings upsert, no merchants update, no follow-up read");
  assert.deepEqual(spy.calls.writes, []);
  assert.equal(result.merchant_id, MERCHANT_ID);
});

test("POST sends the RESOLVED merchant id, never the one supplied by the browser", async () => {
  const spy = makeUpsertSpy();
  const service = makeService(spy, { resolveTo: MERCHANT_ID });

  await service.upsertMerchantSettings({ merchant_id: OTHER_MERCHANT_ID, city: "بغداد" });

  const params = spy.calls.rpc[0].params;
  assert.equal(params.p_merchant_id, MERCHANT_ID);
  assert.ok(!("merchant_id" in params.p_patch), "merchant_id must never travel inside the patch");
});

test("POST refuses when merchant scope cannot be resolved, before touching the database", async () => {
  const spy = makeUpsertSpy();
  const service = makeService(spy, { resolveTo: null });

  await assert.rejects(
    () => service.upsertMerchantSettings({ merchant_id: MERCHANT_ID, city: "بغداد" }),
    (error) => /Merchant id is required/.test(String(error?.message ?? error)),
  );
  assert.equal(spy.calls.rpc.length, 0);
  assert.deepEqual(spy.calls.from, []);
});

test("POST sends a sparse patch: only the fields the caller actually supplied", async () => {
  const spy = makeUpsertSpy();

  // Exactly what MerchantNewOrderAlertBanner sends.
  await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, sound_enabled: true });

  assert.deepEqual(spy.calls.rpc[0].params.p_patch, { sound_enabled: true });
});

test("POST keeps the push panel's partial update partial", async () => {
  const spy = makeUpsertSpy();

  await makeService(spy).upsertMerchantSettings({
    merchant_id: MERCHANT_ID,
    push_enabled: true,
    sound_enabled: true,
  });

  assert.deepEqual(spy.calls.rpc[0].params.p_patch, { push_enabled: true, sound_enabled: true });
});

test("POST treats an empty string as a real update, not an omission", async () => {
  const spy = makeUpsertSpy();

  await makeService(spy).upsertMerchantSettings({
    merchant_id: MERCHANT_ID,
    contact_phone: "",
    delivery_notes: "",
  });

  assert.deepEqual(spy.calls.rpc[0].params.p_patch, { contact_phone: "", delivery_notes: "" });
});

test("POST carries every supported settings field when the settings form saves", async () => {
  const spy = makeUpsertSpy();

  await makeService(spy).upsertMerchantSettings({
    merchant_id: MERCHANT_ID,
    contact_phone: "0770",
    whatsapp_phone: "0771",
    support_email: "a@b.c",
    city: "بغداد",
    address: "شارع ١",
    delivery_notes: "توصيل",
    logo_url: "https://cdn.example/logo.png",
    push_enabled: false,
    sound_enabled: false,
    sound_repeat_interval_seconds: 20,
    sound_max_duration_seconds: 120,
  });

  assert.deepEqual(spy.calls.rpc[0].params.p_patch, {
    contact_phone: "0770",
    whatsapp_phone: "0771",
    support_email: "a@b.c",
    city: "بغداد",
    address: "شارع ١",
    delivery_notes: "توصيل",
    push_enabled: false,
    sound_enabled: false,
    sound_repeat_interval_seconds: 20,
    sound_max_duration_seconds: 120,
    logo_url: "https://cdn.example/logo.png",
  });
});

test("POST preserves the logo_url string-only rule exactly", async () => {
  // Omitted → untouched.
  let spy = makeUpsertSpy();
  await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, city: "بغداد" });
  assert.ok(!("logo_url" in spy.calls.rpc[0].params.p_patch), "omitted logo_url must not reach the write");

  // undefined → untouched.
  spy = makeUpsertSpy();
  await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, logo_url: undefined });
  assert.ok(!("logo_url" in spy.calls.rpc[0].params.p_patch), "undefined logo_url must not reach the write");

  // null → untouched (the old code only updated the logo for a string; null is NOT "clear").
  spy = makeUpsertSpy();
  await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, logo_url: null });
  assert.ok(!("logo_url" in spy.calls.rpc[0].params.p_patch), "null logo_url must not reach the write");

  // "" → a real clear.
  spy = makeUpsertSpy();
  await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, logo_url: "" });
  assert.deepEqual(spy.calls.rpc[0].params.p_patch, { logo_url: "" });

  // A URL → replace.
  spy = makeUpsertSpy();
  await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, logo_url: "https://cdn.example/x.png" });
  assert.deepEqual(spy.calls.rpc[0].params.p_patch, { logo_url: "https://cdn.example/x.png" });
});

test("POST accepts a logo-only request and still goes through the single atomic RPC", async () => {
  const spy = makeUpsertSpy();

  await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, logo_url: "" });

  assert.equal(spy.calls.rpc.length, 1);
  assert.deepEqual(spy.calls.from, []);
});

test("POST returns the RPC's post-write snapshot without a second read", async () => {
  const expected = snapshot({ contact_phone: "0771", updated_at: "2026-08-20T10:00:00.000Z" });
  const spy = makeUpsertSpy(async () => ({ data: expected, error: null }));

  const result = await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, contact_phone: "0771" });

  assert.deepEqual(result, expected);
  assert.deepEqual(spy.calls.from, [], "the snapshot comes from the write transaction, not a follow-up GET");
});

/* ─────────────────────────────────────── POST fail-closed ─────────────────────────────────────── */

test("POST propagates a database failure instead of reporting a successful save", async () => {
  const spy = makeUpsertSpy(async () => ({ data: null, error: { message: "deadlock detected" } }));

  await assert.rejects(() => makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, city: "بغداد" }));
});

test("POST rejects a missing or malformed snapshot rather than inventing settings", async () => {
  const cases = [
    { label: "null payload", data: null, pattern: /returned no payload/ },
    { label: "array payload", data: [snapshot()], pattern: /malformed payload/ },
    { label: "string payload", data: "{}", pattern: /malformed payload/ },
    { label: "empty object", data: {}, pattern: /merchant_id is missing/ },
    { label: "missing logo_url", data: (() => { const s = snapshot(); delete s.logo_url; return s; })(), pattern: /logo_url is missing/ },
    { label: "non-string logo_url", data: snapshot({ logo_url: 42 }), pattern: /logo_url must be a string or null/ },
    { label: "missing updated_at", data: (() => { const s = snapshot(); delete s.updated_at; return s; })(), pattern: /updated_at is missing/ },
    { label: "blank merchant_id", data: snapshot({ merchant_id: "" }), pattern: /merchant_id is missing/ },
  ];

  for (const testCase of cases) {
    const spy = makeUpsertSpy(async () => ({ data: testCase.data, error: null }));
    await assert.rejects(
      () => makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, city: "بغداد" }),
      (error) => testCase.pattern.test(String(error?.message ?? error)),
      testCase.label,
    );
  }
});

test("a null logo_url in the snapshot is valid — a merchant may legitimately have no logo", async () => {
  const spy = makeUpsertSpy(async () => ({ data: snapshot({ logo_url: null }), error: null }));

  const result = await makeService(spy).upsertMerchantSettings({ merchant_id: MERCHANT_ID, city: "بغداد" });

  assert.equal(result.logo_url, null);
});
