/**
 * Native (Capacitor) auth storage adapter backed by the OS keystore/keychain.
 *
 * Guarantees:
 * - Every read/write awaits a single-flight install bootstrap (`readyPromise`).
 * - Fail closed: if secure storage is unusable we throw. There is deliberately
 *   NO localStorage fallback on native — an unencrypted refresh token on disk
 *   is worse than a failed login.
 * - Reinstall safety: iOS keychain entries survive app deletion. On a fresh
 *   install (no Preferences marker) any leftover secure session is purged so a
 *   new device owner never inherits the previous user's session.
 * - Migration transaction safety: legacy localStorage is deleted only after
 *   secure write + read-back AND install-marker write + read-back both succeed.
 */

import {
  INSTALL_MARKER_KEY,
  INSTALL_MARKER_VALUE,
  NATIVE_AUTH_STORAGE_KEY,
  getLegacySupabaseAuthStorageKey,
  isLikelyPersistedAuthSession,
} from "./auth-storage-keys";
import { AuthStorageUnavailableError, StorageBootstrapError } from "./auth-errors";
import type { AsyncSupportedStorage } from "./supported-storage";

export type SecureStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<unknown>;
};

export type PreferencesLike = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
};

export type LegacyStorageLike = Pick<Storage, "getItem" | "removeItem"> | null;

export type AuthStorageMigrationResult = {
  /** Preferences marker already existed — this install had bootstrapped before. */
  alreadyBootstrapped: boolean;
  /** A valid legacy localStorage session was copied into secure storage. */
  migratedLegacySession: boolean;
  /** A stale keychain session left over from a previous install was purged. */
  clearedStaleSecureSession: boolean;
  /** Legacy localStorage key was removed after a verified migration. */
  removedLegacySession: boolean;
};

export type NativeSecureAuthStorageDeps = {
  secureStorage?: SecureStorageLike | (() => Promise<SecureStorageLike>);
  preferences?: PreferencesLike | (() => Promise<PreferencesLike>);
  legacyStorage?: LegacyStorageLike;
  legacyStorageKey?: string;
  nativeStorageKey?: string;
  installMarkerKey?: string;
};

async function loadDefaultSecureStorage(): Promise<SecureStorageLike> {
  const mod = await import("@aparajita/capacitor-secure-storage");
  const plugin = mod.SecureStorage;
  return {
    getItem: (key: string) => plugin.getItem(key),
    setItem: (key: string, value: string) => plugin.setItem(key, value),
    removeItem: (key: string) => plugin.removeItem(key),
  };
}

async function loadDefaultPreferences(): Promise<PreferencesLike> {
  const mod = await import("@capacitor/preferences");
  return {
    get: (options) => mod.Preferences.get(options),
    set: (options) => mod.Preferences.set(options),
  };
}

/**
 * Resolve the WebView legacy storage surface.
 *
 * - No `window` (unit/SSR): `null` — treated as "legacy storage absent".
 * - `window.localStorage` accessible: return it.
 * - Access throws in a native WebView: return a throwing adapter so bootstrap
 *   can distinguish "key absent" from "storage unreadable". Never silent null.
 */
function resolveDefaultLegacyStorage(): LegacyStorageLike {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storage = window.localStorage;
    if (!storage) {
      return null;
    }
    // Touch a property so hardened contexts that throw on first use fail here.
    void storage.length;
    return storage;
  } catch (error) {
    return {
      getItem() {
        throw error;
      },
      removeItem() {
        throw error;
      },
    };
  }
}

export class NativeSecureAuthStorage implements AsyncSupportedStorage {
  private readonly nativeStorageKey: string;
  private readonly installMarkerKey: string;
  private readonly legacyStorageKey: string;
  private readonly legacyStorage: LegacyStorageLike;

  private readonly secureStorageFactory: () => Promise<SecureStorageLike>;
  private readonly preferencesFactory: () => Promise<PreferencesLike>;

  private secureStoragePromise: Promise<SecureStorageLike> | null = null;
  private preferencesPromise: Promise<PreferencesLike> | null = null;

  private readyPromise: Promise<AuthStorageMigrationResult> | null = null;
  private bootstrapError: Error | null = null;
  private migrationResult: AuthStorageMigrationResult | null = null;

  constructor(deps: NativeSecureAuthStorageDeps = {}) {
    this.nativeStorageKey = deps.nativeStorageKey ?? NATIVE_AUTH_STORAGE_KEY;
    this.installMarkerKey = deps.installMarkerKey ?? INSTALL_MARKER_KEY;
    this.legacyStorageKey = deps.legacyStorageKey ?? getLegacySupabaseAuthStorageKey();
    this.legacyStorage = deps.legacyStorage === undefined ? resolveDefaultLegacyStorage() : deps.legacyStorage;

    const secure = deps.secureStorage;
    this.secureStorageFactory =
      typeof secure === "function" ? secure : secure ? async () => secure : loadDefaultSecureStorage;

    const prefs = deps.preferences;
    this.preferencesFactory =
      typeof prefs === "function" ? prefs : prefs ? async () => prefs : loadDefaultPreferences;
  }

