/**
 * Phone identity audit — READ ONLY, counts only.
 *
 * Phone OTP registration stays disabled until this has been run and read. The question it
 * answers: if an existing customer signs in with a phone code, does Supabase find their
 * account, or does it create a second one?
 *
 * Existing customers were created by email/password or as provisional checkout users.
 * If auth.users.phone is empty for them while profiles.phone holds the number, then
 * `shouldCreateUser: false` will not find them, and `true` would mint a duplicate.
 *
 * Never runs automatically, never in CI. Requires credentials supplied from outside:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-phone-identities.mjs
 *
 * Do not run against production without explicit authorization.
 *
 * Output is counts only. No phone number, email, name or metadata is ever printed.
 */
import { createClient } from "@supabase/supabase-js";

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

/** Local Iraqi form, matching normalizeIraqiPhone. Used only to compare, never printed. */
function normalize(phone) {
  if (typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (/^9647\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^07\d{9}$/.test(digits)) return digits;
  if (/^7\d{9}$/.test(digits)) return `0${digits}`;
  return null;
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  // 1000 is the service-role page cap.
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return users;
}

async function main() {
  const authUsers = await listAllAuthUsers();

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, phone, account_type");
  if (profilesError) throw new Error(`profiles read failed: ${profilesError.message}`);

  const { data: identities, error: identitiesError } = await supabase
    .from("customer_phone_identities")
    .select("user_id, phone_normalized");
  if (identitiesError) throw new Error(`customer_phone_identities read failed: ${identitiesError.message}`);

  const authPhoneByUser = new Map();
  let authWithPhone = 0;
  for (const user of authUsers) {
    const normalized = normalize(user.phone ?? "");
    if (normalized) {
      authWithPhone += 1;
      authPhoneByUser.set(user.id, normalized);
    }
  }

  const profilePhones = new Map();
  let profilesWithPhone = 0;
  let provisionalWithPhone = 0;
  let profilePhoneWithoutAuthPhone = 0;

  for (const profile of profiles ?? []) {
    const normalized = normalize(profile.phone ?? "");
    if (!normalized) continue;
    profilesWithPhone += 1;
    profilePhones.set(profile.id, normalized);
    if (profile.account_type === "provisional_customer") provisionalWithPhone += 1;
    if (authPhoneByUser.get(profile.id) !== normalized) profilePhoneWithoutAuthPhone += 1;
  }

  // Duplicate normalized phones across distinct users — each cluster is a potential
  // account collision once phone becomes a login identifier.
  const usersByPhone = new Map();
  for (const [userId, phone] of profilePhones) {
    if (!usersByPhone.has(phone)) usersByPhone.set(phone, new Set());
    usersByPhone.get(phone).add(userId);
  }
  const duplicatePhoneClusters = [...usersByPhone.values()].filter((set) => set.size > 1).length;

  const identityUsersByPhone = new Map();
  for (const row of identities ?? []) {
    const phone = normalize(row.phone_normalized ?? "");
    if (!phone) continue;
    if (!identityUsersByPhone.has(phone)) identityUsersByPhone.set(phone, new Set());
    identityUsersByPhone.get(phone).add(row.user_id);
  }
  const identitiesLinkedToMultipleUsers = [...identityUsersByPhone.values()].filter((s) => s.size > 1).length;

  const report = [
    ["auth.users total", authUsers.length],
    ["auth.users with a usable phone", authWithPhone],
    ["profiles with a usable phone", profilesWithPhone],
    ["customer_phone_identities rows", identities?.length ?? 0],
    ["profiles phone with no matching auth.users.phone", profilePhoneWithoutAuthPhone],
    ["duplicate normalized phones across users", duplicatePhoneClusters],
    ["phone identities linked to more than one user", identitiesLinkedToMultipleUsers],
    ["provisional users holding a phone", provisionalWithPhone],
  ];

  console.log("Phone identity audit — counts only, no personal data\n");
  for (const [label, value] of report) {
    console.log(`  ${label.padEnd(52)} ${value}`);
  }

  console.log("\n## Duplicate-account risk\n");
  if (profilePhoneWithoutAuthPhone === 0) {
    console.log("  LOW — every profile phone is mirrored on the auth user, so phone OTP login");
    console.log("  should resolve to the existing account.");
  } else {
    console.log(`  ELEVATED — ${profilePhoneWithoutAuthPhone} profile(s) hold a phone that auth.users`);
    console.log("  does not. With shouldCreateUser=false those users cannot log in by phone; with");
    console.log("  true they would get a second account. A backfill of auth.users.phone, or an");
    console.log("  explicit account-linking step, is required before enabling phone registration.");
  }
  if (duplicatePhoneClusters > 0 || identitiesLinkedToMultipleUsers > 0) {
    console.log("\n  Additionally, the same number maps to more than one user in the data above.");
    console.log("  Phone cannot become a unique login identifier until that is resolved.");
  }
  console.log("\n  This audit does not authorize enabling VITE_AUTH_PHONE_REGISTRATION_ENABLED.");
  console.log("");
}

main().catch((err) => {
  // Message only — never dump a row or a payload.
  console.error(`Audit failed: ${err.message}`);
  process.exit(1);
});
