/**
 * FRA-S2-001 static tripwire — public.profiles must never become browser-writable.
 *
 * ── What this file is, and what it is NOT ───────────────────────────────────
 *
 * This is a STATIC MIGRATION GUARD. It reads migration TEXT with regular
 * expressions and replays the grant/revoke/policy statements it recognises. It
 * catches the known dangerous patterns early — in a plain unit test, with no
 * database — so a bad migration fails review rather than CI minutes later.
 *
 * It is NOT a PostgreSQL ACL evaluator and must not be described as one. A
 * regex replay cannot see privileges materialised by SQL it does not
 * understand: `ALTER DEFAULT PRIVILEGES`, role membership and inheritance,
 * grants issued from a PL/pgSQL `EXECUTE format(...)` whose text is computed at
 * runtime, ownership changes, or anything else Postgres resolves for itself.
 *
 * The AUTHORITATIVE check is
 * `backend/tests/db-integration/final-schema-gate.sql`, which CI runs with
 * `psql -v ON_ERROR_STOP=1` against the local Supabase stack AFTER every
 * repository migration has actually been applied. That gate uses
 * has_table_privilege / has_column_privilege / pg_class.relrowsecurity /
 * pg_policies, so it sees the state Postgres genuinely computed. If the two
 * layers ever disagree, the SQL gate is right.
 *
 * ── The defect being guarded ────────────────────────────────────────────────
 *
 * The P0 was a composition, not a single bad line: a PERMISSIVE self-UPDATE
 * policy on public.profiles plus the default browser-role UPDATE grant, on a
 * table whose `role` column is the authority both the backend actor resolver
 * and app_private.is_admin() trust. Either half alone is harmless; together
 * they let any customer make themselves an administrator.
 *
 * So this guard replays EVERY migration in filename order and asserts the FINAL
 * state — a guard that only inspected the lockdown migration would keep passing
 * while a later migration quietly re-granted the privilege.
 *
 * Pure static analysis: no Supabase, no network, no database, no new dependency.
 *
 * Run:  node --test tests/profiles-acl-lockdown.test.mjs
 *       (also runs as part of `npm run test:policy`, which CI requires)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const BACKEND_SRC = join(REPO_ROOT, "backend", "src");

const BROWSER_ROLES = ["public", "anon", "authenticated"];

/** Migrations in the order Postgres applies them: lexicographic by filename. */
function orderedMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

/** Strip line comments so commented-out SQL never counts as applied state. */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

function splitRoleList(raw) {
  return raw
    .split(",")
    .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())
    .filter(Boolean);
}

/**
 * Replay a migration list and return the final recognised ACL/policy state of
 * public.profiles.
 *
 * Takes the list as a parameter so the synthetic regression cases below can
 * append a hypothetical future migration without writing one into the
 * repository. Production callers use the default.
 *
 * Seeding matters: Supabase creates public-schema tables with the browser roles
 * already holding every privilege, and the pre-fix Production metadata
 * confirmed exactly that for this table. Starting from "granted" is what makes
 * a MISSING revoke fail this test instead of passing by omission.
 */
