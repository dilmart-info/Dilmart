/**
 * Phase 2A Unit Tests: JenniStoreProvisioningService (v2 — with table lock fixes)
 *
 * Tests the provisioning service in isolation with mocked Supabase + Jenni API.
 * Validates: strict validation, idempotency, table lock, error handling, safety rules.
 *
 * Run: npm run build && node --test tests/jenni-store-provisioning.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockMerchant(overrides = {}) {
  return {
    id: "merchant-test-uuid",
    slug: "test-merchant",
    display_name: "متجر تجريبي",
    jenni_store_id: null,
    jenni_synced_at: null,
    jenni_sync_error: null,
    jenni_merchant_id: "17168",
    ...overrides,
  };
}

function createMockSettings(overrides = {}) {
  return {
    contact_phone: "07801231234",
    whatsapp_phone: "07701234567",
    address: "المنصور شارع 14 رمضان",
    city: "بغداد",
    ...overrides,
  };
}

/**
 * Create a mock SupabaseAdminService that tracks calls.
 * Includes mock for jenni_store_provisioning_locks table.
 */
function createMockSupabase(merchantData, settingsData, opts = {}) {
  const updateCalls = [];
  const insertCalls = [];
  const deleteCalls = [];

  // Track active locks for table-based lock simulation
  const activeLocks = new Set(opts.existingLocks ?? []);

  // Track merchants by jenni_store_id for duplicate detection
  const merchantsByStoreId = opts.merchantsByStoreId ?? {};

  const client = {
    from(table) {
      if (table === "jenni_store_provisioning_locks") {
        return {
          insert(row) {
            return {
              single() {
                insertCalls.push({ table, row });
                const mid = row?.merchant_id;
                if (activeLocks.has(mid)) {
                  // Conflict — lock already held
                  return { error: { code: "23505", message: "duplicate key" } };
                }
                activeLocks.add(mid);
                return { error: null };
              },
            };
          },
          delete() {
            return {
              eq(col, val) {
                deleteCalls.push({ table, col, val });
                activeLocks.delete(val);
                return { error: null };
              },
              lt(col, val) {
                deleteCalls.push({ table, col, val, op: "lt" });
                // Simulate stale lock cleanup
                if (opts.staleLockMerchantId) {
                  activeLocks.delete(opts.staleLockMerchantId);
                }
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "merchants") {
        let selectCols = "";
        let eqCol = "";
        let eqVal = "";
        let neqCol = "";
        let neqVal = "";
        return {
          select(cols) { selectCols = cols; return this; },
          eq(col, val) { eqCol = col; eqVal = val; return this; },
          neq(col, val) { neqCol = col; neqVal = val; return this; },
          async maybeSingle() {
            // Handle duplicate check in linkExistingStore
            if (eqCol === "jenni_store_id" && neqCol === "id") {
              const existing = merchantsByStoreId[eqVal];
              if (existing && existing.id !== neqVal) {
                return { data: existing, error: null };
              }
              return { data: null, error: null };
            }
            return { data: { ...merchantData }, error: null };
          },
          update(values) {
            updateCalls.push({ table: "merchants", values });
            return {
              eq() {
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "merchant_settings") {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: settingsData ? { ...settingsData } : null, error: null }),
        };
      }
      return {
        select() { return this; },
        eq() { return this; },
        neq() { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
        update() { return { eq() { return { error: null }; } }; },
      };
    },
  };

  return { client, updateCalls, insertCalls, deleteCalls, activeLocks };
}

function createMockJenniClient(createStoreResponse = { store_id: 99999 }) {
  const calls = [];
  return {
    calls,
    createStore: async (payload) => {
      calls.push({ method: "createStore", payload });
      return createStoreResponse;
    },
    listStores: async () => ({ data: [] }),
    getStore: async () => null,
  };
}

// ── Import service (from compiled dist) ────────────────────────────────────

let JenniStoreProvisioningService;

function createMockConfig(allowed = "true") {
  return {
    get(key) {
      if (key === "JENNI_ALLOW_STORE_PROVISIONING") return allowed;
      return null;
    }
  };
}

test("load compiled module", async () => {
  const mod = await import("../dist/modules/jenni/jenni-store-provisioning.service.js");
  class WrappedService extends mod.JenniStoreProvisioningService {
    constructor(supabaseAdmin, jenniClient, config = createMockConfig("true")) {
      super(supabaseAdmin, jenniClient, config);
    }
  }
  JenniStoreProvisioningService = WrappedService;
  assert.ok(JenniStoreProvisioningService, "JenniStoreProvisioningService should be exported");
});

// ── Test 1: merchant_with_existing_jenni_store_id_returns_without_api_call ──

test("merchant_with_existing_jenni_store_id_returns_without_api_call", async () => {
  const merchant = createMockMerchant({ jenni_store_id: 12345 });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant("merchant-test-uuid");

  assert.equal(result.jenni_store_id, 12345);
  assert.equal(result.was_created, false);
  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
  assert.equal(supabase.insertCalls.length, 0, "Should NOT acquire lock");
});

// ── Test 2: merchant_without_store_builds_payload_and_calls_createStore ─────

test("merchant_without_store_builds_payload_and_calls_createStore", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({ store_id: 55555 });

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant("merchant-test-uuid");

  assert.equal(result.jenni_store_id, 55555);
  assert.equal(result.was_created, true);
  assert.equal(jenniClient.calls.length, 1, "Should call Jenni API once");

  const payload = jenniClient.calls[0].payload;
  assert.equal(payload.store_name, "متجر تجريبي");
  assert.equal(payload.store_phone, "07801231234");
  assert.equal(payload.governorate_code, "BGD");
  assert.equal(payload.address, "المنصور شارع 14 رمضان");
  assert.equal(payload.merchant_id, 17168);
});

// ── Test 3: missing_address_saves_sync_error_and_throws ────────────────────

test("missing_address_saves_sync_error_and_throws", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings({ address: null });
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(err.message.includes("address"), `Error should mention address: ${err.message}`);
      return true;
    },
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");

  // Verify sync error was saved
  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_sync_error,
  );
  assert.ok(errorUpdates.length > 0, "Should save jenni_sync_error");
  assert.ok(errorUpdates[0].values.jenni_sync_error.includes("address"));
});

// ── Test 4: missing_phone_saves_sync_error_and_throws ──────────────────────

test("missing_phone_saves_sync_error_and_throws", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings({ contact_phone: null, whatsapp_phone: null });
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(err.message.includes("phone"), `Error should mention phone: ${err.message}`);
      return true;
    },
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
});

