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
  assert.equal(result.profilesPhoneWithoutConfirmedAuthPhone, 1); // u2 phone is unconfirmed
  assert.equal(result.duplicatePhoneClusters, 0);
  assert.equal(result.riskLevel, "ELEVATED");
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
  assert.equal(result.profilesWhosePhoneBelongsToAnotherAuthUser, 1); // user-b phone belongs to user-a in auth.users!
  assert.equal(result.profilesEligibleForSafePhoneLinking, 0);
  assert.equal(result.profilesAtDuplicateAccountRiskIfRegistrationEnabled, 0);
  assert.ok(result.profilesRequiringManualResolution > 0);
  assert.equal(result.accountsSafeForLinking, 0);
  assert.equal(result.riskLevel, "HIGH");
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

test("identity audit classification — single user mismatch does not taint innocent safe-linking accounts", () => {
  const authUsers = [
    { id: "user-mismatch", phone: "+9647701111111", phone_confirmed_at: "2026-01-01T00:00:00Z" },
    { id: "user-clean", phone: null, phone_confirmed_at: null },
  ];

  const profiles = [
    // user-mismatch has auth phone 07701111111 != profile phone 07702222222
    { id: "user-mismatch", phone: "07702222222" },
    // user-clean has no auth phone, and a unique profile phone
    { id: "user-clean", phone: "07803333333" },
  ];

  const identities = [];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  assert.equal(result.authPhoneVsProfileMismatch, 1);
  // Crucial invariant: user-clean MUST remain safe for linking despite user-mismatch having a mismatch!
  assert.equal(result.accountsSafeForLinking, 1);
  assert.equal(result.accountsRequiringManualResolution, 1);
});

test("identity audit classification — phone claimed by another auth user is NOT safe for linking", () => {
  const authUsers = [
    { id: "user-owner", phone: "+9647704444444", phone_confirmed_at: "2026-01-01T00:00:00Z" },
    { id: "user-intruder", phone: null, phone_confirmed_at: null },
  ];

  const profiles = [
    { id: "user-owner", phone: "07704444444" },
    // user-intruder has no auth phone, but has profile phone claimed by user-owner!
    { id: "user-intruder", phone: "07704444444" },
  ];

  const identities = [];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  // Cross-table collision detected
  assert.equal(result.duplicatePhoneClusters, 1);
  // Must NOT be safe for linking!
  assert.equal(result.accountsSafeForLinking, 0);
  assert.equal(result.accountsRequiringManualResolution, 2);
  assert.equal(result.riskLevel, "HIGH");
});

test("identity audit classification — cross-table composite duplicates across auth, profiles, and identities", () => {
  const authUsers = [
    { id: "u-auth", phone: "+9647705555555", phone_confirmed_at: "2026-01-01T00:00:00Z" },
  ];

  const profiles = [
    { id: "u-profile", phone: "07705555555" }, // distinct user in profile
  ];

  const identities = [
    { user_id: "u-identity", phone_normalized: "07705555555" }, // third distinct user in identity
  ];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  assert.equal(result.duplicatePhoneClusters, 1);
  assert.equal(result.accountsSafeForLinking, 0);
  assert.equal(result.riskLevel, "HIGH");
});

test("identity audit classification — riskLevel is LOW only when all criteria are satisfied", () => {
  const authUsers = [
    { id: "u-clean", phone: "+9647706666666", phone_confirmed_at: "2026-01-01T00:00:00Z" },
  ];
  const profiles = [
    { id: "u-clean", phone: "07706666666" },
  ];
  const identities = [
    { user_id: "u-clean", phone_normalized: "07706666666" },
  ];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });
  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.riskReasons.length, 0);
  assert.equal(result.accountsSafeForLinking, 0);
  assert.equal(result.accountsRequiringManualResolution, 0);
});

test("identity audit classification — retains all customer_phone_identities rows and flags users with multiple canonical phone identities", () => {
  const authUsers = [
    { id: "user-multi", phone: "+9647701111111", phone_confirmed_at: "2026-01-01T00:00:00Z" },
  ];

  const profiles = [
    { id: "user-multi", phone: "07701111111" },
  ];

  // user-multi has TWO canonical phone identities in customer_phone_identities!
  const identities = [
    { user_id: "user-multi", phone_normalized: "07701111111" },
    { user_id: "user-multi", phone_normalized: "07709999999" },
  ];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  assert.equal(result.customerPhoneIdentitiesRows, 2);
  assert.equal(result.usersWithMultipleCanonicalPhoneIdentities, 1);
  assert.equal(result.profilesRequiringManualResolution, 1);
  assert.equal(result.riskLevel, "HIGH");
  assert.ok(result.riskReasons.some((r) => r.includes("multiple canonical phone identities")));
});

test("identity audit classification — separates eligible new phone registrations from phone hijacking risks", () => {
  const authUsers = [
    { id: "user-auth-owner", phone: "+9647701112233", phone_confirmed_at: "2026-01-01T00:00:00Z" },
    { id: "user-clean-profile", phone: null, phone_confirmed_at: null },
    { id: "user-hijack-risk", phone: null, phone_confirmed_at: null },
  ];

  const profiles = [
    { id: "user-auth-owner", phone: "07701112233" },
    // user-clean-profile has an unlinked phone that DOES NOT belong to any auth user
    { id: "user-clean-profile", phone: "07801112233" },
    // user-hijack-risk has a phone that belongs to user-auth-owner!
    { id: "user-hijack-risk", phone: "07701112233" },
  ];

  const identities = [
    { user_id: "user-auth-owner", phone_normalized: "07701112233" },
  ];

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  assert.equal(result.profilesWithPhone, 3);
  assert.equal(result.profilesPhoneWithoutAuthPhone, 2); // user-clean-profile and user-hijack-risk
  assert.equal(result.profilesEligibleForSafePhoneLinking, 1); // Only user-clean-profile is safe to link
  assert.equal(result.profilesAtDuplicateAccountRiskIfRegistrationEnabled, 1); // user-clean-profile would duplicate if registration enabled
  assert.equal(result.accountsDuplicatedIfRegistrationOn, 1); // Deprecated alias check
  assert.equal(result.profilesWhosePhoneBelongsToAnotherAuthUser, 1); // user-hijack-risk
  assert.equal(result.profilesRequiringManualResolution, 2); // user-auth-owner and user-hijack-risk due to collision
  assert.equal(result.riskLevel, "HIGH");
  assert.ok(result.riskReasons.some((r) => r.includes("account takeover risk")));
  assert.ok(result.riskReasons.some((r) => r.includes("at duplicate account risk if registration enabled")));
});

