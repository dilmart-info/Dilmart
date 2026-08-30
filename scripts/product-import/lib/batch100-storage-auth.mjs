/**
 * Batch100 Storage auth compatibility — sb_secret_ + legacy service_role JWT.
 * Never log key values, prefixes, or reversible fingerprints.
 */

export const EXPECTED_PROJECT_REF = "ztplxqlthuqkuktbznbo";
export const EXPECTED_SUPABASE_HOST = `${EXPECTED_PROJECT_REF}.supabase.co`;

export const KEY_SOURCES = [
  "BATCH100_SUPABASE_SECRET_KEY",
  "SUPABASE_SECRET_KEY",
  "BATCH100_SUPABASE_SERVICE_ROLE_JWT",
  "SUPABASE_SERVICE_ROLE_KEY",
];

/**
 * @param {string|null|undefined} value
 * @returns {"sb_secret"|"legacy_service_role"|"publishable_rejected"|"unknown"|"empty"}
 */
export function classifyKeyKind(value) {
  const v = String(value ?? "");
  if (!v) return "empty";
  if (v.startsWith("sb_secret_")) return "sb_secret";
  if (v.startsWith("eyJ")) return "legacy_service_role";
  if (v.startsWith("sb_publishable_")) return "publishable_rejected";
  return "unknown";
}

/**
 * Preferred lookup order. Freezes the first accepted source.
 * @param {Record<string, string|undefined>} env
 */
export function resolveServerKey(env = process.env) {
  for (const source of KEY_SOURCES) {
    const value = env[source];
    if (value == null || String(value).trim() === "") continue;
    const kind = classifyKeyKind(value);
    if (kind === "sb_secret" || kind === "legacy_service_role") {
      return {
        ok: true,
        source,
        kind,
        key: String(value).trim(),
        code: null,
      };
    }
    if (kind === "publishable_rejected") {
      return {
        ok: false,
        source,
        kind,
        key: null,
        code: "PUBLISHABLE_KEY_NOT_AUTHORIZED",
      };
    }
    return {
      ok: false,
      source,
      kind,
      key: null,
      code: "UNSUPPORTED_SERVER_KEY",
    };
  }
  return {
    ok: false,
    source: null,
    kind: "empty",
    key: null,
    code: "UNSUPPORTED_SERVER_KEY",
  };
}

/**
 * @param {string|null|undefined} url
 */
export function assertProductionSupabaseUrl(url) {
  let hostname;
  try {
    hostname = new URL(String(url || "")).hostname;
  } catch {
    return { ok: false, code: "WRONG_SUPABASE_PROJECT", hostname: null };
  }
  if (hostname !== EXPECTED_SUPABASE_HOST) {
    return { ok: false, code: "WRONG_SUPABASE_PROJECT", hostname };
  }
  return { ok: true, code: null, hostname };
}

/**
 * Auth header strategy for new vs legacy server keys.
 *
 * - REST/Auth: new keys belong in `apikey` only (Bearer sb_secret_ can trigger JWS parse errors).
 * - Storage: OpenAPI still requires an `authorization` header; keep Bearer for storage routes
 *   after the gateway has accepted the key via the read-only probe.
 *
 * @param {string} serverKey
 * @param {"sb_secret"|"legacy_service_role"} kind
 * @param {typeof fetch} [baseFetch]
 */
export function createStorageCompatibleFetch(serverKey, kind, baseFetch = globalThis.fetch) {
  return async (input, init) => {
    const headers = new Headers(init?.headers || {});
    if (!headers.has("apikey")) headers.set("apikey", serverKey);

    const requestUrl = String(typeof input === "string" ? input : input?.url || "");
    const isStorage = requestUrl.includes("/storage/v1/");

    if (kind === "sb_secret") {
      const auth = headers.get("Authorization") || headers.get("authorization") || "";
      if (!isStorage && auth === `Bearer ${serverKey}`) {
        headers.delete("Authorization");
        headers.delete("authorization");
      } else if (isStorage && !headers.has("Authorization") && !headers.has("authorization")) {
        headers.set("Authorization", `Bearer ${serverKey}`);
      }
    } else if (kind === "legacy_service_role") {
      if (!headers.has("Authorization") && !headers.has("authorization")) {
        headers.set("Authorization", `Bearer ${serverKey}`);
      }
    }

    return baseFetch(input, { ...init, headers });
  };
}

