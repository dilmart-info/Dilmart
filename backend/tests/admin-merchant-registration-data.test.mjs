import test from "node:test";
import assert from "node:assert/strict";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

const { MerchantApplicationsService } = await import(
  "../dist/modules/merchant-applications/merchant-applications.service.js"
);
const { MerchantsService } = await import(
  "../dist/modules/merchants/merchants.service.js"
);
const { UpdateMerchantRegistrationDetailsDto } = await import(
  "../dist/modules/merchants/merchants.dto.js"
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

      const chain = {
        select(fields) {
          calls.push({ table, op: "select", fields });
          return chain;
        },
        eq(col, val) {
          calls.push({ table, op: "eq", col, val });
          currentData = currentData.filter((row) => row[col] === val);
          return chain;
        },
        order(col, opts) {
          calls.push({ table, op: "order", col, opts });
          const ascending = opts?.ascending !== false;
          currentData = [...currentData].sort((a, b) => {
            const valA = a[col];
            const valB = b[col];
            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;
            if (valA < valB) return ascending ? -1 : 1;
            if (valA > valB) return ascending ? 1 : -1;
            return 0;
          });
          return chain;
        },
        limit(val) {
          calls.push({ table, op: "limit", val });
          currentData = currentData.slice(0, val);
          return chain;
        },
        insert(payload) {
          calls.push({ table, op: "insert", payload });
          const inserted = Array.isArray(payload) ? payload : [payload];
          const withId = inserted.map(row => ({
            id: row.id || "merchant-123",
            ...row
          }));
          mockData[table] = [...(mockData[table] || []), ...withId];
          currentData = [...withId];
          return chain;
        },
        upsert(payload, opts) {
          calls.push({ table, op: "upsert", payload, opts });
          const upserted = Array.isArray(payload) ? payload : [payload];
          // Replace or append
          upserted.forEach(item => {
            const index = mockData[table].findIndex(row => row.merchant_id === item.merchant_id);
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
          const updated = Array.isArray(payload) ? payload : [payload];
          // Apply updates to filtered elements in mockData
          mockData[table] = mockData[table].map(row => {
            const match = currentData.some(curr => curr.id === row.id);
            if (match) {
              return { ...row, ...payload };
            }
            return row;
          });
          currentData = currentData.map(row => ({ ...row, ...payload }));
          return chain;
        },
        maybeSingle: async () => {
          calls.push({ table, op: "maybeSingle" });
          if (mockErrors[table]) {
            return { data: null, error: mockErrors[table] };
          }
          return { data: currentData[0] || null, error: null };
        },
        single: async () => {
          calls.push({ table, op: "single" });
          if (mockErrors[table]) {
            return { data: null, error: mockErrors[table] };
          }
          if (currentData.length === 0) {
            return { data: null, error: new Error(`No rows found in ${table}`) };
          }
          return { data: currentData[0], error: null };
        },
      };
      return chain;
    },
    auth: {
      admin: {
        createUser: async (payload) => {
          calls.push({ table: "auth", op: "createUser", payload });
          if (mockErrors["auth_create"]) {
            return { data: null, error: mockErrors["auth_create"] };
          }
          return { data: { user: { id: "mock-user-uuid" } }, error: null };
        },
        deleteUser: async (id) => {
          calls.push({ table: "auth", op: "deleteUser", id });
          return { data: {}, error: null };
        },
      },
    },
  };

  const supabaseAdmin = { client };

  return {
    supabaseAdmin,
    calls,
    setMerchantsData: (d) => { mockData.merchants = Array.isArray(d) ? d : [d]; },
    setMerchantUsersData: (d) => { mockData.merchant_users = Array.isArray(d) ? d : [d]; },
    setProfilesData: (d) => { mockData.profiles = Array.isArray(d) ? d : [d]; },
    setSettingsData: (d) => { mockData.merchant_settings = Array.isArray(d) ? d : [d]; },
    setError: (table, err) => { mockErrors[table] = err; },
    clearCalls: () => { calls.length = 0; },
  };
}

// ── BACKEND REGISTRATION TESTS (PRESERVED & STRENGTHENED) ──────────────────