// ── Test 5: missing_governorate_mapping_saves_sync_error_and_throws ────────

test("missing_governorate_mapping_saves_sync_error_and_throws", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings({ city: "مدينة غير معروفة" });
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(
        err.message.includes("city/governorate"),
        `Error should mention governorate mapping: ${err.message}`,
      );
      return true;
    },
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
});

// ── Test 6: jenni_api_failure_saves_sync_error ─────────────────────────────

test("jenni_api_failure_saves_sync_error", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  const jenniClient = {
    createStore: async () => {
      throw new Error("Jenni API: 503 Service Unavailable");
    },
    listStores: async () => ({ data: [] }),
    getStore: async () => null,
    calls: [],
  };

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(err.message.includes("503"), `Error should contain API message: ${err.message}`);
      return true;
    },
  );

  // Verify sync error was saved
  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_sync_error,
  );
  assert.ok(errorUpdates.length > 0, "Should save jenni_sync_error on API failure");
  assert.ok(errorUpdates[0].values.jenni_sync_error.includes("Jenni API error"));
});

// ── Test 7: success_saves_jenni_store_id_synced_at_and_clears_error ────────

test("success_saves_jenni_store_id_synced_at_and_clears_error", async () => {
  const merchant = createMockMerchant({ jenni_sync_error: "previous error" });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({ store_id: 77777 });

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant("merchant-test-uuid");

  assert.equal(result.jenni_store_id, 77777);
  assert.equal(result.was_created, true);

  // Verify the success update was saved
  const successUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_store_id === 77777,
  );
  assert.ok(successUpdates.length > 0, "Should save jenni_store_id");
  assert.equal(successUpdates[0].values.jenni_sync_error, null, "Should clear jenni_sync_error");
  assert.ok(successUpdates[0].values.jenni_synced_at, "Should save jenni_synced_at");
});

