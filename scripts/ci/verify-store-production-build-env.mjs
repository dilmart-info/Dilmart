#!/usr/bin/env node
/**
 * Fail-closed validation of the Store Production frontend build target.
 *
 * A Vite build bakes its environment into the bundle. If `VITE_STORE_API_BASE_URL` or
 * `VITE_SUPABASE_URL` are wrong at build time, the published bundle talks to the wrong backend and no
 * amount of later checking recovers it — the artifact is already wrong. So this runs BEFORE the build
 * and refuses to let a misconfigured target become a Production artifact at all.
 *
 * Rejects, specifically: `localhost`, `*.onrender.com`, any other DilMart host, plain HTTP, arbitrary
 * paths, any Supabase project that is not the Production one, and any URL carrying a non-default port,
 * embedded credentials, a query string or a fragment.
 *
 * Secret hygiene: the publishable key is checked for PRESENCE only. Its value is never printed, never
 * pattern-matched for "looks like a JWT" (a convincing-looking string proves nothing), and never
 * included in a diagnostic. Every failure message names the variable and the rule it broke.
 */

/** Canonical Production identity. Changing these changes what may be published. */
export const CANONICAL = Object.freeze({
  apiBaseUrl: "https://api.store.DilMart.org/api",
  apiHostname: "api.store.DilMart.org",
  apiPathname: "/api",
  supabaseProjectRef: "ztplxqlthuqkuktbznbo",
  supabaseHostname: "ztplxqlthuqkuktbznbo.supabase.co",
  supabasePathname: "/",
  supabaseUrl: "https://ztplxqlthuqkuktbznbo.supabase.co",
  backendBindingUrl: "https://api.store.DilMart.org/api/health/config-public",
});

const REQUIRED_KEYS = [
  "VITE_STORE_API_BASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
];

/** Trailing slashes are harmless normalisation; anything else is a different path. */
function normalizePathname(pathname) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Checks the components of a URL that are NOT the protocol, host or path.
 *
 * `new URL()` happily carries a port, embedded credentials, a query string or a fragment through
 * checks that only look at `protocol`, `hostname` and `pathname` — so
 * `https://user:pass@api.store.DilMart.org:444/api?x=1#y` would otherwise pass as canonical. Baked into
 * a Vite bundle, any of those changes where requests go or what travels with them, so each is refused
 * individually and named in the failure.
 */
function canonicalComponentErrors(key, url) {
  const errors = [];
  // `url.port` is "" for the protocol's default, so this rejects an explicit non-default port only.
  if (url.port !== "") {
    errors.push(`${key} must not specify a port, got :${url.port}`);
  }
  if (url.username !== "" || url.password !== "") {
    errors.push(`${key} must not embed credentials`);
  }
  if (url.search !== "") {
    errors.push(`${key} must not carry a query string`);
  }
  if (url.hash !== "") {
    errors.push(`${key} must not carry a fragment`);
  }
  return errors;
}

/**
 * Validates the build environment. Returns `{ ok, errors }` — never throws, never logs, so it can be
 * unit-tested directly rather than only through a process exit code.
 */
