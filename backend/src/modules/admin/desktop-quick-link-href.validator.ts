/**
 * DilMart-STORE-DESKTOP-QUICK-LINKS-SECURITY-047/048/049 — canonical `desktop_quick_links.href`
 * validator.
 *
 * THE single source of truth for what an admin-authored quick-link href may be. Positive
 * allowlist, not a scheme blocklist: a candidate is accepted ONLY if it structurally matches
 * "internal Store path" — every other input (any scheme, any obfuscation, any encoding trick,
 * any external URL however well-formed) is rejected by construction. Policy is internal-only
 * (least privilege): migration seed data and the admin UX copy both only ever reference internal
 * Store paths (/offers, /products?..., /category/...), and no production evidence of a
 * legitimate external-link requirement was found. This is deliberately a different, broader-query
 * contract than `customer-handoff-target.validator.ts` (that file governs a much narrower,
 * higher-security deep-link surface with a strict per-route query allowlist) — desktop quick
 * links are admin-curated marketing content (already gated by `@Roles("super_admin","admin")` +
 * RLS with no JWT write policy) that legitimately needs `search=`/`sort=`-style query
 * flexibility. Do not merge the two allowlists; they serve different threat models.
 *
 * Security invariant: `whatwgStrip`/`sniffScheme` below exist ONLY to produce an accurate
 * rejection LABEL (e.g. distinguishing `INVALID_JAVASCRIPT_SCHEME` from a generic bucket) for
 * admin UX / audit purposes. They must never be used to decide acceptance — acceptance is a
 * structural check against the ORIGINAL, unmodified input. Concretely: leading/trailing
 * whitespace or embedded tab/CR/LF (` https://x`, `https://x\r`, `jav\tascript:...`) is rejected
 * outright, never stripped-then-accepted.
 *
 * `src/lib/desktop-quick-link-href.ts` is the client-side mirror — keep both in sync.
 */

export type DesktopQuickLinkHrefClassification =
  | "VALID_INTERNAL"
  | "INVALID_JAVASCRIPT_SCHEME"
  | "INVALID_DATA_SCHEME"
  | "INVALID_VBSCRIPT_SCHEME"
  | "INVALID_FILE_SCHEME"
  | "INVALID_BLOB_SCHEME"
  | "INVALID_ABOUT_SCHEME"
  | "INVALID_INTENT_SCHEME"
  | "INVALID_UNKNOWN_SCHEME"
  | "INVALID_EXTERNAL_NOT_ALLOWED"
  | "INVALID_PROTOCOL_RELATIVE"
  | "INVALID_UNSAFE_CHARACTERS"
  | "INVALID_MALFORMED"
  | "INVALID_LEADING_OR_TRAILING_WHITESPACE"
  | "INVALID_EMPTY_OR_TOO_LONG";

const MAX_HREF_LEN = 500;

/** Named scheme → classification, for precise (audit/UX) labeling only — never the security gate itself. */
const NAMED_UNSAFE_SCHEMES: ReadonlyArray<[string, DesktopQuickLinkHrefClassification]> = [
  ["javascript", "INVALID_JAVASCRIPT_SCHEME"],
  ["data", "INVALID_DATA_SCHEME"],
  ["vbscript", "INVALID_VBSCRIPT_SCHEME"],
  ["file", "INVALID_FILE_SCHEME"],
  ["blob", "INVALID_BLOB_SCHEME"],
  ["about", "INVALID_ABOUT_SCHEME"],
  ["intent", "INVALID_INTENT_SCHEME"],
];

/** Control chars (0x00–0x1F, 0x7F) or the markup/quoting characters that never belong in a stored href. */
function hasUnsafeChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
    if (c === 0x5c) return true; // backslash
    if (c === 0x3c || c === 0x3e) return true; // < >
    if (c === 0x22 || c === 0x27 || c === 0x60) return true; // " ' `
  }
  return false;
}

/**
 * Mirrors the WHATWG URL parser's own preprocessing (used by real browsers before scheme-sniffing):
 * strip every ASCII tab/newline/CR anywhere in the string, then trim leading/trailing C0 controls
 * and spaces. Used ONLY to produce an accurate classification label below — never to decide
 * acceptance, since that would let a dirty candidate (e.g. " https://evil") get laundered into a
 * clean one purely by stripping.
 */
function whatwgStrip(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d) continue; // tab, LF, CR
    out += s[i];
  }
  let start = 0;
  let end = out.length;
  while (start < end && out.charCodeAt(start) <= 0x20) start++;
  while (end > start && out.charCodeAt(end - 1) <= 0x20) end--;
  return out.slice(start, end);
}

/** Best-effort scheme sniff on the WHATWG-normalized string, for classification labels only. */
function sniffScheme(stripped: string): string | null {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(stripped);
  return m ? m[1].toLowerCase() : null;
}

/**
 * True if `s` still contains a `%XX` escape sequence — i.e. one more decode layer remains.
 * Applied AFTER a single `decodeURIComponent()` pass, so a literal percent sign that survived
 * that decode (e.g. `"50%"` from `"50%25"`) is valid data, not another encoding layer, and must
 * NOT be flagged here — only a residual escape-looking `%XX` after decoding indicates the input
 * was double-encoded.
 */
function containsEncodedEscape(s: string): boolean {
  return /%[0-9A-Fa-f]{2}/.test(s);
}

/** Control chars only (0x00–0x1F, 0x7F) — used on already-decoded text, where quote/backtick/
 * angle-bracket characters are legitimate data (e.g. an apostrophe in a brand name) and only
 * actual control characters (e.g. a decoded `%0A` newline) are disallowed. */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

/**
 * Classifies (never throws) a candidate `desktop_quick_links.href`. `VALID_INTERNAL` is the only
 * accepting outcome; every other value is one specific rejection reason, safe to surface in admin
 * UX or a read-only audit (it never echoes the raw payload).
 */
