import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNativeSecureAuthStorage,
  type PreferencesLike,
  type SecureStorageLike,
} from "./native-secure-auth-storage";
import { AuthStorageUnavailableError, StorageBootstrapError } from "./auth-errors";
import { INSTALL_MARKER_KEY, INSTALL_MARKER_VALUE, NATIVE_AUTH_STORAGE_KEY } from "./auth-storage-keys";

const LEGACY_KEY = "sb-testproject-auth-token";

const VALID_SESSION = JSON.stringify({
  access_token: "header.payload.signature",
  refresh_token: "refresh-value",
  expires_at: 1893456000,
  user: { id: "11111111-2222-3333-4444-555555555555" },
});

function makeSecureStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const api: SecureStorageLike & { store: Map<string, string> } = {
    store,
    getItem: vi.fn(async (key: string) => (store.has(key) ? (store.get(key) as string) : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => store.delete(key)),
  };
  return api;
}

function makePreferences(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const api: PreferencesLike & { store: Map<string, string> } = {
    store,
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    }),
  };
  return api;
}

function makeLegacyStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

function build(overrides: {
  secure?: ReturnType<typeof makeSecureStorage>;
  prefs?: ReturnType<typeof makePreferences>;
  legacy?: ReturnType<typeof makeLegacyStorage> | null;
} = {}) {
  const secure = overrides.secure ?? makeSecureStorage();
  const prefs = overrides.prefs ?? makePreferences();
  const legacy = overrides.legacy === undefined ? makeLegacyStorage() : overrides.legacy;

  const storage = createNativeSecureAuthStorage({
    secureStorage: secure,
    preferences: prefs,
    legacyStorage: legacy,
    legacyStorageKey: LEGACY_KEY,
  });

  return { storage, secure, prefs, legacy };
}

describe("native secure auth storage — install bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("F. happy-path migration: Secure present, marker present, Legacy absent", async () => {
    const { storage, secure, prefs, legacy } = build({
      legacy: makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION }),
    });

    const result = await storage.ready();

    expect(result.migratedLegacySession).toBe(true);
    expect(result.removedLegacySession).toBe(true);
    expect(result.clearedStaleSecureSession).toBe(false);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
    expect(legacy?.store.has(LEGACY_KEY)).toBe(false);
    expect(prefs.store.get(INSTALL_MARKER_KEY)).toBe(INSTALL_MARKER_VALUE);
  });

  it("keeps the legacy session and leaves the marker unset when the secure write fails", async () => {
    const secure = makeSecureStorage();
    secure.setItem = vi.fn(async () => {
      throw new Error("keystore locked");
    });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    const { storage, prefs } = build({ secure, legacy });

    await expect(storage.ready()).rejects.toBeInstanceOf(StorageBootstrapError);

    expect(legacy.store.get(LEGACY_KEY)).toBe(VALID_SESSION);
    expect(legacy.removeItem).not.toHaveBeenCalled();
    expect(prefs.store.has(INSTALL_MARKER_KEY)).toBe(false);
    expect(storage.getBootstrapError()).toBeInstanceOf(StorageBootstrapError);
  });

  it("keeps the legacy session when the secure read-back does not match", async () => {
    const secure = makeSecureStorage();
    secure.getItem = vi.fn(async () => "corrupted-value");
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    const { storage, prefs } = build({ secure, legacy });

    await expect(storage.ready()).rejects.toBeInstanceOf(StorageBootstrapError);

    expect(legacy.store.get(LEGACY_KEY)).toBe(VALID_SESSION);
    expect(prefs.store.has(INSTALL_MARKER_KEY)).toBe(false);
  });

  it("ignores a malformed legacy blob and purges the keychain instead", async () => {
    const secure = makeSecureStorage({ [NATIVE_AUTH_STORAGE_KEY]: "left-over-from-previous-install" });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: "{not-a-session}" });
    const { storage } = build({ secure, legacy });

    const result = await storage.ready();

    expect(result.migratedLegacySession).toBe(false);
    expect(result.clearedStaleSecureSession).toBe(true);
    expect(secure.store.has(NATIVE_AUTH_STORAGE_KEY)).toBe(false);
  });

  it("purges a keychain session that outlived a reinstall when no marker exists", async () => {
    const secure = makeSecureStorage({ [NATIVE_AUTH_STORAGE_KEY]: VALID_SESSION });
    const { storage, prefs } = build({ secure, legacy: null });

    const result = await storage.ready();

    expect(result.clearedStaleSecureSession).toBe(true);
    expect(secure.store.has(NATIVE_AUTH_STORAGE_KEY)).toBe(false);
    expect(prefs.store.get(INSTALL_MARKER_KEY)).toBe(INSTALL_MARKER_VALUE);
  });

  it("keeps secure session when marker already exists and no legacy residue", async () => {
    const secure = makeSecureStorage({ [NATIVE_AUTH_STORAGE_KEY]: VALID_SESSION });
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    const { storage } = build({ secure, prefs, legacy: null });

    const result = await storage.ready();

    expect(result.alreadyBootstrapped).toBe(true);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
    expect(secure.removeItem).not.toHaveBeenCalled();
    expect(prefs.set).not.toHaveBeenCalled();
  });

  it("runs bootstrap exactly once across concurrent reads (single-flight)", async () => {
    const prefs = makePreferences();
    const { storage } = build({ prefs, legacy: null });

    await Promise.all([storage.ready(), storage.getItem(NATIVE_AUTH_STORAGE_KEY), storage.ready()]);

    // One bootstrap: marker read + marker write + marker read-back.
    expect(prefs.get).toHaveBeenCalledTimes(2);
    expect(prefs.set).toHaveBeenCalledTimes(1);
  });

  it("retry() re-runs a failed bootstrap", async () => {
    const prefs = makePreferences();
    const realGet = prefs.get;
    prefs.get = vi
      .fn()
      .mockRejectedValueOnce(new Error("preferences unavailable"))
      .mockImplementation(realGet);
    const { storage } = build({ prefs, legacy: null });

    await expect(storage.ready()).rejects.toBeInstanceOf(AuthStorageUnavailableError);
    await expect(storage.retry()).resolves.toMatchObject({ alreadyBootstrapped: false });
    expect(storage.getBootstrapError()).toBeNull();
  });
});

