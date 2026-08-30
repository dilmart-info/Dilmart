/**
 * Phase 2F Unit Tests: JenniMerchantProvisioningService
 *
 * Tests the merchant provisioning service, admin delegation, and client routing.
 * Validates: safety gates, idempotency, table locks, payload validation, error mapping, and security/redaction.
 *
 * Run: npm run build && node --test tests/jenni-merchant-provisioning.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

// ── Helpers ────────────────────────────────────────────────────────────────

const MOCK_MERCHANT_UUID = "d1a61c3c-83b6-4552-824f-c0c29f4a9b6c";

function createMockMerchant(overrides = {}) {
  return {
    id: MOCK_MERCHANT_UUID,
    slug: "test-merchant",
    display_name: "متجر تجريبي",
    jenni_merchant_id: null,
    jenni_merchant_synced_at: null,
    jenni_merchant_sync_error: null,
    ...overrides,
  };
}

function createMockSettings(overrides = {}) {
  return {
    contact_phone: "07801231234",
    whatsapp_phone: "07701234567",
    ...overrides,
  };
}

/**
 * Create a mock SupabaseAdminService that tracks calls.
 * Includes mock for jenni_merchant_provisioning_locks table.
 */
function createMockSupabase(merchantData, settingsData, opts = {}) {
  const updateCalls = [];
  const insertCalls = [];
  const deleteCalls = [];

  // Track active locks for table-based lock simulation
  const activeLocks = new Set(opts.existingLocks ?? []);

  const client = {
    from(table) {
      if (table === "jenni_merchant_provisioning_locks") {
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
        let eqCol = "";
        let eqVal = "";
        return {
          select(cols) { return this; },
          eq(col, val) { eqCol = col; eqVal = val; return this; },
          async maybeSingle() {
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
        maybeSingle: async () => ({ data: null, error: null }),
        update() { return { eq() { return { error: null }; } }; },
      };
    },
  };

  return { client, updateCalls, insertCalls, deleteCalls, activeLocks };
}

function createMockJenniClient(createMerchantResponse = { merchant_id: "m-99999", generated_password: "pwd" }) {
  const calls = [];
  return {
    calls,
    systemCode: () => "STYL_AI",
    createMerchant: async (payload) => {
      calls.push({ method: "createMerchant", payload });
      return createMerchantResponse;
    },
  };
}

function createMockConfig(allowed = "true") {
  return {
    get(key) {
      if (key === "JENNI_ALLOW_MERCHANT_PROVISIONING") return allowed;
      if (key === "JENNI_SYSTEM_CODE") return "STYL_AI";
      return null;
    }
  };
}

// ── Import Compiled Modules ────────────────────────────────────────────────

let JenniMerchantProvisioningService;

test("load compiled JenniMerchantProvisioningService module", async () => {
  const mod = await import("../dist/modules/jenni/jenni-merchant-provisioning.service.js");
  class WrappedService extends mod.JenniMerchantProvisioningService {
    constructor(supabaseAdmin, jenniClient, config = createMockConfig("true")) {
      super(supabaseAdmin, jenniClient, config);
    }
  }
  JenniMerchantProvisioningService = WrappedService;
  assert.ok(JenniMerchantProvisioningService, "JenniMerchantProvisioningService should be exported");
});

// ── Section 1: JenniMerchantProvisioningService Unit Tests ──────────────────

test("gate false throws ForbiddenException and does not call Jenni", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();
  const disabledConfig = createMockConfig("false");

  const service = new JenniMerchantProvisioningService(supabase, jenniClient, disabledConfig);

  await assert.rejects(
    () => service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID),
    (err) => {
      assert.equal(err.status, 403);
      assert.ok(err.message.includes("disabled"), `Should say disabled: ${err.message}`);
      return true;
    }
  );

  assert.equal(jenniClient.calls.length, 0, "jenniClient.createMerchant must NOT be called when gate is false");
  assert.equal(supabase.updateCalls.length, 0, "Should NOT save sync error to DB on safety gate failure");
});

