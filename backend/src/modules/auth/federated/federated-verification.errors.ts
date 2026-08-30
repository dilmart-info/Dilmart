/**
 * STORE-PR5 (Blocker 1) — Typed federated verification error boundary.
 *
 * These are the ONLY failure signals the verifier raises. Callers classify by `instanceof`, never by
 * matching human-readable messages. Raw Supabase/PostgreSQL/PostgREST errors and key/config import
 * failures are caught at the verifier boundary and re-raised as `FederatedVerificationDependencyError`
 * so infrastructure diagnostics never escape into the guard or an API body.
 *
 * `FederatedTokenInvalidError` and `FederatedSessionFamilyInvalidError` extend the pre-PR4
 * `FederatedSessionInvalidError` for backward compatibility (existing tests assert that base type for
 * any token/claim/family failure).
 */

/** Base "the token/session is not valid" error (HTTP 401 family). */
export class FederatedSessionInvalidError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "FederatedSessionInvalidError";
  }
}

/** Malformed token, bad signature, missing/mistyped claims, unknown/mismatched kid, disallowed alg. → 401 */
export class FederatedTokenInvalidError extends FederatedSessionInvalidError {
  constructor(reason: string) {
    super(reason);
    this.name = "FederatedTokenInvalidError";
  }
}

/** Cryptographically valid token but the DB session family is revoked/expired/compromised/version-mismatched. → 401 */
export class FederatedSessionFamilyInvalidError extends FederatedSessionInvalidError {
  constructor(reason = "session family invalid") {
    super(reason);
    this.name = "FederatedSessionFamilyInvalidError";
  }
}

/** A dependency (repository RPC transport / PostgreSQL / key or config import) was unavailable. → 503 */
export class FederatedVerificationDependencyError extends Error {
  constructor(reason = "federated verification dependency unavailable") {
    super(reason);
    this.name = "FederatedVerificationDependencyError";
  }
}

/** A genuinely unexpected programming failure inside verification. → 500 */
export class FederatedVerificationInternalError extends Error {
  constructor(reason = "federated verification internal error") {
    super(reason);
    this.name = "FederatedVerificationInternalError";
  }
}
