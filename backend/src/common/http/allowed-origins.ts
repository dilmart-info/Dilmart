/**
 * DILMART-ANDROID-PRODUCTION-API-CONNECTIVITY-002
 *
 * Source of truth for API CORS transport origin configuration.
 * Separates trusted web frontend origins from native application (Capacitor) origins.
 *
 * Rules:
 * - General API CORS permits the exact-match union of FRONTEND_ORIGINS and NATIVE_APP_ORIGINS.
 * - Wildcard ('*') origins are strictly forbidden and rejected.
 * - Exact string matching only (no regex, suffix, or reflective origin approval).
 * - Empty entries are ignored.
 * - Missing NATIVE_APP_ORIGINS defaults to an empty list.
 */

function cleanOriginList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");
}

/**
 * Reads trusted web frontend origins from FRONTEND_ORIGINS (fallback: FRONTEND_ORIGIN or http://localhost:8080).
 * Wildcards ('*') and empty entries are strictly excluded.
 */
export function parseFrontendOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.FRONTEND_ORIGINS ?? env.FRONTEND_ORIGIN ?? "http://localhost:8080";
  return cleanOriginList(raw);
}

/**
 * Reads trusted native application origins from NATIVE_APP_ORIGINS (e.g. https://localhost, capacitor://localhost).
 * Defaults to an empty list when unset. Wildcards ('*') and empty entries are strictly excluded.
 */
export function parseNativeAppOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.NATIVE_APP_ORIGINS ?? "";
  return cleanOriginList(raw);
}

/**
 * Returns the deduplicated union of trusted web frontend and native application origins
 * for general Express CORS transport. Wildcards and suffix matches are strictly prohibited.
 */
export function parseAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const frontend = parseFrontendOrigins(env);
  const native = parseNativeAppOrigins(env);
  return Array.from(new Set([...frontend, ...native]));
}

/** Exact-match origin check (no wildcard, no suffix match). A missing, wildcard, or unlisted Origin is rejected. */
export function isAllowedOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin || origin === "*") return false;
  return parseAllowedOrigins(env).includes(origin);
}
