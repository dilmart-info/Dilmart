/**
 * STORE-PR5 (DilMart-CUSTOMER-STORE-STORE-PR5) — Auth-source authorization metadata.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.4 (Store Auth Adapter / dual ActorContext),
 * §9.5 (backend authority for federated customer features).
 *
 * A protected route accepts a Supabase Bearer identity by default. Federated (DilMart customer app)
 * identities are accepted ONLY on routes that explicitly opt in via `@AuthSources(...)`. This keeps
 * least-privilege: `@Roles("authenticated")` alone never federated-enables a route.
 */
import { SetMetadata } from "@nestjs/common";

/** The two identity origins Store Backend can resolve an actor from. */
export type AuthSource = "supabase" | "DilMart_federated";

/** Reflector metadata key for the per-route allowed auth sources. */
export const AUTH_SOURCES_KEY = "authSources";

/**
 * Explicitly declare which auth sources a protected route accepts.
 *
 * Example (the only routes that should carry `DilMart_federated`):
 *   @Roles("authenticated")
 *   @AuthSources("supabase", "DilMart_federated")
 *
 * A protected route with NO `@AuthSources` metadata is treated as SUPABASE_ONLY
 * (see DEFAULT_AUTH_SOURCES) — the backward-compatible, least-privilege default.
 */
export const AuthSources = (...sources: AuthSource[]) => SetMetadata(AUTH_SOURCES_KEY, sources);

/**
 * The default allowed sources for any protected route that does not declare `@AuthSources`.
 * MUST remain `["supabase"]` so existing routes keep exactly their current behavior and no route
 * becomes federated-enabled implicitly.
 */
export const DEFAULT_AUTH_SOURCES: readonly AuthSource[] = ["supabase"] as const;
