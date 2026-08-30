/**
 * Platform-aware auth storage entry point handed to the Supabase client.
 *
 * IMPORTANT: this module must never import `@/integrations/supabase/client`.
 * The client imports *this* module, so the dependency has to stay one-way.
 */

import { isNative } from "@/lib/capacitor";
import { NATIVE_AUTH_STORAGE_KEY, getLegacySupabaseAuthStorageKey } from "./auth-storage-keys";
import { createBrowserAuthStorage } from "./browser-auth-storage";
import { createNativeSecureAuthStorage, type NativeSecureAuthStorage } from "./native-secure-auth-storage";
import type { AsyncSupportedStorage, SupportedStorage } from "./supported-storage";

export type { AsyncSupportedStorage, SupportedStorage };

/** Resolved once at module load; Capacitor's platform never changes at runtime. */
export const isNativePlatform: boolean = isNative();

/** Legacy Supabase localStorage key — still the active key on web. */
export const legacyAuthStorageKey: string = getLegacySupabaseAuthStorageKey();

/** Storage key Supabase should use for this platform. */
export const platformStorageKey: string = isNativePlatform ? NATIVE_AUTH_STORAGE_KEY : legacyAuthStorageKey;

export const browserAuthStorage: AsyncSupportedStorage = createBrowserAuthStorage();

/** Only instantiated on native so web bundles never touch the Capacitor plugins. */
export const nativeAuthStorage: NativeSecureAuthStorage | null = isNativePlatform
  ? createNativeSecureAuthStorage()
  : null;

export const authStorage: SupportedStorage = nativeAuthStorage ?? browserAuthStorage;

// Start the native install/migration bootstrap immediately so the very first
// Supabase read already has a ready keystore.
if (nativeAuthStorage) {
  void nativeAuthStorage.ready().catch(() => undefined);
}

/**
 * Removes the persisted session for the active platform.
 *
 * Deliberately targeted: never `SecureStorage.clear()` and never
 * `localStorage.clear()` — unrelated app state (cart, marketplace cache,
 * preferences) must survive a logout.
 */
export async function clearPersistedAuthSession(): Promise<void> {
  if (nativeAuthStorage) {
    await nativeAuthStorage.clearPersistedSession();
    return;
  }

  await browserAuthStorage.removeItem(platformStorageKey);
  if (legacyAuthStorageKey !== platformStorageKey) {
    await browserAuthStorage.removeItem(legacyAuthStorageKey);
  }
}
