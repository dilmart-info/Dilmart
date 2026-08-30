/**
 * Barber Handoff orchestration.
 *
 * Prepare: verify assertion → validate state/clientStateHash → validate target (reuses the
 * canonical customer-handoff target validator — one allowlist for the whole Store) → rate limit →
 * 256-bit CSPRNG code → ATOMIC finalize (upsert store_linked_profiles + handoff row + PREPARED
 * audit + DB-clock expiry) → safe URL (code+state only).
 * Redeem: rate limit → atomic DB-time consume → mint a fresh opaque session token (256-bit CSPRNG,
 * hash-only stored) → return safe barber summary + target; the controller plants the session cookie.
 * A redeem always establishes a NEW session unconditionally superseding whatever the browser's
 * cookie held before (mirrors ordinary login-switch semantics — no silent merge).
 */
import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { BarberHandoffConfig } from "./barber-handoff.config";
import { BarberHandoffAssertionService, BarberAssertionInvalidError } from "./barber-handoff-assertion.service";
import { BarberHandoffRepository } from "./barber-handoff-repository";
import { BarberHandoffError, BarberHandoffErrors } from "./barber-handoff.errors";
import { AuthenticatedRedeemResult, BARBER_BOUNDS, BARBER_RATE_LIMITS, BarberWebSessionResult, PrepareResult } from "./barber-handoff.types";
import { resolveBarberWebSessionToken } from "./barber-web-cookie";
// Reuses the canonical Store target-path allowlist — there is exactly one, shared with Customer.
import { validateHandoffTargetPath } from "../customer-handoff/customer-handoff-target.validator";
// Reuses the generic, actor-agnostic sliding-window limiter + trusted-proxy-aware IP resolver.
import { SlidingWindowRateLimiter } from "../customer-handoff/customer-handoff-rate-limiter";
// Reuses the SAME segment computation the native X-Store-Session exchange already uses — one
// source of truth for role/sourceApp/barbershopId -> segment, never duplicated or guessed here.
import { ProductVisibilityService } from "../product-visibility.service";

/** Barber-web target route keys: '/' (home) + 'store' (/store/:slug). Matches the frontend's
 *  validateBarberTarget mirror and Main's own barber-handoff-target.validator exactly. */
const BARBER_TARGET_KEYS = new Set(["/", "store"]);

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

@Injectable()
export class BarberHandoffService {
  private readonly logger = new Logger(BarberHandoffService.name);
  private readonly prepareLimiter = new SlidingWindowRateLimiter(BARBER_RATE_LIMITS.PREPARE_PER_USER_PER_MIN, 60_000);
  private readonly redeemIpLimiter = new SlidingWindowRateLimiter(BARBER_RATE_LIMITS.REDEEM_PER_IP_PER_MIN, 60_000);

  constructor(
    private readonly config: BarberHandoffConfig,
    private readonly assertions: BarberHandoffAssertionService,
    private readonly repo: BarberHandoffRepository,
    private readonly productVisibility: ProductVisibilityService,
  ) {}