test("already linked jenni_merchant_id returns idempotently and does not call Jenni", async () => {
  const merchant = createMockMerchant({ jenni_merchant_id: "m-existing-123" });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);
  const result = await service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID);

  assert.equal(result.jenni_merchant_id, "m-existing-123");
  assert.equal(result.was_created, false);
  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
  assert.equal(supabase.insertCalls.length, 0, "Should NOT acquire lock");
});

test("valid payload calls createMerchant with priority phone normalization", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings({ contact_phone: "07801231234", whatsapp_phone: "07709999999" });
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({ merchant_id: "m-55555" });

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);
  const result = await service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID);

  assert.equal(result.jenni_merchant_id, "m-55555");
  assert.equal(result.was_created, true);
  assert.equal(jenniClient.calls.length, 1, "Should call Jenni API once");

  const payload = jenniClient.calls[0].payload;
  assert.equal(payload.merchant_name, "متجر تجريبي");
  assert.equal(payload.phone, "07801231234", "Should prioritize contact_phone");
  assert.equal(payload.system_code, "DilMart_M_D1A61C3C83B6");
});

test("valid payload uses whatsapp phone fallback if contact phone is null", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings({ contact_phone: null, whatsapp_phone: "07709999999" });
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({ merchant_id: "m-55555" });

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);
  const result = await service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID);

  assert.equal(result.jenni_merchant_id, "m-55555");
  const payload = jenniClient.calls[0].payload;
  assert.equal(payload.phone, "07709999999", "Should use whatsapp_phone fallback");
});

test("provider error saves jenni_merchant_sync_error", async () => {
  const { JenniProviderException } = await import("../dist/modules/jenni/jenni-provider.exception.js");
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  const jenniClient = createMockJenniClient();
  jenniClient.createMerchant = async () => {
    throw new JenniProviderException("Jenni rejected merchant creation", 400);
  };

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID),
    (err) => {
      assert.ok(err instanceof JenniProviderException);
      assert.equal(err.status, 400);
      return true;
    }
  );

  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_merchant_sync_error,
  );
  assert.ok(errorUpdates.length > 0, "Should save jenni_merchant_sync_error");
  assert.equal(
    errorUpdates[0].values.jenni_merchant_sync_error,
    "Jenni API error: Jenni rejected merchant creation"
  );
});

test("local validation error does not save provider error", async () => {
  const merchant = createMockMerchant({ display_name: null }); // invalid display_name
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);

  await assert.rejects(
    () => service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("missing display_name"), `Error should mention display_name: ${err.message}`);
      return true;
    }
  );

  assert.equal(jenniClient.calls.length, 0, "Should NOT call Jenni API");
  const errorUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_merchant_sync_error,
  );
  assert.equal(errorUpdates.length, 0, "Should NOT save sync error to DB on local validation failure");
});

test("generated_password is not saved in database", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient({
    merchant_id: "m-88888",
    generated_password: "supersecretpassword123"
  });

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);
  const result = await service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID);

  assert.equal(result.jenni_merchant_id, "m-88888");

  // Verify database update does not contain generated_password
  const successUpdates = supabase.updateCalls.filter(
    (c) => c.table === "merchants" && c.values.jenni_merchant_id === "m-88888"
  );
  assert.ok(successUpdates.length > 0, "Should save merchant id");
  assert.equal(successUpdates[0].values.generated_password, undefined, "generated_password must NOT be saved in DB");
  assert.ok(!JSON.stringify(successUpdates[0].values).includes("supersecretpassword123"), "Should not contain password in DB payload");
});

test("lock is acquired and released on success", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);
  await service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID);

  assert.equal(supabase.insertCalls.length, 1, "Should attempt to acquire lock");
  assert.equal(supabase.activeLocks.has(MOCK_MERCHANT_UUID), false, "Lock should be released after success");
  const lockDeletes = supabase.deleteCalls.filter(
    (c) => c.table === "jenni_merchant_provisioning_locks" && c.val === MOCK_MERCHANT_UUID,
  );
  assert.ok(lockDeletes.length > 0, "Should call DELETE to release lock");
});

