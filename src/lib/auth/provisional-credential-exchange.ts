/**
 * §9.3 — exchange provisional (guest checkout) credentials for a CANDIDATE session, with no effect on
 * whoever is signed in.
 *
 * A guest checkout can be in flight for seconds, and the customer using the tab can change in that window.
 * Running the provisional sign-in on the application's own Supabase client made that unfixable at the
 * commit: the SDK persists the new session and publishes `SIGNED_IN` before its promise resolves, so by
 * the time anything could check, the previous customer had already been overwritten. A guard that runs
 * after the damage is not a guard.
 *
 * This client therefore exists only to turn credentials into a session VALUE. It uses the same Supabase
 * project and key as the application client — this is not a second identity system — but it is configured
 * so that obtaining a candidate cannot touch application state:
 *
 *   persistSession: false     nothing is written to the app's auth storage
 *   autoRefreshToken: false   no second, long-lived auth owner running its own refresh loop
 *   detectSessionInUrl: false no URL parsing, no ambient session pickup
 *
 * It also has its own in-memory storage, so it never shares a storage key with the application client, and
 * a fresh one is built per exchange and then dropped — there is no long-lived second auth owner.
 *
 * The candidate is NOT signed out afterwards. `signOut({ scope: "local" })` terminates the Supabase Auth
 * session and revokes its refresh token, which would hand the commit a session that works on its current
 * access token and can never refresh again. Isolation here comes from configuration, not from tearing the
 * session down: nothing is persisted, nothing is published, and the client itself is discarded.
 *
 * A candidate becomes the authoritative session only through
 * `AuthSessionManager.commitProvisionalAuthentication`. A rejected candidate needs no cleanup anywhere:
 * it was never installed, so there is nothing to undo and nothing of the winner's to restore.
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** In-memory only. Deliberately not `authStorage`: this client must leave no trace. */
function ephemeralStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

/** Injected stand-in for tests only. Production builds a fresh client per exchange and keeps none. */
let injectedClient: SupabaseClient<Database> | null = null;

function createCandidateExchangeClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: ephemeralStorage(),
      storageKey: "DilMart-provisional-candidate",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Test seam — inject a stand-in exchange client. Production never holds one. */
export function setProvisionalExchangeClientForTests(next: SupabaseClient<Database> | null): void {
  injectedClient = next;
}

/**
 * Turn provisional credentials into a candidate session. Never installs it, never publishes it, and never
 * disturbs the session the application is currently holding.
 */
export async function exchangeProvisionalCredentials(
  email: string,
  password: string,
): Promise<Session> {
  const client = injectedClient ?? createCandidateExchangeClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const session = data?.session;
  if (!session?.access_token || !session.refresh_token || !session.user?.id) {
    throw new Error("تعذر تهيئة الجلسة. حاول مرة أخرى.");
  }

  // The client is simply dropped. Signing the candidate out here would revoke the refresh token the
  // commit is about to install, leaving a session that cannot outlive its first access token.
  return session;
}
