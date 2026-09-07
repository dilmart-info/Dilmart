/**
 * Phone identity audit — READ ONLY, counts only.
 *
 * Phone OTP registration stays disabled until this has been run and read. The question it
 * answers: if an existing customer signs in with a phone code, does Supabase find their
 * account, or does it create a second one?
 *
 * Distinguishes confirmed phone identities (phone_confirmed_at) from unconfirmed phones
 * and raw profile text.
 *
 * Never runs automatically, never in CI. Requires credentials supplied from outside:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ALLOW_PHONE_IDENTITY_AUDIT=true node scripts/audit-phone-identities.mjs
 *
 * Output is counts only. No phone number, email, name or metadata is ever printed.
 */
import { createClient } from "@supabase/supabase-js";

/** Local Iraqi form, matching normalizeIraqiPhone. Used only to compare, never printed. */
export function normalize(phone) {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (/^9647\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^07\d{9}$/.test(digits)) return digits;
  if (/^7\d{9}$/.test(digits)) return `0${digits}`;
  return null;
}

/**
 * Pure, deterministic classification function for identity audit.
 * Accepts arrays of authUsers, profiles, and identities. Returns counts and risk assessment.
 */
export function classifyPhoneIdentities({ authUsers = [], profiles = [], identities = [] }) {
  const authPhoneByUser = new Map();
  const confirmedAuthPhoneByUser = new Map();
  const usersByAuthPhone = new Map();
  let authWithPhone = 0;
  let authWithConfirmedPhone = 0;
  let authWithUnconfirmedPhone = 0;

  for (const user of authUsers) {
    const normalized = normalize(user.phone ?? "");
    if (normalized) {
      authWithPhone += 1;
      authPhoneByUser.set(user.id, normalized);
      if (!usersByAuthPhone.has(normalized)) usersByAuthPhone.set(normalized, new Set());
      usersByAuthPhone.get(normalized).add(user.id);

      const isConfirmed = Boolean(user.phone_confirmed_at && String(user.phone_confirmed_at).trim());
      if (isConfirmed) {
        authWithConfirmedPhone += 1;
        confirmedAuthPhoneByUser.set(user.id, normalized);
      } else {
        authWithUnconfirmedPhone += 1;
      }
    }
  }

  const profilePhones = new Map();
  let profilesWithPhone = 0;
  let provisionalWithPhone = 0;
  let profilePhoneWithoutAuthPhone = 0;
  let profilesPhoneWithoutConfirmedAuthPhone = 0;
  let authPhoneVsProfileMismatch = 0;

  for (const profile of profiles) {
    const normalized = normalize(profile.phone ?? "");
    if (!normalized) continue;
    profilesWithPhone += 1;
    profilePhones.set(profile.id, normalized);
    if (profile.account_type === "provisional_customer") provisionalWithPhone += 1;

    const authPhone = authPhoneByUser.get(profile.id);
    if (!authPhone) {
      profilePhoneWithoutAuthPhone += 1;
    } else if (authPhone !== normalized) {
      authPhoneVsProfileMismatch += 1;
    }

    const confirmedPhone = confirmedAuthPhoneByUser.get(profile.id);
    if (!confirmedPhone || confirmedPhone !== normalized) {
      profilesPhoneWithoutConfirmedAuthPhone += 1;
    }
  }

  // customer_phone_identities analysis
  const identitiesByUserId = new Map(); // userId -> Set<phone>
  const identityUsersByPhone = new Map(); // phone -> Set<userId>
  for (const row of identities) {
    const phone = normalize(row.phone_normalized ?? "");
    if (!phone) continue;
    if (!identityUsersByPhone.has(phone)) identityUsersByPhone.set(phone, new Set());
    identityUsersByPhone.get(phone).add(row.user_id);

    if (!identitiesByUserId.has(row.user_id)) identitiesByUserId.set(row.user_id, new Set());
    identitiesByUserId.get(row.user_id).add(phone);
  }
  const identitiesLinkedToMultipleUsers = [...identityUsersByPhone.values()].filter((s) => s.size > 1).length;

  let usersWithMultipleCanonicalPhoneIdentities = 0;
  for (const [, phones] of identitiesByUserId) {
    if (phones.size > 1) {
      usersWithMultipleCanonicalPhoneIdentities += 1;
    }
  }

  // Composite union of phone owners across authUsers, profiles, and customer_phone_identities
  const allPhoneOwners = new Map();
  const registerPhoneOwner = (phone, userId) => {
    if (!phone || !userId) return;
    if (!allPhoneOwners.has(phone)) allPhoneOwners.set(phone, new Set());
    allPhoneOwners.get(phone).add(userId);
  };

  for (const [userId, phone] of authPhoneByUser) {
    registerPhoneOwner(phone, userId);
  }
  for (const [userId, phone] of profilePhones) {
    registerPhoneOwner(phone, userId);
  }
  for (const [userId, phones] of identitiesByUserId) {
    for (const phone of phones) {
      registerPhoneOwner(phone, userId);
    }
  }

  const duplicatePhoneClusters = [...allPhoneOwners.values()].filter((set) => set.size > 1).length;

  // auth phone vs canonical customer_phone_identities mismatch
  let authVsIdentityMismatch = 0;
  for (const [userId, confirmedPhone] of confirmedAuthPhoneByUser) {
    const userPhones = identitiesByUserId.get(userId);
    if (!userPhones || !userPhones.has(confirmedPhone)) {
      authVsIdentityMismatch += 1;
    }
  }

  // Profiles evaluation separated into explicit indicators:
  // 1. profilesWhosePhoneBelongsToAnotherAuthUser: phone belongs to another auth user (hijacking risk)
  // 2. profilesEligibleForSafePhoneLinking: profile has phone, no auth.users phone, does not belong to any other auth user,
  //    and has no collisions across profiles/identities. Safe for linking to existing profile.
  // 3. profilesAtDuplicateAccountRiskIfRegistrationEnabled: if phone registration (shouldCreateUser: true) were enabled,
  //    these unlinked profile phones would create duplicate auth users instead of linking to their profile.
  // 4. profilesRequiringManualResolution: any profile having collisions, mismatches, or multi-identities
  let profilesEligibleForSafePhoneLinking = 0;
  let profilesWhosePhoneBelongsToAnotherAuthUser = 0;
  let profilesRequiringManualResolution = 0;

  for (const [userId, phone] of profilePhones) {
    const authPhone = authPhoneByUser.get(userId);
    const hasUserMismatch = Boolean(authPhone && authPhone !== phone);
    const owners = allPhoneOwners.get(phone);
    const hasCollision = Boolean(owners && owners.size > 1);

    const authOwners = usersByAuthPhone.get(phone);
    const belongsToAnotherAuthUser = Boolean(authOwners && [...authOwners].some((id) => id !== userId));

    const userIdentities = identitiesByUserId.get(userId);
    const hasMultipleIdentities = Boolean(userIdentities && userIdentities.size > 1);

    if (belongsToAnotherAuthUser) {
      profilesWhosePhoneBelongsToAnotherAuthUser += 1;
    }

    if (hasCollision || hasUserMismatch || belongsToAnotherAuthUser || hasMultipleIdentities) {
      profilesRequiringManualResolution += 1;
    } else if (!authPhone) {
      profilesEligibleForSafePhoneLinking += 1;
    }
  }

  const profilesAtDuplicateAccountRiskIfRegistrationEnabled = profilesEligibleForSafePhoneLinking;

  // Aliases for compatibility
  const accountsSafeForLinking = profilesEligibleForSafePhoneLinking;
  const accountsRequiringManualResolution = profilesRequiringManualResolution;
  /** @deprecated Use profilesAtDuplicateAccountRiskIfRegistrationEnabled instead */
  const accountsDuplicatedIfRegistrationOn = profilesAtDuplicateAccountRiskIfRegistrationEnabled;

  // Comprehensive risk assessment
  const riskReasons = [];
  if (profilesWhosePhoneBelongsToAnotherAuthUser > 0) {
    riskReasons.push(`${profilesWhosePhoneBelongsToAnotherAuthUser} profile phone(s) belong to another auth user (account takeover risk)`);
  }
  if (usersWithMultipleCanonicalPhoneIdentities > 0) {
    riskReasons.push(`${usersWithMultipleCanonicalPhoneIdentities} user(s) have multiple canonical phone identities`);
  }
  if (profilesAtDuplicateAccountRiskIfRegistrationEnabled > 0) {
    riskReasons.push(`${profilesAtDuplicateAccountRiskIfRegistrationEnabled} profile(s) at duplicate account risk if registration enabled`);
  }
  if (profilesPhoneWithoutConfirmedAuthPhone > profilePhoneWithoutAuthPhone) {
    const unconfirmedCount = profilesPhoneWithoutConfirmedAuthPhone - profilePhoneWithoutAuthPhone;
    riskReasons.push(`${unconfirmedCount} profile phone(s) match unconfirmed auth user(s)`);
  }
  if (duplicatePhoneClusters > 0) {
    riskReasons.push(`${duplicatePhoneClusters} phone cluster(s) shared across multiple distinct users`);
  }
  if (authPhoneVsProfileMismatch > 0) {
    riskReasons.push(`${authPhoneVsProfileMismatch} auth vs profile phone mismatch(es)`);
  }
  if (authVsIdentityMismatch > 0) {
    riskReasons.push(`${authVsIdentityMismatch} auth vs identity table mismatch(es)`);
  }
  if (identitiesLinkedToMultipleUsers > 0) {
    riskReasons.push(`${identitiesLinkedToMultipleUsers} phone identity row(s) linked to multiple users`);
  }
  if (authWithUnconfirmedPhone > 0) {
    riskReasons.push(`${authWithUnconfirmedPhone} unconfirmed auth phone(s) in auth.users`);
  }
  if (profilesRequiringManualResolution > 0) {
    riskReasons.push(`${profilesRequiringManualResolution} profile(s) require manual resolution`);
  }

  let riskLevel = "LOW";
  if (riskReasons.length > 0) {
    if (
      duplicatePhoneClusters > 0 ||
      identitiesLinkedToMultipleUsers > 0 ||
      profilesWhosePhoneBelongsToAnotherAuthUser > 0 ||
      usersWithMultipleCanonicalPhoneIdentities > 0 ||
      profilesRequiringManualResolution > 0
    ) {
      riskLevel = "HIGH";
    } else {
      riskLevel = "ELEVATED";
    }
  }

  return {
    authUsersTotal: authUsers.length,
    authWithPhone,
    authWithConfirmedPhone,
    authWithUnconfirmedPhone,
    profilesWithPhone,
    customerPhoneIdentitiesRows: identities.length,
    profilesPhoneWithoutAuthPhone: profilePhoneWithoutAuthPhone,
    profilesPhoneWithoutConfirmedAuthPhone,
    authPhoneVsProfileMismatch,
    authVsIdentityMismatch,
    duplicatePhoneClusters,
    identitiesLinkedToMultipleUsers,
    usersWithMultipleCanonicalPhoneIdentities,
    provisionalWithPhone,
    profilesEligibleForSafePhoneLinking,
    profilesAtDuplicateAccountRiskIfRegistrationEnabled,
    profilesWhosePhoneBelongsToAnotherAuthUser,
    profilesRequiringManualResolution,
    accountsSafeForLinking,
    accountsRequiringManualResolution,
    accountsDuplicatedIfRegistrationOn,
    riskLevel,
    riskReasons,
  };
}