// ── Test 8: no_auto_use_of_17025 ──────────────────────────────────────────

test("no_auto_use_of_17025", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({ store_id: 88888 });

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant("merchant-test-uuid");

  assert.notEqual(result.jenni_store_id, 17025, "Must NEVER auto-use 17025");

  // Verify no update contains 17025
  for (const call of supabase.updateCalls) {
    assert.notEqual(call.values.jenni_store_id, 17025, "Must NEVER save 17025 automatically");
  }
});

// ── Test 9: no_default_BGD ─────────────────────────────────────────────────

test("no_default_BGD", async () => {
  const merchant = createMockMerchant();
  // city is null — should NOT default to BGD
  const settings = createMockSettings({ city: null });
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(
        err.message.includes("city/governorate"),
        "Should fail when city is null (no BGD default)",
      );
      return true;
    },
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
});

// ── Test 10: no_address_city_fallback ──────────────────────────────────────

test("no_address_city_fallback", async () => {
  const merchant = createMockMerchant();
  // address is null but city is present — should NOT use city as address fallback
  const settings = createMockSettings({ address: null, city: "بغداد" });
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(err.message.includes("address"), "Should fail for missing address even if city exists");
      return true;
    },
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
});

// ── Test 11: resolveGovernorateCode — normalized exact matching + alef ──────

test("resolveGovernorateCode exact matching with alef unification", async () => {
  const mod = await import("../dist/modules/jenni/jenni-store-provisioning.service.js");
  const service = new mod.JenniStoreProvisioningService({}, {});

  // Arabic exact matches
  assert.equal(service.resolveGovernorateCode("بغداد"), "BGD");
  assert.equal(service.resolveGovernorateCode("البصرة"), "BAS");
  assert.equal(service.resolveGovernorateCode("أربيل"), "ARB");
  assert.equal(service.resolveGovernorateCode("كربلاء"), "KRB");
  assert.equal(service.resolveGovernorateCode("بابل"), "BBL");
  assert.equal(service.resolveGovernorateCode("الأنبار"), "ANB");
  assert.equal(service.resolveGovernorateCode("نينوى (الموصل)"), "NIN");
  assert.equal(service.resolveGovernorateCode("ذي قار (الناصرية)"), "DHI");

  // English exact matches
  assert.equal(service.resolveGovernorateCode("Baghdad"), "BGD");
  assert.equal(service.resolveGovernorateCode("Basra"), "BAS");
  assert.equal(service.resolveGovernorateCode("Erbil"), "ARB");
  assert.equal(service.resolveGovernorateCode("Babylon"), "BBL");
  assert.equal(service.resolveGovernorateCode("Anbar"), "ANB");
  assert.equal(service.resolveGovernorateCode("Mosul"), "NIN");
  assert.equal(service.resolveGovernorateCode("Kirkuk"), "KRK");

  // Case insensitive
  assert.equal(service.resolveGovernorateCode("BAGHDAD"), "BGD");
  assert.equal(service.resolveGovernorateCode("basra"), "BAS");

  // Common aliases
  assert.equal(service.resolveGovernorateCode("الموصل"), "NIN");
  assert.equal(service.resolveGovernorateCode("الديوانية"), "QAD");
  assert.equal(service.resolveGovernorateCode("الناصرية"), "DHI");
  assert.equal(service.resolveGovernorateCode("السماوة"), "MTH");
  assert.equal(service.resolveGovernorateCode("العمارة"), "MYS");
  assert.equal(service.resolveGovernorateCode("الكوت"), "WST");
  assert.equal(service.resolveGovernorateCode("الرمادي"), "ANB");
  assert.equal(service.resolveGovernorateCode("الحلة"), "BBL");

  // Alef unification: أربيل → اربيل after normalization
  // Both أربيل (with hamza) and اربيل (without) should resolve
  assert.equal(service.resolveGovernorateCode("أربيل"), "ARB", "Hamzated alef should match");
  assert.equal(service.resolveGovernorateCode("إربيل"), "ARB", "Alef with kasra should match");
  assert.equal(service.resolveGovernorateCode("الأنبار"), "ANB", "Hamzated alef in Anbar");

  // Unknown city → null (no fallback)
  assert.equal(service.resolveGovernorateCode("مدينة خيالية"), null);
  assert.equal(service.resolveGovernorateCode(""), null);
  assert.equal(service.resolveGovernorateCode(null), null);
});

