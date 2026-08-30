import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function readStatusJson() {
  const searchPaths = [
    path.resolve(process.cwd(), "supabase_status.json"),
    path.resolve(process.cwd(), "../supabase_status.json"),
    path.resolve(process.cwd(), "../../supabase_status.json"),
  ];
  for (const statusPath of searchPaths) {
    try {
      if (fs.existsSync(statusPath)) {
        return JSON.parse(fs.readFileSync(statusPath, "utf8"));
      }
    } catch (e) {
      // Ignore and try the next candidate path.
    }
  }
  return null;
}

function resolveUrl(status) {
  return (
    process.env.SUPABASE_URL ||
    status?.api?.url ||
    status?.API_URL ||
    status?.api_url ||
    "http://127.0.0.1:54321"
  );
}

function resolveServiceRoleKey(status) {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    status?.auth?.service_role_key ||
    status?.SERVICE_ROLE_KEY ||
    status?.service_role_key ||
    null
  );
}

/** Anon/publishable key — used to exercise RLS-restricted (`anon`/`authenticated`) reads. */
function resolveAnonKey(status) {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    status?.api?.anon_key ||
    status?.auth?.anon_key ||
    status?.ANON_KEY ||
    status?.anon_key ||
    null
  );
}

export function getTestClient() {
  const status = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? null : readStatusJson();
  const url = resolveUrl(status);
  const key = resolveServiceRoleKey(status);

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for integration tests but was not provided or resolved.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Anon-role client — used by RLS integration tests to verify what an unauthenticated
 * storefront visitor can/cannot read. Returns `null` (never throws) when no anon key can be
 * resolved so callers can skip cleanly instead of failing the whole suite.
 */
export function getAnonClient() {
  const status = readStatusJson();
  const url = resolveUrl(status);
  const key = resolveAnonKey(status);
  if (!key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** Authenticated (non-service-role) client for a specific user's access token. */
export function getUserClient(accessToken) {
  const status = readStatusJson();
  const url = resolveUrl(status);
  const key = resolveAnonKey(status);
  if (!key || !accessToken) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
