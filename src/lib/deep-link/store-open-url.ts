/**
 * STORE-PR6 §4 — strict, pure parser for the incoming Universal/App Link.
 *
 * Accepted production shape ONLY:  https://store.DilMart.org/open?code=<opaque>&state=<opaque>
 * Everything else fails closed. NEVER log the full URL / code / state.
 *
 * The percent-encoding of the RAW query is validated BEFORE any URLSearchParams normalization (which would
 * silently repair/lose malformed sequences), so `%ZZ`, `%`, `%2`, `%E0%A4%A` etc. are rejected.
 */
import {
  APPROVED_STORE_HOSTS,
  CODE_MAX_LEN,
  HANDOFF_OPEN_PATH,
  STATE_MAX_LEN,
  type ParseResult,
} from "./store-deep-link.types";

const MAX_URL_LEN = 4096;
// Opaque one-time artifacts (post-decode) are URL-safe base64url-ish. Anything else is rejected.
const OPAQUE = /^[A-Za-z0-9._~-]+$/;
// Any `%` NOT followed by exactly two hex digits is malformed encoding.
const MALFORMED_PERCENT = /%(?![0-9A-Fa-f]{2})/;

function isApprovedHost(hostname: string): boolean {
  return (APPROVED_STORE_HOSTS as readonly string[]).includes(hostname.toLowerCase());
}

/**
 * Validate ONLY the RAW query string (exactly one `code` + one `state`, well-formed percent-encoding, opaque
 * charset, within bounds). Used by the WEB /open page (same-origin params) and by the full-URL parser via
 * `url.search`. The RAW string is required so malformed encoding is caught before URLSearchParams runs.
 */
export function parseHandoffQuery(rawSearch: unknown): ParseResult {
  if (typeof rawSearch !== "string") return { ok: false, reason: "non_string_query" };
  const raw = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  if (raw.length === 0) return { ok: false, reason: "empty_query" };
  if (MALFORMED_PERCENT.test(raw)) return { ok: false, reason: "malformed_encoding" };

  let sp: URLSearchParams;
  try {
    sp = new URLSearchParams(raw);
  } catch {
    return { ok: false, reason: "unparseable_query" };
  }
  for (const key of sp.keys()) {
    if (key !== "code" && key !== "state") return { ok: false, reason: "unknown_param" };
  }
  const codes = sp.getAll("code");
  const states = sp.getAll("state");
  if (codes.length !== 1 || states.length !== 1) return { ok: false, reason: "duplicate_or_missing" };
  const code = codes[0];
  const state = states[0];
  if (!code || !state) return { ok: false, reason: "empty_param" };
  if (code.length > CODE_MAX_LEN || state.length > STATE_MAX_LEN) return { ok: false, reason: "oversized_param" };
  if (!OPAQUE.test(code) || !OPAQUE.test(state)) return { ok: false, reason: "charset" };
  return { ok: true, params: { code, state } };
}

export function parseHandoffOpenUrl(input: unknown): ParseResult {
  if (typeof input !== "string" || input.length === 0) return { ok: false, reason: "empty_input" };
  if (input.length > MAX_URL_LEN) return { ok: false, reason: "oversized_url" };
  if (input.startsWith("//")) return { ok: false, reason: "protocol_relative" };

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "non_https" };
  if (url.username || url.password) return { ok: false, reason: "userinfo" };
  if (!isApprovedHost(url.hostname)) return { ok: false, reason: "foreign_host" };
  if (url.pathname !== HANDOFF_OPEN_PATH) return { ok: false, reason: "path_mismatch" };
  if (url.hash && url.hash !== "#") return { ok: false, reason: "fragment" };

  // Validate the RAW query (url.search preserves the untouched encoding).
  return parseHandoffQuery(url.search);
}

/** Unit Separator (U+001F) — outside the opaque charset, so it can never occur inside code/state. */
const FP_SEP = String.fromCharCode(0x1f);

/**
 * STORE-PR6 §5 — raised when Web Crypto SHA-256 is unavailable. The dedup identity MUST be
 * collision-resistant; there is deliberately NO non-crypto fallback, so the controller fails closed
 * (never redeems) instead of deduping on a collision-prone digest.
 */
export class HandoffCryptoUnavailableError extends Error {
  readonly code = "crypto_unavailable";
  constructor() {
    super("Web Crypto SHA-256 unavailable — refusing to redeem the handoff (fail closed).");
    this.name = "HandoffCryptoUnavailableError";
  }
}

/**
 * STORE-PR6 §5 — collision-resistant, memory-only dedup identity: SHA-256 over code + an unambiguous
 * separator + state, hex-encoded. NEVER logged, never persisted. Async (Web Crypto). If SubtleCrypto is
 * unavailable this THROWS `HandoffCryptoUnavailableError` — it never falls back to a weak (djb2) hash.
 */
export async function handoffFingerprint(params: { code: string; state: string }): Promise<string> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) throw new HandoffCryptoUnavailableError();
  const data = new TextEncoder().encode(params.code + FP_SEP + params.state);
  const digest = await subtle.digest("SHA-256", data);
  return "fp_" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