test("MerchantApplicationsService - Registration persists trimmed business_type", async () => {
  const { supabaseAdmin, calls } = makeMockSupabase();
  const service = new MerchantApplicationsService(supabaseAdmin);

  const payload = {
    email: "test@example.com",
    password: "password123",
    owner_full_name: "John Doe",
    owner_phone: "07701234567",
    store_name_ar: "متجري",
    store_name_en: "My Store",
    display_name: "My Store",
    slug: "my-store",
    city: "Baghdad",
    address: "Karrada",
    contact_phone: "07701234567",
    business_type: "  retail-perfumes  ",
    description: "Store description",
  };

  const result = await service.registerApplication(payload);
  assert.ok(result.ok);

  const insertCall = calls.find((c) => c.table === "merchants" && c.op === "insert");
  assert.ok(insertCall);
  assert.equal(insertCall.payload.business_type, "retail-perfumes");
});

test("MerchantApplicationsService - Registration persists null business_type when blank", async () => {
  const { supabaseAdmin, calls } = makeMockSupabase();
  const service = new MerchantApplicationsService(supabaseAdmin);

  const payload = {
    email: "test1@example.com",
    password: "password123",
    owner_full_name: "John Doe",
    owner_phone: "07701234567",
    store_name_ar: "متجري",
    store_name_en: "My Store",
    display_name: "My Store",
    slug: "my-store",
    city: "Baghdad",
    address: "Karrada",
    contact_phone: "07701234567",
    business_type: "   ",
  };

  const result = await service.registerApplication(payload);
  assert.ok(result.ok);

  const insertCall = calls.find((c) => c.table === "merchants" && c.op === "insert");
  assert.ok(insertCall);
  assert.equal(insertCall.payload.business_type, null);
});

test("MerchantApplicationsService - Registration persists null business_type when omitted", async () => {
  const { supabaseAdmin, calls } = makeMockSupabase();
  const service = new MerchantApplicationsService(supabaseAdmin);

  const payload = {
    email: "test2@example.com",
    password: "password123",
    owner_full_name: "John Doe",
    owner_phone: "07701234567",
    store_name_ar: "متجري",
    store_name_en: "My Store",
    display_name: "My Store",
    slug: "my-store",
    city: "Baghdad",
    address: "Karrada",
    contact_phone: "07701234567",
  };

  const result = await service.registerApplication(payload);
  assert.ok(result.ok);

  const insertCall = calls.find((c) => c.table === "merchants" && c.op === "insert");
  assert.ok(insertCall);
  assert.equal(insertCall.payload.business_type, null);
});

// ── BACKEND GET BY ID TESTS (PRESERVED & STRENGTHENED) ──────────────────

test("MerchantsService - getMerchantById selects earliest owner from multiple owners", async () => {
  const {
    supabaseAdmin,
    setMerchantsData,
    setMerchantUsersData,
    setProfilesData,
    setSettingsData,
  } = makeMockSupabase();

  const service = new MerchantsService(supabaseAdmin, null);

  setMerchantsData({
    id: "merchant-123",
    slug: "my-store",
    name_ar: "متجري",
    name_en: "My Store",
    display_name: "My Store",
    description: "Store description",
    business_type: "retail",
    status: "draft",
    submitted_at: "2026-08-05T12:00:00Z",
  });

  setMerchantUsersData([
    { merchant_id: "merchant-123", user_id: "user-newest", role: "owner", created_at: "2026-08-03T10:00:00Z" },
    { merchant_id: "merchant-123", user_id: "user-oldest", role: "owner", created_at: "2026-08-01T10:00:00Z" },
    { merchant_id: "merchant-123", user_id: "user-other", role: "staff", created_at: "2026-08-01T09:00:00Z" },
  ]);

  setProfilesData([
    { id: "user-oldest", email: "oldest@example.com", full_name: "Oldest Owner", phone: "07701111111" },
    { id: "user-newest", email: "newest@example.com", full_name: "Newest Owner", phone: "07702222222" },
  ]);

  setSettingsData({
    merchant_id: "merchant-123",
    city: "Baghdad",
    address: "Karrada",
    contact_phone: "07709999999",
    whatsapp_phone: "07705555555",
    support_email: "support@example.com",
  });

  const result = await service.getMerchantById("merchant-123");
  assert.ok(result);
  const reg = result.registration_details;
  assert.ok(reg);

  assert.equal(reg.applicant_user_id, "user-oldest");
  assert.equal(reg.email, "oldest@example.com");
  assert.equal(reg.owner_full_name, "Oldest Owner");
  assert.equal(reg.owner_phone, "07701111111");
  assert.equal(reg.whatsapp_phone, "07705555555");
});