describe("native secure auth storage — migration transaction safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A. Preferences.set fails: legacy remains, marker absent, secure copy remains, retry succeeds", async () => {
    const secure = makeSecureStorage();
    const prefs = makePreferences();
    prefs.set = vi.fn(async () => {
      throw new Error("preferences write failed");
    });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    const { storage } = build({ secure, prefs, legacy });

    await expect(storage.ready()).rejects.toBeInstanceOf(StorageBootstrapError);

    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
    expect(legacy.store.get(LEGACY_KEY)).toBe(VALID_SESSION);
    expect(prefs.store.has(INSTALL_MARKER_KEY)).toBe(false);
    expect(legacy.removeItem).not.toHaveBeenCalled();

    // Repair preferences and retry.
    prefs.set = vi.fn(async ({ key, value }: { key: string; value: string }) => {
      prefs.store.set(key, value);
    });
    prefs.get = vi.fn(async ({ key }: { key: string }) => ({ value: prefs.store.get(key) ?? null }));

    const result = await storage.retry();
    expect(result.migratedLegacySession).toBe(true);
    expect(result.removedLegacySession).toBe(true);
    expect(prefs.store.get(INSTALL_MARKER_KEY)).toBe(INSTALL_MARKER_VALUE);
    expect(legacy.store.has(LEGACY_KEY)).toBe(false);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
  });

  it("A2. Preferences marker read-back mismatch keeps legacy and rejects", async () => {
    const prefs = makePreferences();
    prefs.set = vi.fn(async ({ key, value }: { key: string; value: string }) => {
      prefs.store.set(key, value);
    });
    prefs.get = vi
      .fn()
      .mockResolvedValueOnce({ value: null }) // initial marker read
      .mockResolvedValueOnce({ value: "wrong" }); // read-back after set
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    const { storage, secure } = build({ prefs, legacy });

    await expect(storage.ready()).rejects.toBeInstanceOf(StorageBootstrapError);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
    expect(legacy.store.get(LEGACY_KEY)).toBe(VALID_SESSION);
  });

  it("B. Preferences.set writes marker then throws: retry sees marker and removes legacy only", async () => {
    const secure = makeSecureStorage();
    const prefs = makePreferences();
    let setCalls = 0;
    prefs.set = vi.fn(async ({ key, value }: { key: string; value: string }) => {
      setCalls += 1;
      prefs.store.set(key, value);
      if (setCalls === 1) throw new Error("crash after durable write");
    });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    const { storage } = build({ secure, prefs, legacy });

    await expect(storage.ready()).rejects.toBeInstanceOf(StorageBootstrapError);
    expect(prefs.store.get(INSTALL_MARKER_KEY)).toBe(INSTALL_MARKER_VALUE);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
    expect(legacy.store.get(LEGACY_KEY)).toBe(VALID_SESSION);

    // Retry: marker present → scrub legacy, do NOT re-migrate.
    const setSpyBeforeRetry = prefs.set;
    const result = await storage.retry();
    expect(result.alreadyBootstrapped).toBe(true);
    expect(result.migratedLegacySession).toBe(false);
    expect(result.removedLegacySession).toBe(true);
    expect(legacy.store.has(LEGACY_KEY)).toBe(false);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
    // No new marker write required on residue cleanup.
    expect(setSpyBeforeRetry).toHaveBeenCalledTimes(1);
  });

  it("C. Legacy remove fails after marker commit; retry after repair removes legacy", async () => {
    const secure = makeSecureStorage();
    const prefs = makePreferences();
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    legacy.removeItem = vi.fn(() => {
      throw new Error("localStorage blocked");
    });
    const { storage } = build({ secure, prefs, legacy });

    await expect(storage.ready()).rejects.toBeInstanceOf(StorageBootstrapError);
    expect(prefs.store.get(INSTALL_MARKER_KEY)).toBe(INSTALL_MARKER_VALUE);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
    expect(legacy.store.get(LEGACY_KEY)).toBe(VALID_SESSION);

    legacy.removeItem = vi.fn((key: string) => {
      legacy.store.delete(key);
    });

    const result = await storage.retry();
    expect(result.alreadyBootstrapped).toBe(true);
    expect(result.migratedLegacySession).toBe(false);
    expect(result.removedLegacySession).toBe(true);
    expect(legacy.store.has(LEGACY_KEY)).toBe(false);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
  });

  it("D. Marker exists + Secure absent + Legacy present → residue removed, NOT migrated", async () => {
    const secure = makeSecureStorage();
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    const { storage } = build({ secure, prefs, legacy });

    const result = await storage.ready();

    expect(result.alreadyBootstrapped).toBe(true);
    expect(result.migratedLegacySession).toBe(false);
    expect(result.removedLegacySession).toBe(true);
    expect(secure.store.has(NATIVE_AUTH_STORAGE_KEY)).toBe(false);
    expect(secure.setItem).not.toHaveBeenCalled();
    expect(legacy.store.has(LEGACY_KEY)).toBe(false);
  });

  it("G. Marker absent + legacy getItem throws: reject, keep secure, no marker, retry migrates", async () => {
    const secure = makeSecureStorage({ [NATIVE_AUTH_STORAGE_KEY]: VALID_SESSION });
    const prefs = makePreferences();
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    legacy.getItem = vi.fn(() => {
      throw new Error("legacy localStorage blocked");
    });
    const { storage } = build({ secure, prefs, legacy });

    await expect(storage.ready()).rejects.toBeInstanceOf(AuthStorageUnavailableError);
    expect(prefs.store.has(INSTALL_MARKER_KEY)).toBe(false);
    expect(secure.removeItem).not.toHaveBeenCalled();
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);

    legacy.getItem = vi.fn((key: string) => legacy.store.get(key) ?? null);
    const result = await storage.retry();
    expect(result.migratedLegacySession).toBe(true);
    expect(result.removedLegacySession).toBe(true);
    expect(prefs.store.get(INSTALL_MARKER_KEY)).toBe(INSTALL_MARKER_VALUE);
    expect(legacy.store.has(LEGACY_KEY)).toBe(false);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
  });

  it("H. Marker present + legacy getItem throws: reject, keep secure + marker", async () => {
    const secure = makeSecureStorage({ [NATIVE_AUTH_STORAGE_KEY]: VALID_SESSION });
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    legacy.getItem = vi.fn(() => {
      throw new Error("legacy localStorage blocked");
    });
    const { storage } = build({ secure, prefs, legacy });

    await expect(storage.ready()).rejects.toBeInstanceOf(AuthStorageUnavailableError);
    expect(secure.store.get(NATIVE_AUTH_STORAGE_KEY)).toBe(VALID_SESSION);
    expect(prefs.store.get(INSTALL_MARKER_KEY)).toBe(INSTALL_MARKER_VALUE);
    expect(secure.setItem).not.toHaveBeenCalled();
    expect(legacy.removeItem).not.toHaveBeenCalled();
  });
});

