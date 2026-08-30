/**
 * Opaque OTP request handles.
 *
 * `POST /auth/account-claim/recover` and `POST /auth/password-reset/request` must not
 * reveal whether an account exists, yet `verify` needs something to identify the
 * challenge. Returning `challenge_id` only when the account exists is exactly the
 * enumeration oracle those endpoints were written to avoid, which is why they previously
 * returned nothing at all and left the flow impossible to complete.
 *
 * A handle solves both: every request gets one, and it is indistinguishable from the
 * outside. A real handle carries the challenge id, a decoy carries random bytes of the
 * same length. Signing alone would not be enough — a signed payload is still readable,
 * so the caller could see which kind it holds. The payload is therefore encrypted with
 * AES-256-GCM, which also authenticates it.
 *
 * Handles are stateless. No table, no migration, nothing to clean up.
 *
 * Keying: the handle key comes from OTP_REQUEST_HANDLE_SECRET, never from
 * OTP_HMAC_SECRET (which keys OTP digests) or OTP_TOKEN_SECRET (which keys action
 * tokens). Three purposes, three keys — compromising one must not compromise another.
 *
 * Format: `v1.<base64url(iv || tag || ciphertext)>`. The version prefix is constant, so
 * it reveals nothing about the kind, and it lets a future secret rotation ship a `v2`
 * that can be distinguished from, and rejected alongside, the old one.
 */
import * as crypto from "crypto";

const HANDLE_VERSION = "v1";
const HANDLE_PREFIX = `${HANDLE_VERSION}.`;

const HANDLE_KIND_CHALLENGE = "c";
const HANDLE_KIND_DECOY = "d";

/** Both kinds serialise to this length, so the ciphertext never hints at the kind. */
const PAYLOAD_VALUE_LENGTH = 36;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export type ResolvedOtpRequestHandle =
  | { kind: "challenge"; challengeId: string }
  | { kind: "decoy" };

/**
 * Derived from the dedicated request-handle secret with domain separation, so a handle
 * key can never collide with an OTP digest key or an action-token key even if an operator
 * mistakenly configures the same value twice. The distinctness check in
 * OtpChallengeService rejects that configuration outright in production.
 */
function handleKey(handleSecret: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(`otp-request-handle:${HANDLE_VERSION}:${handleSecret}`)
    .digest();
}

function seal(handleSecret: string, kind: string, value: string): string {
  const padded = value.padEnd(PAYLOAD_VALUE_LENGTH, " ").slice(0, PAYLOAD_VALUE_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", handleKey(handleSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(`${kind}${padded}`, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return HANDLE_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

/** Handle for a real challenge. */
export function issueChallengeHandle(handleSecret: string, challengeId: string): string {
  return seal(handleSecret, HANDLE_KIND_CHALLENGE, challengeId);
}

/**
 * Handle for a request that matched no account, or whose delivery never ran. Verifying it
 * always fails the same way a wrong code does, so the caller learns nothing.
 */
export function issueDecoyHandle(handleSecret: string): string {
  return seal(handleSecret, HANDLE_KIND_DECOY, crypto.randomUUID());
}

/**
 * Returns null for anything tampered with, truncated, or issued under another secret.
 * Callers must treat null exactly like a decoy — same message, same status.
 */
export function resolveOtpRequestHandle(
  handleSecret: string,
  handle: string,
): ResolvedOtpRequestHandle | null {
  if (typeof handle !== "string" || !handle.startsWith(HANDLE_PREFIX)) return null;

  let raw: Buffer;
  try {
    raw = Buffer.from(handle.slice(HANDLE_PREFIX.length), "base64url");
  } catch {
    return null;
  }
  if (raw.length !== IV_LENGTH + TAG_LENGTH + 1 + PAYLOAD_VALUE_LENGTH) return null;

  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);

  let plaintext: string;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", handleKey(handleSecret), iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }

  const kind = plaintext.slice(0, 1);
  const value = plaintext.slice(1).trim();

  if (kind === HANDLE_KIND_CHALLENGE) {
    return value ? { kind: "challenge", challengeId: value } : null;
  }
  if (kind === HANDLE_KIND_DECOY) {
    return { kind: "decoy" };
  }
  return null;
}
