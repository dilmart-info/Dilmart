/**
 * Clears abandoned auth.users.phone_change values.
 *
 * A phone change that was started and never verified leaves a pending target on the auth
 * record. It is mostly harmless, but two of them on the same number guarantee that one user
 * will fail verification for reasons nobody can see from the UI, so there needs to be a way
 * to clear them.
 *
 * NOT RUN by the change that introduces it. It exists so the operation is reviewed as code
 * rather than improvised against production at 2am.
 *
 *   ALLOW_PHONE_CHANGE_CLEANUP=true node scripts/cleanup-stale-phone-change.mjs [--dry-run]
 *
 * Safety properties:
 *   * refuses to run without the gate
 *   * only touches records whose phone_change has been pending longer than the threshold
 *   * never touches a confirmed phone, and never writes phone_confirmed_at
 *   * prints counts and ids, never a phone number
 */
import { createClient } from "@supabase/supabase-js";
import { collectPendingPhoneChanges } from "./lib/phone-audit.util.mjs";

const dryRun = process.argv.includes("--dry-run");

if ((process.env.ALLOW_PHONE_CHANGE_CLEANUP || "").trim() !== "true") {
  console.error("Refusing to run without ALLOW_PHONE_CHANGE_CLEANUP=true.");
  console.error("This clears pending phone changes on real auth users. Review first.");
  process.exit(1);
}

const url = (process.env.SUPABASE_URL || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const staleHours = Number((process.env.PHONE_CHANGE_STALE_HOURS || "24").trim());
if (!Number.isFinite(staleHours) || staleHours < 1) {
  console.error("PHONE_CHANGE_STALE_HOURS must be a positive number of hours.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function listAllAuthUsers() {
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

const users = await listAllAuthUsers();
const staleCutoffMs = Date.now() - staleHours * 60 * 60 * 1000;
const stale = collectPendingPhoneChanges(users, { staleCutoffMs }).filter((p) => p.stale);

console.log(`Stale phone changes older than ${staleHours}h: ${stale.length}\n`);

if (stale.length === 0) {
  console.log("  Nothing to do.");
  process.exit(0);
}

for (const entry of stale) console.log(`  ${entry.userId}`);

if (dryRun) {
  console.log("\n  Dry run — nothing was changed.");
  process.exit(0);
}

/*
 * This script deliberately stops here.
 *
 * There is no supported admin API for clearing a pending phone_change. The closest thing,
 * updateUserById({ phone: "" }), does something quite different: it removes the user's
 * *confirmed* phone. Running that against the seven accounts in this project would destroy
 * real identity data to tidy up a field nobody can see.
 *
 * Clearing phone_change requires a direct statement against auth.users, which needs
 * database credentials this script does not have and should not be given. So it prints the
 * reviewed statement and leaves execution to an operator who can see what they are running.
 */
console.log("\n  NO AUTOMATIC MUTATION IS PERFORMED.\n");
console.log("  Supabase exposes no admin API for clearing a pending phone_change, and the");
console.log("  nearest alternative erases the confirmed phone instead. Run the statement");
console.log("  below in the SQL editor, against the intended project, after reviewing the");
console.log("  ids above:\n");
console.log("    update auth.users");
console.log("       set phone_change = '',");
console.log("           phone_change_token = '',");
console.log("           phone_change_sent_at = null");
console.log("     where id in (");
console.log(stale.map((entry) => `             '${entry.userId}'`).join(",\n"));
console.log("           )");
console.log("       and phone_change <> ''");
console.log("       and phone_change_sent_at < now() - interval '" + staleHours + " hours';\n");
console.log("  It touches no confirmed phone and writes no phone_confirmed_at.");
process.exit(0);