describe("native secure auth storage — fail closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never falls back to localStorage when secure reads fail", async () => {
    const secure = makeSecureStorage();
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    secure.getItem = vi.fn(async () => {
      throw new Error("osError");
    });
    const { storage } = build({ secure, prefs, legacy: makeLegacyStorage() });

    await expect(storage.getItem(NATIVE_AUTH_STORAGE_KEY)).rejects.toBeInstanceOf(AuthStorageUnavailableError);
    // Residue cleanup may read/remove legacy during ready(); the critical invariant
    // is that a secure get failure never returns the legacy plaintext session.
  });

  it("rejects writes instead of degrading to plaintext storage", async () => {
    const secure = makeSecureStorage();
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    secure.setItem = vi.fn(async () => {
      throw new Error("osError");
    });
    const { storage } = build({ secure, prefs, legacy: null });

    await expect(storage.setItem(NATIVE_AUTH_STORAGE_KEY, VALID_SESSION)).rejects.toBeInstanceOf(
      AuthStorageUnavailableError,
    );
  });

  it("surfaces a missing plugin as AuthStorageUnavailableError", async () => {
    const storage = createNativeSecureAuthStorage({
      secureStorage: async () => {
        throw new Error("plugin not implemented");
      },
      preferences: makePreferences(),
      legacyStorage: null,
      legacyStorageKey: LEGACY_KEY,
    });

    await expect(storage.ready()).rejects.toBeInstanceOf(AuthStorageUnavailableError);
  });
});

