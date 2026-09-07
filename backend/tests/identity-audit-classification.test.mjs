import { strict as assert } from "node:assert";
import test from "node:test";
import { classifyPhoneIdentities, normalize } from "../scripts/audit-phone-identities.mjs";

test("identity audit classification — normalization contract", () => {
  assert.equal(normalize("07701234567"), "07701234567");
  assert.equal(normalize("+9647701234567"), "07701234567");
  assert.equal(normalize("9647701234567"), "07701234567");
  assert.equal(normalize("7701234567"), "07701234567");
  assert.equal(normalize("invalid"), null);
});

test("identity audit classification — confirmed vs unconfirmed phone separation", () => {
  const authUsers = [
    { id: "u1", phone: "+9647701111111", phone_confirmed_at: "2026-08-01T10:00:00Z" },
    { id: "u2", phone: "+9647702222222", phone_confirmed_at: null }, // unconfirmed
    { id: "u3", phone: null, phone_confirmed_at: null }, // email only
  ];

  const profiles = [
    { id: "u1", phone: "07701111111" },
    { id: "u2", phone: "07702222222" },
    { id: "u3", phone: null },
  ];

  const identities = [
    { user_id: "u1", phone_normalized: "07701111111" },
  ];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  assert.equal(result.authUsersTotal, 3);
  assert.equal(result.authWithPhone, 2);
  assert.equal(result.authWithConfirmedPhone, 1);
  assert.equal(result.authWithUnconfirmedPhone, 1);
  assert.equal(result.profilesWithPhone, 2);
  assert.equal(result.customerPhoneIdentitiesRows, 1);
  assert.equal(result.profilesPhoneWithoutAuthPhone, 0);
  assert.equal(result.duplicatePhoneClusters, 0);
});

test("identity audit classification — detects duplicate phone clusters and collisions", () => {
  const authUsers = [
    { id: "user-a", phone: "+9647701234567", phone_confirmed_at: "2026-01-01T00:00:00Z" },
    { id: "user-b", phone: null, phone_confirmed_at: null },
  ];

  // Both user-a and user-b have the same phone in profiles table
  const profiles = [
    { id: "user-a", phone: "07701234567" },
    { id: "user-b", phone: "07701234567" },
  ];

  const identities = [
    { user_id: "user-a", phone_normalized: "07701234567" },
    { user_id: "user-b", phone_normalized: "07701234567" }, // Collision in canonical table!
  ];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  assert.equal(result.duplicatePhoneClusters, 1);
  assert.equal(result.identitiesLinkedToMultipleUsers, 1);
  assert.equal(result.profilesPhoneWithoutAuthPhone, 1); // user-b has profile phone but no auth phone!
  assert.equal(result.accountsDuplicatedIfRegistrationOn, 1);
  assert.ok(result.accountsRequiringManualResolution > 0);
  assert.equal(result.accountsSafeForLinking, 0);
});

test("identity audit classification — identifies accounts safe for linking", () => {
  const authUsers = [
    { id: "user-email-1", phone: null, phone_confirmed_at: null },
  ];

  const profiles = [
    { id: "user-email-1", phone: "07809998877" }, // Unique profile phone
  ];

  const identities = [];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  assert.equal(result.profilesPhoneWithoutAuthPhone, 1);
  assert.equal(result.duplicatePhoneClusters, 0);
  assert.equal(result.accountsSafeForLinking, 1);
  assert.equal(result.accountsRequiringManualResolution, 0);
});