// ── Test 12: fallback_to_whatsapp_phone ───────────────────────────────────

test("fallback_to_whatsapp_phone", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings({ contact_phone: null }); // whatsapp_phone still set
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({ store_id: 44444 });

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant("merchant-test-uuid");

  assert.equal(result.jenni_store_id, 44444);
  assert.equal(result.was_created, true);

  const payload = jenniClient.calls[0].payload;
  assert.equal(payload.store_phone, "07701234567", "Should use whatsapp_phone as fallback");
});

// ── Test 13: lock_is_released_on_jenni_api_failure ─────────────────────────

test("lock_is_released_on_jenni_api_failure", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  const jenniClient = {
    createStore: async () => { throw new Error("Jenni API down"); },
    calls: [],
  };

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(() => service.ensureStoreForMerchant("merchant-test-uuid"));

  // Verify lock was released in finally
  assert.equal(supabase.activeLocks.has("merchant-test-uuid"), false, "Lock should be released after API failure");
  const lockDeletes = supabase.deleteCalls.filter(
    (c) => c.table === "jenni_store_provisioning_locks" && c.val === "merchant-test-uuid",
  );
  assert.ok(lockDeletes.length > 0, "Should call DELETE to release lock");
});

// ── Test 14: concurrent_provisioning_lock_conflict ─────────────────────────

test("concurrent_provisioning_lock_conflict", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  // Simulate another request already holding the lock
  const supabase = createMockSupabase(merchant, settings, {
    existingLocks: ["merchant-test-uuid"],
  });
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(
        err.message.includes("already in progress"),
        `Error should mention lock conflict: ${err.message}`,
      );
      return true;
    },
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API when locked");
});

// ── Test 15: stale_lock_older_than_ttl_gets_cleaned ────────────────────────

test("stale_lock_older_than_ttl_gets_cleaned", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  // Simulate a stale lock that should be cleaned
  const supabase = createMockSupabase(merchant, settings, {
    existingLocks: ["merchant-test-uuid"],
    staleLockMerchantId: "merchant-test-uuid", // This lock will be cleaned on stale check
  });
  const jenniClient = createMockJenniClient({ store_id: 33333 });

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant("merchant-test-uuid");

  assert.equal(result.jenni_store_id, 33333);
  assert.equal(result.was_created, true);

  // Verify stale cleanup was triggered
  const staleDeletes = supabase.deleteCalls.filter((c) => c.op === "lt");
  assert.ok(staleDeletes.length > 0, "Should attempt stale lock cleanup");
});

// ── Test 16: linkExistingStore_rejects_duplicate_store_id ──────────────────

