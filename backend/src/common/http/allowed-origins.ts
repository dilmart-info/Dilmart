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

export function parseExactOrigins(variableName: string, raw: string | undefined): string[] {
  if (!raw) return [];
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.some((origin) => origin === "*" || origin.includes("*"))) {
    throw new Error(`${variableName} must not contain wildcard origins`);
  }

  return origins;
}

/**
 * Reads trusted web frontend origins from FRONTEND_ORIGINS (fallback: FRONTEND_ORIGIN or http://localhost:8080).
 * Wildcards ('*') are strictly forbidden and cause a startup/configuration error.
 */
export function parseFrontendOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const variableName = env.FRONTEND_ORIGINS !== undefined
    ? "FRONTEND_ORIGINS"
    : env.FRONTEND_ORIGIN !== undefined
    ? "FRONTEND_ORIGIN"
    : "FRONTEND_ORIGINS";
  const raw = env.FRONTEND_ORIGINS ?? env.FRONTEND_ORIGIN ?? "http://localhost:8080";
  return parseExactOrigins(variableName, raw);
}

/**
 * Reads trusted native application origins from NATIVE_APP_ORIGINS (e.g. https://localhost, capacitor://localhost).
 * Defaults to an empty list when unset. Wildcards ('*') are strictly forbidden and cause a startup error.
 */
export function parseNativeAppOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.NATIVE_APP_ORIGINS ?? "";
  return parseExactOrigins("NATIVE_APP_ORIGINS", raw);
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