export function classifyDesktopQuickLinkHref(input: unknown): DesktopQuickLinkHrefClassification {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_HREF_LEN) {
    return "INVALID_EMPTY_OR_TOO_LONG";
  }

  // Reject raw leading/trailing whitespace/control chars on the ORIGINAL string up front —
  // acceptance must never depend on a normalized copy. Catches " https://x", "https://x ",
  // "\thttps://x", "https://x\r", "\nhttps://x", and equivalent internal-path variants.
  if (input.charCodeAt(0) <= 0x20 || input.charCodeAt(input.length - 1) <= 0x20) {
    return "INVALID_LEADING_OR_TRAILING_WHITESPACE";
  }

  // ── Internal path: exactly one leading slash, never "//...". Only accepted shape. ─────────
  if (input[0] === "/" && input[1] !== "/") {
    if (input.includes("#")) return "INVALID_UNSAFE_CHARACTERS"; // no fragments — least privilege
    const qIdx = input.indexOf("?");
    const rawPath = qIdx >= 0 ? input.slice(0, qIdx) : input;
    const queryString = qIdx >= 0 ? input.slice(qIdx + 1) : "";

    if (hasUnsafeChar(rawPath)) return "INVALID_UNSAFE_CHARACTERS";
    if (rawPath.includes("..")) return "INVALID_UNSAFE_CHARACTERS"; // traversal

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      return "INVALID_MALFORMED";
    }
    if (containsEncodedEscape(decodedPath)) return "INVALID_MALFORMED"; // double-encoded bypass attempt
    if (decodedPath[0] !== "/" || decodedPath[1] === "/") return "INVALID_UNSAFE_CHARACTERS";
    if (hasUnsafeChar(decodedPath) || decodedPath.includes("..")) return "INVALID_UNSAFE_CHARACTERS";

    if (queryString.length > 0) {
      if (hasUnsafeChar(queryString)) return "INVALID_UNSAFE_CHARACTERS";
      // Both the key AND the value of every pair must decode exactly once (reject
      // double-encoding / malformed escapes / decoded control chars) — a malformed or
      // double-encoded KEY (e.g. "%ZZ=ok", "%2525=ok") is rejected exactly like a bad value.
      // A literal percent sign that survives one decode (e.g. "50%" from "50%25") is valid data,
      // not another encoding layer — see `containsEncodedEscape`. Legitimate single-encoded
      // values (e.g. brand=O%27me%27do) are preserved as-is.
      for (const pair of queryString.split("&")) {
        const eq = pair.indexOf("=");
        const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
        const rawVal = eq >= 0 ? pair.slice(eq + 1) : "";
        for (const rawComponent of [rawKey, rawVal]) {
          let decoded: string;
          try {
            decoded = decodeURIComponent(rawComponent);
          } catch {
            return "INVALID_MALFORMED";
          }
          if (containsEncodedEscape(decoded)) return "INVALID_MALFORMED";
          if (hasControlChar(decoded)) return "INVALID_UNSAFE_CHARACTERS";
        }
      }
    }
    return "VALID_INTERNAL";
  }

  // ── Not an internal path — policy is internal-only, so everything else is rejected. The
  // WHATWG-normalized copy below is used ONLY to produce a precise rejection label. ──────────
  const stripped = whatwgStrip(input);
  if (hasUnsafeChar(stripped)) {
    const scheme = sniffScheme(stripped);
    const named = scheme && NAMED_UNSAFE_SCHEMES.find(([s]) => s === scheme);
    return named ? named[1] : "INVALID_UNSAFE_CHARACTERS";
  }

  if (stripped.startsWith("//")) return "INVALID_PROTOCOL_RELATIVE";

  if (/^https?:\/\//i.test(stripped)) return "INVALID_EXTERNAL_NOT_ALLOWED";

  const scheme = sniffScheme(stripped);
  if (scheme) {
    const named = NAMED_UNSAFE_SCHEMES.find(([s]) => s === scheme);
    if (named) return named[1];
    return "INVALID_UNKNOWN_SCHEME";
  }
  return "INVALID_UNSAFE_CHARACTERS";
}

export function isValidDesktopQuickLinkHref(input: unknown): boolean {
  return classifyDesktopQuickLinkHref(input) === "VALID_INTERNAL";
}

/** Human-readable (Arabic, admin-facing) message per rejection reason — never echoes the raw payload. */
export function describeDesktopQuickLinkHrefRejection(
  classification: DesktopQuickLinkHrefClassification,
): string {
  switch (classification) {
    case "INVALID_EMPTY_OR_TOO_LONG":
      return "الرابط فارغ أو طويل جداً.";
    case "INVALID_LEADING_OR_TRAILING_WHITESPACE":
      return "الرابط يحتوي على مسافات أو رموز غير مرئية في البداية أو النهاية.";
    case "INVALID_PROTOCOL_RELATIVE":
      return "الرابط غير مسموح (protocol-relative). استخدم مساراً داخلياً يبدأ بـ /.";
    case "INVALID_EXTERNAL_NOT_ALLOWED":
      return "الروابط الخارجية غير مسموحة. استخدم مساراً داخلياً يبدأ بـ / فقط.";
    case "INVALID_MALFORMED":
      return "تنسيق الرابط غير صالح.";
    case "INVALID_UNSAFE_CHARACTERS":
      return "الرابط يحتوي على رموز غير مسموحة.";
    case "INVALID_UNKNOWN_SCHEME":
      return "نوع الرابط غير مدعوم. استخدم مساراً داخلياً يبدأ بـ / فقط.";
    default:
      return "هذا النوع من الروابط غير مسموح لأسباب أمنية.";
  }
}
