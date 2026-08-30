/**
 * Auth lifecycle boundary guard.
 *
 * Two invariants:
 * 1. The Supabase client must never hardcode `storage: localStorage`. Storage is
 *    platform-aware and owned by src/lib/auth/auth-storage.ts.
 * 2. Session-lifecycle calls (getSession / refreshSession / start|stopAutoRefresh /
 *    onAuthStateChange / signOut) may only appear inside the auth layer, so there
 *    is exactly one owner of refresh and logout semantics.
 *
 * Sign-in style calls (signInWithPassword / signUp / resend) are intentionally
 * NOT restricted here; they are wrapped by src/lib/auth/auth-actions.ts but do
 * not affect session lifecycle ownership.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = "src";
const CLIENT_FILE = "src/integrations/supabase/client.ts";

/** Files/globs allowed to call session-lifecycle APIs directly. */
const ALLOWLIST = [CLIENT_FILE, "src/lib/auth/"];

const FORBIDDEN_CALL_PATTERN =
  /supabase\.auth\.(getSession|refreshSession|startAutoRefresh|stopAutoRefresh|onAuthStateChange|signOut)\s*\(/;

const LOCAL_STORAGE_PATTERN = /storage\s*:\s*localStorage\b/;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walk(fullPath));
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath.replaceAll("\\", "/"));
    }
  }
  return files;
}

function isAllowed(file) {
  return ALLOWLIST.some((allowed) => (allowed.endsWith("/") ? file.startsWith(allowed) : file === allowed));
}

/**
 * Strips comments so guidance written in comments is never reported as a violation.
 *
 * The line-comment pass uses [^\n]* rather than .* on purpose. In JavaScript `.` excludes
 * every line terminator including \r, so on a CRLF checkout `//...` would not reach the
 * `$` anchor and the comment survived — which made this guard fail on Windows while
 * passing on the LF checkout CI uses.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => line.replace(/\/\/[^\n]*$/, ""))
    .join("\n");
}

const violations = [];

if (!existsSync(CLIENT_FILE)) {
  violations.push({ file: CLIENT_FILE, line: 0, reason: "Supabase client file is missing." });
} else {
  const clientContent = stripComments(readFileSync(CLIENT_FILE, "utf8"));
  clientContent.split("\n").forEach((line, idx) => {
    if (LOCAL_STORAGE_PATTERN.test(line)) {
      violations.push({
        file: CLIENT_FILE,
        line: idx + 1,
        reason: "`storage: localStorage` is forbidden — use authStorage from @/lib/auth/auth-storage.",
        text: line.trim(),
      });
    }
  });

  if (!/storage\s*:\s*authStorage\b/.test(clientContent)) {
    violations.push({
      file: CLIENT_FILE,
      line: 0,
      reason: "Supabase client must configure `storage: authStorage`.",
    });
  }

  if (!/storageKey\s*:\s*platformStorageKey\b/.test(clientContent)) {
    violations.push({
      file: CLIENT_FILE,
      line: 0,
      reason: "Supabase client must configure `storageKey: platformStorageKey`.",
    });
  }
}

for (const file of walk(SRC_DIR)) {
  if (isAllowed(file)) continue;
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, idx) => {
    const match = FORBIDDEN_CALL_PATTERN.exec(line);
    if (!match) return;
    violations.push({
      file,
      line: idx + 1,
      reason: `supabase.auth.${match[1]}() must go through @/lib/auth (authSessionManager / auth-actions).`,
      text: line.trim(),
    });
  });
}

if (violations.length > 0) {
  console.error("Auth lifecycle boundary guard failed.\n");
  for (const v of violations) {
    const location = v.line > 0 ? `${v.file}:${v.line}` : v.file;
    console.error(`${location} ${v.reason}${v.text ? `\n    ${v.text}` : ""}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

console.log("Auth lifecycle boundary guard passed. Session lifecycle is owned by src/lib/auth only.");
