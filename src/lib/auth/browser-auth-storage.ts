/**
 * Web auth storage adapter.
 *
 * Supabase accepts an async `SupportedStorage`, so the synchronous
 * `window.localStorage` calls are simply wrapped in promises. Behaviour on web
 * is intentionally unchanged from before Phase 3.
 */

import type { AsyncSupportedStorage } from "./supported-storage";

export type SyncStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** In-memory fallback used only when localStorage is entirely unavailable (SSR/tests). */
export function createMemoryStorage(): SyncStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function resolveDefaultStorage(): SyncStorageLike {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Access to localStorage can throw in hardened/private browsing contexts.
  }
  return createMemoryStorage();
}

export function createBrowserAuthStorage(storage: SyncStorageLike = resolveDefaultStorage()): AsyncSupportedStorage {
  return {
    async getItem(key: string): Promise<string | null> {
      return storage.getItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      storage.setItem(key, value);
    },
    async removeItem(key: string): Promise<void> {
      storage.removeItem(key);
    },
  };
}
