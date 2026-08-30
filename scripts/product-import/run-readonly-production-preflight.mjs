#!/usr/bin/env node
/**
 * Read-only production preflight runner — FINAL PREFLIGHT EVIDENCE.
 *
 * HARD STOP (never violated by this script):
 *  - Never sets FIX_EXEC_AUTHORIZATION or FIX_EXEC_ALLOW_WRITES.
 *  - Never passes --execute/--resume to the guarded CLI.
 *  - Never writes evidence to tracked `docs/` (only to the gitignored
 *    `.tmp-product-import/` scratch space).
 *
 * Safety gates enforced BEFORE any HTTP call is made:
 *  1. Worktree must be clean (tracked dirty OR untracked outside `.tmp-product-import/`
 *     fails WORKTREE_NOT_CLEAN) — this preflight must run against exactly the reviewed,
 *     committed tree.
 *  2. `FIX_EXEC_APPROVED_HEAD_SHA` must be operator-supplied and equal to the actual
 *     `git rev-parse HEAD` — this script NEVER derives/defaults it (APPROVED_HEAD_REQUIRED /
 *     APPROVED_HEAD_MISMATCH).
 *  3. `FIX_EXEC_ADMIN_JWT` must be explicitly set by the operator (never loaded from
 *     `.tmp-product-import/ard-al-khaleej/batch100/.admin-jwt.env` or any other file) and
 *     is decoded + validated entirely locally (sub present, role not anon/service_role,
 *     exp present and >= 5 minutes in the future) before any network call
 *     (ADMIN_JWT_INVALID / ADMIN_JWT_ROLE_REJECTED / ADMIN_JWT_EXPIRED).
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { scrubSecrets } from "./lib/private-catalog-fix-plan.mjs";
import {
  validateApprovedHead,
  validateAdminJwtForReadOnly,
  assertCleanWorktreeForExecution,
  writeTmpPreflightEvidence,
} from "./lib/private-catalog-fix-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TASK_ID = "DilMart-ARD-AL-KHALEEJ-PRIVATE-CATALOG-FIX-RUNTIME-FINAL-PREFLIGHT-EVIDENCE-001";

/** backend/.env may supply SUPABASE_URL + a server key ONLY — never an Admin JWT. */
const BACKEND_ENV_ALLOWED_KEYS = [
  "SUPABASE_URL",
  "BATCH100_SUPABASE_SECRET_KEY",
  "SUPABASE_SECRET_KEY",
  "BATCH100_SUPABASE_SERVICE_ROLE_JWT",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function loadEnvFile(p, env, allowedKeys) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (allowedKeys && !allowedKeys.includes(key)) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (env[key] == null || env[key] === "") env[key] = v;
  }
}

function failLocal(code, extra = {}) {
  const evidence = {
    task_id: TASK_ID,
    mode: "preflight",
    read_only: true,
    ok: false,
    checked_live: false,
    error: code,
    execution_status: "NOT_EXECUTED",
    production_storage_writes: false,
    production_db_writes: false,
    fix_exec_authorization_set: false,
    fix_exec_allow_writes_set: false,
    ...extra,
  };
  const written = writeTmpPreflightEvidence(evidence, { root: ROOT });
  console.log(
    scrubSecrets(
      JSON.stringify({ ...evidence, evidence_path: written.path, evidence_sha256: written.sha256 }, null, 2),
    ),
  );
  process.exit(1);
}

const env = { ...process.env };
// This runner never authorizes writes and never leaks a stray fake-adapter fixture into
// what must be a genuine live production preflight.
delete env.FIX_EXEC_AUTHORIZATION;
delete env.FIX_EXEC_ALLOW_WRITES;
delete env.FIX_EXEC_FAKE_ADAPTERS_JSON;
// Never trust an ambient ADMIN_JWT sourced from elsewhere in the shell environment —
// FIX_EXEC_ADMIN_JWT (validated below) is the only accepted source.
delete env.ADMIN_JWT;

loadEnvFile(path.join(ROOT, "backend/.env"), env, BACKEND_ENV_ALLOWED_KEYS);
// NEVER load .tmp-product-import/ard-al-khaleej/batch100/.admin-jwt.env (or any other
// cached-JWT file) — FIX_EXEC_ADMIN_JWT must come only from the operator's own
// environment at invocation time.

// 1. Clean worktree — must run against exactly the reviewed/committed tree.
const worktree = assertCleanWorktreeForExecution(ROOT);
if (!worktree.ok) {
  failLocal(worktree.code, { worktree_offending: worktree.offending || null, message: worktree.message || null });
}

// 2. Operator-supplied approved Head SHA, verified against the actual Git HEAD.
const headGate = validateApprovedHead({ env, cwd: ROOT });
if (!headGate.ok) {
  failLocal(headGate.code, {
    actual_git_head: headGate.actual || null,
    approved_head_sha: headGate.approved || null,
    head_match: false,
  });
}
const head = headGate.headSha;

// 3. Admin JWT — explicit FIX_EXEC_ADMIN_JWT only, decoded + validated locally, never sent
//    anywhere (including to production) until every local check has passed.
const jwtGate = validateAdminJwtForReadOnly(env.FIX_EXEC_ADMIN_JWT);
if (!jwtGate.ok) {
  failLocal(jwtGate.code, {
    actual_git_head: head,
    approved_head_sha: head,
    head_match: true,
    jwt_reason: jwtGate.reason || null,
    jwt_role: jwtGate.role || null,
  });
}

const r = spawnSync(
  process.execPath,
  ["scripts/product-import/execute-private-catalog-fix.mjs", "--preflight"],
  {
    env,
    encoding: "utf8",
    cwd: ROOT,
    maxBuffer: 20 * 1024 * 1024,
  },
);

const combined = scrubSecrets(`${r.stdout || ""}\n${r.stderr || ""}`);
let parsed = null;
try {
  const start = combined.indexOf("{");
  const end = combined.lastIndexOf("}");
  if (start >= 0 && end > start) parsed = JSON.parse(combined.slice(start, end + 1));
} catch {
  parsed = null;
}

const evidence = {
  task_id: TASK_ID,
  mode: "preflight",
  read_only: true,
  ...(parsed || {}),
  ok: parsed?.ok ?? false,
  exit_code: r.status,
  // Verified locally above — never re-derived from the subprocess output, which is
  // scrubbed/parsed best-effort only.
  actual_git_head: head,
  approved_head_sha: head,
  head_match: true,
  execution_status: "NOT_EXECUTED",
  fix_exec_authorization_set: false,
  fix_exec_allow_writes_set: false,
  production_storage_writes: false,
  production_db_writes: false,
  scrubbed_cli_tail: combined.slice(-8000),
};

const written = writeTmpPreflightEvidence(evidence, { root: ROOT });

const summary = { ...evidence, evidence_path: written.path, evidence_sha256: written.sha256 };
delete summary.scrubbed_cli_tail;
delete summary.result;
console.log(scrubSecrets(JSON.stringify(summary, null, 2)));
process.exit(r.status === 0 ? 0 : 1);
