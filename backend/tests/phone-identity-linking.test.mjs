/**
 * Verified phone linking.
 *
 * The whole security property is that this service cannot make a phone verified — it only
 * mirrors what Supabase Auth already established, read from the caller's own token. These
 * tests exist mostly to prove that a caller cannot talk their way past that.
 *
 * No network. The Supabase client and the audit sink are fakes.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { PhoneIdentityService } = await import("../dist/modules/auth/phone-identity.service.js");
const { buildClusters, collectPendingPhoneChanges, mask, normalize } = await import(
  "../scripts/lib/phone-audit.util.mjs"
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const PHONE_E164 = "+9647501234567";
const PHONE_LOCAL = "07501234567";

/** Minimal in-memory stand-in for the two tables this service touches. */
function fakeSupabase({ identities = [], authUser = undefined, failures = {} } = {}) {
  const state = { identities: [...identities], profiles: new Map(), upserts: [], updates: [] };

  const client = {
    from(relation) {
      if (relation === "customer_phone_identities") {
        return {
          select: () => ({
            eq: (col1, val1) => ({
              eq: (col2, val2) => ({
                maybeSingle: async () => {
                  if (failures.lookup) return { data: null, error: { code: "42501" } };
                  const row = state.identities.find(
                    (r) => r[col1] === val1 && r[col2] === val2,
                  );
                  return { data: row ?? null, error: null };
                },
              }),
            }),
          }),
          upsert: async (row) => {
            if (failures.upsert) return { error: failures.upsert };
            state.upserts.push(row);
            const existing = state.identities.find((r) => r.user_id === row.user_id);
            if (existing) Object.assign(existing, row);
            else state.identities.push({ ...row });
            return { error: null };
          },
        };
      }

      if (relation === "profiles") {
        return {
          update: (patch) => ({
            eq: async (_col, id) => {
              if (failures.profileUpdate) return { error: failures.profileUpdate };
              state.updates.push({ id, patch });
              state.profiles.set(id, patch);
              return { error: null };
            },
          }),
        };
      }

      throw new Error(`unexpected relation ${relation}`);
    },
  };

  // Mirrors SupabaseAdminService: the client is a property, and token resolution is a
  // method on the service itself.
  return {
    client,
    state,
    async resolveUserFromAccessToken() {
      return authUser ?? null;
    },
  };
}

function makeService(options) {
  const supabase = fakeSupabase(options);
  const auditEntries = [];
  const audit = { log: async (entry) => auditEntries.push(entry) };
  const service = new PhoneIdentityService(supabase, audit);
  return { service, state: supabase.state, auditEntries };
}

const actorFor = (userId = USER_ID) => ({
  actorId: userId,
  actorRole: "authenticated",
  actorToken: "access-token",
});

const codeOf = (err) => err?.getResponse?.()?.code;

// ── Availability ─────────────────────────────────────────────────────────────

test("a free number is available", async () => {
  const { service } = makeService();
  const result = await service.checkAvailability(actorFor(), PHONE_LOCAL);
  assert.deepEqual(result, { available: true, alreadyMine: false });
});

test("a number verified by another user is not available", async () => {
  const { service } = makeService({
    identities: [{ user_id: OTHER_USER, phone_normalized: PHONE_E164, is_verified: true }],
  });
  const result = await service.checkAvailability(actorFor(), PHONE_LOCAL);
  assert.deepEqual(result, { available: false, alreadyMine: false });
});

test("a number the caller already owns is available and flagged as theirs", async () => {
  const { service } = makeService({
    identities: [{ user_id: USER_ID, phone_normalized: PHONE_E164, is_verified: true }],
  });
  const result = await service.checkAvailability(actorFor(), PHONE_LOCAL);
  assert.deepEqual(result, { available: true, alreadyMine: true });
});

test("an unverified row does not block anybody", async () => {
  // Seven of these exist in production. They are claims, not proof, and must not lock a
  // real owner out of their own number.
  const { service } = makeService({
    identities: [{ user_id: OTHER_USER, phone_normalized: PHONE_E164, is_verified: false }],
  });
  const result = await service.checkAvailability(actorFor(), PHONE_LOCAL);
  assert.equal(result.available, true);
});

test("availability requires a logged-in caller", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.checkAvailability({}, PHONE_LOCAL),
    (err) => err.getStatus() === 401 && codeOf(err) === "AUTH_REQUIRED",
  );
});

test("an invalid number is rejected before any lookup", async () => {
  const { service } = makeService();
  for (const bad of ["", "   ", "12345", "+15551234567", "0650123456"]) {
    await assert.rejects(
      () => service.checkAvailability(actorFor(), bad),
      (err) => err.getStatus() === 400,
    );
  }
});