export function verifyStoreProductionBuildEnv(env) {
  const errors = [];

  for (const key of REQUIRED_KEYS) {
    const value = env[key];
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${key} is missing or empty`);
    }
  }
  // Without the values present there is nothing further to check; report the absences alone.
  if (errors.length > 0) return { ok: false, errors };

  // ── Store API base ────────────────────────────────────────────────────────────────────────────
  const apiUrl = parseUrl(env.VITE_STORE_API_BASE_URL.trim());
  if (!apiUrl) {
    errors.push("VITE_STORE_API_BASE_URL is not a valid URL");
  } else {
    if (apiUrl.protocol !== "https:") {
      errors.push(`VITE_STORE_API_BASE_URL must use https:, got ${apiUrl.protocol}`);
    }
    if (apiUrl.hostname !== CANONICAL.apiHostname) {
      errors.push(
        `VITE_STORE_API_BASE_URL host must be ${CANONICAL.apiHostname}, got ${apiUrl.hostname}`,
      );
    }
    if (normalizePathname(apiUrl.pathname) !== CANONICAL.apiPathname) {
      errors.push(
        `VITE_STORE_API_BASE_URL path must be ${CANONICAL.apiPathname}, got ${apiUrl.pathname}`,
      );
    }
    errors.push(...canonicalComponentErrors("VITE_STORE_API_BASE_URL", apiUrl));
  }

  // ── Supabase project ──────────────────────────────────────────────────────────────────────────
  const projectRef = env.VITE_SUPABASE_PROJECT_ID.trim();
  if (projectRef !== CANONICAL.supabaseProjectRef) {
    errors.push(
      `VITE_SUPABASE_PROJECT_ID must be ${CANONICAL.supabaseProjectRef}, got ${projectRef}`,
    );
  }

  const supabaseUrl = parseUrl(env.VITE_SUPABASE_URL.trim());
  if (!supabaseUrl) {
    errors.push("VITE_SUPABASE_URL is not a valid URL");
  } else {
    if (supabaseUrl.protocol !== "https:") {
      errors.push(`VITE_SUPABASE_URL must use https:, got ${supabaseUrl.protocol}`);
    }
    if (supabaseUrl.hostname !== CANONICAL.supabaseHostname) {
      errors.push(
        `VITE_SUPABASE_URL host must be ${CANONICAL.supabaseHostname}, got ${supabaseUrl.hostname}`,
      );
    }
    // The Supabase client builds its own paths from this origin, so anything beyond the root is a
    // different base than the one every request will actually be composed against.
    if (normalizePathname(supabaseUrl.pathname) !== CANONICAL.supabasePathname) {
      errors.push(
        `VITE_SUPABASE_URL path must be ${CANONICAL.supabasePathname}, got ${supabaseUrl.pathname}`,
      );
    }
    errors.push(...canonicalComponentErrors("VITE_SUPABASE_URL", supabaseUrl));
  }

  // VITE_SUPABASE_PUBLISHABLE_KEY: presence only, already checked above. Its value is never inspected
  // or echoed — a string that merely looks like a key proves nothing about which project it belongs to,
  // and the project is established by the two checks above.

  return { ok: errors.length === 0, errors };
}

/**
 * Read-only preflight: ask the live Production API which Supabase project it is bound to. Confirms the
 * bundle and the backend it will call agree, which neither variable check can establish on its own.
 * Never authenticated, never mutating.
 */
export async function verifyBackendBinding(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(CANONICAL.backendBindingUrl, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return { ok: false, errors: [`backend binding check: HTTP ${response.status}`] };
    }
    const body = await response.json();
    const ref = body?.supabaseProjectRef;
    if (ref !== CANONICAL.supabaseProjectRef) {
      return {
        ok: false,
        errors: [
          `backend binding check: live API reports supabaseProjectRef ${ref}, expected ${CANONICAL.supabaseProjectRef}`,
        ],
      };
    }
    return { ok: true, errors: [] };
  } catch (error) {
    return { ok: false, errors: [`backend binding check failed: ${error?.message ?? error}`] };
  }
}

/** CLI entry point. Only runs when executed directly, so importing for tests has no side effects. */
async function main() {
  const result = verifyStoreProductionBuildEnv(process.env);

  if (result.ok && process.env.VERIFY_STORE_BACKEND_BINDING === "true") {
    const binding = await verifyBackendBinding();
    result.ok = binding.ok;
    result.errors.push(...binding.errors);
  }

  if (!result.ok) {
    console.error("[verify-store-production-build-env] REFUSED — Production target is not canonical:");
    for (const error of result.errors) console.error(`  - ${error}`);
    console.error("No Production artifact may be built from this environment.");
    process.exit(1);
  }

  console.log("[verify-store-production-build-env] Production target verified:");
  console.log(`  API      ${CANONICAL.apiBaseUrl}`);
  console.log(`  Supabase ${CANONICAL.supabaseUrl} (${CANONICAL.supabaseProjectRef})`);
  console.log("  publishable key present (value not inspected)");
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;

if (invokedDirectly) {
  await main();
}