test("linkExistingStore_rejects_duplicate_store_id", async () => {
  const merchant = createMockMerchant();
  const supabase = createMockSupabase(merchant, null, {
    merchantsByStoreId: {
      17025: { id: "other-merchant-id", slug: "other-merchant" },
    },
  });

  const service = new JenniStoreProvisioningService(supabase, {});

  await assert.rejects(
    () => service.linkExistingStore("merchant-test-uuid", 17025),
    (err) => {
      assert.ok(
        err.message.includes("already linked"),
        `Error should mention duplicate: ${err.message}`,
      );
      assert.ok(
        err.message.includes("other-merchant"),
        `Error should mention the other merchant: ${err.message}`,
      );
      return true;
    },
  );
});

// ── Test 17: linkExistingStore_succeeds_when_no_duplicate ──────────────────

test("linkExistingStore_succeeds_when_no_duplicate", async () => {
  const merchant = createMockMerchant();
  const supabase = createMockSupabase(merchant, null, { merchantsByStoreId: {} });

  const service = new JenniStoreProvisioningService(supabase, {});
  await service.linkExistingStore("merchant-test-uuid", 55555);

  const linkUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_store_id === 55555,
  );
  assert.ok(linkUpdates.length > 0, "Should save jenni_store_id");
  assert.equal(linkUpdates[0].values.jenni_sync_error, null, "Should clear error");
});

// ── Test 18: lock_released_on_success_too ──────────────────────────────────

test("lock_released_on_success", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({ store_id: 66666 });

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  await service.ensureStoreForMerchant("merchant-test-uuid");

  // Lock should be released after success
  assert.equal(supabase.activeLocks.has("merchant-test-uuid"), false, "Lock should be released after success");
});

// ── Test 19: provisioning_gate_disabled_throws_forbidden_exception_for_unlinked_merchant ──

test("provisioning_gate_disabled_throws_forbidden_exception_for_unlinked_merchant", async () => {
  const merchant = createMockMerchant({ jenni_store_id: null });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();
  const disabledConfig = createMockConfig("false");

  const service = new JenniStoreProvisioningService(supabase, jenniClient, disabledConfig);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.equal(err.status, 403);
      assert.ok(err.message.includes("disabled"), `Should say disabled: ${err.message}`);
      return true;
    }
  );

  assert.equal(jenniClient.calls.length, 0, "jenniClient.createStore must NEVER be called");
});

// ── Test 20: provisioning_gate_disabled_succeeds_for_already_linked_merchant ──

test("provisioning_gate_disabled_succeeds_for_already_linked_merchant", async () => {
  const merchant = createMockMerchant({ jenni_store_id: 12345 });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();
  const disabledConfig = createMockConfig("false");

  const service = new JenniStoreProvisioningService(supabase, jenniClient, disabledConfig);
  const result = await service.ensureStoreForMerchant("merchant-test-uuid");

  assert.equal(result.jenni_store_id, 12345, "Should return existing linked store_id");
  assert.equal(result.was_created, false);
  assert.equal(jenniClient.calls.length, 0, "jenniClient.createStore must NOT be called");
});

// ── Observability & Provider Exception Tests ───────────────────────────────

