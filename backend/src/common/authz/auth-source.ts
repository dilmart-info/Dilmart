import { SetMetadata } from "@nestjs/common";

/** Authoritative identity origin for DILMART Backend. */
export type AuthSource = "supabase";

/** Reflector metadata key for the per-route allowed auth sources. */
export const AUTH_SOURCES_KEY = "authSources";

export const AuthSources = (...sources: AuthSource[]) => SetMetadata(AUTH_SOURCES_KEY, sources);

export const DEFAULT_AUTH_SOURCES: readonly AuthSource[] = ["supabase"] as const;

