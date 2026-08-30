/**
 * STORE-PR5 §Phase E — the single source of truth for the CORS / cookie-CSRF origin allowlist.
 *
 * The same exact-match allowlist that `enableCors` uses (main.ts) also gates cookie-authenticated
 * federated mutations (refresh / logout / logout-all in cookie mode). We NEVER pair
 * `Access-Control-Allow-Origin: *` with credentials, and a cookie request from an origin outside
 * this list is rejected (CSRF defense) rather than silently honored.
 */
export function parseAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.FRONTEND_ORIGINS ?? env.FRONTEND_ORIGIN ?? "http://localhost:8080";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Exact-match origin check (no wildcard, no suffix match). A missing Origin is NOT allowed for cookie mode. */
export function isAllowedOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return false;
  return parseAllowedOrigins(env).includes(origin);
}