  // ── PREPARE ──────────────────────────────────────────────────────────────────
  async prepare(bearerToken: string | undefined, state: unknown, requestId = randomUUID()): Promise<PrepareResult> {
    if (!this.config.handoffEnabled) throw BarberHandoffErrors.storeIntegrationDisabled();

    const raw = this.extractBearer(bearerToken);

    let assertion;
    try {
      assertion = await this.assertions.verify(raw);
    } catch (err) {
      if (err instanceof BarberAssertionInvalidError) throw BarberHandoffErrors.handoffInvalid();
      throw err;
    }

    if (typeof state !== "string" || state.length < BARBER_BOUNDS.STATE_MIN_LEN || state.length > BARBER_BOUNDS.STATE_MAX_LEN) {
      throw BarberHandoffErrors.stateMismatch();
    }
    const stateHash = sha256Hex(state);
    if (!hexEqual(stateHash, assertion.clientStateHash)) throw BarberHandoffErrors.stateMismatch();

    // Review P2: one consistent allowlist end to end. Restrict prepare to the exact Barber
    // subset the /open-barber landing accepts ('/' home + '/store/:slug' storefronts) — a wider
    // customer-only target must be rejected HERE, before a code is ever minted, not discovered
    // as "invalid" by the landing page after redemption already consumed it.
    const targetPath = validateHandoffTargetPath(assertion.target, BARBER_TARGET_KEYS);
    if (!targetPath) throw BarberHandoffErrors.invalidTarget();

    if (!this.prepareLimiter.allow(assertion.sub)) throw BarberHandoffErrors.rateLimited();

    const code = randomBytes(32).toString("base64url"); // 256-bit CSPRNG
    const codeHash = sha256Hex(code);
    const ttl = this.config.codeTtlSeconds;

    const segment = this.productVisibility.computeSegmentFromToken({
      role: assertion.role,
      sourceApp: assertion.sourceApp,
      barbershopId: assertion.barbershopId,
    });

    let result;
    try {
      result = await this.repo.finalizeHandoff({
        DilMartUserId: assertion.sub,
        DilMartRole: assertion.role,
        barbershopId: assertion.barbershopId,
        segment,
        displayName: assertion.displayName ?? null,
        phone: assertion.phone ?? null,
        city: assertion.city ?? null,
        businessType: assertion.businessType ?? null,
        codeHash,
        stateHash,
        assertionJti: assertion.jti,
        targetPath,
        sourceSurface: assertion.sourceSurface,
        codeTtlSeconds: ttl,
        requestId,
      });
    } catch {
      this.logger.error("[barber-handoff] handoff finalize error.");
      throw BarberHandoffErrors.storeUnavailable();
    }

    if (result.status !== "OK" || !result.handoffId) {
      throw BarberHandoffErrors.handoffInvalid(); // jti/code_hash replay
    }

    const base = this.config.getOpenBaseUrl();
    const handoffUrl = `${base}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

    return { handoffId: result.handoffId, handoffUrl, expiresIn: ttl, target: targetPath };
  }

  // ── REDEEM ───────────────────────────────────────────────────────────────────
  async redeem(
    body: { code?: unknown; state?: unknown },
    clientIp: string | undefined,
    requestId = randomUUID(),
  ): Promise<{ result: AuthenticatedRedeemResult; sessionToken: string; sessionTtlSeconds: number }> {
    if (!this.config.handoffEnabled) throw BarberHandoffErrors.storeIntegrationDisabled();

    const code = this.boundedString(body.code, BARBER_BOUNDS.CODE_MAX_LEN);
    const state = this.boundedString(body.state, BARBER_BOUNDS.STATE_MAX_LEN);
    if (!code || !state) throw BarberHandoffErrors.handoffInvalid();

    const ipKey = (clientIp || "unknown").slice(0, 64);
    if (!this.redeemIpLimiter.allow(`ip:${ipKey}`)) throw BarberHandoffErrors.rateLimited();

    // ONE atomic RPC (review P1): consume + prior-session revocation (single-active-session) +
    // new-session insert in a single transaction. The raw session token is generated here and
    // only its SHA-256 hash ever leaves this process; a failure after consume rolls the consume
    // back inside the RPC, so a transient DB failure can never strand a valid login. The RPC also
    // enforces the OWNER/BARBER profile invariant in-transaction (a non-Barber row fails closed
    // WITHOUT burning the code).
    const sessionToken = randomBytes(32).toString("base64url");
    const ttl = this.config.sessionTtlSeconds;
    const row = await this.repo.redeemAndCreateSession(
      sha256Hex(code),
      sha256Hex(state),
      sha256Hex(sessionToken),
      ttl,
    );
    if (
      row.outcome_status !== "REDEEMED" ||
      !row.linked_profile_id ||
      !row.DilMart_user_id ||
      !row.DilMart_barbershop_id ||
      (row.role !== "OWNER" && row.role !== "BARBER")
    ) {
      switch (row.error_code) {
        case "HANDOFF_EXPIRED":
          throw BarberHandoffErrors.handoffExpired();
        case "HANDOFF_ALREADY_REDEEMED":
          throw BarberHandoffErrors.handoffInvalid(); // no distinct signal to an attacker
        case "HANDOFF_STATE_MISMATCH":
          throw BarberHandoffErrors.stateMismatch();
        default:
          throw BarberHandoffErrors.handoffInvalid();
      }
    }

    await this.repo.writeAudit({
      requestId,
      handoffId: row.handoff_id,
      linkedProfileId: row.linked_profile_id,
      eventType: "HANDOFF_SESSION_ESTABLISHED",
      status: "REDEEMED",
    });

    return {
      result: {
        status: "authenticated",
        barber: {
          linkedProfileId: row.linked_profile_id,
          DilMartUserId: row.DilMart_user_id,
          DilMartBarbershopId: row.DilMart_barbershop_id,
          role: row.role,
          displayName: row.display_name ?? null,
          shopName: null,
        },
        target: row.target_path ?? "/",
      },
      sessionToken,
      sessionTtlSeconds: ttl,
    };
  }

  // ── WEB SESSION CHECK (B2B cookie consumer) ─────────────────────────────────
  /**
   * The counterpart the redeem cookie was always missing a caller for: reads
   * __Host-DilMart_store_bwt, enforces the Origin allowlist the cookie's own doc comment requires,
   * verifies+touches the session, and returns a safe identity or a uniform "unauthenticated" —
   * never distinguishing "no cookie" from "bad origin" from "expired/revoked" in the response.
   */
  async checkWebSession(headers: Record<string, string | string[] | undefined> | undefined): Promise<BarberWebSessionResult> {
    if (!this.config.handoffEnabled) throw BarberHandoffErrors.storeIntegrationDisabled();

    const source = resolveBarberWebSessionToken(headers);
    if (source.kind !== "present") return { status: "unauthenticated" };

    let verified;
    try {
      verified = await this.repo.verifySession(sha256Hex(source.token));
    } catch {
      this.logger.error("[barber-handoff] web session verify error.");
      throw BarberHandoffErrors.storeUnavailable();
    }
    if (!verified || (verified.role !== "OWNER" && verified.role !== "BARBER")) {
      return { status: "unauthenticated" };
    }

    const contact = await this.repo.getLinkedProfileContactFields(verified.linkedProfileId).catch(() => null);

    return {
      status: "authenticated",
      barber: {
        linkedProfileId: verified.linkedProfileId,
        DilMartUserId: verified.DilMartUserId,
        DilMartBarbershopId: verified.DilMartBarbershopId,
        role: verified.role,
        displayName: contact?.displayName ?? null,
        shopName: null, // no shop_name column exists yet — parity with the redeem response, not invented here
        phone: contact?.phone ?? null,
        city: contact?.city ?? null,
        businessType: contact?.businessType ?? null,
      },
    };
  }

  /** Store-web-only logout: revokes every ACTIVE session for the DilMart user behind the presented
   *  cookie (the single-active-session invariant means that's normally exactly one row), if the
   *  Origin is approved. Never touches DilMart Main login or the Customer session — this is the
   *  Barber B2B cookie only. Idempotent when there is nothing to revoke (no cookie / forbidden
   *  origin / unknown token). Review fix: a genuine verify/revoke failure now THROWS rather than
   *  being swallowed into a false "unauthenticated" — the caller must not believe logout succeeded
   *  while the session (and the DB row) is still ACTIVE. */
  async logoutWebSession(headers: Record<string, string | string[] | undefined> | undefined): Promise<{ status: "unauthenticated" }> {
    if (!this.config.handoffEnabled) throw BarberHandoffErrors.storeIntegrationDisabled();

    const source = resolveBarberWebSessionToken(headers);
    if (source.kind === "present") {
      let verified;
      try {
        verified = await this.repo.verifySession(sha256Hex(source.token));
      } catch {
        this.logger.error("[barber-handoff] web session logout verify error.");
        throw BarberHandoffErrors.storeUnavailable();
      }
      if (verified) {
        try {
          await this.repo.revokeSessionsForUser(verified.DilMartUserId);
        } catch {
          this.logger.error("[barber-handoff] web session logout revoke failed.");
          throw BarberHandoffErrors.storeUnavailable();
        }
        // Best-effort only: the repository already swallows and logs its own audit-write
        // failures — the session is already revoked at this point regardless of this outcome.
        await this.repo.writeAudit({
          linkedProfileId: verified.linkedProfileId,
          eventType: "HANDOFF_SESSION_LOGOUT",
          status: "REVOKED",
        });
      }
    }
    return { status: "unauthenticated" };
  }

  // ── helpers ────────────────────────────────────────────────────────────────────
  private extractBearer(header: string | undefined): string {
    const h = (header ?? "").trim();
    if (!h.startsWith("Bearer ")) throw BarberHandoffErrors.handoffInvalid();
    const token = h.slice("Bearer ".length).trim();
    if (!token) throw BarberHandoffErrors.handoffInvalid();
    return token;
  }

  private boundedString(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length === 0 || t.length > max) return null;
    return t;
  }
}