describe("native secure auth storage — targeted clearing", () => {
  it("removes only the auth key and the legacy key on logout", async () => {
    const secure = makeSecureStorage({
      [NATIVE_AUTH_STORAGE_KEY]: VALID_SESSION,
      "unrelated.key": "keep-me",
    });
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION, "cart-v1": "keep-me" });
    const { storage } = build({ secure, prefs, legacy });

    await storage.clearPersistedSession();

    expect(secure.store.has(NATIVE_AUTH_STORAGE_KEY)).toBe(false);
    expect(secure.store.get("unrelated.key")).toBe("keep-me");
    expect(legacy.store.has(LEGACY_KEY)).toBe(false);
    expect(legacy.store.get("cart-v1")).toBe("keep-me");
    expect(prefs.store.get(INSTALL_MARKER_KEY)).toBe(INSTALL_MARKER_VALUE);
  });

  it("E. Logout rejects when legacy removal fails after secure clear", async () => {
    const secure = makeSecureStorage({ [NATIVE_AUTH_STORAGE_KEY]: VALID_SESSION });
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    legacy.removeItem = vi.fn(() => {
      throw new Error("cannot remove");
    });
    const { storage } = build({ secure, prefs, legacy });

    await expect(storage.clearPersistedSession()).rejects.toBeInstanceOf(StorageBootstrapError);
    expect(secure.store.has(NATIVE_AUTH_STORAGE_KEY)).toBe(false);
    expect(legacy.store.get(LEGACY_KEY)).toBe(VALID_SESSION);
  });

  it("E2. Logout rejects when legacy key remains after removeItem", async () => {
    const secure = makeSecureStorage({ [NATIVE_AUTH_STORAGE_KEY]: VALID_SESSION });
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    legacy.removeItem = vi.fn(() => {
      // pretend remove was a no-op
    });
    const { storage } = build({ secure, prefs, legacy });

    await expect(storage.clearPersistedSession()).rejects.toBeInstanceOf(StorageBootstrapError);
    expect(legacy.store.get(LEGACY_KEY)).toBe(VALID_SESSION);
  });

  it("I. Logout rejects when legacy getItem verification throws (storage_error)", async () => {
    const secure = makeSecureStorage({ [NATIVE_AUTH_STORAGE_KEY]: VALID_SESSION });
    const prefs = makePreferences({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    const legacy = makeLegacyStorage({ [LEGACY_KEY]: VALID_SESSION });
    let reads = 0;
    legacy.getItem = vi.fn((key: string) => {
      reads += 1;
      if (reads === 1) return legacy.store.get(key) ?? null;
      throw new Error("cannot verify legacy removal");
    });
    const { storage } = build({ secure, prefs, legacy });

    await expect(storage.clearPersistedSession()).rejects.toBeInstanceOf(AuthStorageUnavailableError);
    expect(secure.store.has(NATIVE_AUTH_STORAGE_KEY)).toBe(false);
    expect(legacy.removeItem).toHaveBeenCalled();
  });
});
