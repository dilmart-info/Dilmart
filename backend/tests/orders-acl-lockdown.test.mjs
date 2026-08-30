/**
 * FRA-S5-001 static tripwire — public.orders must never be browser-writable.
 *
 * ── What this file is, and what it is NOT ───────────────────────────────────
 *
 * This is a STATIC MIGRATION GUARD. It reads migration TEXT with regular
 * expressions and replays the grant/revoke/policy statements it recognises, so a
 * dangerous migration fails review rather than CI minutes later.
 *
 * It is NOT a PostgreSQL ACL evaluator. A regex replay cannot see privileges
 * materialised by SQL it does not understand — `ALTER DEFAULT PRIVILEGES`, role
 * inheritance, grants issued from a computed `EXECUTE format(...)`, ownership
 * changes. The AUTHORITATIVE check is the `$fra_s5_001$` block in
 * `backend/tests/db-integration/final-schema-gate.sql`, which CI runs with
 * `psql -v ON_ERROR_STOP=1` against the local Supabase stack AFTER every
 * migration has actually been applied. If the two layers disagree, the SQL gate
 * is right.
 *
 * ── The defect being guarded ────────────────────────────────────────────────
 *
 * `public.orders` granted full CRUD to `anon` and `authenticated` while carrying
 * two column-unrestricted UPDATE policies — `Agents can update their assigned
 * orders` (`auth.uid() = agent_id`) and `Merchant members can update own
 * merchant orders` (`app_private.is_merchant_member(merchant_id)`). RLS cannot
 * restrict columns, so both authorised a write to EVERY column of a matching
 * row: an agent could rewrite the COD cash owed on their assigned orders, a
 * merchant the commission and settlement state of theirs. Either half alone is
 * inert; it is the pair that is a P0.
 *
 * Pure static analysis — no Supabase, no network, no database, no new dependency.
 *
 * Run:  node --test tests/orders-acl-lockdown.test.mjs
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

const BROWSER_ROLES = ["public", "anon", "authenticated"];
const TABLE = "orders";
const DROPPED_POLICIES = [
  "Agents can update their assigned orders",
  "Merchant members can update own merchant orders",
];
/** Ownership predicates that make a policy browser-satisfiable rather than admin-gated. */
const OWNER_SCOPED = /auth\.uid\(\)|is_merchant_member/i;

function orderedMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

/** Strip line comments so commented-out SQL never counts as applied state. */
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "");

const splitRoleList = (raw) =>
  raw
    .split(",")
    .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())
    .filter(Boolean);

/**
 * Replay a migration list and return the final recognised state of public.orders.
 *
 * Takes the list as a parameter so the negative cases can append a hypothetical
 * future migration in memory, without writing one into the repository.
 *
 * Seeding matters: Supabase creates public-schema tables with the browser roles
 * already holding every privilege, and the Stage 5 catalog query confirmed
 * exactly that for this table before containment. Starting from "granted" is
 * what makes a MISSING revoke fail this test instead of passing by omission.
 */
