/**
 * DilMart-STORE-DESKTOP-QUICK-LINKS-SECURITY-047/048/049 — client-side mirror of the backend canonical
 * validator (`backend/src/modules/admin/desktop-quick-link-href.validator.ts`). SEMANTICALLY
 * MATCHING that file — keep both in sync. The backend remains authoritative; this mirror exists
 * so the admin form gives immediate feedback and the storefront never blindly renders an unsafe
 * href as clickable navigation, without waiting on a round-trip for either purpose.
 *
 * Policy is internal-only (least privilege): migration seed data and the admin UX copy both only
 * ever reference internal Store paths; no product evidence of a legitimate external-link
 * requirement was found. Acceptance is always decided against the ORIGINAL, unmodified input —
 * normalization (`whatwgStrip`) exists only to produce an accurate rejection LABEL, never to
 * launder a dirty candidate (e.g. leading/trailing whitespace) into acceptance.
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

const NAMED_UNSAFE_SCHEMES: ReadonlyArray<[string, DesktopQuickLinkHrefClassification]> = [
  ["javascript", "INVALID_JAVASCRIPT_SCHEME"],
  ["data", "INVALID_DATA_SCHEME"],
  ["vbscript", "INVALID_VBSCRIPT_SCHEME"],
  ["file", "INVALID_FILE_SCHEME"],
  ["blob", "INVALID_BLOB_SCHEME"],
  ["about", "INVALID_ABOUT_SCHEME"],
  ["intent", "INVALID_INTENT_SCHEME"],
];

function hasUnsafeChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
    if (c === 0x5c) return true;
    if (c === 0x3c || c === 0x3e) return true;
    if (c === 0x22 || c === 0x27 || c === 0x60) return true;
  }
  return false;
}

function whatwgStrip(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d) continue;
    out += s[i];
  }
  let start = 0;
  let end = out.length;
  while (start < end && out.charCodeAt(start) <= 0x20) start++;
  while (end > start && out.charCodeAt(end - 1) <= 0x20) end--;
  return out.slice(start, end);
}

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

export function classifyDesktopQuickLinkHref(input: unknown): DesktopQuickLinkHrefClassification {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_HREF_LEN) {
    return "INVALID_EMPTY_OR_TOO_LONG";
  }

  if (input.charCodeAt(0) <= 0x20 || input.charCodeAt(input.length - 1) <= 0x20) {
    return "INVALID_LEADING_OR_TRAILING_WHITESPACE";
  }

  if (input[0] === "/" && input[1] !== "/") {
    if (input.includes("#")) return "INVALID_UNSAFE_CHARACTERS";
    const qIdx = input.indexOf("?");
    const rawPath = qIdx >= 0 ? input.slice(0, qIdx) : input;
    const queryString = qIdx >= 0 ? input.slice(qIdx + 1) : "";

    if (hasUnsafeChar(rawPath)) return "INVALID_UNSAFE_CHARACTERS";
    if (rawPath.includes("..")) return "INVALID_UNSAFE_CHARACTERS";

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      return "INVALID_MALFORMED";
    }
    if (containsEncodedEscape(decodedPath)) return "INVALID_MALFORMED";
    if (decodedPath[0] !== "/" || decodedPath[1] === "/") return "INVALID_UNSAFE_CHARACTERS";
    if (hasUnsafeChar(decodedPath) || decodedPath.includes("..")) return "INVALID_UNSAFE_CHARACTERS";

    if (queryString.length > 0) {
      if (hasUnsafeChar(queryString)) return "INVALID_UNSAFE_CHARACTERS";
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