test("lock is released on failure", async () => {
  const merchant = createMockMerchant();
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();
  jenniClient.createMerchant = async () => {
    throw new Error("Jenni API error");
  };

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);
  await assert.rejects(() => service.ensureMerchantForMerchant(MOCK_MERCHANT_UUID));

  assert.equal(supabase.activeLocks.has(MOCK_MERCHANT_UUID), false, "Lock should be released after failure");
  const lockDeletes = supabase.deleteCalls.filter(
    (c) => c.table === "jenni_merchant_provisioning_locks" && c.val === MOCK_MERCHANT_UUID,
  );
  assert.ok(lockDeletes.length > 0, "Should call DELETE to release lock");
});

test("unique system_code generation algorithm and validation", async () => {
  const targetUuid = "65575f7c-4204-44d0-99a0-fc1902e2ed91";
  const merchant = createMockMerchant({ id: targetUuid });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);

  let sentPayload = null;
  const jenniClient = createMockJenniClient();
  jenniClient.createMerchant = async (payload) => {
    sentPayload = payload;
    return { merchant_id: "m-12345" };
  };

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);
  await service.ensureMerchantForMerchant(targetUuid);

  assert.ok(sentPayload, "Should have sent payload");

  // Verify generated system_code equals DilMart_M_65575F7C4204 for UUID 65575f7c-4204-44d0-99a0-fc1902e2ed91
  assert.equal(sentPayload.system_code, "DilMart_M_65575F7C4204");

  // Verify generated value does not equal STYL_AI
  assert.notEqual(sentPayload.system_code, "STYL_AI");

  // Verify generated value matches /^[A-Z0-9_]+$/
  assert.ok(/^[A-Z0-9_]+$/.test(sentPayload.system_code), "Should match A-Z0-9_ format");

  // Verify payload includes merchant_name, phone, and system_code
  assert.ok(sentPayload.merchant_name, "Should include merchant_name");
  assert.ok(sentPayload.phone, "Should include phone");
  assert.ok(sentPayload.system_code, "Should include system_code");

  // Verify determinism: running again with same UUID yields same system_code
  const jenniClient2 = createMockJenniClient();
  let sentPayload2 = null;
  jenniClient2.createMerchant = async (payload) => {
    sentPayload2 = payload;
    return { merchant_id: "m-12345" };
  };
  const service2 = new JenniMerchantProvisioningService(supabase, jenniClient2);
  await service2.ensureMerchantForMerchant(targetUuid);
  assert.equal(sentPayload2.system_code, "DilMart_M_65575F7C4204");
});

test("invalid UUID format for system_code throws BadRequestException", async () => {
  const invalidUuid = "not-a-uuid-string";
  const merchant = createMockMerchant({ id: invalidUuid });
  const settings = createMockSettings();
  const supabase = createMockSupabase(merchant, settings);
  const jenniClient = createMockJenniClient();

  const service = new JenniMerchantProvisioningService(supabase, jenniClient);
  await assert.rejects(
    () => service.ensureMerchantForMerchant(invalidUuid),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes("Invalid merchant ID format"), `Message should mention invalid merchant ID: ${err.message}`);
      return true;
    }
  );
});

// ── Section 2: JenniClientService Tests ─────────────────────────────────────

