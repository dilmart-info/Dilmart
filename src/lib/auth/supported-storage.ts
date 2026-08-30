/**
 * Structural equivalent of `@supabase/supabase-js`'s `SupportedStorage`.
 *
 * Kept in its own module so both storage adapters and `auth-storage.ts` can
 * reference it without creating an import cycle.
 */
export type SupportedStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
};

/** Strictly async variant implemented by every DilMart-Store adapter. */
export type AsyncSupportedStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