/**
 * @param {{ createClient: Function }} supabaseJs
 * @param {string} url
 * @param {string} serverKey
 * @param {"sb_secret"|"legacy_service_role"} kind
 */
export function createBatch100StorageClient(supabaseJs, url, serverKey, kind, customFetch = globalThis.fetch) {
  return supabaseJs.createClient(url, serverKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: createStorageCompatibleFetch(serverKey, kind, customFetch),
    },
  });
}

/**
 * Classify auth-probe / upload auth failures without echoing secrets.
 * @param {number|null|undefined} status
 * @param {string|null|undefined} message
 */
export function classifyAuthFailure(status, message) {
  const msg = String(message || "");
  const lower = msg.toLowerCase();
  const jws =
    /invalid compact jws/i.test(msg) ||
    /invalid jwt/i.test(msg) ||
    (/jwt/i.test(msg) && /invalid|malformed|parse/i.test(msg));

  const authHttp = status === 401 || status === 403;
  const invalidApiKey = /invalid api key/i.test(msg);
  const authText =
    invalidApiKey ||
    /unauthorized|forbidden|api key|apikey|not authorized|jwt|jws|accessdenied/i.test(msg);

  if ((authHttp || authText) && jws) {
    return { isAuth: true, code: "KEY_NOT_RECOGNIZED_OR_WRONG_AUTH_FLOW" };
  }
  if (authHttp || authText || invalidApiKey) {
    return { isAuth: true, code: "KEY_INVALID_DISABLED_OR_WRONG_PROJECT" };
  }
  if (/wrong_supabase_project|project mismatch/i.test(lower)) {
    return { isAuth: true, code: "WRONG_SUPABASE_PROJECT" };
  }
  return { isAuth: false, code: null };
}

/**
 * Read-only API-key probe against the production gateway.
 * Uses REST with `apikey` (Bearer only for legacy JWT). Never returns row/user/secret payloads.
 * @param {{ url: string, key: string, kind: "sb_secret"|"legacy_service_role", fetchImpl?: typeof fetch }} opts
 */
export async function probeServerKeyAcceptance(opts) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const base = String(opts.url).replace(/\/$/, "");
  const endpoint = `${base}/rest/v1/`;
  const headers = new Headers({ apikey: opts.key, Accept: "application/json" });
  if (opts.kind === "legacy_service_role") {
    headers.set("Authorization", `Bearer ${opts.key}`);
  }
  // sb_secret_: apikey credential only for gateway recognition.

  let status = null;
  let message = "";
  try {
    const res = await fetchImpl(endpoint, { method: "GET", headers });
    status = res.status;
    message = (await res.text()).slice(0, 240);
    const classified = classifyAuthFailure(status, message);
    if (classified.isAuth) {
      return { ok: false, status, code: classified.code, message: null };
    }
    return { ok: true, status, code: null, message: null };
  } catch (e) {
    message = String(e?.message || e);
    status = null;
  }

  const classified = classifyAuthFailure(status, message);
  return {
    ok: false,
    status,
    code: classified.code || (status === null ? "SERVER_KEY_PROBE_NETWORK_FAILED" : "KEY_INVALID_DISABLED_OR_WRONG_PROJECT"),
    message: null,
  };
}

/**
 * Redact any secret-looking substrings from log/evidence strings.
 * @param {unknown} value
 * @param {string[]} secrets
 */
export function scrubSecrets(value, secrets = []) {
  let s = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue;
    s = s.split(secret).join("[REDACTED]");
  }
  s = s.replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED_SB_SECRET]");
  s = s.replace(/sb_publishable_[A-Za-z0-9_-]+/g, "[REDACTED_PUBLISHABLE]");
  s = s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]");
  return s;
}

export function safeAuthLog(payload, secrets = []) {
  return JSON.parse(scrubSecrets(payload, secrets));
}
