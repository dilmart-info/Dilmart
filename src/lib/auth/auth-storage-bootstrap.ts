/**
 * Thin façade over the platform auth storage bootstrap.
 *
 * On web there is nothing to bootstrap, so `ensureAuthStorageReady()` resolves
 * immediately. On native it awaits the single-flight install/migration routine.
 */

import { nativeAuthStorage } from "./auth-storage";
import type { AuthStorageMigrationResult } from "./native-secure-auth-storage";

export type { AuthStorageMigrationResult };

const WEB_MIGRATION_RESULT: AuthStorageMigrationResult = {
  alreadyBootstrapped: true,
  migratedLegacySession: false,
  clearedStaleSecureSession: false,
  removedLegacySession: false,
};

export async function ensureAuthStorageReady(): Promise<AuthStorageMigrationResult> {
  if (!nativeAuthStorage) return WEB_MIGRATION_RESULT;
  return nativeAuthStorage.ready();
}

/** Non-throwing variant: the last bootstrap error, or null when healthy. */
export function getAuthStorageBootstrapError(): Error | null {
  return nativeAuthStorage?.getBootstrapError() ?? null;
}

/** Migration flags for diagnostics and tests. Null until bootstrap succeeds. */
export function getAuthStorageMigrationResult(): AuthStorageMigrationResult | null {
  if (!nativeAuthStorage) return WEB_MIGRATION_RESULT;
  return nativeAuthStorage.getMigrationResult();
}

/** Used by the storage-error retry affordance in the UI. */
export async function retryAuthStorageBootstrap(): Promise<AuthStorageMigrationResult> {
  if (!nativeAuthStorage) return WEB_MIGRATION_RESULT;
  return nativeAuthStorage.retry();
}