// ── BACKEND PATCH REGISTRATION-DETAILS ENDPOINT TESTS (NEW) ──────────────────

test("DTO Validation - Rejects prohibited fields", async () => {
  const prohibitedFields = ["email", "password", "slug", "status", "user_id", "submitted_at"];

  for (const field of prohibitedFields) {
    const payload = {
      merchant: { name_ar: "جديد" },
      [field]: "prohibited-value"
    };

    const dto = plainToInstance(UpdateMerchantRegistrationDetailsDto, payload);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    assert.ok(errors.length > 0, `Should reject when ${field} is present`);
    const badProps = errors.map(e => e.property);
    assert.ok(badProps.includes(field), `Validation errors should include ${field}`);
  }
});

test("MerchantsService - PATCH endpoint - safe updates and whitespace trimming", async () => {
  const {
    supabaseAdmin,
    setMerchantsData,
    setMerchantUsersData,
    setProfilesData,
    setSettingsData,
    calls,
  } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  setMerchantsData({
    id: "merchant-123",
    name_ar: "القديم",
    name_en: "Old",
    display_name: "Old Display"
  });
  setMerchantUsersData({ merchant_id: "merchant-123", user_id: "user-abc", role: "owner" });
  setProfilesData({ id: "user-abc", full_name: "Old Owner" });
  setSettingsData({ merchant_id: "merchant-123", city: "Old City" });

  const payload = {
    merchant: {
      name_ar: "  الجديد  ",
      name_en: "  New  ",
      display_name: "  New Display  "
    },
    settings: {
      city: "  New City  ",
      whatsapp_phone: "  07708888888  "
    },
    owner: {
      full_name: "  New Owner  "
    }
  };

  const result = await service.updateMerchantRegistrationDetails("merchant-123", payload);
  assert.ok(result);

  const merchantUpdateCall = calls.find(c => c.table === "merchants" && c.op === "update");
  assert.ok(merchantUpdateCall);
  assert.equal(merchantUpdateCall.payload.name_ar, "الجديد");
  assert.equal(merchantUpdateCall.payload.name_en, "New");
  assert.equal(merchantUpdateCall.payload.display_name, "New Display");

  const settingsUpsertCall = calls.find(c => c.table === "merchant_settings" && c.op === "upsert");
  assert.ok(settingsUpsertCall);
  assert.equal(settingsUpsertCall.payload.city, "New City");
  assert.equal(settingsUpsertCall.payload.whatsapp_phone, "07708888888");

  const profileUpdateCall = calls.find(c => c.table === "profiles" && c.op === "update");
  assert.ok(profileUpdateCall);
  assert.equal(profileUpdateCall.payload.full_name, "New Owner");
});

test("MerchantsService - PATCH endpoint - rejects blank required fields", async () => {
  const { supabaseAdmin, setMerchantsData } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  setMerchantsData({ id: "merchant-123" });

  const payload = {
    merchant: {
      name_ar: "   " // blank required
    }
  };

  await assert.rejects(
    async () => {
      await service.updateMerchantRegistrationDetails("merchant-123", payload);
    },
    /name_ar is required/
  );
});

test("MerchantsService - PATCH endpoint - blank nullable fields become null", async () => {
  const {
    supabaseAdmin,
    setMerchantsData,
    setMerchantUsersData,
    setProfilesData,
    setSettingsData,
    calls
  } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  setMerchantsData({ id: "merchant-123" });
  setMerchantUsersData({ merchant_id: "merchant-123", user_id: "user-abc", role: "owner" });
  setProfilesData({ id: "user-abc" });
  setSettingsData({ merchant_id: "merchant-123" });

  const payload = {
    merchant: {
      description: "   ", // blank nullable
      business_type: ""   // blank nullable
    },
    settings: {
      city: "   " // blank nullable
    },
    owner: {
      phone: "   " // blank nullable
    }
  };

  await service.updateMerchantRegistrationDetails("merchant-123", payload);

  const merchantUpdateCall = calls.find(c => c.table === "merchants" && c.op === "update");
  assert.ok(merchantUpdateCall);
  assert.equal(merchantUpdateCall.payload.description, null);
  assert.equal(merchantUpdateCall.payload.business_type, null);

  const settingsUpsertCall = calls.find(c => c.table === "merchant_settings" && c.op === "upsert");
  assert.ok(settingsUpsertCall);
  assert.equal(settingsUpsertCall.payload.city, null);

  const profileUpdateCall = calls.find(c => c.table === "profiles" && c.op === "update");
  assert.ok(profileUpdateCall);
  assert.equal(profileUpdateCall.payload.phone, null);
});