async function listAllAuthUsers(supabase) {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return users;
}

async function runAudit() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required and must be supplied externally.");
    console.error("This script is read only, but it still needs service-role access to read auth.users.");
    process.exit(1);
  }

  if (process.env.ALLOW_PHONE_IDENTITY_AUDIT !== "true") {
    console.error("Refusing to run without ALLOW_PHONE_IDENTITY_AUDIT=true.");
    console.error("Set it deliberately, and only against an environment you are authorized to read.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const authUsers = await listAllAuthUsers(supabase);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, phone, account_type");
  if (profilesError) throw new Error(`profiles read failed: ${profilesError.message}`);

  const { data: identities, error: identitiesError } = await supabase
    .from("customer_phone_identities")
    .select("user_id, phone_normalized");
  if (identitiesError) throw new Error(`customer_phone_identities read failed: ${identitiesError.message}`);

  const result = classifyPhoneIdentities({ authUsers, profiles, identities });

  const report = [
    ["auth.users total", result.authUsersTotal],
    ["auth.users with a phone value", result.authWithPhone],
    ["auth.users with CONFIRMED phone", result.authWithConfirmedPhone],
    ["auth.users with UNCONFIRMED phone", result.authWithUnconfirmedPhone],
    ["profiles with a usable phone", result.profilesWithPhone],
    ["customer_phone_identities rows", result.customerPhoneIdentitiesRows],
    ["profiles phone with no matching auth.users.phone", result.profilesPhoneWithoutAuthPhone],
    ["profiles phone with no CONFIRMED auth.users.phone", result.profilesPhoneWithoutConfirmedAuthPhone],
    ["auth phone vs profile phone mismatches", result.authPhoneVsProfileMismatch],
    ["auth phone vs customer_phone_identities mismatches", result.authVsIdentityMismatch],
    ["duplicate normalized phones across users", result.duplicatePhoneClusters],
    ["phone identities linked to more than one user", result.identitiesLinkedToMultipleUsers],
    ["users with multiple canonical phone identities", result.usersWithMultipleCanonicalPhoneIdentities],
    ["provisional users holding a phone", result.provisionalWithPhone],
    ["profiles eligible for safe phone linking", result.profilesEligibleForSafePhoneLinking],
    ["profiles at duplicate risk if registration enabled", result.profilesAtDuplicateAccountRiskIfRegistrationEnabled],
    ["profiles whose phone belongs to another auth user", result.profilesWhosePhoneBelongsToAnotherAuthUser],
    ["profiles requiring manual resolution", result.profilesRequiringManualResolution],
    ["candidate accounts safe for linking", result.accountsSafeForLinking],
  ];

  console.log("Phone identity audit — counts only, no personal data\n");
  for (const [label, value] of report) {
    console.log(`  ${label.padEnd(54)} ${value}`);
  }

  console.log("\n## Duplicate-account risk\n");
  if (result.riskLevel === "LOW") {
    console.log("  LOW — all profile phones correspond to confirmed auth users without collisions or mismatches.");
  } else {
    console.log(`  ${result.riskLevel} — ${result.riskReasons.join("; ")}.`);
    console.log("  Unlinked profile phones may create duplicate auth users.");
    console.log("  Colliding phones may authenticate into a different existing account and require mandatory manual resolution.");
    console.log("  Phone registration must remain BLOCKED until account linking completes.");
  }
}

// Only auto-run if executed as main CLI script
if (process.argv[1] && process.argv[1].endsWith("audit-phone-identities.mjs")) {
  runAudit().catch((err) => {
    console.error(`Audit failed: ${err.message}`);
    process.exit(1);
  });
}