function replayProfilesState(migrations = orderedMigrations()) {
  const state = {
    tableUpdate: new Set(BROWSER_ROLES),
    roleColumnUpdate: new Set(BROWSER_ROLES),
    tableSelect: new Set(BROWSER_ROLES),
    serviceRole: new Set(),
    policies: new Map(),
    lockdownSeen: false,
    regrantAfterLockdown: [],
    unsafePolicyAfterLockdown: [],
  };

  const target = String.raw`(?:TABLE\s+)?(?:ONLY\s+)?public\.profiles`;
  const schemaWide = String.raw`ALL\s+TABLES\s+IN\s+SCHEMA\s+public`;

  /** Apply one grant/revoke to the tracked state. */
  const applyPrivilege = ({ migration, privs, roles, columnScoped, granting }) => {
    const touchesUpdate = /\bUPDATE\b/.test(privs) || /\bALL\b/.test(privs);
    const touchesSelect = /\bSELECT\b/.test(privs) || /\bALL\b/.test(privs);

    for (const role of roles) {
      if (touchesSelect && !columnScoped) {
        if (granting) state.tableSelect.add(role);
        else state.tableSelect.delete(role);
      }

      if (touchesUpdate) {
        if (columnScoped) {
          const cols = splitRoleList(columnScoped);
          // `%s` is the dynamic all-columns list emitted by the lockdown DO block.
          const touchesRole = cols.includes("role") || cols.includes("%s");
          if (touchesRole) {
            if (granting) state.roleColumnUpdate.add(role);
            else state.roleColumnUpdate.delete(role);
          }
        } else if (granting) {
          state.tableUpdate.add(role);
          state.roleColumnUpdate.add(role);
        } else {
          state.tableUpdate.delete(role);
          state.roleColumnUpdate.delete(role);
        }
      }

      if (role === "service_role") {
        for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          if (privs.includes(p) || /\bALL\b/.test(privs)) {
            if (granting) state.serviceRole.add(p);
            else state.serviceRole.delete(p);
          }
        }
      }

      if (granting && state.lockdownSeen && BROWSER_ROLES.includes(role) && touchesUpdate) {
        state.regrantAfterLockdown.push(`${migration}: GRANT UPDATE to ${role}`);
      }
    }
  };

  for (const { name, sql: raw } of migrations) {
    const sql = stripComments(raw);

    // GRANT <privs> ON [TABLE] public.profiles TO <roles>
    for (const m of sql.matchAll(
      new RegExp(String.raw`GRANT\s+([\s\S]*?)\s+ON\s+${target}\s+TO\s+([^;]+);`, "gi"),
    )) {
      applyPrivilege({
        migration: name,
        privs: m[1].toUpperCase(),
        roles: splitRoleList(m[2]),
        columnScoped: /UPDATE\s*\(([^)]*)\)/i.exec(m[1])?.[1] ?? null,
        granting: true,
      });
    }

    // GRANT <privs> ON ALL TABLES IN SCHEMA public TO <roles>
    // Postgres expands this over every existing table, public.profiles included,
    // so it restores exactly the privilege the lockdown removed.
    for (const m of sql.matchAll(
      new RegExp(String.raw`GRANT\s+([\s\S]*?)\s+ON\s+${schemaWide}\s+TO\s+([^;]+);`, "gi"),
    )) {
      applyPrivilege({
        migration: `${name} (schema-wide)`,
        privs: m[1].toUpperCase().replace(/\bPRIVILEGES\b/g, ""),
        roles: splitRoleList(m[2]),
        columnScoped: null,
        granting: true,
      });
    }

    // REVOKE <privs> ON [TABLE] public.profiles FROM <roles>
    for (const m of sql.matchAll(
      new RegExp(String.raw`REVOKE\s+([\s\S]*?)\s+ON\s+${target}\s+FROM\s+([^;']+)[;']`, "gi"),
    )) {
      applyPrivilege({
        migration: name,
        privs: m[1].toUpperCase(),
        roles: splitRoleList(m[2]),
        columnScoped: /UPDATE\s*\(([^)]*)\)/i.exec(m[1])?.[1] ?? null,
        granting: false,
      });
    }

    // REVOKE <privs> ON ALL TABLES IN SCHEMA public FROM <roles>
    for (const m of sql.matchAll(
      new RegExp(String.raw`REVOKE\s+([\s\S]*?)\s+ON\s+${schemaWide}\s+FROM\s+([^;']+)[;']`, "gi"),
    )) {
      applyPrivilege({
        migration: `${name} (schema-wide)`,
        privs: m[1].toUpperCase().replace(/\bPRIVILEGES\b/g, ""),
        roles: splitRoleList(m[2]),
        columnScoped: null,
        granting: false,
      });
    }

    // CREATE POLICY "name" ON public.profiles [FOR cmd] ...
    for (const m of sql.matchAll(
      new RegExp(
        String.raw`CREATE\s+POLICY\s+"?([^"\s]+(?:\s+[^"\s]+)*?)"?\s+ON\s+${target}([\s\S]*?);`,
        "gi",
      ),
    )) {
      const policyName = m[1].trim();
      const body = m[2];
      const cmd = (/FOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i.exec(body)?.[1] ?? "ALL").toUpperCase();
      state.policies.set(policyName, { cmd, migration: name });

      const writes = cmd === "UPDATE" || cmd === "ALL";
      const selfScoped = /auth\.uid\(\)\s*=\s*id/i.test(body);
      if (state.lockdownSeen && writes && selfScoped) {
        state.unsafePolicyAfterLockdown.push(`${name}: policy "${policyName}" (${cmd})`);
      }
    }

    // DROP POLICY [IF EXISTS] "name" ON public.profiles
    for (const m of sql.matchAll(
      new RegExp(
        String.raw`DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([^"\s]+(?:\s+[^"\s]+)*?)"?\s*\n?\s*ON\s+${target}`,
        "gi",
      ),
    )) {
      state.policies.delete(m[1].trim());
    }

    if (name.includes("lock_profiles_browser_update_privileges")) {
      state.lockdownSeen = true;
    }
  }

  return state;
}

/** True when the replayed state would let a browser role write profiles again. */
function isDangerous(s) {
  return (
    BROWSER_ROLES.some((r) => s.tableUpdate.has(r) || s.roleColumnUpdate.has(r)) ||
    s.regrantAfterLockdown.length > 0
  );
}

const state = replayProfilesState();