test("JenniClientService.createMerchant() calls /v2/merchant-management/create", async () => {
  const clientMod = await import("../dist/modules/jenni/jenni-client.service.js");
  const mockConfig = {
    get(key) {
      if (key === "JENNI_API_BASE_URL") return "https://mock-jenni.api";
      if (key === "JENNI_SYSTEM_CODE") return "STYL_AI";
      return null;
    }
  };
  const mockAuth = {
    getAccessToken: async () => "mock-token",
  };

  const client = new clientMod.JenniClientService(mockConfig, mockAuth);
  const originalFetch = globalThis.fetch;
  let fetchedUrl = "";
  let fetchedOptions = null;

  globalThis.fetch = async (url, opts) => {
    fetchedUrl = url;
    fetchedOptions = opts;
    return {
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ merchant_id: "m-client-99", generated_password: "pwd" }),
    };
  };

  try {
    const payload = { merchant_name: "Client Test", phone: "07801231234", system_code: "DilMart_M_TEST123456" };
    const res = await client.createMerchant(payload);

    assert.equal(res.merchant_id, "m-client-99");
    assert.equal(fetchedUrl, "https://mock-jenni.api/v2/merchant-management/create");
    assert.equal(fetchedOptions.method, "POST");
    assert.equal(JSON.parse(fetchedOptions.body).merchant_name, "Client Test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("JenniClientService error sanitizer redacts generated_password", async () => {
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
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({
        message: "Invalid payload parameters",
        generated_password: "topsecretpassword_leak",
        access_token: "sensitive_token_leak",
      }),
    };
  };

  try {
    await assert.rejects(
      () => client.createMerchant({ merchant_name: "Test", phone: "0780", system_code: "DilMart_M_TEST123456" }),
      (err) => {
        assert.ok(err instanceof exceptionMod.JenniProviderException);
        assert.ok(!err.sanitizedBodyPreview.includes("topsecretpassword_leak"), "Password should be redacted");
        assert.ok(!err.sanitizedBodyPreview.includes("sensitive_token_leak"), "Token should be redacted");
        assert.ok(err.sanitizedBodyPreview.includes("[REDACTED]"), "Should show [REDACTED]");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Section 3: AdminService integration tests ──────────────────────────────

test("AdminService createJenniMerchant blocked if gate is false", async () => {
  const adminMod = await import("../dist/modules/admin/admin.service.js");

  const mockConfig = {
    get(key) {
      if (key === "JENNI_ALLOW_MERCHANT_PROVISIONING") return "false";
      return null;
    }
  };

  const mockMerchantProvisioning = {
    getProvisioningStatus: async () => ({}),
  };

  // Mock AdminService constructor dependencies using 16-param array
  const args = Array(16).fill(null);
  args[12] = mockMerchantProvisioning; // jenniMerchantProvisioningService
  args[15] = mockConfig; // configService

  const adminService = new adminMod.AdminService(...args);

  await assert.rejects(
    () => adminService.createJenniMerchant("merchant-uuid", { actorId: "admin-1", actorRole: "admin" }),
    (err) => {
      assert.equal(err.status, 403);
      assert.ok(err.message.includes("disabled"), `Should say disabled: ${err.message}`);
      return true;
    }
  );
});

test("AdminService createJenniMerchant success logs audit and does NOT trigger store provisioning", async () => {
  const adminMod = await import("../dist/modules/admin/admin.service.js");

  const mockConfig = {
    get(key) {
      if (key === "JENNI_ALLOW_MERCHANT_PROVISIONING") return "true";
      return null;
    }
  };

  let ensureMerchantCalled = false;
  const mockMerchantProvisioning = {
    ensureMerchantForMerchant: async (merchantId, attemptId) => {
      ensureMerchantCalled = true;
      return { jenni_merchant_id: "m-audit-123", was_created: true };
    }
  };

  const auditLogs = [];
  const mockAudit = {
    log: async (logInput) => {
      auditLogs.push(logInput);
    }
  };

  // Mock AdminService constructor dependencies using 16-param array
  const args = Array(16).fill(null);
  args[1] = mockAudit; // auditService
  args[12] = mockMerchantProvisioning; // jenniMerchantProvisioningService
  args[15] = mockConfig; // configService

  const adminService = new adminMod.AdminService(...args);

  const result = await adminService.createJenniMerchant("merchant-uuid", { actorId: "admin-1", actorRole: "admin" });

  assert.equal(result.ok, true);
  assert.equal(result.jenni_merchant_id, "m-audit-123");
  assert.equal(result.was_created, true);
  assert.equal(ensureMerchantCalled, true);

  // Check audit log
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].eventType, "JENNI_MERCHANT_PROVISIONED");
  assert.equal(auditLogs[0].resource.id, "merchant-uuid");
  assert.equal(auditLogs[0].payload.jenni_merchant_id, "m-audit-123");
});

test("JenniAuthService token source selection diagnostics", async () => {
  const authMod = await import("../dist/modules/jenni/jenni-auth.service.js");
  
  const mockConfig = {
    get(key) {
      if (key === "JENNI_API_BASE_URL") return "https://mock-jenni.api";
      if (key === "JENNI_USERNAME") return "user";
      if (key === "JENNI_PASSWORD") return "pwd";
      if (key === "JENNI_SYSTEM_CODE") return "STYL_AI";
      if (key === "JENNI_DIAGNOSTICS_ENABLED") return "true";
      return null;
    }
  };

  const originalFetch = globalThis.fetch;
  
  try {
    // 1. Response has 'token'
    const tokenVal1 = "my.secret.token.value.1";
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({
        token: tokenVal1,
        expiresIn: 1800,
      }),
    });

    const authService1 = new authMod.JenniAuthService(mockConfig);
    const diag1 = await authService1.diagnoseAuth();
    
    assert.equal(diag1.result, "AUTH_OK");
    assert.ok(diag1.safeMetadata);
    assert.equal(diag1.safeMetadata.selected_token_source, "token");
    assert.equal(diag1.safeMetadata.selected_token_length, tokenVal1.length);
    assert.equal(diag1.safeMetadata.selected_token_dot_count, 4);
    assert.equal(diag1.safeMetadata.expires_in, 1800);
    
    // Assert that returned diagnostics never contain actual token strings
    const serializedDiag1 = JSON.stringify(diag1);
    assert.ok(!serializedDiag1.includes(tokenVal1), "Should not leak token in returned metadata");

    // 2. Response has 'access_token'
    const tokenVal2 = "my.secret.access.token.2";
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({
        access_token: tokenVal2,
        expires_in: 7200,
      }),
    });

    const authService2 = new authMod.JenniAuthService(mockConfig);
    const diag2 = await authService2.diagnoseAuth();
    
    assert.equal(diag2.result, "AUTH_OK");
    assert.ok(diag2.safeMetadata);
    assert.equal(diag2.safeMetadata.selected_token_source, "access_token");
    assert.equal(diag2.safeMetadata.selected_token_length, tokenVal2.length);
    assert.equal(diag2.safeMetadata.selected_token_dot_count, 4);
    assert.equal(diag2.safeMetadata.expires_in, 7200);

    const serializedDiag2 = JSON.stringify(diag2);
    assert.ok(!serializedDiag2.includes(tokenVal2), "Should not leak token in returned metadata");

    // 3. Response has 'accessToken'
    const tokenVal3 = "my.secret.accessToken.value.3";
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({
        accessToken: tokenVal3,
      }),
    });

    const authService3 = new authMod.JenniAuthService(mockConfig);
    const diag3 = await authService3.diagnoseAuth();
    
    assert.equal(diag3.result, "AUTH_OK");
    assert.ok(diag3.safeMetadata);
    assert.equal(diag3.safeMetadata.selected_token_source, "accessToken");
    assert.equal(diag3.safeMetadata.selected_token_length, tokenVal3.length);
    assert.equal(diag3.safeMetadata.selected_token_dot_count, 4);

    const serializedDiag3 = JSON.stringify(diag3);
    assert.ok(!serializedDiag3.includes(tokenVal3), "Should not leak token in returned metadata");

  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("JenniAuthService bearer token normalization and outgoing request headers", async () => {
  const authMod = await import("../dist/modules/jenni/jenni-auth.service.js");
  const clientMod = await import("../dist/modules/jenni/jenni-client.service.js");

  const mockConfig = {
    get(key) {
      if (key === "JENNI_API_BASE_URL") return "https://mock-jenni.api";
      if (key === "JENNI_USERNAME") return "user";
      if (key === "JENNI_PASSWORD") return "pwd";
      if (key === "JENNI_SYSTEM_CODE") return "STYL_AI";
      if (key === "JENNI_DIAGNOSTICS_ENABLED") return "true";
      return null;
    }
  };

  const originalFetch = globalThis.fetch;

  try {
    // 1. Login with 'token' prefixed by 'Bearer '
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        token: "Bearer eyJ.my.test.token.with.bearer.1",
        expiresIn: 1800,
        refreshToken: "Bearer my.refresh.token.1"
      }),
      text: async () => JSON.stringify({
        token: "Bearer eyJ.my.test.token.with.bearer.1",
        expiresIn: 1800,
        refreshToken: "Bearer my.refresh.token.1"
      }),
    });

    const authService1 = new authMod.JenniAuthService(mockConfig);
    
    // Test diagnoseAuth
    const diag1 = await authService1.diagnoseAuth();
    assert.equal(diag1.result, "AUTH_OK");
    assert.ok(diag1.safeMetadata);
    assert.equal(diag1.safeMetadata.selected_token_had_bearer_prefix, true);
    assert.equal(diag1.safeMetadata.selected_token_starts_with_bearer_after_normalization, false);
    assert.equal(diag1.safeMetadata.selected_token_length, "eyJ.my.test.token.with.bearer.1".length);
    assert.equal(JSON.stringify(diag1).includes("Bearer"), false, "Diagnostics should not leak prefix or token");
    assert.equal(JSON.stringify(diag1).includes("eyJ"), false, "Diagnostics should not leak token value");

    // Test login() cache population
    const cachedToken1 = await authService1.getAccessToken();
    assert.equal(cachedToken1, "eyJ.my.test.token.with.bearer.1");
    assert.ok(!cachedToken1.startsWith("Bearer "));

    // 2. Login with 'access_token' prefixed by 'Bearer '
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        access_token: "bearer eyJ.my.test.token.with.bearer.2",
        expires_in: 3600,
      }),
      text: async () => JSON.stringify({
        access_token: "bearer eyJ.my.test.token.with.bearer.2",
        expires_in: 3600,
      }),
    });

    const authService2 = new authMod.JenniAuthService(mockConfig);
    const cachedToken2 = await authService2.getAccessToken();
    assert.equal(cachedToken2, "eyJ.my.test.token.with.bearer.2");

    // 3. Login with 'accessToken' prefixed by 'Bearer '
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        accessToken: "BEARER eyJ.my.test.token.with.bearer.3",
      }),
      text: async () => JSON.stringify({
        accessToken: "BEARER eyJ.my.test.token.with.bearer.3",
      }),
    });

    const authService3 = new authMod.JenniAuthService(mockConfig);
    const cachedToken3 = await authService3.getAccessToken();
    assert.equal(cachedToken3, "eyJ.my.test.token.with.bearer.3");

    // 4. Token refresh normalization
    globalThis.fetch = async (url, opts) => {
      if (url.includes("/v2/auth/refresh")) {
        assert.equal(opts.headers.Authorization, "Bearer my-refresh-token");
        return {
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => ({
            token: "Bearer eyJ.refreshed.access.token",
            refreshToken: "Bearer my-next-refresh-token",
            expiresIn: 3600
          }),
          text: async () => JSON.stringify({
            token: "Bearer eyJ.refreshed.access.token",
            refreshToken: "Bearer my-next-refresh-token",
            expiresIn: 3600
          })
        };
      }
      return { ok: false };
    };

    const authServiceRefresh = new authMod.JenniAuthService(mockConfig);
    authServiceRefresh.cache = {
      accessToken: "old-access-token",
      refreshToken: "my-refresh-token",
      expiresAtMs: Date.now() - 5000 // expired
    };

    const tokenAfterRefresh = await authServiceRefresh.getAccessToken();
    assert.equal(tokenAfterRefresh, "eyJ.refreshed.access.token");
    assert.equal(authServiceRefresh.cache.refreshToken, "my-next-refresh-token");

    // 5. Verify outgoing Request Header in JenniClientService is exactly Bearer eyJ...
    let fetchHeaders = null;
    globalThis.fetch = async (url, opts) => {
      fetchHeaders = opts.headers;
      return {
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ data: [] }),
        text: async () => JSON.stringify({ data: [] }),
      };
    };

    const clientService = new clientMod.JenniClientService(mockConfig, authServiceRefresh);
    await clientService.request({ method: "GET", path: "/v2/merchants/my-stores" });
    
    assert.ok(fetchHeaders);
    assert.equal(fetchHeaders.Authorization, "Bearer eyJ.refreshed.access.token");

  } finally {
    globalThis.fetch = originalFetch;
  }
});