function replayOrdersState(migrations = orderedMigrations()) {
  const state = {
    tableUpdate: new Set(BROWSER_ROLES),
    columnUpdate: new Set(BROWSER_ROLES), // any column-level UPDATE, incl. financial
    tableSelect: new Set(BROWSER_ROLES),
    serviceRole: new Set(),
    policies: new Map(),
    lockdownSeen: false,
    regrantAfterLockdown: [],
    unsafePolicyAfterLockdown: [],
  };

  const target = String.raw`(?:TABLE\s+)?(?:ONLY\s+)?public\.${TABLE}`;
  const schemaWide = String.raw`ALL\s+TABLES\s+IN\s+SCHEMA\s+public`;

  const apply = ({ migration, privs, roles, columnScoped, granting }) => {
    const touchesUpdate = /\bUPDATE\b/.test(privs) || /\bALL\b/.test(privs);
    const touchesSelect = /\bSELECT\b/.test(privs) || /\bALL\b/.test(privs);

    for (const role of roles) {
      if (touchesSelect && !columnScoped) {
        if (granting) state.tableSelect.add(role);
        else state.tableSelect.delete(role);
      }

      if (touchesUpdate) {
        if (columnScoped) {
          // `%s` is the dynamic all-columns list emitted by the lockdown DO block.
          if (granting) state.columnUpdate.add(role);
          else state.columnUpdate.delete(role);
        } else if (granting) {
          state.tableUpdate.add(role);
          state.columnUpdate.add(role);
        } else {
          state.tableUpdate.delete(role);
          state.columnUpdate.delete(role);
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
        state.regrantAfterLockdown.push(
          `${migration}: GRANT UPDATE${columnScoped ? " (columns)" : ""} to ${role}`,
        );
      }
    }
  };

  for (const { name, sql: raw } of migrations) {
    const sql = stripComments(raw);

    for (const [pattern, granting, label] of [
      [String.raw`GRANT\s+([\s\S]*?)\s+ON\s+${target}\s+TO\s+([^;]+);`, true, name],
      [String.raw`GRANT\s+([\s\S]*?)\s+ON\s+${schemaWide}\s+TO\s+([^;]+);`, true, `${name} (schema-wide)`],
      [String.raw`REVOKE\s+([\s\S]*?)\s+ON\s+${target}\s+FROM\s+([^;']+)[;']`, false, name],
      [String.raw`REVOKE\s+([\s\S]*?)\s+ON\s+${schemaWide}\s+FROM\s+([^;']+)[;']`, false, `${name} (schema-wide)`],
    ]) {
      for (const m of sql.matchAll(new RegExp(pattern, "gi"))) {
        apply({
          migration: label,
          privs: m[1].toUpperCase().replace(/\bPRIVILEGES\b/g, ""),
          roles: splitRoleList(m[2]),
          columnScoped: /UPDATE\s*\(/i.test(m[1]),
          granting,
        });
      }
    }

    // Policy statements MUST be applied in true statement order. Several
    // migrations DROP a policy and immediately recreate it in the same file
    // (e.g. 20260216043544 for "Admins can update orders"); applying every
    // CREATE before every DROP would wrongly leave it deleted.
    const policyStatements = [];
    for (const m of sql.matchAll(
      new RegExp(
        String.raw`CREATE\s+POLICY\s+"?([^"\n]+?)"?\s+ON\s+${target}([\s\S]*?);`,
        "gi",
      ),
    )) {
      policyStatements.push({ at: m.index, kind: "create", name: m[1].trim(), body: m[2] });
    }
    for (const m of sql.matchAll(
      new RegExp(
        String.raw`DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([^"\n]+?)"?\s*\n?\s*ON\s+${target}`,
        "gi",
      ),
    )) {
      policyStatements.push({ at: m.index, kind: "drop", name: m[1].trim() });
    }
    policyStatements.sort((a, b) => a.at - b.at);

    for (const st of policyStatements) {
      if (st.kind === "drop") {
        state.policies.delete(st.name);
        continue;
      }
      const cmd = (/FOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i.exec(st.body)?.[1] ?? "ALL").toUpperCase();
      state.policies.set(st.name, { cmd, migration: name });

      const writes = cmd === "UPDATE" || cmd === "ALL";
      if (state.lockdownSeen && writes && OWNER_SCOPED.test(st.body)) {
        state.unsafePolicyAfterLockdown.push(`${name}: policy "${st.name}" (${cmd})`);
      }
    }

    if (name.includes("lock_orders_browser_update_privileges")) state.lockdownSeen = true;
  }

  return state;
}

/** True when the replayed state would let a browser role write orders again. */
const isDangerous = (s) =>
  BROWSER_ROLES.some((r) => s.tableUpdate.has(r) || s.columnUpdate.has(r)) ||
  s.regrantAfterLockdown.length > 0 ||
  DROPPED_POLICIES.some((p) => s.policies.has(p));

const state = replayOrdersState();

// ── 1. The lockdown migration is part of the ordered history ─────────────────

test("the orders ACL lockdown migration is present", () => {
  assert.ok(
    orderedMigrations().some((m) => m.name.includes("lock_orders_browser_update_privileges")),
    "expected a *_lock_orders_browser_update_privileges.sql migration",
  );
  assert.ok(state.lockdownSeen, "lockdown migration was not reached during replay");
});

// ── 2. Final state: no browser write reaches public.orders ───────────────────

test("no browser role holds table-level UPDATE on public.orders", () => {
  const offenders = BROWSER_ROLES.filter((r) => state.tableUpdate.has(r));
  assert.deepEqual(
    offenders,
    [],
    `FRA-S5-001 would be reopened: table UPDATE on public.orders held by ${offenders.join(", ")}`,
  );
});

test("no browser role holds column-level UPDATE on public.orders", () => {
  const offenders = BROWSER_ROLES.filter((r) => state.columnUpdate.has(r));
  assert.deepEqual(
    offenders,
    [],
    `FRA-S5-001 would be reopened: column UPDATE on public.orders held by ${offenders.join(", ")}`,
  );
});

for (const policy of DROPPED_POLICIES) {
  test(`the vulnerable policy "${policy}" is not in the final state`, () => {
    assert.equal(state.policies.has(policy), false, `policy "${policy}" must stay dropped`);
  });
}

test("no later migration re-grants browser UPDATE after the lockdown", () => {
  assert.deepEqual(
    state.regrantAfterLockdown,
    [],
    `re-grant detected after lockdown: ${state.regrantAfterLockdown.join("; ")}`,
  );
});

test("no later migration recreates an owner-scoped write policy on orders", () => {
  assert.deepEqual(
    state.unsafePolicyAfterLockdown,
    [],
    `owner-scoped write policy recreated after lockdown: ${state.unsafePolicyAfterLockdown.join("; ")}`,
  );
});

// ── 3. Final state: legitimate access is preserved ───────────────────────────

test("service_role retains SELECT/INSERT/UPDATE/DELETE on public.orders", () => {
  for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    assert.ok(state.serviceRole.has(priv), `service_role must keep ${priv} on public.orders`);
  }
});

test("the admin UPDATE policy is untouched by the lockdown", () => {
  const admin = state.policies.get("Admins can update orders");
  assert.ok(admin, 'policy "Admins can update orders" must still exist');
  assert.equal(admin.cmd, "UPDATE");
});

// ── 4. Non-vacuous negative coverage (in-memory hypotheticals) ───────────────
//
// `29990101...` sorts last, so each replays after the lockdown exactly as a real
// later migration would. Nothing is written into supabase/migrations.

const withSynthetic = (sql) =>
  replayOrdersState([
    ...orderedMigrations(),
    { name: "29990101000000_synthetic_orders_probe.sql", sql },
  ]);

test("the real repository history is safe (control)", () => {
  assert.equal(isDangerous(state), false, "baseline migrations must leave no browser UPDATE");
});

test("detects table-level GRANT UPDATE ON public.orders TO authenticated", () => {
  const s = withSynthetic("GRANT UPDATE ON TABLE public.orders TO authenticated;");
  assert.ok(s.tableUpdate.has("authenticated"));
  assert.ok(s.regrantAfterLockdown.some((e) => e.includes("authenticated")));
  assert.ok(isDangerous(s));
});

test("detects GRANT ALL PRIVILEGES ON public.orders TO anon", () => {
  const s = withSynthetic("GRANT ALL PRIVILEGES ON TABLE public.orders TO anon;");
  assert.ok(s.tableUpdate.has("anon"));
  assert.ok(isDangerous(s));
});

test("detects a schema-wide GRANT UPDATE ON ALL TABLES IN SCHEMA public", () => {
  const s = withSynthetic("GRANT UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;");
  assert.ok(s.tableUpdate.has("authenticated"));
  assert.ok(isDangerous(s));
});

test("detects a schema-wide GRANT ALL to PUBLIC", () => {
  const s = withSynthetic("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;");
  assert.ok(s.tableUpdate.has("public"));
  assert.ok(isDangerous(s));
});

test("detects a column-level UPDATE grant on a financial column", () => {
  const s = withSynthetic(
    "GRANT UPDATE (cash_expected_amount) ON TABLE public.orders TO authenticated;",
  );
  assert.ok(
    s.columnUpdate.has("authenticated"),
    "a column-level grant must reopen the column-UPDATE state",
  );
  assert.ok(isDangerous(s));
});

for (const policy of DROPPED_POLICIES) {
  test(`detects recreation of "${policy}"`, () => {
    const predicate = policy.startsWith("Agents")
      ? "USING (auth.uid() = agent_id) WITH CHECK (auth.uid() = agent_id)"
      : "USING (app_private.is_merchant_member(merchant_id)) WITH CHECK (app_private.is_merchant_member(merchant_id))";
    const s = withSynthetic(
      `CREATE POLICY "${policy}" ON public.orders FOR UPDATE ${predicate};`,
    );
    assert.ok(s.policies.has(policy), "the recreated policy must be seen");
    assert.ok(
      s.unsafePolicyAfterLockdown.length > 0,
      "recreating an owner-scoped write policy must be reported",
    );
    assert.ok(isDangerous(s));
  });
}

test("detects an equivalently-named owner-scoped write policy", () => {
  // The guard must not trust policy names: a differently-named policy with the
  // same agent-scoped predicate is the same defect.
  const s = withSynthetic(
    'CREATE POLICY "Couriers may edit their deliveries" ON public.orders FOR UPDATE USING (auth.uid() = agent_id);',
  );
  assert.ok(
    s.unsafePolicyAfterLockdown.some((e) => e.includes("Couriers may edit their deliveries")),
    "an owner-scoped write policy must be flagged regardless of its name",
  );
});

// ── 5. The authoritative gate must stay wired up ─────────────────────────────

test("final-schema-gate.sql carries the authoritative FRA-S5-001 assertions", () => {
  const gate = readFileSync(join(HERE, "db-integration", "final-schema-gate.sql"), "utf8");
  assert.match(gate, /\$fra_s5_001\$/, "the SQL gate must contain the FRA-S5-001 block");
  assert.match(
    gate,
    /has_table_privilege\(\s*'authenticated',\s*'public\.orders',\s*'UPDATE'\s*\)/,
    "the SQL gate must assert the authenticated table privilege",
  );
  assert.match(
    gate,
    /has_column_privilege\(r\.role,\s*'public\.orders'/,
    "the SQL gate must assert per-column privileges",
  );
});