test("every written form of one number resolves to the same bucket", async () => {
  const { service } = makeService({
    identities: [{ user_id: OTHER_USER, phone_normalized: PHONE_E164, is_verified: true }],
  });
  for (const form of ["07501234567", "+9647501234567", "009647501234567", "7501234567"]) {
    const result = await service.checkAvailability(actorFor(), form);
    assert.equal(result.available, false, `${form} should resolve to the taken number`);
  }
});

// ── Sync ─────────────────────────────────────────────────────────────────────

test("a verified auth phone is mirrored into both tables", async () => {
  const { service, state, auditEntries } = makeService({
    authUser: { id: USER_ID, phone: "9647501234567" },
  });

  const result = await service.syncVerifiedPhone(actorFor());
  assert.equal(result.linked, true);
  assert.match(result.phoneMasked, /\*/);

  assert.equal(state.identities.length, 1);
  assert.equal(state.identities[0].phone_normalized, PHONE_E164);
  assert.equal(state.identities[0].is_verified, true);
  assert.equal(state.identities[0].verification_source, "supabase_phone_change");
  assert.equal(state.profiles.get(USER_ID).phone, PHONE_E164);
  assert.equal(auditEntries.length, 1);
});

test("sync requires a session", async () => {
  const { service } = makeService({ authUser: { id: USER_ID, phone: "9647501234567" } });

  await assert.rejects(
    () => service.syncVerifiedPhone({}),
    (err) => err.getStatus() === 401,
  );
  await assert.rejects(
    () => service.syncVerifiedPhone({ actorId: USER_ID, actorRole: "authenticated" }),
    (err) => err.getStatus() === 401,
  );
});

test("a token that resolves to a different user is refused", async () => {
  // The token is the authority for identity, so a mismatch is an impersonation attempt.
  const { service, state } = makeService({ authUser: { id: OTHER_USER, phone: "9647501234567" } });

  await assert.rejects(
    () => service.syncVerifiedPhone(actorFor(USER_ID)),
    (err) => err.getStatus() === 401,
  );
  assert.equal(state.identities.length, 0);
});

test("an unresolvable token is refused", async () => {
  const { service } = makeService({ authUser: null });
  await assert.rejects(
    () => service.syncVerifiedPhone(actorFor()),
    (err) => err.getStatus() === 401,
  );
});

test("sync refuses when the auth record carries no phone", async () => {
  // This is the case that matters: the client claims verification succeeded, but Supabase
  // never recorded a phone. Trusting the client here would fabricate a verified identity.
  const { service, state } = makeService({ authUser: { id: USER_ID, phone: null } });

  await assert.rejects(
    () => service.syncVerifiedPhone(actorFor()),
    (err) => err.getStatus() === 400 && codeOf(err) === "PHONE_NOT_VERIFIED",
  );
  assert.equal(state.identities.length, 0);
  assert.equal(state.updates.length, 0);
});

test("sync takes the number from the auth record, never from the request", async () => {
  const { service, state } = makeService({ authUser: { id: USER_ID, phone: "9647509999999" } });

  // The actor context carries a different phone; it must be ignored entirely.
  await service.syncVerifiedPhone({ ...actorFor(), actorPhone: PHONE_E164 });
  assert.equal(state.identities[0].phone_normalized, "+9647509999999");
});

test("a number already verified by someone else is refused, not stolen", async () => {
  const { service, state } = makeService({
    authUser: { id: USER_ID, phone: "9647501234567" },
    identities: [{ user_id: OTHER_USER, phone_normalized: PHONE_E164, is_verified: true }],
  });

  await assert.rejects(
    () => service.syncVerifiedPhone(actorFor()),
    (err) => err.getStatus() === 409 && codeOf(err) === "PHONE_ALREADY_LINKED",
  );
  // The other user's link is untouched.
  assert.equal(state.identities.length, 1);
  assert.equal(state.identities[0].user_id, OTHER_USER);
  assert.equal(state.updates.length, 0);
});

test("a uniqueness violation surfaces as a conflict", async () => {
  const { service } = makeService({
    authUser: { id: USER_ID, phone: "9647501234567" },
    failures: { upsert: { code: "23505", message: "duplicate key" } },
  });

  await assert.rejects(
    () => service.syncVerifiedPhone(actorFor()),
    (err) => err.getStatus() === 409 && codeOf(err) === "PHONE_ALREADY_LINKED",
  );
});

test("repeated syncs are idempotent", async () => {
  const { service, state, auditEntries } = makeService({
    authUser: { id: USER_ID, phone: "9647501234567" },
  });

  for (let i = 0; i < 4; i += 1) await service.syncVerifiedPhone(actorFor());

  assert.equal(state.identities.length, 1, "one identity per user, however many syncs");
  assert.equal(state.identities[0].phone_normalized, PHONE_E164);
  assert.equal(auditEntries.length, 4, "each link attempt is still audited");
});

