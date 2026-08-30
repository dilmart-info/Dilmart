import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { AuthSessionManager } from "./auth-session-manager";
import { AUTH_REFRESH_OUTCOMES } from "./auth-events";
import { AuthStorageUnavailableError } from "./auth-errors";

const clearPersistedAuthSession = vi.fn(async () => undefined);
const ensureAuthStorageReady = vi.fn(async () => ({
  alreadyBootstrapped: true,
  migratedLegacySession: false,
  clearedStaleSecureSession: false,
  removedLegacySession: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: {} },
}));

vi.mock("./auth-storage", () => ({
  clearPersistedAuthSession: (...args: unknown[]) => clearPersistedAuthSession(...(args as [])),
}));

vi.mock("./auth-storage-bootstrap", () => ({
  ensureAuthStorageReady: (...args: unknown[]) => ensureAuthStorageReady(...(args as [])),
  getAuthStorageBootstrapError: () => null,
  retryAuthStorageBootstrap: vi.fn(async () => undefined),
}));

function makeSession(expiresInSeconds: number, accessToken = "access-token"): Session {
  return {
    access_token: accessToken,
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    expires_in: expiresInSeconds,
    token_type: "bearer",
    user: { id: "user-1" },
  } as unknown as Session;
}

function makeAuthClient(overrides: Record<string, unknown> = {}) {
  return {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    startAutoRefresh: vi.fn(async () => undefined),
    stopAutoRefresh: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeManager(auth: ReturnType<typeof makeAuthClient>) {
  const manager = new AuthSessionManager();
  manager.setClient({ auth } as never);
  return manager;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getValidAccessToken", () => {
  it("returns the current token when it is comfortably valid", async () => {
    const auth = makeAuthClient({
      getSession: vi.fn(async () => ({ data: { session: makeSession(3600) }, error: null })),
    });
    const manager = makeManager(auth);

    expect(await manager.getValidAccessToken()).toBe("access-token");
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes when the token expires within the 60s threshold", async () => {
    const refreshed = makeSession(3600, "fresh-token");
    const auth = makeAuthClient({
      getSession: vi.fn(async () => ({ data: { session: makeSession(30) }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: refreshed }, error: null })),
    });
    const manager = makeManager(auth);

    expect(await manager.getValidAccessToken()).toBe("fresh-token");
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("returns null when there is no session", async () => {
    const manager = makeManager(makeAuthClient());
    expect(await manager.getValidAccessToken()).toBeNull();
  });

  it("keeps using the current token when the refresh fails transiently", async () => {
    const auth = makeAuthClient({
      getSession: vi.fn(async () => ({ data: { session: makeSession(30) }, error: null })),
      refreshSession: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    const manager = makeManager(auth);

    expect(await manager.getValidAccessToken()).toBe("access-token");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe("refreshSessionSingleFlight", () => {
  it("coalesces concurrent refreshes into one network call", async () => {
    let resolveRefresh: ((value: unknown) => void) | null = null;
    const refreshed = makeSession(3600, "fresh-token");
    const auth = makeAuthClient({
      refreshSession: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    });
    const manager = makeManager(auth);

    const first = manager.refreshSessionSingleFlight();
    const second = manager.refreshSessionSingleFlight();
    expect(first).toBe(second);

    resolveRefresh?.({ data: { session: refreshed }, error: null });
    const [a, b] = await Promise.all([first, second]);

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(a.status).toBe(AUTH_REFRESH_OUTCOMES.refreshed);
    expect(b.session?.access_token).toBe("fresh-token");
  });

  it("allows a new refresh after the previous one settles", async () => {
    const auth = makeAuthClient({
      refreshSession: vi.fn(async () => ({ data: { session: makeSession(3600) }, error: null })),
    });
    const manager = makeManager(auth);

    await manager.refreshSessionSingleFlight();
    await manager.refreshSessionSingleFlight();

    expect(auth.refreshSession).toHaveBeenCalledTimes(2);
  });

  it("logs out on a definitive failure", async () => {
    const auth = makeAuthClient({
      refreshSession: vi.fn(async () => ({
        data: { session: null },
        error: { message: "Invalid Refresh Token: Refresh Token Not Found", status: 400 },
      })),
    });
    const manager = makeManager(auth);

    const result = await manager.refreshSessionSingleFlight();

    expect(result.status).toBe(AUTH_REFRESH_OUTCOMES.definitiveFailure);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearPersistedAuthSession).toHaveBeenCalledTimes(1);
  });

  it("preserves the session on a transient failure", async () => {
    const auth = makeAuthClient({
      getSession: vi.fn(async () => ({ data: { session: makeSession(30) }, error: null })),
      refreshSession: vi.fn(async () => ({
        data: { session: null },
        error: { message: "Service Unavailable", status: 503 },
      })),
    });
    const manager = makeManager(auth);
    await manager.getSession();

    const result = await manager.refreshSessionSingleFlight();

    expect(result.status).toBe(AUTH_REFRESH_OUTCOMES.transientFailure);
    expect(result.session?.access_token).toBe("access-token");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(clearPersistedAuthSession).not.toHaveBeenCalled();
  });

  it("reports storage failures without destroying the session", async () => {
    const auth = makeAuthClient({
      refreshSession: vi.fn(async () => {
        throw new AuthStorageUnavailableError();
      }),
    });
    const manager = makeManager(auth);

    const result = await manager.refreshSessionSingleFlight();

    expect(result.status).toBe(AUTH_REFRESH_OUTCOMES.storageError);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(manager.getStorageError()).toBeInstanceOf(AuthStorageUnavailableError);
  });
});

describe("logoutCurrentDevice", () => {
  it("signs out with local scope and clears only the auth keys", async () => {
    const auth = makeAuthClient();
    const manager = makeManager(auth);

    await manager.logoutCurrentDevice();

    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearPersistedAuthSession).toHaveBeenCalledTimes(1);
    expect(manager.getLastKnownSession()).toBeNull();
  });

  it("still clears local state when the remote sign-out throws", async () => {
    const auth = makeAuthClient({
      signOut: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    const manager = makeManager(auth);

    await expect(manager.logoutCurrentDevice()).resolves.toBeUndefined();
    expect(clearPersistedAuthSession).toHaveBeenCalledTimes(1);
  });

  it("rejects when secure auth key removal fails", async () => {
    clearPersistedAuthSession.mockRejectedValueOnce(new AuthStorageUnavailableError());
    const auth = makeAuthClient();
    const manager = makeManager(auth);

    await expect(manager.logoutCurrentDevice()).rejects.toBeInstanceOf(AuthStorageUnavailableError);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearPersistedAuthSession).toHaveBeenCalledTimes(1);
  });

  it("still rejects secure-clear failure after a network signOut error", async () => {
    clearPersistedAuthSession.mockRejectedValueOnce(new AuthStorageUnavailableError());
    const auth = makeAuthClient({
      signOut: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    const manager = makeManager(auth);

    await expect(manager.logoutCurrentDevice()).rejects.toBeInstanceOf(AuthStorageUnavailableError);
    expect(clearPersistedAuthSession).toHaveBeenCalledTimes(1);
  });
});

describe("bootstrapSession", () => {
  it("awaits storage readiness before reading the session", async () => {
    const session = makeSession(3600);
    const auth = makeAuthClient({
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
    });
    const manager = makeManager(auth);

    const restored = await manager.bootstrapSession();

    expect(ensureAuthStorageReady).toHaveBeenCalledTimes(1);
    expect(restored?.access_token).toBe("access-token");
  });

  it("propagates storage bootstrap failures instead of signing out", async () => {
    ensureAuthStorageReady.mockRejectedValueOnce(new AuthStorageUnavailableError());
    const auth = makeAuthClient();
    const manager = makeManager(auth);

    await expect(manager.bootstrapSession()).rejects.toBeInstanceOf(AuthStorageUnavailableError);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(clearPersistedAuthSession).not.toHaveBeenCalled();
  });
});