// ── 1. The lockdown migration exists and is part of the ordered history ──────

test("the profiles ACL lockdown migration is present", () => {
  const found = orderedMigrations().some((m) =>
    m.name.includes("lock_profiles_browser_update_privileges"),
  );
  assert.ok(found, "expected a *_lock_profiles_browser_update_privileges.sql migration");
  assert.ok(state.lockdownSeen, "lockdown migration was not reached during replay");
});

// ── 2. Final state: browser roles hold no UPDATE on public.profiles ──────────

test("no browser role holds table-level UPDATE on public.profiles", () => {
  const offenders = BROWSER_ROLES.filter((r) => state.tableUpdate.has(r));
  assert.deepEqual(
    offenders,
    [],
    `FRA-S2-001 would be reopened: table UPDATE on public.profiles held by ${offenders.join(", ")}`,
  );
});

test("no browser role holds UPDATE on public.profiles.role", () => {
  const offenders = BROWSER_ROLES.filter((r) => state.roleColumnUpdate.has(r));
  assert.deepEqual(
    offenders,
    [],
    `FRA-S2-001 would be reopened: UPDATE on profiles.role held by ${offenders.join(", ")}`,
  );
});

test("the unrestricted customer self-UPDATE policy is not in the final state", () => {
  assert.equal(
    state.policies.has("Users can update their own profiles"),
    false,
    'policy "Users can update their own profiles" must stay dropped',
  );
});

test("no later migration re-grants browser UPDATE after the lockdown", () => {
  assert.deepEqual(
    state.regrantAfterLockdown,
    [],
    `re-grant detected after lockdown: ${state.regrantAfterLockdown.join("; ")}`,
  );
});

test("no later migration recreates a customer self-UPDATE policy on profiles", () => {
  // Recreating one is only safe while browser roles hold no table UPDATE. If a
  // future migration adds both, this test is the thing that catches it.
  const browserCanUpdate = BROWSER_ROLES.some((r) => state.tableUpdate.has(r));
  if (!browserCanUpdate) return;
  assert.deepEqual(
    state.unsafePolicyAfterLockdown,
    [],
    `self-UPDATE policy recreated while browser roles hold table UPDATE: ${state.unsafePolicyAfterLockdown.join("; ")}`,
  );
});

// ── 3. Final state: legitimate access is preserved ───────────────────────────

test("authenticated retains SELECT on public.profiles", () => {
  assert.ok(
    state.tableSelect.has("authenticated"),
    "authenticated must keep SELECT so the owner/admin read policies still work",
  );
});

test("service_role retains SELECT/INSERT/UPDATE/DELETE on public.profiles", () => {
  for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert.ok(state.serviceRole.has(priv), `service_role must keep ${priv} on public.profiles`);
  }
});

test("the admin UPDATE policy is untouched by the lockdown", () => {
  const adminPolicy = state.policies.get("Admins can update any profile");
  assert.ok(adminPolicy, 'policy "Admins can update any profile" must still exist');
  assert.equal(adminPolicy.cmd, "UPDATE");
});

// ── 4. Non-vacuous coverage: schema-wide grants must be recognised ───────────
//
// A hypothetical future migration is appended in memory only — nothing is
// written into supabase/migrations. `29990101...` sorts last, so it replays
// after the lockdown exactly as a real later migration would.

function withSyntheticMigration(sql) {
  return replayProfilesState([
    ...orderedMigrations(),
    { name: "29990101000000_synthetic_regression_probe.sql", sql },
  ]);
}

test("the real repository history is safe (control for the synthetic cases)", () => {
  assert.equal(
    isDangerous(state),
    false,
    "baseline repository migrations must not leave browser UPDATE in place",
  );
});

test("detects GRANT UPDATE ON ALL TABLES IN SCHEMA public TO authenticated", () => {
  const s = withSyntheticMigration(
    "GRANT UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;",
  );
  assert.ok(
    s.tableUpdate.has("authenticated"),
    "schema-wide GRANT UPDATE must restore table UPDATE for authenticated",
  );
  assert.ok(
    s.roleColumnUpdate.has("authenticated"),
    "schema-wide GRANT UPDATE must restore UPDATE on the role column",
  );
  assert.ok(
    s.regrantAfterLockdown.some((e) => e.includes("authenticated")),
    "schema-wide re-grant after the lockdown must be reported",
  );
  assert.ok(isDangerous(s), "schema-wide GRANT UPDATE must be treated as reopening FRA-S2-001");
});