test("JenniClientService request throws JenniProviderException on non-2xx response", async () => {
  const clientMod = await import("../dist/modules/jenni/jenni-client.service.js");
  const exceptionMod = await import("../dist/modules/jenni/jenni-provider.exception.js");

  const mockConfig = {
    get(key) {
      if (key === "JENNI_API_BASE_URL") return "https://mock-jenni.api";
      return null;
    }
  };
  const mockAuth = {
    getAccessToken: async () => "mock-token",
  };

  const client = new clientMod.JenniClientService(mockConfig, mockAuth);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 400,
      headers: {
        get(key) {
          if (key === "content-type") return "application/json";
          return null;
        }
      },
      text: async () => JSON.stringify({ message: "Invalid payload parameters", error: "Bad Request" }),
    };
  };

  try {
    await assert.rejects(
      () => client.createStore({ store_name: "Test Store" }),
      (err) => {
        assert.ok(err instanceof exceptionMod.JenniProviderException, `Should throw JenniProviderException, got ${err?.constructor?.name}`);
        assert.equal(err.status, 400);
        assert.equal(err.providerStatus, 400);
        assert.equal(err.message, "Jenni API rejected request. status=400 path=/v2/stores/create");
        assert.ok(!err.message.includes("Invalid payload parameters"), "Exception message should not contain raw provider body");
        assert.ok(err.sanitizedBodyPreview.includes("Invalid payload parameters"), "Exception property sanitizedBodyPreview should contain raw provider body");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ensureStoreForMerchant saves JenniProviderException to jenni_sync_error", async () => {
  const { JenniProviderException } = await import("../dist/modules/jenni/jenni-provider.exception.js");

  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  const jenniClient = createMockJenniClient();
  jenniClient.createStore = async () => {
    throw new JenniProviderException("Jenni rejected store creation", 400);
  };

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(err instanceof JenniProviderException);
      assert.equal(err.status, 400);
      assert.equal(err.message, "Jenni rejected store creation");
      return true;
    }
  );

  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_sync_error,
  );
  assert.ok(errorUpdates.length > 0, "Should save jenni_sync_error");
  assert.equal(errorUpdates[0].values.jenni_sync_error, "Jenni API error: Jenni rejected store creation");
});

test("ensureStoreForMerchant does NOT save security gate ForbiddenException to jenni_sync_error", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();
  const disabledConfig = createMockConfig("false");

  const service = new JenniStoreProvisioningService(supabase, jenniClient, disabledConfig);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    }
  );

  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_sync_error,
  );
  assert.equal(errorUpdates.length, 0, "Should NOT save jenni_sync_error on security gate failure");
});

// ── New Tests for Platform/Aggregator Store Provisioning (merchant_id) ────

test("store_payload_includes_merchant_id_matching_parsed_jenni_merchant_id", async () => {
  const merchant = createMockMerchant({ jenni_merchant_id: "17168" });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({ store_id: 112233 });

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant("merchant-test-uuid");

  assert.equal(result.jenni_store_id, 112233);
  assert.equal(jenniClient.calls.length, 1);
  const payload = jenniClient.calls[0].payload;
  assert.equal(payload.merchant_id, 17168);
});

test("missing_jenni_merchant_id_fails_locally_and_does_not_call_jenni", async () => {
  const merchant = createMockMerchant({ jenni_merchant_id: null });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(err.message.includes("jenni_merchant_id"), `Error should mention jenni_merchant_id: ${err.message}`);
      return true;
    }
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
  
  // Verify sync error was saved
  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_sync_error,
  );
  assert.ok(errorUpdates.length > 0, "Should save jenni_sync_error");
  assert.ok(errorUpdates[0].values.jenni_sync_error.includes("jenni_merchant_id"));
});

test("invalid_non_numeric_jenni_merchant_id_fails_locally_and_does_not_call_jenni", async () => {
  const merchant = createMockMerchant({ jenni_merchant_id: "invalid-id" });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant("merchant-test-uuid"),
    (err) => {
      assert.ok(err.message.includes("jenni_merchant_id"), `Error should mention jenni_merchant_id: ${err.message}`);
      return true;
    }
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
});

// ── Tests for Duplicate Store Name Provisioning (Phase 2 / Phase 4) ───────────