test("a failed profile update does not fail the link", async () => {
  // The verified identity row is the record of truth; profiles.phone is a convenience copy.
  const { service, state } = makeService({
    authUser: { id: USER_ID, phone: "9647501234567" },
    failures: { profileUpdate: { code: "42501", message: "denied" } },
  });

  const result = await service.syncVerifiedPhone(actorFor());
  assert.equal(result.linked, true);
  assert.equal(state.identities.length, 1);
});

test("nothing is written when the ownership lookup fails", async () => {
  const { service, state } = makeService({
    authUser: { id: USER_ID, phone: "9647501234567" },
    failures: { lookup: true },
  });

  await assert.rejects(
    () => service.syncVerifiedPhone(actorFor()),
    (err) => codeOf(err) === "PHONE_LOOKUP_FAILED",
  );
  assert.equal(state.identities.length, 0);
});

test("phone_confirmed_at is never written and no automatic confirmation happens", async () => {
  const { service, state } = makeService({ authUser: { id: USER_ID, phone: "9647501234567" } });
  await service.syncVerifiedPhone(actorFor());

  const written = JSON.stringify(state.upserts.concat(state.updates));
  assert.ok(!written.includes("phone_confirmed_at"), "confirmation belongs to Supabase alone");
  assert.ok(!written.includes("email_confirmed_at"));
});

// ── Privacy ──────────────────────────────────────────────────────────────────

test("the audit entry carries a masked phone, never the number", async () => {
  const { service, auditEntries } = makeService({
    authUser: { id: USER_ID, phone: "9647501234567" },
  });
  await service.syncVerifiedPhone(actorFor());

  const serialized = JSON.stringify(auditEntries);
  assert.ok(!serialized.includes(PHONE_E164));
  assert.ok(!serialized.includes("9647501234567"));
  assert.ok(!serialized.includes("7501234567"));
  assert.equal(auditEntries[0].eventType, "PHONE_IDENTITY_LINKED");
});

test("no full phone number reaches the logs", async () => {
  const captured = [];
  const { service } = makeService({
    authUser: { id: USER_ID, phone: "9647501234567" },
    identities: [{ user_id: OTHER_USER, phone_normalized: PHONE_E164, is_verified: true }],
  });
  for (const level of ["log", "warn", "error"]) service.logger[level] = (m) => captured.push(String(m));

  await service.syncVerifiedPhone(actorFor()).catch(() => {});

  const output = captured.join("\n");
  assert.ok(output.length > 0);
  assert.ok(!output.includes(PHONE_E164));
  assert.ok(!output.includes("9647501234567"));
  assert.ok(!output.includes("7501234567"));
});

// ── Audit helpers ────────────────────────────────────────────────────────────

test("clusters group distinct users sharing one number", () => {
  const clusters = buildClusters([
    { userId: "a", phone: "07501234567" },
    { userId: "b", phone: "+9647501234567" },
    { userId: "c", phone: "07509999999" },
    { userId: "d", phone: "not-a-phone" },
  ]);

  assert.equal(clusters.length, 1, "only the shared number forms a cluster");
  assert.deepEqual(clusters[0].userIds.sort(), ["a", "b"]);
});

test("one user listed twice is not a cluster", () => {
  const clusters = buildClusters([
    { userId: "a", phone: "07501234567" },
    { userId: "a", phone: "+9647501234567" },
  ]);
  assert.equal(clusters.length, 0);
});

test("masking never reveals a dialable number", () => {
  const masked = mask(normalize(PHONE_E164));
  assert.equal(masked, "0750****567");
  assert.ok(!masked.includes("1234"));
  assert.equal(mask(null), "***");
  assert.equal(mask("07"), "***");
});

test("stale pending phone changes are identified by age", () => {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;

  const pending = collectPendingPhoneChanges(
    [
      { id: "fresh", phone_change: "9647501111111", phone_change_sent_at: new Date(now - 1000).toISOString() },
      { id: "stale", phone_change: "9647502222222", phone_change_sent_at: new Date(now - 48 * 60 * 60 * 1000).toISOString() },
      { id: "undated", phone_change: "9647503333333", phone_change_sent_at: null },
      { id: "none", phone_change: "", phone_change_sent_at: null },
      { id: "absent" },
    ],
    { staleCutoffMs: cutoff },
  );

  assert.equal(pending.length, 3, "only users with a pending change are counted");
  assert.deepEqual(
    pending.filter((p) => p.stale).map((p) => p.userId).sort(),
    ["stale", "undated"],
  );
});
