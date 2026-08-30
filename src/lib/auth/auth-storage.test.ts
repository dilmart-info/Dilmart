import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NATIVE_AUTH_STORAGE_KEY } from "./auth-storage-keys";

/**
 * `auth-storage` resolves the platform at module load, so each case needs a
 * fresh module registry with `isNative()` stubbed before the import.
 */
async function loadAuthStorage(native: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/capacitor", () => ({
    isNative: () => native,
    openExternal: vi.fn(),
    shouldOpenExternally: () => false,
  }));
  return import("./auth-storage");
}

describe("auth storage platform selection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/capacitor");
    vi.resetModules();
  });

  it("uses the browser adapter and the legacy Supabase key on web", async () => {
    const mod = await loadAuthStorage(false);

    expect(mod.isNativePlatform).toBe(false);
    expect(mod.nativeAuthStorage).toBeNull();
    expect(mod.authStorage).toBe(mod.browserAuthStorage);
    expect(mod.platformStorageKey).toBe(mod.legacyAuthStorageKey);
    expect(mod.platformStorageKey.startsWith("sb-")).toBe(true);
  });

  it("uses the encrypted native adapter and the namespaced key on native", async () => {
    const mod = await loadAuthStorage(true);

    expect(mod.isNativePlatform).toBe(true);
    expect(mod.nativeAuthStorage).not.toBeNull();
    expect(mod.authStorage).toBe(mod.nativeAuthStorage);
    expect(mod.platformStorageKey).toBe(NATIVE_AUTH_STORAGE_KEY);
    expect(mod.authStorage).not.toBe(mod.browserAuthStorage);
  });

  it("round-trips through localStorage on web without touching unrelated keys", async () => {
    const mod = await loadAuthStorage(false);
    window.localStorage.setItem("cart-v1", "keep-me");

    await mod.authStorage.setItem(mod.platformStorageKey, "session-blob");
    expect(await mod.authStorage.getItem(mod.platformStorageKey)).toBe("session-blob");

    await mod.clearPersistedAuthSession();

    expect(await mod.authStorage.getItem(mod.platformStorageKey)).toBeNull();
    expect(window.localStorage.getItem("cart-v1")).toBe("keep-me");
    window.localStorage.removeItem("cart-v1");
  });
});
