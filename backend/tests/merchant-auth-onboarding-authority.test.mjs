import test from "node:test";
import assert from "node:assert/strict";

const { MerchantApplicationsService } = await import(
  "../dist/modules/merchant-applications/merchant-applications.service.js"
);
const { MerchantsService } = await import(
  "../dist/modules/merchants/merchants.service.js"
);

function makeMockSupabase() {
  const calls = [];
  const mockData = {
    merchants: [],
    merchant_users: [],
    profiles: [],
    merchant_settings: [],
  };
  const mockErrors = {};

  const client = {
    from(table) {
      let currentData = [...(mockData[table] || [])];
      let pendingUpdate = null;

      const applyPendingUpdate = () => {
        if (!pendingUpdate) return;
        mockData[table] = mockData[table].map(row => {
          const match = currentData.some(curr => curr.id === row.id || (row.user_id && curr.user_id === row.user_id));
          if (match) {
            return { ...row, ...pendingUpdate };
          }
          return row;
        });
        currentData = currentData.map(row => ({ ...row, ...pendingUpdate }));
        pendingUpdate = null;
      };

      const chain = {
        select(fields) {
          calls.push({ table, op: "select", fields });
          applyPendingUpdate();
          return chain;
        },
        eq(col, val) {
          calls.push({ table, op: "eq", col, val });
          currentData = currentData.filter((row) => row[col] === val);
          return chain;
        },
        ilike(col, val) {
          calls.push({ table, op: "ilike", col, val });
          currentData = currentData.filter((row) => String(row[col] || "").toLowerCase() === String(val || "").toLowerCase());
          return chain;
        },
        in(col, vals) {
          calls.push({ table, op: "in", col, vals });
          currentData = currentData.filter((row) => vals.includes(row[col]));
          return chain;
        },
        order(col, opts) {
          calls.push({ table, op: "order", col, opts });
          return chain;
        },
        insert(payload) {
          calls.push({ table, op: "insert", payload });
          const inserted = Array.isArray(payload) ? payload : [payload];
          const withId = inserted.map(row => ({
            id: row.id || `mock-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
            ...row
          }));
          mockData[table] = [...(mockData[table] || []), ...withId];
          currentData = [...withId];
          return chain;
        },
        upsert(payload, opts) {
          calls.push({ table, op: "upsert", payload, opts });
          const upserted = Array.isArray(payload) ? payload : [payload];
          upserted.forEach(item => {
            const index = mockData[table].findIndex(row => (item.id && row.id === item.id) || (item.merchant_id && row.merchant_id === item.merchant_id));
            if (index !== -1) {
              mockData[table][index] = { ...mockData[table][index], ...item };
            } else {
              mockData[table].push(item);
            }
          });
          currentData = [...upserted];
          return chain;
        },
        update(payload) {
          calls.push({ table, op: "update", payload });
          pendingUpdate = payload;
          return chain;
        },
        maybeSingle: async () => {
          calls.push({ table, op: "maybeSingle" });
          applyPendingUpdate();
          if (mockErrors[table]) return { data: null, error: mockErrors[table] };
          return { data: currentData[0] || null, error: null };
        },
        single: async () => {
          calls.push({ table, op: "single" });
          applyPendingUpdate();
          if (mockErrors[table]) return { data: null, error: mockErrors[table] };
          if (currentData.length === 0) return { data: null, error: new Error(`No rows found in ${table}`) };
          return { data: currentData[0], error: null };
        },
        then: (resolve) => {
          applyPendingUpdate();
          return resolve({ data: currentData, error: null });
        },
      };
      return chain;
    },
    auth: {
      admin: {
        createUser: async (payload) => {
          calls.push({ table: "auth", op: "createUser", payload });
          if (mockErrors["auth_create"]) return { data: null, error: mockErrors["auth_create"] };
          return { data: { user: { id: "mock-user-123" } }, error: null };
        },
        deleteUser: async (id) => {
          calls.push({ table: "auth", op: "deleteUser", id });
          return { error: null };
        }
      }
    }
  };

  return {
    supabaseAdmin: { client },
    calls,
    mockData,
    setError(key, err) { mockErrors[key] = err; },
  };
}

test("registerApplication - rejects duplicate slug with SLUG_EXISTS conflict code", async () => {
  const { supabaseAdmin, mockData } = makeMockSupabase();
  mockData.merchants.push({ id: "m-existing", slug: "test-store" });
  const service = new MerchantApplicationsService(supabaseAdmin);

  await assert.rejects(
    async () => {
      await service.registerApplication({
        email: "new@example.com",
        password: "Password123!",
        owner_full_name: "Test Owner",
        owner_phone: "07700000000",
        store_name_ar: "متجر تجريبي",
        store_name_en: "Test Store",
        display_name: "Test Store",
        slug: "test-store",
        city: "Baghdad",
        address: "Mansour",
        contact_phone: "07700000000",
      });
    },
    (err) => {
      assert.equal(err.name, "ConflictException");
      const resp = err.getResponse();
      assert.equal(typeof resp === "object" ? resp.code : null, "SLUG_EXISTS");
      return true;
    }
  );
});

test("registerApplication - rejects existing email with active store with EXISTING_MERCHANT code", async () => {
  const { supabaseAdmin, mockData } = makeMockSupabase();
  mockData.profiles.push({ id: "user-1", email: "merchant@example.com", role: "merchant_owner" });
  mockData.merchants.push({ id: "m-1", status: "active", display_name: "Active Store" });
  mockData.merchant_users.push({ merchant_id: "m-1", user_id: "user-1", role: "owner", merchants: { id: "m-1", status: "active" } });

  const service = new MerchantApplicationsService(supabaseAdmin);

  await assert.rejects(
    async () => {
      await service.registerApplication({
        email: "merchant@example.com",
        password: "Password123!",
        owner_full_name: "Test Owner",
        owner_phone: "07700000000",
        store_name_ar: "متجر جديد",
        store_name_en: "New Store",
        display_name: "New Store",
        slug: "new-unique-slug",
        city: "Baghdad",
        address: "Mansour",
        contact_phone: "07700000000",
      });
    },
    (err) => {
      assert.equal(err.name, "ConflictException");
      const resp = err.getResponse();
      assert.equal(typeof resp === "object" ? resp.code : null, "EXISTING_MERCHANT");
      return true;
    }
  );
});

test("registerApplication - rejects existing email with pending application with EXISTING_APPLICATION code", async () => {
  const { supabaseAdmin, mockData } = makeMockSupabase();
  mockData.profiles.push({ id: "user-2", email: "applicant@example.com", role: "merchant_applicant" });
  mockData.merchants.push({ id: "m-2", status: "pending_review", display_name: "Pending Store" });
  mockData.merchant_users.push({ merchant_id: "m-2", user_id: "user-2", role: "owner", merchants: { id: "m-2", status: "pending_review" } });

  const service = new MerchantApplicationsService(supabaseAdmin);

  await assert.rejects(
    async () => {
      await service.registerApplication({
        email: "applicant@example.com",
        password: "Password123!",
        owner_full_name: "Test Owner",
        owner_phone: "07700000000",
        store_name_ar: "متجر جديد",
        store_name_en: "New Store",
        display_name: "New Store",
        slug: "new-unique-slug-2",
        city: "Baghdad",
        address: "Mansour",
        contact_phone: "07700000000",
      });
    },
    (err) => {
      assert.equal(err.name, "ConflictException");
      const resp = err.getResponse();
      assert.equal(typeof resp === "object" ? resp.code : null, "EXISTING_APPLICATION");
      return true;
    }
  );
});

test("approveMerchant - updates status to active and promotes owner profile to merchant_owner", async () => {
  const { supabaseAdmin, mockData } = makeMockSupabase();
  mockData.merchants.push({ id: "m-approve", status: "pending_review" });
  mockData.merchant_users.push({ merchant_id: "m-approve", user_id: "user-owner-1", role: "owner" });
  mockData.profiles.push({ id: "user-owner-1", role: "merchant_applicant" });

  const service = new MerchantApplicationsService(supabaseAdmin);
  const result = await service.approveMerchant("m-approve", "admin-123");

  assert.equal(result.ok, true);
  const merchant = mockData.merchants.find(m => m.id === "m-approve");
  assert.equal(merchant.status, "active");
  assert.equal(merchant.approved_by, "admin-123");
  assert.notEqual(merchant.approved_at, null);

  const profile = mockData.profiles.find(p => p.id === "user-owner-1");
  assert.equal(profile.role, "merchant_owner", "Owner profile must be promoted to merchant_owner");
});

test("rejectMerchant - updates status to rejected with reason without calling RPC", async () => {
  const { supabaseAdmin, mockData } = makeMockSupabase();
  mockData.merchants.push({ id: "m-reject", status: "pending_review" });

  const service = new MerchantApplicationsService(supabaseAdmin);
  const result = await service.rejectMerchant("m-reject", "وثائق غير مكتملة", "admin-123");

  assert.equal(result.ok, true);
  const merchant = mockData.merchants.find(m => m.id === "m-reject");
  assert.equal(merchant.status, "rejected");
  assert.equal(merchant.rejected_by, "admin-123");
  assert.equal(merchant.rejection_reason, "وثائق غير مكتملة");
});

test("getMyApplicationStatus - prioritizes active merchant membership over pending or rejected", async () => {
  const { supabaseAdmin, mockData } = makeMockSupabase();
  mockData.merchant_users.push(
    {
      merchant_id: "m-pending",
      user_id: "user-multi",
      role: "owner",
      created_at: "2026-09-01T00:00:00Z",
      merchants: { id: "m-pending", status: "pending_review", display_name: "Old Pending" }
    },
    {
      merchant_id: "m-active",
      user_id: "user-multi",
      role: "owner",
      created_at: "2026-08-01T00:00:00Z",
      merchants: { id: "m-active", status: "active", display_name: "Active Main Store" }
    }
  );

  const service = new MerchantApplicationsService(supabaseAdmin);
  const result = await service.getMyApplicationStatus("user-multi");

  assert.equal(result.has_application, true);
  assert.equal(result.merchant.id, "m-active");
  assert.equal(result.merchant.status, "active");
  assert.equal(result.merchant.display_name, "Active Main Store");
});

test("updateMerchantStatus - promotes owner profile from merchant_applicant to merchant_owner upon activation", async () => {
  const { supabaseAdmin, mockData } = makeMockSupabase();
  mockData.merchants.push({ id: "m-activate", status: "pending_review" });
  mockData.merchant_users.push({ merchant_id: "m-activate", user_id: "owner-456", role: "owner" });
  mockData.profiles.push({ id: "owner-456", role: "merchant_applicant" });

  const service = new MerchantsService(supabaseAdmin, null);

  // Mock computeReadinessByMerchantId to return passing readiness
  service.computeReadinessByMerchantId = async () => ({
    checklist: [],
    commercial_agreement_configured: true,
  });

  const result = await service.updateMerchantStatus("m-activate", { status: "active" });
  assert.equal(result.ok, true);

  const profile = mockData.profiles.find(p => p.id === "owner-456");
  assert.equal(profile.role, "merchant_owner", "Owner profile must be upgraded to merchant_owner on status=active");
});
