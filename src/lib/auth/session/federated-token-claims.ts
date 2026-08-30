/**
 * STORE-PR5 §9.2 — read the NON-secret identity claims out of a federated access token.
 *
 * The backend signs the access token with `sub = storeCustomerId` plus `sessionFamilyId` /
 * `linkedProfileId` (see `FederatedAccessTokenService`). This module decodes that payload WITHOUT
 * verifying the signature, and the result is used for EXACTLY ONE purpose: deciding whether a token the
 * client just received still belongs to the identity the client is currently holding in memory.
 *
 * It is never an authorization decision. The backend re-verifies every token on every request; an
 * attacker who could forge these claims could only make the client distrust a token it already has,
 * which fails safe (revalidate via /auth/context), never open.
 */

export type FederatedTokenIdentity = {
  /** JWT `sub` — the Store customer id. */
  storeCustomerId: string | null;
  /** One family per redeem; rotation inside a family preserves it. */
  sessionFamilyId: string | null;
  linkedProfileId: string | null;
};

function decodeBase64Url(segment: string): string | null {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    if (typeof atob === "function") {
      const binary = atob(padded);
      // Claim values are UUIDs/ASCII, but decode as UTF-8 so a non-ASCII claim can never corrupt the JSON.
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    // Non-browser runtimes (SSR/node test env without atob).
    const nodeBuffer = (globalThis as { Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer;
    return nodeBuffer ? nodeBuffer.from(padded, "base64").toString("utf8") : null;
  } catch {
    return null;
  }
}

function asClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Returns the identity claims, or `null` when the token is not a readable JWT. A `null` result means
 * "cannot prove which identity this token belongs to" — callers must treat that as a change, not as a match.
 */
export function readFederatedTokenIdentity(accessToken: string | null | undefined): FederatedTokenIdentity | null {
  if (typeof accessToken !== "string") return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const identity: FederatedTokenIdentity = {
    storeCustomerId: asClaim(p.sub),
    sessionFamilyId: asClaim(p.sessionFamilyId),
    linkedProfileId: asClaim(p.linkedProfileId),
  };
  // A payload that carries none of the identity claims tells us nothing.
  if (!identity.storeCustomerId && !identity.sessionFamilyId) return null;
  return identity;
}

/**
 * Does adopting `nextAccessToken` require the identity to be re-resolved from `/auth/context`?
 *
 * Continuation is permitted ONLY when every one of these is PROVEN. Anything else — an unreadable
 * token on either side, a missing claim on either side, or any mismatch — returns `true`. There is no
 * branch that treats "cannot tell" as "same identity".
 *
 *   - both tokens decode;
 *   - both carry a `sub`, they match each other, and they match the customer held in memory;
 *   - both carry a `sessionFamilyId` and they match;
 *   - if both carry a `linkedProfileId`, they match.
 *
 * The session family is deliberately load-bearing, not merely corroborating. Every redeem mints a
 * fresh family while rotation preserves it, so a changed — or unprovable — family means the shared web
 * cookie authority was replaced. The same human may well still be present, but `linkedProfileId`,
 * roles, profile and every user-scoped cache were resolved under the OLD authority and must not be
 * carried across that transition on trust.
 */
/**
 * A stable key for the identity CONTEXT a token belongs to: customer + session family.
 *
 * `null` when either claim is unreadable — callers must treat an unknown context as a NEW one, never as
 * a continuation of whatever they were already resolving. Used to decide whether a refresh that arrives
 * while resolution is already pending represents the SAME unresolved context (same generation) or a
 * different one (new generation, which invalidates any in-flight resolution).
 */
export function federatedContextKey(accessToken: string | null | undefined): string | null {
  const identity = readFederatedTokenIdentity(accessToken);
  if (!identity?.storeCustomerId || !identity.sessionFamilyId) return null;
  return `${identity.storeCustomerId}|${identity.sessionFamilyId}`;
}

export function requiresIdentityRevalidation(
  previous: { accessToken: string; storeCustomerId: string },
  nextAccessToken: string,
): boolean {
  const prev = readFederatedTokenIdentity(previous.accessToken);
  const next = readFederatedTokenIdentity(nextAccessToken);
  if (!prev || !next) return true; // either side unreadable → never assume continuity

  if (!prev.storeCustomerId || !next.storeCustomerId) return true;
  if (prev.storeCustomerId !== next.storeCustomerId) return true;
  // The token we believe we are holding must agree with the identity we resolved for it; a mismatch
  // means memory and credential have already diverged.
  if (previous.storeCustomerId && prev.storeCustomerId !== previous.storeCustomerId) return true;

  // Both sides must PROVE the family. A missing family on either side is unprovable, not benign.
  if (!prev.sessionFamilyId || !next.sessionFamilyId) return true;
  if (prev.sessionFamilyId !== next.sessionFamilyId) return true;

  if (prev.linkedProfileId && next.linkedProfileId && prev.linkedProfileId !== next.linkedProfileId) return true;

  return false;
}
