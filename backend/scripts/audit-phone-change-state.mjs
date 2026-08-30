/**
 * Read-only audit of pending phone changes and duplicate phone clusters.
 *
 * Two jobs, both diagnostic:
 *
 *   1. auth.users.phone_change — how many identities are sitting on an unfinished phone
 *      change, how many are stale, and whether two people are mid-change on the same
 *      number. A stale phone_change is not harmful on its own, but it is the state a
 *      half-finished linking flow leaves behind, so it is worth watching once the flow is
 *      live.
 *
 *   2. Duplicate phone clusters in profiles. The production audit found one cluster
 *      covering two profiles. It is not resolved automatically and never will be: deciding
 *      which of two people owns a number is not a decision code gets to make.
 *
 * Default output is counts only. The cluster detail — user ids and a masked phone — needs
 * an explicit gate, because it is the one output here that identifies individuals.
 *
 *   ALLOW_PHONE_IDENTITY_AUDIT=true node scripts/audit-phone-change-state.mjs
 *   ALLOW_PHONE_CLUSTER_DETAIL=true ...          # adds ids + masked numbers
 *
 * Never prints a full phone number. Writes nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { buildClusters, collectPendingPhoneChanges, mask } from "./lib/phone-audit.util.mjs";

if ((process.env.ALLOW_PHONE_IDENTITY_AUDIT || "").trim() !== "true") {
  console.error("Refusing to run without ALLOW_PHONE_IDENTITY_AUDIT=true.");
  process.exit(1);
}

const showClusterDetail = (process.env.ALLOW_PHONE_CLUSTER_DETAIL || "").trim() === "true";

const url = (process.env.SUPABASE_URL || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

/** A phone change left unfinished for longer than this is treated as abandoned. */
const STALE_HOURS = Number((process.env.PHONE_CHANGE_STALE_HOURS || "24").trim());

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

async function main() {
  const authUsers = await listAllAuthUsers();

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, phone");
  if (profilesError) throw new Error(`profiles read failed: ${profilesError.message}`);

  // ── Pending phone changes ────────────────────────────────────────────────
  const staleCutoff = Date.now() - STALE_HOURS * 60 * 60 * 1000;
  const pending = collectPendingPhoneChanges(authUsers, { staleCutoffMs: staleCutoff });

  const stale = pending.filter((p) => p.stale).length;
  const pendingClusters = buildClusters(pending);

  // ── Duplicate profile phones ─────────────────────────────────────────────
  const profileClusters = buildClusters(
    (profiles ?? []).map((p) => ({ userId: p.id, phone: p.phone ?? "" })),
  );
  const profilesInClusters = profileClusters.reduce((sum, c) => sum + c.userIds.length, 0);

  // ── Report ───────────────────────────────────────────────────────────────
  console.log("Phone change and duplicate cluster audit — read only\n");
  console.log("## Pending phone changes\n");
  console.log(`  auth users total                        ${authUsers.length}`);
  console.log(`  with an unfinished phone_change         ${pending.length}`);
  console.log(`  of those, stale (> ${STALE_HOURS}h)     ${stale}`);
  console.log(`  numbers targeted by more than one user  ${pendingClusters.length}`);

  console.log("\n## Duplicate phone clusters in profiles\n");
  console.log(`  clusters                                ${profileClusters.length}`);
  console.log(`  profiles inside a cluster               ${profilesInClusters}`);

  if (profileClusters.length > 0) {
    console.log("\n  MANUAL RESOLUTION REQUIRED.");
    console.log("  A duplicate cluster means two accounts claim one number. Nothing here decides");
    console.log("  who owns it — that needs a human, and evidence outside this database.");
    console.log("  Until it is resolved, phone cannot become a unique login identifier.");
  }

  if (showClusterDetail && profileClusters.length > 0) {
    console.log("\n## Cluster detail (ids and masked numbers only)\n");
    for (const cluster of profileClusters) {
      console.log(`  ${mask(cluster.phone)}  →  ${cluster.userIds.join(", ")}`);
    }
  } else if (profileClusters.length > 0) {
    console.log("\n  Set ALLOW_PHONE_CLUSTER_DETAIL=true to list the affected ids.");
  }

  if (pendingClusters.length > 0) {
    console.log("\n  Two or more identities are mid-change on the same number. Only one can");
    console.log("  succeed; the others will fail verification. Consider the cleanup script.");
  }

  console.log("\n  This audit changes nothing and authorizes nothing. In particular it does not");
  console.log("  authorize enabling VITE_AUTH_PHONE_REGISTRATION_ENABLED.");
  console.log("");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
