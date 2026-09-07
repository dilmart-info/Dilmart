import test from "node:test";
import assert from "node:assert/strict";
import { PhoneIdentityService } from "../dist/modules/auth/phone-identity.service.js";

function makeSupabaseAdminStub({ existingRows = [], authUser = null } = {}) {
  return {
    client: {
      from: (table) => ({
        select: (_cols) => {
          const filters = {};
          const query = {
            eq: (col, val) => {
              filters[col] = val;
              return query;
            },
            maybeSingle: async () => {
              if (table === "customer_phone_identities") {
                const row = existingRows.find((r) =>
                  Object.entries(filters).every(([k, v]) => r[k] === v)
                );
                return { data: row ?? null, error: null };
              }
              return { data: null, error: null };
            },
          };
          return query;
        },
        upsert: async (row) => ({ data: row, error: null }),
      }),
      auth: {
        getUser: async (_token) => {
          if (authUser) return { data: { user: authUser }, error: null };
          return { data: { user: null }, error: new Error("Invalid token") };
        },
      },
    },
  };
}

const auditStub = {
  record: async () => {},
};

test("PhoneIdentityService — reports available when phone is not held by anyone", async () => {
  const admin = makeSupabaseAdminStub({ existingRows: [] });
  const service = new PhoneIdentityService(admin, auditStub);

  const actor = { actorId: "user-1" };
  const result = await service.checkAvailability(actor, "07701234567");

  assert.equal(result.available, true);
  assert.equal(result.alreadyMine, false);
});

test("PhoneIdentityService — reports alreadyMine when phone is held by caller", async () => {
  const admin = makeSupabaseAdminStub({
    existingRows: [{ user_id: "user-1", phone_normalized: "+9647701234567", is_verified: true }],
  });
  const service = new PhoneIdentityService(admin, auditStub);

  const actor = { actorId: "user-1" };
  const result = await service.checkAvailability(actor, "07701234567");

  assert.equal(result.available, true);
  assert.equal(result.alreadyMine, true);
});

test("PhoneIdentityService — reports unavailable when phone is held by someone else", async () => {
  const admin = makeSupabaseAdminStub({
    existingRows: [{ user_id: "other-user", phone_normalized: "+9647701234567", is_verified: true }],
  });
  const service = new PhoneIdentityService(admin, auditStub);

  const actor = { actorId: "user-1" };
  const result = await service.checkAvailability(actor, "07701234567");

  assert.equal(result.available, false);
  assert.equal(result.alreadyMine, false);
});
