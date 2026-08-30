/**
 * STORE-PR5 §Phase G — native federated secure storage + app-scoped device id.
 *
 * Native: the federated session (incl. the raw refresh token) is written ONLY to OS-encrypted secure
 * storage under a key SEPARATE from the Supabase key, with write + read-back verification and targeted
 * removal (never SecureStorage.clear()). There is deliberately NO localStorage / Preferences / plaintext
 * fallback for the token on native — a secure failure surfaces `storage_error`.
 *
 * Web: nothing token-bearing is persisted here — the HttpOnly `__Host-` cookie owns the refresh token and
 * JS holds only the in-memory access token. `load/persist/clear` are cookie-mode no-ops on web.
 *
 * Device id: one random, app-scoped, NON-advertising installation id (Preferences, not secure — it is not a
 * secret and must survive a logout). Never IMEI / serial / advertising id / phone number.
 */

import type { PreferencesLike, SecureStorageLike } from "../native-secure-auth-storage";
import { FederatedStorageError, type AppAuthSource } from "./app-session.types";

export const FEDERATED_NATIVE_STORAGE_KEY = "DilMart.store.federated.session.v1";
export const DEVICE_ID_KEY = "DilMart.store.device.id.v1";

export type FederatedNativeRecord = {
  version: 1;
  authSource: Extract<AppAuthSource, "DilMart_federated">;
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
  customer: {
    id: string;
    email: string | null;
    phone: string | null;
    linkedProfileId: string;
  };
  deviceId: string;
};

export type FederatedStorageDeps = {
  isNative?: () => boolean;
  secureStorage?: SecureStorageLike | (() => Promise<SecureStorageLike>);
  preferences?: PreferencesLike | (() => Promise<PreferencesLike>);
  /** 32-hex-char random id generator (test seam). Default uses Web Crypto. */
  randomId?: () => string;
};

function defaultRandomId(): string {
  const bytes = new Uint8Array(16);
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.getRandomValues) g.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); // non-crypto last resort
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadDefaultSecureStorage(): Promise<SecureStorageLike> {
  const mod = await import("@aparajita/capacitor-secure-storage");
  const plugin = mod.SecureStorage;
  return {
    getItem: (key: string) => plugin.getItem(key) as Promise<string | null>,
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

export class FederatedSessionStorage {
  private readonly isNative: () => boolean;
  private readonly secureFactory: () => Promise<SecureStorageLike>;
  private readonly prefsFactory: () => Promise<PreferencesLike>;
  private readonly randomId: () => string;
  private readonly storageKey = FEDERATED_NATIVE_STORAGE_KEY;

  constructor(deps: FederatedStorageDeps = {}) {
    this.isNative = deps.isNative ?? (() => false);
    const s = deps.secureStorage;
    this.secureFactory = typeof s === "function" ? s : s ? async () => s : loadDefaultSecureStorage;
    const p = deps.preferences;
    this.prefsFactory = typeof p === "function" ? p : p ? async () => p : loadDefaultPreferences;
    this.randomId = deps.randomId ?? defaultRandomId;
  }

  /** Native only. On web the cookie owns the refresh token → nothing to load in JS. */
  async load(): Promise<FederatedNativeRecord | null> {
    if (!this.isNative()) return null;
    const secure = await this.secure();
    let raw: string | null;
    try {
      raw = await secure.getItem(this.storageKey);
    } catch (error) {
      throw new FederatedStorageError("Failed to read the encrypted federated session.", error);
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as FederatedNativeRecord;
      if (parsed?.version !== 1 || parsed.authSource !== "DilMart_federated" || !parsed.customer?.id) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Native only, with read-back verification. Web is a cookie-mode no-op. */
  async persist(record: FederatedNativeRecord): Promise<void> {
    if (!this.isNative()) return;
    const secure = await this.secure();
    const serialized = JSON.stringify(record);
    try {
      await secure.setItem(this.storageKey, serialized);
    } catch (error) {
      throw new FederatedStorageError("Failed to persist the encrypted federated session.", error);
    }
    let readBack: string | null;
    try {
      readBack = await secure.getItem(this.storageKey);
    } catch (error) {
      throw new FederatedStorageError("Failed to verify the encrypted federated session write.", error);
    }
    if (readBack !== serialized) {
      throw new FederatedStorageError("Encrypted federated session read-back did not match the written value.");
    }
  }

  /** Targeted remove + verified absence. Never SecureStorage.clear(). Web is a no-op. */
  async clear(): Promise<void> {
    if (!this.isNative()) return;
    const secure = await this.secure();
    try {
      await secure.removeItem(this.storageKey);
    } catch (error) {
      throw new FederatedStorageError("Failed to clear the encrypted federated session.", error);
    }
    let remaining: string | null;
    try {
      remaining = await secure.getItem(this.storageKey);
    } catch (error) {
      throw new FederatedStorageError("Failed to verify federated session removal.", error);
    }
    if (remaining != null) {
      throw new FederatedStorageError("Encrypted federated session was still present after removal.");
    }
  }

  /**
   * Fresh-install / keychain-safety purge of ONLY the federated key. Best-effort: a purge failure is
   * surfaced so the install bootstrap can decide, but it never touches unrelated secure keys.
   */
  async purgeForFreshInstall(): Promise<void> {
    if (!this.isNative()) return;
    const secure = await this.secure();
    try {
      await secure.removeItem(this.storageKey);
    } catch (error) {
      throw new FederatedStorageError("Failed to purge the stale federated session on fresh install.", error);
    }
  }

  /**
   * Read the installation id WITHOUT creating one. The refresh path needs the id the redeem bound the
   * session family to, but must never mint an identifier for a visitor who has not redeemed a handoff.
   */
  async peekDeviceId(): Promise<string | null> {
    try {
      const prefs = await this.prefs();
      const existing = (await prefs.get({ key: DEVICE_ID_KEY }))?.value ?? null;
      return existing && existing.trim() ? existing.trim() : null;
    } catch {
      return null;
    }
  }

  /** One stable app-scoped installation id; generated + verified on first use. */
  async getOrCreateDeviceId(): Promise<string> {
    const prefs = await this.prefs();
    let existing: string | null = null;
    try {
      existing = (await prefs.get({ key: DEVICE_ID_KEY }))?.value ?? null;
    } catch {
      existing = null;
    }
    if (existing && existing.trim()) return existing.trim();

    const id = this.randomId();
    await prefs.set({ key: DEVICE_ID_KEY, value: id });
    return id;
  }

  private secureCache: Promise<SecureStorageLike> | null = null;
  private prefsCache: Promise<PreferencesLike> | null = null;
  private secure(): Promise<SecureStorageLike> {
    if (!this.secureCache) {
      this.secureCache = this.secureFactory().catch((e: unknown) => {
        this.secureCache = null;
        throw new FederatedStorageError("Secure storage plugin could not be loaded.", e);
      });
    }
    return this.secureCache;
  }
  private prefs(): Promise<PreferencesLike> {
    if (!this.prefsCache) {
      this.prefsCache = this.prefsFactory().catch((e: unknown) => {
        this.prefsCache = null;
        throw new FederatedStorageError("Preferences plugin could not be loaded.", e);
      });
    }
    return this.prefsCache;
  }
}
