/**
 * FINAL PREFLIGHT EVIDENCE safety helpers.
 *
 * These are deliberately separate from the journal-bound `assertFirstExecuteHeadBinding` /
 * `assertResumeHeadBinding` gates in `private-catalog-fix-runtime.mjs` (which persist and
 * re-verify `journal.execution_head_sha` across --execute/--resume). This module backs:
 *   - the standalone read-only production preflight runner (never touches a journal), and
 *   - a shared clean-worktree write guard reused by both the runner and the CLI's
 *     --execute/--resume path.
 *
 * Hard rules enforced here:
 *   - `FIX_EXEC_APPROVED_HEAD_SHA` is NEVER derived from the actual Git HEAD — it must be
 *     operator-supplied, and is only ever verified against the actual HEAD.
 *   - Admin JWT metadata is decoded and validated entirely locally/offline — this module
 *     never makes an HTTP call and never logs the token.
 *   - Evidence is written only under the gitignored `.tmp-product-import/` scratch space,
 *     never under tracked `docs/`.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { getActualGitHead } from "./private-catalog-fix-execution.mjs";

export { getActualGitHead };

/**
 * Verify an operator-supplied `FIX_EXEC_APPROVED_HEAD_SHA` against the actual Git HEAD of
 * `cwd`. Never sets or defaults the approved SHA itself — a missing value always fails
 * closed (`APPROVED_HEAD_REQUIRED`), never silently passes.
 */
export function validateApprovedHead({
  env = process.env,
  cwd = process.cwd(),
  getActualHeadShaFn = getActualGitHead,
} = {}) {
  const approved = env?.FIX_EXEC_APPROVED_HEAD_SHA;
  const actual = getActualHeadShaFn(cwd);
  if (!approved || String(approved).trim() === "") {
    return { ok: false, code: "APPROVED_HEAD_REQUIRED", actual, approved: null };
  }
  if (!actual) {
    return { ok: false, code: "APPROVED_HEAD_REQUIRED", actual: null, approved };
  }
  if (String(approved) !== String(actual)) {
    return { ok: false, code: "APPROVED_HEAD_MISMATCH", actual, approved };
  }
  return { ok: true, headSha: actual, actual, approved };
}

/**
 * Decode and validate Admin JWT metadata locally — no signature verification (the adapter
 * layer still authenticates against Supabase/Backend), no network call, never logged.
 * Rejects anon/service_role tokens and any token expiring within `minRemainingSec`.
 */
export function validateAdminJwtForReadOnly(
  token,
  { nowSec = Math.floor(Date.now() / 1000), minRemainingSec = 300 } = {},
) {
  if (!token || typeof token !== "string" || !token.trim()) {
    return { ok: false, code: "ADMIN_JWT_INVALID", reason: "MISSING" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, code: "ADMIN_JWT_INVALID", reason: "MALFORMED" };
  }
  let payload;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return { ok: false, code: "ADMIN_JWT_INVALID", reason: "UNDECODABLE_PAYLOAD" };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, code: "ADMIN_JWT_INVALID", reason: "EMPTY_PAYLOAD" };
  }
  if (!payload.sub) {
    return { ok: false, code: "ADMIN_JWT_INVALID", reason: "MISSING_SUB" };
  }
  const role = payload.role || payload.app_metadata?.role || null;
  if (role === "anon" || role === "service_role") {
    return { ok: false, code: "ADMIN_JWT_ROLE_REJECTED", role };
  }
  if (payload.exp == null) {
    return { ok: false, code: "ADMIN_JWT_INVALID", reason: "MISSING_EXP" };
  }
  const remainingSec = Number(payload.exp) - Number(nowSec);
  if (!Number.isFinite(remainingSec) || remainingSec < minRemainingSec) {
    return {
      ok: false,
      code: "ADMIN_JWT_EXPIRED",
      remaining_sec: Number.isFinite(remainingSec) ? remainingSec : null,
      sub: payload.sub,
      role,
    };
  }
  return { ok: true, sub: payload.sub, role, remaining_sec: remainingSec };
}

/**
 * A genuine production write (or the real read-only production preflight runner) must
 * execute against exactly the reviewed/committed tree. Any tracked modification (staged or
 * unstaged), or any untracked file outside the gitignored `.tmp-product-import/` scratch
 * space, fails closed with `WORKTREE_NOT_CLEAN`.
 */
export function assertCleanWorktreeForExecution(cwd = process.cwd()) {
  let raw;
  try {
    raw = execSync("git status --porcelain --untracked-files=all", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    return { ok: false, code: "WORKTREE_STATUS_UNAVAILABLE", message: String(e.message || e) };
  }

  const offending = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Porcelain v1: 2-char status code + 1 space + path (renames use "old -> new").
    const rawPath = line.slice(3).split(" -> ").pop().trim();
    const unquoted = rawPath.replace(/^"|"$/g, "");
    const normalized = unquoted.replace(/\\/g, "/").replace(/^\.\//, "");
    if (normalized.startsWith(".tmp-product-import/")) continue;
    offending.push(line);
  }

  if (offending.length) {
    return { ok: false, code: "WORKTREE_NOT_CLEAN", offending };
  }
  return { ok: true };
}

/**
 * Write read-only production preflight evidence ONLY to the gitignored
 * `.tmp-product-import/` scratch space — never to tracked `docs/`. Returns the SHA-256 of
 * the written file so callers can record it alongside the evidence itself.
 */
export function writeTmpPreflightEvidence(evidence, { root = process.cwd() } = {}) {
  const dir = path.join(root, ".tmp-product-import/ard-al-khaleej/private-catalog-fix-plan");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "production-readonly-preflight.json");
  fs.writeFileSync(filePath, JSON.stringify(evidence, null, 2));
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
  return { path: filePath, sha256 };
}