test("detects GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon", () => {
  const s = withSyntheticMigration(
    "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon;",
  );
  assert.ok(s.tableUpdate.has("anon"), "GRANT ALL must restore table UPDATE for anon");
  assert.ok(s.roleColumnUpdate.has("anon"), "GRANT ALL must restore UPDATE on the role column");
  assert.ok(
    s.regrantAfterLockdown.some((e) => e.includes("anon")),
    "schema-wide GRANT ALL after the lockdown must be reported",
  );
  assert.ok(isDangerous(s), "schema-wide GRANT ALL must be treated as reopening FRA-S2-001");
});

test("detects a schema-wide grant to PUBLIC", () => {
  const s = withSyntheticMigration("GRANT UPDATE ON ALL TABLES IN SCHEMA public TO PUBLIC;");
  assert.ok(s.tableUpdate.has("public"), "a PUBLIC schema-wide grant must be recognised");
  assert.ok(isDangerous(s));
});

test("a schema-wide revoke after a schema-wide grant is recognised", () => {
  const s = withSyntheticMigration(
    [
      "GRANT UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;",
      "REVOKE UPDATE ON ALL TABLES IN SCHEMA public FROM authenticated;",
    ].join("\n"),
  );
  assert.equal(
    s.tableUpdate.has("authenticated"),
    false,
    "a following schema-wide REVOKE must clear the grant again",
  );
});

test("a recreated self-UPDATE policy plus a schema-wide grant is caught", () => {
  const s = withSyntheticMigration(
    [
      "GRANT UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;",
      'CREATE POLICY "Users can edit their own profile" ON public.profiles',
      "  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);",
    ].join("\n"),
  );
  assert.ok(isDangerous(s), "grant + self-update policy must be flagged");
  assert.ok(
    s.unsafePolicyAfterLockdown.length > 0,
    "the recreated self-update policy must be reported",
  );
});

// ── 5. The application-side half of the contract ─────────────────────────────

const dtoSource = readFileSync(
  join(BACKEND_SRC, "modules", "profiles", "profiles.dto.ts"),
  "utf8",
);
const profilesServiceSource = readFileSync(
  join(BACKEND_SRC, "modules", "profiles", "profiles.service.ts"),
  "utf8",
);
const mainSource = readFileSync(join(BACKEND_SRC, "main.ts"), "utf8");

const AUTHORITY_FIELDS = [
  "role",
  "points",
  "account_type",
  "is_active",
  "delivery_company_id",
  "merchant_id",
  "email",
];

test("UpdateMyProfileDto exposes only the three editable profile fields", () => {
  const declared = [...dtoSource.matchAll(/^\s{2}([a-z_][a-z0-9_]*)\??\s*:/gim)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(declared)].sort(),
    ["address", "full_name", "phone"],
    "UpdateMyProfileDto gained or lost a field — re-review before changing this",
  );
});

test("UpdateMyProfileDto cannot accept any authority field", () => {
  for (const field of AUTHORITY_FIELDS) {
    assert.equal(
      new RegExp(String.raw`^\s{2}${field}\??\s*:`, "im").test(dtoSource),
      false,
      `UpdateMyProfileDto must never accept "${field}"`,
    );
  }
});

test("customer profile edits are routed through the backend service_role client", () => {
  assert.match(
    profilesServiceSource,
    /this\.supabaseAdmin\.client\s*\n?\s*\.from\("profiles"\)/,
    "ProfilesService must write profiles through SupabaseAdminService (service_role)",
  );
  assert.match(
    profilesServiceSource,
    /assertSelfAccess/,
    "ProfilesService must assert self-access before writing",
  );
});

test("ProfilesService writes only the allowlisted profile columns", () => {
  const updateBlock = /\.update\(\{([\s\S]*?)\}\)/.exec(profilesServiceSource);
  assert.ok(updateBlock, "could not locate the ProfilesService update payload");
  const written = [...updateBlock[1].matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:/gim)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(written)].sort(),
    ["address", "full_name", "phone"],
    "ProfilesService must not write any column outside the allowlist",
  );
});

test("the global ValidationPipe strips non-DTO fields", () => {
  assert.match(
    mainSource,
    /new ValidationPipe\(\{[^}]*whitelist:\s*true/,
    "whitelist:true is what stops an unexpected body field reaching a DTO",
  );
});

// ── 6. The authoritative gate must stay wired up ─────────────────────────────

test("final-schema-gate.sql carries the authoritative FRA-S2-001 assertions", () => {
  const gate = readFileSync(
    join(HERE, "db-integration", "final-schema-gate.sql"),
    "utf8",
  );
  assert.match(gate, /FRA-S2-001/, "the SQL gate must contain the FRA-S2-001 block");
  assert.match(
    gate,
    /has_column_privilege\(\s*'authenticated',\s*'public\.profiles',\s*'role',\s*'UPDATE'\s*\)/,
    "the SQL gate must assert on the role column privilege",
  );
  assert.match(gate, /relrowsecurity/, "the SQL gate must assert RLS is enabled");
});
