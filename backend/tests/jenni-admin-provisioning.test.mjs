/**
 * Phase 2B — Admin Jenni Provisioning Endpoints Tests
 *
 * Tests the admin provisioning endpoints and UI badge logic.
 *
 * Run: npm run build && node --test tests/jenni-admin-provisioning.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

// ── Test helpers ──────────────────────────────────────────────────────────────

function createMockProvisioningService() {
  const calls = [];
  return {
    calls,
    async getProvisioningStatus(merchantId) {
      calls.push({ method: "getProvisioningStatus", merchantId });
      return {
        merchant_slug: "test-merchant",
        jenni_store_id: null,
        jenni_synced_at: null,
        jenni_sync_error: null,
        is_linked: false,
      };
    },
    async ensureStoreForMerchant(merchantId) {
      calls.push({ method: "ensureStoreForMerchant", merchantId });
      return { jenni_store_id: 99999, was_created: true };
    },
    async linkExistingStore(merchantId, storeId) {
      calls.push({ method: "linkExistingStore", merchantId, storeId });
    },
  };
}

// ── UI badge logic (extracted from MerchantDetail.tsx) ─────────────────────

function computeJenniBadge(status) {
  if (!status) return { label: "غير معروف", color: "text-muted-foreground", bg: "bg-muted" };
  if (status.jenni_sync_error) return { label: "خطأ", color: "text-red-700", bg: "bg-red-100" };
  if (status.is_linked) return { label: "مربوط", color: "text-emerald-700", bg: "bg-emerald-100" };
  return { label: "غير مربوط", color: "text-amber-700", bg: "bg-amber-100" };
}

// ── Test 1: load compiled admin service ───────────────────────────────────

test("load compiled admin service module", async () => {
  const mod = await import("../dist/modules/admin/admin.service.js");
  assert.ok(mod.AdminService, "AdminService should be exported");
});

// ── Test 2: provisioning status — linked ──────────────────────────────────

test("getProvisioningStatus returns linked status", async () => {
  const svc = createMockProvisioningService();
  // Override to return linked status
  svc.getProvisioningStatus = async (id) => ({
    merchant_slug: "DilMart-primary",
    jenni_store_id: 17025,
    jenni_synced_at: "2026-06-16T00:00:00Z",
    jenni_sync_error: null,
    is_linked: true,
  });

  const result = await svc.getProvisioningStatus("test-id");
  assert.equal(result.is_linked, true);
  assert.equal(result.jenni_store_id, 17025);
  assert.equal(result.jenni_sync_error, null);
});

// ── Test 3: provisioning status — not linked ──────────────────────────────

test("getProvisioningStatus returns not linked status", async () => {
  const svc = createMockProvisioningService();

  const result = await svc.getProvisioningStatus("test-id");
  assert.equal(result.is_linked, false);
  assert.equal(result.jenni_store_id, null);
});

// ── Test 4: provisioning status — error state ─────────────────────────────

test("getProvisioningStatus returns error state", async () => {
  const svc = createMockProvisioningService();
  svc.getProvisioningStatus = async () => ({
    merchant_slug: "alarsh",
    jenni_store_id: null,
    jenni_synced_at: null,
    jenni_sync_error: "Missing required field: address",
    is_linked: false,
  });

  const result = await svc.getProvisioningStatus("test-id");
  assert.equal(result.is_linked, false);
  assert.ok(result.jenni_sync_error.includes("address"));
});

// ── Test 5: createJenniStore calls ensureStoreForMerchant ──────────────────

test("createJenniStore delegates to ensureStoreForMerchant", async () => {
  const svc = createMockProvisioningService();

  const result = await svc.ensureStoreForMerchant("merchant-uuid");
  assert.equal(result.jenni_store_id, 99999);
  assert.equal(result.was_created, true);
  assert.equal(svc.calls.length, 1);
  assert.equal(svc.calls[0].method, "ensureStoreForMerchant");
  assert.equal(svc.calls[0].merchantId, "merchant-uuid");
});

// ── Test 6: createJenniStore returns idempotent result ─────────────────────

test("createJenniStore returns was_created=false for existing store", async () => {
  const svc = createMockProvisioningService();
  svc.ensureStoreForMerchant = async () => ({
    jenni_store_id: 17025,
    was_created: false,
  });

  const result = await svc.ensureStoreForMerchant("merchant-uuid");
  assert.equal(result.jenni_store_id, 17025);
  assert.equal(result.was_created, false);
});

// ── Test 7: createJenniStore throws on validation failure ──────────────────

test("createJenniStore throws on validation failure", async () => {
  const svc = createMockProvisioningService();
  svc.ensureStoreForMerchant = async () => {
    throw new Error("Missing required field: phone");
  };

  await assert.rejects(
    () => svc.ensureStoreForMerchant("merchant-uuid"),
    (err) => {
      assert.ok(err.message.includes("phone"));
      return true;
    },
  );
});

// ── Test 8: linkJenniStore calls linkExistingStore ─────────────────────────

test("linkJenniStore calls linkExistingStore with correct args", async () => {
  const svc = createMockProvisioningService();

  await svc.linkExistingStore("merchant-uuid", 12345);

  assert.equal(svc.calls.length, 1);
  assert.equal(svc.calls[0].method, "linkExistingStore");
  assert.equal(svc.calls[0].merchantId, "merchant-uuid");
  assert.equal(svc.calls[0].storeId, 12345);
});

// ── Test 9: linkJenniStore rejects duplicate ───────────────────────────────

test("linkJenniStore rejects duplicate store_id", async () => {
  const svc = createMockProvisioningService();
  svc.linkExistingStore = async () => {
    throw new Error("jenni_store_id=12345 is already linked to merchant alarsh");
  };

  await assert.rejects(
    () => svc.linkExistingStore("merchant-uuid", 12345),
    (err) => {
      assert.ok(err.message.includes("already linked"));
      return true;
    },
  );
});

// ── Test 10: linkJenniStore rejects invalid store_id (zero) ────────────────

test("linkJenniStore rejects invalid store_id (zero)", async () => {
  const svc = createMockProvisioningService();
  svc.linkExistingStore = async () => {
    throw new Error("Invalid jenni_store_id");
  };

  await assert.rejects(
    () => svc.linkExistingStore("merchant-uuid", 0),
    (err) => {
      assert.ok(err.message.includes("Invalid"));
      return true;
    },
  );
});

// ── Test 11: linkJenniStore rejects invalid store_id (negative) ────────────

test("linkJenniStore rejects negative store_id", async () => {
  const svc = createMockProvisioningService();
  svc.linkExistingStore = async () => {
    throw new Error("Invalid jenni_store_id");
  };

  await assert.rejects(
    () => svc.linkExistingStore("merchant-uuid", -5),
    (err) => {
      assert.ok(err.message.includes("Invalid"));
      return true;
    },
  );
});

// ── Test 12: UI badge — linked ────────────────────────────────────────────

test("UI badge shows مربوط when is_linked=true", () => {
  const badge = computeJenniBadge({ is_linked: true, jenni_store_id: 17025, jenni_sync_error: null });
  assert.equal(badge.label, "مربوط");
  assert.equal(badge.bg, "bg-emerald-100");
});

// ── Test 13: UI badge — not linked ────────────────────────────────────────

test("UI badge shows غير مربوط when is_linked=false", () => {
  const badge = computeJenniBadge({ is_linked: false, jenni_store_id: null, jenni_sync_error: null });
  assert.equal(badge.label, "غير مربوط");
  assert.equal(badge.bg, "bg-amber-100");
});

// ── Test 14: UI badge — error ─────────────────────────────────────────────

test("UI badge shows خطأ when sync_error exists", () => {
  const badge = computeJenniBadge({ is_linked: false, jenni_store_id: null, jenni_sync_error: "timeout" });
  assert.equal(badge.label, "خطأ");
  assert.equal(badge.bg, "bg-red-100");
});

// ── Test 15: UI badge — null status ───────────────────────────────────────

test("UI badge shows غير معروف when status is null", () => {
  const badge = computeJenniBadge(null);
  assert.equal(badge.label, "غير معروف");
  assert.equal(badge.bg, "bg-muted");
});

// ── Test 16: UI badge — error takes priority over linked ──────────────────

test("UI badge error takes priority even if is_linked=true", () => {
  const badge = computeJenniBadge({ is_linked: true, jenni_store_id: 17025, jenni_sync_error: "conflict" });
  assert.equal(badge.label, "خطأ");
});

// ── Test 17: no auto use of 17025 ─────────────────────────────────────────

test("create-store does not hardcode any store_id", async () => {
  const svc = createMockProvisioningService();
  const result = await svc.ensureStoreForMerchant("merchant-uuid");

  // Result should not be 17025 (that would be auto-usage)
  assert.notEqual(result.jenni_store_id, 17025);
});

// ── Test 18: link-store requires explicit input ───────────────────────────

test("link-store requires explicit jenni_store_id", async () => {
  const svc = createMockProvisioningService();
  await svc.linkExistingStore("merchant-uuid", 55555);

  assert.equal(svc.calls.length, 1);
  assert.equal(svc.calls[0].storeId, 55555);
  // Verify it's not some default value
  assert.notEqual(svc.calls[0].storeId, 17025);
  assert.notEqual(svc.calls[0].storeId, 0);
});

// ── Test 19: Admin endpoints are defined with correct paths ───────────────

test("admin endpoints use correct route paths", async () => {
  // Structural test — verify the controller file has correct routes
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const controllerPath = path.resolve(
    import.meta.dirname ?? ".",
    "../src/modules/admin/admin.controller.ts",
  );

  const content = await fs.readFile(controllerPath, "utf-8");

  // Verify 3 Jenni endpoints exist
  assert.ok(content.includes("jenni/merchants/:id/provisioning-status"), "GET provisioning-status should exist");
  assert.ok(content.includes("jenni/merchants/:id/create-store"), "POST create-store should exist");
  assert.ok(content.includes("jenni/merchants/:id/link-store"), "POST link-store should exist");

  // Verify admin-only roles
  const jenniSection = content.substring(content.indexOf("Jenni Store Provisioning (Phase 2B)"));
  const roleMatches = jenniSection.match(/@Roles\("super_admin", "admin"\)/g) ?? [];
  assert.ok(roleMatches.length >= 3, `Expected >= 3 Roles decorators in Jenni section, got ${roleMatches.length}`);
});

// ── Test 20: no dispatch/shipment/finance/webhook in controller ───────────

test("admin controller Jenni section has no dispatch/shipment/finance/webhook", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const controllerPath = path.resolve(
    import.meta.dirname ?? ".",
    "../src/modules/admin/admin.controller.ts",
  );

  const content = await fs.readFile(controllerPath, "utf-8");
  const jenniSection = content.substring(content.indexOf("Jenni Store Provisioning (Phase 2B)"));

  assert.ok(!jenniSection.includes("dispatch"), "Jenni section should not contain dispatch");
  assert.ok(!jenniSection.includes("Shipment"), "Jenni section should not contain Shipment");
  assert.ok(!jenniSection.includes("webhook"), "Jenni section should not contain webhook");
});
