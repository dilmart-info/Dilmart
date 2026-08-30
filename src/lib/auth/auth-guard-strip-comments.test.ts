import { describe, expect, it } from "vitest";
// The guard is a plain .mjs script; importing its helper keeps this regression inside the
// suite CI already runs.
// @ts-expect-error - untyped .mjs guard script
import { stripComments } from "../../../scripts/auth/check-auth-lifecycle-boundary.mjs";

/**
 * The guard reported a false violation on Windows checkouts and passed on CI. The cause
 * was line-ending dependent: after split("\n") a CRLF file leaves \r at the end of every
 * line, and in JavaScript `.` does not match \r, so `/\/\/.*$/` never anchored and the
 * comment survived stripping. The comment in supabase/client.ts quotes the forbidden
 * pattern, so it was then flagged as real code.
 */
describe("auth guard comment stripping", () => {
  const FORBIDDEN = "storage: localStorage";
  const source = [
    "import { createClient } from '@supabase/supabase-js';",
    "",
    "// Storage is platform-aware and owned by @/lib/auth/auth-storage.",
    "// Never hardcode `storage: localStorage`.",
    "",
    "export const supabase = createClient(url, key, {",
    "  auth: { storage: authStorage },",
    "});",
  ];

  it("removes the quoted pattern from line comments with LF endings", () => {
    const stripped = stripComments(source.join("\n"));
    expect(stripped).not.toContain(FORBIDDEN);
    expect(stripped).toContain("storage: authStorage");
  });

  it("removes it identically with CRLF endings", () => {
    const stripped = stripComments(source.join("\r\n"));
    expect(stripped).not.toContain(FORBIDDEN);
    expect(stripped).toContain("storage: authStorage");
  });

  it("produces the same violation-relevant result for both line endings", () => {
    const lf = stripComments(source.join("\n")).replace(/\r/g, "");
    const crlf = stripComments(source.join("\r\n")).replace(/\r/g, "");
    expect(crlf).toBe(lf);
  });

  it("still strips block comments and leaves real code alone", () => {
    const withBlock = `/* storage: localStorage */\nconst a = 1;\r\nconst b = "storage: localStorage";`;
    const stripped = stripComments(withBlock);
    expect(stripped).toContain("const a = 1;");
    // A real string literal is code, not a comment — it must survive so the guard can
    // still flag it.
    expect(stripped).toContain('const b = "storage: localStorage";');
  });
});