test("MerchantsService - PATCH endpoint - omitted fields preserve existing values", async () => {
  const {
    supabaseAdmin,
    setMerchantsData,
    calls
  } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  setMerchantsData({ id: "merchant-123" });

  const payload = {
    merchant: {
      name_ar: "الاسم الجديد"
      // description is omitted
    }
  };

  await service.updateMerchantRegistrationDetails("merchant-123", payload);

  const merchantUpdateCall = calls.find(c => c.table === "merchants" && c.op === "update");
  assert.ok(merchantUpdateCall);
  assert.equal(merchantUpdateCall.payload.name_ar, "الاسم الجديد");
  assert.equal(merchantUpdateCall.payload.description, undefined); // omitted, preserves DB value
});

test("MerchantsService - PATCH endpoint - owner payload with no owner membership fails", async () => {
  const {
    supabaseAdmin,
    setMerchantsData,
    setMerchantUsersData,
  } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  setMerchantsData({ id: "merchant-123" });
  setMerchantUsersData([]); // no owner membership

  const payload = {
    owner: {
      full_name: "المالك الجديد"
    }
  };

  await assert.rejects(
    async () => {
      await service.updateMerchantRegistrationDetails("merchant-123", payload);
    },
    /No owner membership exists/
  );
});

test("MerchantsService - PATCH endpoint - owner payload with missing profile fails", async () => {
  const {
    supabaseAdmin,
    setMerchantsData,
    setMerchantUsersData,
    setProfilesData,
  } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  setMerchantsData({ id: "merchant-123" });
  setMerchantUsersData({ merchant_id: "merchant-123", user_id: "user-abc", role: "owner" });
  setProfilesData([]); // profile is missing!

  const payload = {
    owner: {
      full_name: "المالك الجديد"
    }
  };

  await assert.rejects(
    async () => {
      await service.updateMerchantRegistrationDetails("merchant-123", payload);
    },
    /Owner profile not found/
  );
});

test("MerchantsService - PATCH endpoint - merchant-not-found returns NotFoundException", async () => {
  const { supabaseAdmin } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  const payload = {
    merchant: { name_ar: "اسم جديد" }
  };

  await assert.rejects(
    async () => {
      await service.updateMerchantRegistrationDetails("merchant-999", payload);
    },
    (err) => {
      assert.equal(err.name, "NotFoundException");
      assert.equal(err.message, "Merchant not found.");
      assert.equal(err.getStatus?.(), 404);
      return true;
    }
  );
});

test("MerchantsService - PATCH endpoint - no auth-admin calls are made", async () => {
  const {
    supabaseAdmin,
    setMerchantsData,
    setMerchantUsersData,
    setProfilesData,
    calls,
  } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  setMerchantsData({ id: "merchant-123" });
  setMerchantUsersData({ merchant_id: "merchant-123", user_id: "user-abc", role: "owner" });
  setProfilesData({ id: "user-abc" });

  const payload = {
    owner: { full_name: "اسم جديد" }
  };

  await service.updateMerchantRegistrationDetails("merchant-123", payload);

  const authCall = calls.find(c => c.table === "auth");
  assert.equal(authCall, undefined, "No auth admin calls should occur");
});

test("MerchantsService - getMerchantById propagates errors", async () => {
  const { supabaseAdmin, setError } = makeMockSupabase();
  const service = new MerchantsService(supabaseAdmin, null);

  setError("merchants", new Error("Database timeout"));

  await assert.rejects(
    async () => {
      await service.getMerchantById("merchant-123");
    },
    /Database timeout/
  );
});
