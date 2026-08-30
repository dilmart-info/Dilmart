/**
 * Canonical storage keys for the DilMart-Store auth session.
 *
 * Native (Capacitor) builds persist the Supabase session blob inside the
 * OS keystore/keychain under `NATIVE_AUTH_STORAGE_KEY`. Web builds keep the
 * historical Supabase localStorage key so existing browser sessions survive.
 */

/** Key used inside encrypted native secure storage. */
export const NATIVE_AUTH_STORAGE_KEY = "DilMart.store.auth.session.v1";

/** Capacitor Preferences key proving this install already ran storage bootstrap. */
export const INSTALL_MARKER_KEY = "DilMart.store.install.marker.v1";

/** Value written to the install marker. Only presence matters. */
export const INSTALL_MARKER_VALUE = "1";

/**
 * Fallback used when the Supabase URL cannot be parsed. Supabase itself falls
 * back to a generic key, so a deterministic literal keeps behaviour stable.
 */
export const FALLBACK_LEGACY_AUTH_STORAGE_KEY = "sb-DilMart-store-auth-token";

/** Extracts `<ref>` from `https://<ref>.supabase.co`. Returns null when unparsable. */
export function parseSupabaseProjectRef(supabaseUrl: string | undefined | null): string | null {
  if (!supabaseUrl || typeof supabaseUrl !== "string") return null;
  try {
    const { hostname } = new URL(supabaseUrl);
    const [ref] = hostname.split(".");
    return ref && ref.length > 0 ? ref : null;
  } catch {
    // Tolerate bare hostnames such as "abcdefgh.supabase.co".
    const match = /^([a-z0-9-]+)\.supabase\.(co|in|red)/i.exec(supabaseUrl.trim());
    return match?.[1] ?? null;
  }
}

/**
 * The localStorage key Supabase used before this phase (`sb-<ref>-auth-token`).
 * Still the active key on web, and the migration source on native.
 */
export function getLegacySupabaseAuthStorageKey(
  supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL as string | undefined,
): string {
  const ref = parseSupabaseProjectRef(supabaseUrl);
  return ref ? `sb-${ref}-auth-token` : FALLBACK_LEGACY_AUTH_STORAGE_KEY;
}

/**
 * Minimal shape validation for a persisted Supabase session blob. Used to decide
 * whether a legacy localStorage entry is worth migrating into secure storage.
 * Never logs or returns token material.
 */
export function isLikelyPersistedAuthSession(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.trim().length === 0) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object") return false;
  const candidate = parsed as Record<string, unknown>;
  // Supabase v2 may wrap the session inside `currentSession`.
  const session = (candidate.currentSession ?? candidate) as Record<string, unknown>;
  if (!session || typeof session !== "object") return false;

  const accessToken = session.access_token;
  const refreshToken = session.refresh_token;
  const user = session.user as Record<string, unknown> | undefined;

  return (
    typeof accessToken === "string" &&
    accessToken.length > 0 &&
    typeof refreshToken === "string" &&
    refreshToken.length > 0 &&
    !!user &&
    typeof user === "object" &&
    typeof user.id === "string" &&
    user.id.length > 0
  );
}