test("duplicate_store_name_retries_with_unique_deterministic_name_and_succeeds", async () => {
  const mod = await import("../dist/modules/jenni/jenni-provider.exception.js");
  const JenniProviderException = mod.JenniProviderException;

  const merchant = createMockMerchant({
    id: "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7",
    slug: "ard-al-khaleej",
    display_name: "أرض الخليج",
    jenni_merchant_id: "18794",
  });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  let attemptCount = 0;
  const jenniClient = {
    calls: [],
    createStore: async (payload) => {
      jenniClient.calls.push({ method: "createStore", payload });
      attemptCount++;
      if (attemptCount === 1) {
        throw new JenniProviderException(
          "Jenni API rejected request. status=400 path=/v2/stores/create",
          400,
          '{"success":false,"message":"name is reduplicate","store_id":null,"store_name":null,"generated_password":"[REDACTED]"}'
        );
      }
      return { store_id: 887766 };
    },
    listStores: async () => ({ data: [] }),
    getStore: async () => null,
  };

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant(merchant.id);

  assert.equal(result.jenni_store_id, 887766);
  assert.equal(result.was_created, true);
  assert.equal(jenniClient.calls.length, 2, "Should have attempted twice (initial + retry)");

  // Verify first attempt used base display_name
  assert.equal(jenniClient.calls[0].payload.store_name, "أرض الخليج");
  // Verify retry attempt used deterministic unique name
  assert.equal(jenniClient.calls[1].payload.store_name, "أرض الخليج - ard-al-khaleej");

  // Verify store ID was saved to DB
  const storeIdUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_store_id === 887766
  );
  assert.equal(storeIdUpdates.length, 1, "Should save jenni_store_id to DB");
  assert.equal(storeIdUpdates[0].values.jenni_sync_error, null, "Should clear sync error on success");

  // Verify lock was released
  assert.equal(supabase.deleteCalls.length, 1, "Lock should be released");
});

test("duplicate_store_name_fallback_uses_short_merchant_id_if_slug_missing", async () => {
  const mod = await import("../dist/modules/jenni/jenni-provider.exception.js");
  const JenniProviderException = mod.JenniProviderException;

  const merchant = createMockMerchant({
    id: "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7",
    slug: null,
    display_name: "أرض الخليج",
    jenni_merchant_id: "18794",
  });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  let attemptCount = 0;
  const jenniClient = {
    calls: [],
    createStore: async (payload) => {
      jenniClient.calls.push({ method: "createStore", payload });
      attemptCount++;
      if (attemptCount === 1) {
        throw new JenniProviderException(
          "Jenni API rejected request. status=400 path=/v2/stores/create",
          400,
          '{"success":false,"message":"name is reduplicate"}'
        );
      }
      return { store_id: 887767 };
    },
    listStores: async () => ({ data: [] }),
    getStore: async () => null,
  };

  const service = new JenniStoreProvisioningService(supabase, jenniClient);
  const result = await service.ensureStoreForMerchant(merchant.id);

  assert.equal(result.jenni_store_id, 887767);
  assert.equal(jenniClient.calls.length, 2);
  assert.equal(jenniClient.calls[1].payload.store_name, "أرض الخليج - ac7c356b");
});

test("duplicate_store_name_retry_failure_saves_clean_error_and_releases_lock", async () => {
  const mod = await import("../dist/modules/jenni/jenni-provider.exception.js");
  const JenniProviderException = mod.JenniProviderException;

  const merchant = createMockMerchant({
    id: "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7",
    slug: "ard-al-khaleej",
    display_name: "أرض الخليج",
    jenni_merchant_id: "18794",
  });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  const jenniClient = {
    calls: [],
    createStore: async (payload) => {
      jenniClient.calls.push({ method: "createStore", payload });
      throw new JenniProviderException(
        "Jenni API rejected request. status=400 path=/v2/stores/create",
        400,
        '{"success":false,"message":"name is reduplicate"}'
      );
    },
    listStores: async () => ({ data: [] }),
    getStore: async () => null,
  };

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant(merchant.id),
    (err) => {
      assert.ok(
        err.message.includes("duplicate") || err.message.includes("reduplicate"),
        `Error message should indicate duplicate issue: ${err.message}`
      );
      return true;
    }
  );

  assert.equal(jenniClient.calls.length, 2, "Should attempt exactly twice (1 initial + 1 retry)");

  // Verify store ID was NOT saved
  const storeIdUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_store_id != null
  );
  assert.equal(storeIdUpdates.length, 0, "Should NOT save jenni_store_id on failure");

  // Verify error was saved to DB
  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_sync_error
  );
  assert.ok(errorUpdates.length > 0, "Should save jenni_sync_error");
  assert.ok(
    errorUpdates[0].values.jenni_sync_error.includes("Jenni Store name duplicate") ||
    errorUpdates[0].values.jenni_sync_error.includes("duplicate"),
    `Saved error should be clear: ${errorUpdates[0].values.jenni_sync_error}`
  );

  // Verify lock was released
  assert.equal(supabase.deleteCalls.length, 1, "Lock should be released in finally");
});