  /** Storage key this adapter reads/writes. */
  get storageKey(): string {
    return this.nativeStorageKey;
  }

  /** Last bootstrap failure, or null when bootstrap succeeded / has not run. */
  getBootstrapError(): Error | null {
    return this.bootstrapError;
  }

  getMigrationResult(): AuthStorageMigrationResult | null {
    return this.migrationResult;
  }

  /** Single-flight install bootstrap. Safe to call any number of times. */
  ready(): Promise<AuthStorageMigrationResult> {
    if (!this.readyPromise) {
      this.readyPromise = this.bootstrapInstallAndMigrate();
      // Prevent an unhandled rejection when nothing is awaiting yet; the stored
      // promise still rejects for real callers.
      void this.readyPromise.catch(() => undefined);
    }
    return this.readyPromise;
  }

  /** Discards a failed bootstrap so the UI can offer a retry. */
  retry(): Promise<AuthStorageMigrationResult> {
    this.readyPromise = null;
    this.bootstrapError = null;
    this.secureStoragePromise = null;
    this.preferencesPromise = null;
    return this.ready();
  }

  async getItem(key: string): Promise<string | null> {
    await this.ready();
    const secure = await this.getSecureStorage();
    try {
      return await secure.getItem(key);
    } catch (error) {
      throw new AuthStorageUnavailableError("Failed to read the encrypted auth session.", error);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.ready();
    const secure = await this.getSecureStorage();
    try {
      await secure.setItem(key, value);
    } catch (error) {
      throw new AuthStorageUnavailableError("Failed to persist the encrypted auth session.", error);
    }
  }

  async removeItem(key: string): Promise<void> {
    await this.ready();
    const secure = await this.getSecureStorage();
    try {
      await secure.removeItem(key);
    } catch (error) {
      throw new AuthStorageUnavailableError("Failed to remove the encrypted auth session.", error);
    }
  }

  /**
   * Removes only this app's auth entry. Never calls `SecureStorage.clear()` —
   * other namespaced entries must survive a logout.
   *
   * Both secure and legacy keys must be confirmed absent; any failure throws.
   */
  async clearPersistedSession(): Promise<void> {
    const secure = await this.getSecureStorage();
    try {
      await secure.removeItem(this.nativeStorageKey);
    } catch (error) {
      throw new AuthStorageUnavailableError("Failed to clear the encrypted auth session.", error);
    }

    let remainingSecure: string | null = null;
    try {
      remainingSecure = await secure.getItem(this.nativeStorageKey);
    } catch (error) {
      throw new AuthStorageUnavailableError("Failed to verify encrypted auth session removal.", error);
    }
    if (remainingSecure != null) {
      throw new AuthStorageUnavailableError("Encrypted auth session was still present after removal.");
    }

    this.removeLegacySessionOrThrow();
  }

  private async getSecureStorage(): Promise<SecureStorageLike> {
    if (!this.secureStoragePromise) {
      this.secureStoragePromise = this.secureStorageFactory().catch((error: unknown) => {
        this.secureStoragePromise = null;
        throw new AuthStorageUnavailableError("Secure storage plugin could not be loaded.", error);
      });
    }
    return this.secureStoragePromise;
  }

  private async getPreferences(): Promise<PreferencesLike> {
    if (!this.preferencesPromise) {
      this.preferencesPromise = this.preferencesFactory().catch((error: unknown) => {
        this.preferencesPromise = null;
        throw new AuthStorageUnavailableError("Preferences plugin could not be loaded.", error);
      });
    }
    return this.preferencesPromise;
  }

  /**
   * Strict legacy read. Never swallows getItem failures.
   * - Legacy storage object absent → null (no legacy surface).
   * - Key absent → null.
   * - getItem throws → AuthStorageUnavailableError (not "fresh install").
   */
  private readLegacySessionOrThrow(): string | null {
    if (!this.legacyStorage) return null;

    try {
      return this.legacyStorage.getItem(this.legacyStorageKey);
    } catch (error) {
      throw new AuthStorageUnavailableError("Failed to read the legacy auth session.", error);
    }
  }

  /**
   * Strict legacy cleanup: remove + verify absence. Never swallows failures.
   * No-op success when the key is already absent (or legacy storage unavailable).
   */
  private removeLegacySessionOrThrow(): void {
    if (!this.legacyStorage) return;

    const before = this.readLegacySessionOrThrow();
    if (before == null) return;

    try {
      this.legacyStorage.removeItem(this.legacyStorageKey);
    } catch (error) {
      throw new StorageBootstrapError("Failed to remove the legacy auth session.", error);
    }

    const after = this.readLegacySessionOrThrow();
    if (after != null) {
      throw new StorageBootstrapError("Legacy auth session was still present after removal.");
    }
  }

  private async commitInstallMarker(preferences: PreferencesLike): Promise<void> {
    try {
      await preferences.set({ key: this.installMarkerKey, value: INSTALL_MARKER_VALUE });
    } catch (error) {
      throw new StorageBootstrapError("Failed to persist the install marker.", error);
    }

    let readBack: string | null = null;
    try {
      const stored = await preferences.get({ key: this.installMarkerKey });
      readBack = stored?.value ?? null;
    } catch (error) {
      throw new StorageBootstrapError("Failed to read back the install marker.", error);
    }

    if (readBack !== INSTALL_MARKER_VALUE) {
      throw new StorageBootstrapError("Install marker read-back did not match the written value.");
    }
  }

  private async bootstrapInstallAndMigrate(): Promise<AuthStorageMigrationResult> {
    try {
      const result = await this.runBootstrap();
      this.bootstrapError = null;
      this.migrationResult = result;
      return result;
    } catch (error) {
      const normalized =
        error instanceof AuthStorageUnavailableError || error instanceof StorageBootstrapError
          ? error
          : new StorageBootstrapError("Auth storage bootstrap failed.", error);
      this.bootstrapError = normalized;
      throw normalized;
    }
  }

  private async runBootstrap(): Promise<AuthStorageMigrationResult> {
    const preferences = await this.getPreferences();

    let marker: string | null = null;
    try {
      const stored = await preferences.get({ key: this.installMarkerKey });
      marker = stored?.value ?? null;
    } catch (error) {
      throw new AuthStorageUnavailableError("Failed to read the install marker.", error);
    }

    if (marker) {
      return this.handleMarkerPresent();
    }

    return this.handleFreshInstallOrMigration(preferences);
  }

  /**
   * Marker already exists: secure storage is the source of truth.
   * Never re-migrate legacy → secure (that could revive a logged-out session).
   * Only scrub leftover legacy residue.
   */
  private async handleMarkerPresent(): Promise<AuthStorageMigrationResult> {
    const legacyRaw = this.readLegacySessionOrThrow();
    let removedLegacySession = false;

    if (legacyRaw != null) {
      // Secure may or may not exist; either way do NOT copy legacy into secure.
      this.removeLegacySessionOrThrow();
      removedLegacySession = true;
    }

    return {
      alreadyBootstrapped: true,
      migratedLegacySession: false,
      clearedStaleSecureSession: false,
      removedLegacySession,
    };
  }

  private async handleFreshInstallOrMigration(preferences: PreferencesLike): Promise<AuthStorageMigrationResult> {
    const secure = await this.getSecureStorage();
    const legacyRaw = this.readLegacySessionOrThrow();
    let migratedLegacySession = false;
    let clearedStaleSecureSession = false;
    let removedLegacySession = false;

    if (isLikelyPersistedAuthSession(legacyRaw)) {
      // Transaction:
      // 1-3 secure write + verified read-back
      // 4-6 marker write + verified read-back
      // 7-8 legacy delete + verified absence
      try {
        await secure.setItem(this.nativeStorageKey, legacyRaw as string);
        const readBack = await secure.getItem(this.nativeStorageKey);
        if (readBack !== legacyRaw) {
          throw new StorageBootstrapError("Secure storage read-back did not match the migrated session.");
        }
      } catch (error) {
        // Keep the legacy session untouched and leave the marker unset so the
        // next launch retries. Losing the user's session is not an option.
        throw error instanceof StorageBootstrapError
          ? error
          : new StorageBootstrapError("Failed to migrate the legacy auth session into secure storage.", error);
      }

      migratedLegacySession = true;

      // Marker must succeed before legacy deletion.
      await this.commitInstallMarker(preferences);

      // If legacy cleanup fails after marker commit: keep secure + marker,
      // leave legacy temporarily, reject so retry can scrub legacy only.
      this.removeLegacySessionOrThrow();
      removedLegacySession = true;
    } else {
      // Fresh install with no legacy session: purge any keychain entry that
      // outlived a previous install of the app.
      try {
        await secure.removeItem(this.nativeStorageKey);
      } catch (error) {
        throw new AuthStorageUnavailableError("Failed to purge the stale secure auth session.", error);
      }
      clearedStaleSecureSession = true;

      await this.commitInstallMarker(preferences);
    }

    return {
      alreadyBootstrapped: false,
      migratedLegacySession,
      clearedStaleSecureSession,
      removedLegacySession,
    };
  }
}

export function createNativeSecureAuthStorage(deps: NativeSecureAuthStorageDeps = {}): NativeSecureAuthStorage {
  return new NativeSecureAuthStorage(deps);
}