test("non_duplicate_error_does_not_trigger_retry", async () => {
  const mod = await import("../dist/modules/jenni/jenni-provider.exception.js");
  const JenniProviderException = mod.JenniProviderException;

  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  const jenniClient = {
    calls: [],
    createStore: async (payload) => {
      jenniClient.calls.push({ method: "createStore", payload });
      throw new JenniProviderException(
        "Jenni API rejected request. status=500 path=/v2/stores/create",
        500,
        '{"success":false,"message":"internal server error"}'
      );
    },
    listStores: async () => ({ data: [] }),
    getStore: async () => null,
  };

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant(merchant.id),
    (err) => err instanceof JenniProviderException
  );

  assert.equal(jenniClient.calls.length, 1, "Should NOT retry for non-duplicate errors");
});

test("duplicate_first_then_retry_fails_with_500_does_not_label_as_duplicate", async () => {
  const mod = await import("../dist/modules/jenni/jenni-provider.exception.js");
  const JenniProviderException = mod.JenniProviderException;

  const merchant = createMockMerchant({
    id: "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7",
    slug: "ard-al-khaleej",
    display_name: "أرض الخليج",
    jenni_merchant_id: "18794",
  });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  let attemptCount = 0;
  const jenniClient = {
    calls: [],
    createStore: async (payload) => {
      jenniClient.calls.push({ method: "createStore", payload });
      attemptCount++;
      if (attemptCount === 1) {
        // First attempt: duplicate name
        throw new JenniProviderException(
          "Jenni API rejected request. status=400 path=/v2/stores/create",
          400,
          '{"success":false,"message":"name is reduplicate"}'
        );
      }
      // Second attempt: server error (NOT duplicate)
      throw new JenniProviderException(
        "Jenni API rejected request. status=500 path=/v2/stores/create",
        500,
        '{"success":false,"message":"internal server error"}'
      );
    },
    listStores: async () => ({ data: [] }),
    getStore: async () => null,
  };

  const service = new JenniStoreProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureStoreForMerchant(merchant.id),
    (err) => {
      // The thrown error must be the 500 JenniProviderException, NOT the duplicate wrapper
      assert.ok(err instanceof JenniProviderException, `Should be JenniProviderException, got ${err?.constructor?.name}`);
      assert.equal(err.providerStatus, 500, "providerStatus must be 500 from the retry error, not 400 duplicate");
      assert.ok(
        !err.message.includes("duplicate"),
        `Error message must NOT mention 'duplicate': ${err.message}`
      );
      return true;
    }
  );

  // Must have attempted exactly 2 times (1 initial + 1 retry)
  assert.equal(jenniClient.calls.length, 2, "Should attempt exactly twice");

  // Verify store ID was NOT saved
  const storeIdUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_store_id != null
  );
  assert.equal(storeIdUpdates.length, 0, "Should NOT save jenni_store_id on failure");

  // Verify NO misleading duplicate error was saved to DB
  // The outer catch will save a generic "Jenni API error: ..." message instead
  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_sync_error
  );
  for (const update of errorUpdates) {
    assert.ok(
      !update.values.jenni_sync_error.includes("Jenni Store name duplicate"),
      `Should NOT save misleading duplicate message, got: ${update.values.jenni_sync_error}`
    );
  }

  // Verify lock was released
  assert.equal(supabase.deleteCalls.length, 1, "Lock should be released in finally");
});
