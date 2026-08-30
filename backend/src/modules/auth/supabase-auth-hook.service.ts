/**
 * Supabase Auth "Send SMS" hook.
 *
 * Supabase owns the OTP: it generates the code, verifies it, and issues the session. This
 * service is transport only — it takes the code Supabase already minted and hands it to
 * the existing WhatsAppOtpProvider. No Meta logic is duplicated here, no challenge row is
 * written, and the code is never stored, logged or returned.
 *
 * Signature verification uses the standardwebhooks library against the **raw** request
 * body. Re-serialising the parsed object would change the bytes and could never match, so
 * a missing raw body is treated as a verification failure rather than falling back.
 */
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { Webhook } from "standardwebhooks";
import { AuthHookIdempotencyService } from "./auth-hook-idempotency.service";
import { maskPhoneForLogs, toWhatsAppE164 } from "./otp-phone.util";
import { WhatsAppOtpProvider, type WhatsAppOtpSendResult } from "./whatsapp-otp.provider";

export interface SupabaseSmsHookHeaders {
  "webhook-id"?: string;
  "webhook-timestamp"?: string;
  "webhook-signature"?: string;
}

export interface SupabaseSmsHookPayload {
  user?: { id?: string | null; phone?: string | null };
  sms?: { otp?: string | null };
}

/**
 * Supabase abandons an HTTP auth hook after roughly five seconds. Finishing a Meta call
 * after that point cannot help the user — the auth request has already failed — and it
 * would burn a template send. The hook therefore runs on its own, tighter deadline than
 * the channel default that Account Claim and the legacy reset paths use.
 */
const HOOK_TIMEOUT_DEFAULT_MS = 4000;
const HOOK_TIMEOUT_MIN_MS = 1000;
const HOOK_TIMEOUT_MAX_MS = 4500;

/** How long a completed delivery is remembered, so a Supabase retry is not sent twice. */
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 2000;

/**
 * Per-recipient send limits. Supabase calls this endpoint from a small set of shared
 * egress addresses, so an IP-based limit would treat every customer in the country as one
 * caller. The real subject is the recipient, and the limits sit close to a sane resend
 * policy rather than trying to be the primary defence — Supabase already rate limits OTP
 * issuance upstream.
 */
const RECIPIENT_LIMIT_PER_MINUTE = 3;
const RECIPIENT_LIMIT_PER_HOUR = 10;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const RECIPIENT_TRACKER_MAX = 10_000;

/**
 * Domain separation for the recipient-limit key.
 *
 * The limiter key is derived from SUPABASE_AUTH_HOOK_SECRET rather than given its own
 * environment variable: one fewer secret for an operator to provision, rotate and get
 * wrong, and HMAC with a distinct label already guarantees the derived key is
 * cryptographically unrelated to the signature-verification use of the same secret.
 * Bumping the version suffix rotates every bucket.
 */
const RECIPIENT_LIMIT_KEY_LABEL = "auth-hook-recipient-limit:v1";

/**
 * How long to wait on a dispatch another instance is already performing. Kept far below
 * the hook budget so a wait can never be the reason Supabase abandons the request.
 */
const CROSS_INSTANCE_WAIT_MS = 1500;
const CROSS_INSTANCE_POLL_MS = 150;

type DeliveryEntry =
  | { state: "IN_FLIGHT"; startedAt: number; digest: string; promise: Promise<void> }
  | { state: "SUCCEEDED"; completedAt: number; digest: string };

@Injectable()
export class SupabaseAuthHookService {
  private readonly logger = new Logger(SupabaseAuthHookService.name);

  /**
   * Delivery deduplication cache, keyed by webhook-id.
   *
   * Not a replay-attack defence — a repeated signed request is usually Supabase retrying,
   * which is legitimate. Signature verification is what rejects forgeries; this exists so
   * a legitimate retry does not send a second WhatsApp message.
   *
   * Only IN_FLIGHT and SUCCEEDED are recorded. A failure removes the entry entirely, so a
   * later retry is accepted and dispatched again. Keeping a FAILED state would turn one
   * bad Meta response into ten minutes of refused retries.
   */
  private readonly deliveries = new Map<string, DeliveryEntry>();

  /** Send timestamps per hashed recipient. Never holds a phone or a user id. */
  private readonly recipientSends = new Map<string, number[]>();

  /** Instance fields rather than bare constants so tests can drive the real cap paths. */
  private recipientTrackerMax = RECIPIENT_TRACKER_MAX;
  private deliveryMaxEntries = IDEMPOTENCY_MAX_ENTRIES;

  constructor(
    private readonly config: ConfigService,
    private readonly whatsAppOtp: WhatsAppOtpProvider,
    private readonly durable: AuthHookIdempotencyService,
  ) {}

  private getHookSecret(): string {
    const secret = this.config.get<string>("SUPABASE_AUTH_HOOK_SECRET")?.trim();
    if (!secret) {
      this.logger.error("[AUTH_HOOK] SUPABASE_AUTH_HOOK_SECRET is not configured");
      throw new ServiceUnavailableException({
        code: "SUPABASE_AUTH_HOOK_SECRET_MISSING",
        message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
      });
    }
    return secret;
  }

  private isProductionRuntime(): boolean {
    return (process.env.NODE_ENV || "").toLowerCase() === "production";
  }

  /**
   * Must stay under Supabase's five-second hook budget. An out-of-range value fails
   * readiness in production rather than silently falling back to a default that would
   * exceed the budget; outside production it falls back and says so.
   */
  resolveHookTimeoutMs(): number {
    const raw = this.config.get<string>("SUPABASE_AUTH_HOOK_TIMEOUT_MS")?.trim();
    if (!raw) return HOOK_TIMEOUT_DEFAULT_MS;

    const parsed = Number(raw);
    const valid =
      Number.isFinite(parsed) && parsed >= HOOK_TIMEOUT_MIN_MS && parsed <= HOOK_TIMEOUT_MAX_MS;

    if (valid) return parsed;

    if (this.isProductionRuntime()) {
      this.logger.error(
        `[AUTH_HOOK] SUPABASE_AUTH_HOOK_TIMEOUT_MS must be between ${HOOK_TIMEOUT_MIN_MS} and ${HOOK_TIMEOUT_MAX_MS}`,
      );
      throw new ServiceUnavailableException({
        code: "SUPABASE_AUTH_HOOK_TIMEOUT_INVALID",
        message: "قناة إرسال رمز التحقق غير مهيأة بشكل صحيح",
      });
    }

    this.logger.warn(
      `[AUTH_HOOK] Ignoring out-of-range SUPABASE_AUTH_HOOK_TIMEOUT_MS, using ${HOOK_TIMEOUT_DEFAULT_MS}ms`,
    );
    return HOOK_TIMEOUT_DEFAULT_MS;
  }

  /**
   * Digest of the exact bytes that were signed. Stored instead of the body so the cache
   * never holds an OTP or a phone number, and it is only ever compared, never emitted.
   */
  private payloadDigest(rawBody: string): string {
    return crypto.createHash("sha256").update(rawBody).digest("hex");
  }

  /**
   * Irreversible recipient key.
   *
   * Keyed on the **normalized E.164 destination only**, never on user.id. One phone can be
   * attached to more than one auth user, and bucketing by user id would let the same
   * handset be messaged once per identity — which is precisely the abuse the limit exists
   * to stop. The destination is what receives the message, so the destination is the
   * subject.
   *
   * HMAC rather than a bare hash, so a stolen tracker cannot be brute-forced against the
   * small Iraqi mobile space. The derived key is domain-separated from the signature use of
   * the same secret, and neither the key nor the phone is ever logged.
   */
  private recipientKey(normalizedE164Phone: string): string {
    const derivedKey = crypto
      .createHmac("sha256", this.getHookSecret())
      .update(RECIPIENT_LIMIT_KEY_LABEL)
      .digest();
    return crypto.createHmac("sha256", derivedKey).update(`recipient:${normalizedE164Phone}`).digest("hex");
  }

  /** Drops expired SUCCEEDED entries. IN_FLIGHT is never touched here. */
  private pruneExpired(now: number): void {
    for (const [id, entry] of this.deliveries) {
      if (entry.state === "SUCCEEDED" && now - entry.completedAt > IDEMPOTENCY_TTL_MS) {
        this.deliveries.delete(id);
      }
    }
  }

  /**
   * Makes room for one new entry.
   *
   * Evicting an IN_FLIGHT entry would lose the promise a concurrent duplicate is waiting
   * on and allow a second dispatch of the same webhook, so only SUCCEEDED entries are ever
   * removed. If every slot is genuinely in flight the request is refused with a retryable
   * 503 instead — dropping work silently is worse than asking Supabase to try again.
   */
  private reserveCapacity(now: number): void {
    this.pruneExpired(now);
    if (this.deliveries.size < this.deliveryMaxEntries) return;

    // Map preserves insertion order, so the first SUCCEEDED found is the oldest.
    for (const [id, entry] of this.deliveries) {
      if (entry.state === "SUCCEEDED") {
        this.deliveries.delete(id);
        if (this.deliveries.size < this.deliveryMaxEntries) return;
      }
    }

    this.logger.error(
      `[AUTH_HOOK] Delivery cache is full with in-flight entries (${this.deliveries.size}) — refusing new webhook`,
    );
    throw new ServiceUnavailableException({
      code: "SUPABASE_AUTH_HOOK_CAPACITY_EXCEEDED",
      message: "تعذر إرسال رمز التحقق حالياً. حاول مرة أخرى",
    });
  }

  /** Drops timestamps older than an hour and removes recipients left with none. */
  private pruneRecipientSends(now: number): void {
    for (const [key, times] of this.recipientSends) {
      const recent = times.filter((t) => now - t < HOUR_MS);
      if (recent.length === 0) this.recipientSends.delete(key);
      else if (recent.length !== times.length) this.recipientSends.set(key, recent);
    }
  }

  /**
   * Read-only quota decision. Deliberately does not mutate, so a request rejected later
   * for delivery capacity never leaves a phantom attempt behind.
   */
  private checkRecipientQuota(recipientKey: string, now: number): void {
    const previous = (this.recipientSends.get(recipientKey) ?? []).filter((t) => now - t < HOUR_MS);
    const lastMinute = previous.filter((t) => now - t < MINUTE_MS).length;

    if (lastMinute >= RECIPIENT_LIMIT_PER_MINUTE || previous.length >= RECIPIENT_LIMIT_PER_HOUR) {
      // The key itself is never logged — it would be a stable pseudonym for one person.
      this.logger.warn("[AUTH_HOOK] Recipient send limit reached — refusing dispatch");
      throw new HttpException(
        {
          code: "SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED",
          message: "تم إرسال عدد كبير من الرموز. حاول بعد قليل",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Ensures the tracker can hold this recipient before anything is recorded.
   *
   * An existing recipient always fits — its bucket is already there. A genuinely new one is
   * refused with a retryable 503 when every slot belongs to an active recipient, because
   * silently evicting somebody else's bucket would hand an attacker a way to clear their
   * own limit by flooding the map with fresh numbers.
   */
  private reserveRecipientCapacity(recipientKey: string, now: number): void {
    if (this.recipientSends.has(recipientKey)) return;

    this.pruneRecipientSends(now);
    if (this.recipientSends.size < this.recipientTrackerMax) return;

    this.logger.error(
      `[AUTH_HOOK] Recipient tracker is full with active entries (${this.recipientSends.size}) — refusing new recipient`,
    );
    throw new ServiceUnavailableException({
      code: "SUPABASE_AUTH_HOOK_RECIPIENT_CAPACITY_EXCEEDED",
      message: "تعذر إرسال رمز التحقق حالياً. حاول مرة أخرى",
    });
  }

  /**
   * Records one attempt. Called only once every reservation has succeeded and a dispatch is
   * certain to be attempted.
   *
   * A provider failure still counts. The attempt consumed a real outbound call, and not
   * counting it would let a caller hammer one recipient for free whenever Meta happens to
   * be failing.
   */
  private recordRecipientAttempt(recipientKey: string, now: number): void {
    const previous = (this.recipientSends.get(recipientKey) ?? []).filter((t) => now - t < HOUR_MS);
    previous.push(now);
    this.recipientSends.set(recipientKey, previous);
  }

  private verifySignature(rawBody: string | undefined, headers: SupabaseSmsHookHeaders): string {
    const id = headers["webhook-id"];
    const timestamp = headers["webhook-timestamp"];
    const signature = headers["webhook-signature"];

    if (!id || !timestamp || !signature) {
      this.logger.warn("[AUTH_HOOK] Rejected — missing Standard Webhooks headers");
      throw new UnauthorizedException({
        code: "SUPABASE_AUTH_HOOK_SIGNATURE_MISSING",
        message: "طلب غير صالح",
      });
    }

    if (typeof rawBody !== "string" || rawBody.length === 0) {
      // Never fall back to JSON.stringify(body): the signature covers the original bytes.
      this.logger.error("[AUTH_HOOK] Rejected — raw request body was not captured");
      throw new UnauthorizedException({
        code: "SUPABASE_AUTH_HOOK_RAW_BODY_MISSING",
        message: "طلب غير صالح",
      });
    }

    const webhook = new Webhook(this.getHookSecret());
    try {
      webhook.verify(rawBody, {
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
      });
    } catch {
      // The library's message can echo signature material; it stays out of the log.
      this.logger.warn("[AUTH_HOOK] Rejected — signature verification failed");
      throw new UnauthorizedException({
        code: "SUPABASE_AUTH_HOOK_SIGNATURE_INVALID",
        message: "طلب غير صالح",
      });
    }

    return id;
  }

  private parsePayload(payload: SupabaseSmsHookPayload): {
    phone: string;
    otp: string;
    userId: string | null;
  } {
    const phone = payload?.user?.phone?.trim();
    const otp = payload?.sms?.otp?.trim();

    if (!phone) {
      this.logger.warn("[AUTH_HOOK] Rejected — payload has no user.phone");
      throw new BadRequestException({
        code: "SUPABASE_AUTH_HOOK_PHONE_MISSING",
        message: "طلب غير صالح",
      });
    }
    if (!otp) {
      this.logger.warn("[AUTH_HOOK] Rejected — payload has no sms.otp");
      throw new BadRequestException({
        code: "SUPABASE_AUTH_HOOK_OTP_MISSING",
        message: "طلب غير صالح",
      });
    }
    return { phone, otp, userId: payload?.user?.id?.trim() || null };
  }

  /**
   * The actual Meta call. Returns the provider result instead of throwing, because the
   * durable ledger has to distinguish "Meta refused" from "we never found out".
   */
  private async attemptSend(
    destination: string,
    otp: string,
    correlationId: string,
  ): Promise<WhatsAppOtpSendResult> {
    const masked = maskPhoneForLogs(destination);
    const timeoutMs = this.resolveHookTimeoutMs();

    this.logger.log(
      `[AUTH_HOOK] Dispatching correlationId=${correlationId} phone=${masked} timeoutMs=${timeoutMs}`,
    );

    const result = await this.whatsAppOtp.sendOtp(destination, otp, { timeoutMs });

    if (!result.success) {
      this.logger.error(
        `[AUTH_HOOK] WhatsApp submission failed correlationId=${correlationId} phone=${masked} ` +
          `errorCode=${result.errorCode ?? "unknown"} class=${result.failureClass ?? "n/a"}`,
      );
    } else {
      this.logger.log(
        `[AUTH_HOOK] WhatsApp accepted correlationId=${correlationId} phone=${masked} ` +
          `providerAcceptedMessageId=${result.providerAcceptedMessageId ?? "n/a"}`,
      );
    }

    return result;
  }

  private deliveryFailure(result: WhatsAppOtpSendResult): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: result.errorCode || "OTP_DELIVERY_FAILED",
      message: "تعذر إرسال رمز التحقق عبر واتساب",
    });
  }

  /**
   * Whether we know Meta did not accept the message.
   *
   * A timeout or a network fault tells us nothing — the request may well have arrived — so
   * those are ambiguous and must never be retried under the same webhook-id. Everything
   * else is Meta answering with an error, which means it did not accept.
   */
  private isExplicitRefusal(result: WhatsAppOtpSendResult): boolean {
    return result.failureClass !== undefined && result.failureClass !== "PROVIDER_TIMEOUT";
  }

  /** The actual Meta dispatch for the in-memory path, which signals failure by throwing. */
  private async dispatch(destination: string, otp: string, correlationId: string): Promise<void> {
    const result = await this.attemptSend(destination, otp, correlationId);
    if (!result.success) throw this.deliveryFailure(result);
  }

  /**
   * Verifies, then delivers exactly once per webhook-id.
   *
   * Returns nothing on success — the controller answers 200 with an empty body, so no
   * response can ever carry the code back out.
   *
   * A provider failure throws. Supabase must see the auth request fail rather than believe
   * a message went out that never did, and the failed id is forgotten so the retry works.
   */
  async handleSendSms(input: {
    rawBody: string | undefined;
    headers: SupabaseSmsHookHeaders;
    payload: SupabaseSmsHookPayload;
  }): Promise<void> {
    const correlationId = crypto.randomUUID();

    // Order matters: nothing enters the cache or the rate limiter until the request is
    // proven authentic and well-formed, so a forged or malformed request can never block a
    // genuine retry or consume somebody's quota.
    const webhookId = this.verifySignature(input.rawBody, input.headers);
    // userId is parsed for payload completeness only. It never selects a rate-limit
    // bucket, is never stored, and is never logged.
    const { phone, otp } = this.parsePayload(input.payload);

    let destination: string;
    try {
      destination = toWhatsAppE164(phone);
    } catch {
      this.logger.error(
        `[AUTH_HOOK] Invalid phone for WhatsApp delivery correlationId=${correlationId} phone=${maskPhoneForLogs(phone)}`,
      );
      throw new BadRequestException({
        code: "SUPABASE_AUTH_HOOK_PHONE_INVALID",
        message: "طلب غير صالح",
      });
    }

    const digest = this.payloadDigest(input.rawBody as string);
    const now = Date.now();

    // Rate limiting stays in memory on purpose. It is a courtesy limit in front of
    // Supabase's own issuance limits, and paying a database round trip per OTP to make it
    // survive a restart would buy very little. Idempotency is the part where losing state
    // costs a real message, so that is the part that became durable.
    const recipientKey = this.recipientKey(destination);

    if (this.durable.isRequired()) {
      this.checkRecipientQuota(recipientKey, now);
      this.reserveRecipientCapacity(recipientKey, now);
      await this.handleDurable({ webhookId, digest, destination, otp, correlationId, recipientKey, now });
      return;
    }

    this.pruneExpired(now);

    const existing = this.deliveries.get(webhookId);

    if (existing) {
      if (existing.digest !== digest) {
        // A correctly signed request cannot normally reuse an id with different content,
        // so this is either a broken sender or an attempt to ride an id that already
        // counted as delivered. Refuse, and send nothing.
        this.logger.error(
          `[AUTH_HOOK] webhook-id reused with a different payload correlationId=${correlationId}`,
        );
        throw new ConflictException({
          code: "SUPABASE_AUTH_HOOK_ID_REUSED_WITH_DIFFERENT_PAYLOAD",
          message: "طلب غير صالح",
        });
      }

      if (existing.state === "SUCCEEDED") {
        // A legitimate Supabase retry of something already delivered. Acknowledge it; do
        // not send again, do not answer 401, and do not consume recipient quota.
        this.logger.log(`[AUTH_HOOK] idempotent replay acknowledged correlationId=${correlationId}`);
        return;
      }

      // Two copies of the same webhook arrived while the first was still dispatching.
      // Await the original rather than starting a second send; both callers then share its
      // outcome, and if it failed the entry is already gone so a fresh retry is allowed.
      // This path never inserts, so it keeps working even at full capacity.
      this.logger.log(`[AUTH_HOOK] awaiting in-flight delivery correlationId=${correlationId}`);
      await existing.promise;
      return;
    }

    // A genuinely new webhook. Ordering is deliberate: every non-mutating check runs
    // first, then every reservation, and only then is anything recorded. A rejection at any
    // step therefore leaves no phantom quota consumed and evicts no completed delivery.
    //
    //   5. quota decision, read only
    //   6. recipient tracker capacity
    //   7. delivery idempotency capacity
    //   8. record the attempt
    //   9. insert IN_FLIGHT
    //  10. dispatch
    this.checkRecipientQuota(recipientKey, now);
    this.reserveRecipientCapacity(recipientKey, now);
    this.reserveCapacity(now);
    this.recordRecipientAttempt(recipientKey, now);

    const promise = this.dispatch(destination, otp, correlationId);
    this.deliveries.set(webhookId, { state: "IN_FLIGHT", startedAt: now, digest, promise });

    try {
      await promise;
      this.deliveries.set(webhookId, { state: "SUCCEEDED", completedAt: Date.now(), digest });
    } catch (error) {
      // Forget the failure completely. A timeout, a Meta error or a network fault must all
      // leave the id retryable rather than locked out for the TTL.
      this.deliveries.delete(webhookId);
      throw error;
    }
  }

  /**
   * Delivery through the durable ledger.
   *
   * Every decision about whether to send comes from one atomic claim, so two instances
   * racing the same webhook-id cannot both dispatch. Nothing in this method writes an OTP,
   * a phone number or a body — the ledger only ever sees an id, a digest and a state.
   */
  private async handleDurable(ctx: {
    webhookId: string;
    digest: string;
    destination: string;
    otp: string;
    correlationId: string;
    recipientKey: string;
    now: number;
  }): Promise<void> {
    const { webhookId, digest, destination, otp, correlationId, recipientKey, now } = ctx;

    const claim = await this.durable.claim(webhookId, digest);

    switch (claim.status) {
      case "SUCCEEDED":
        // A legitimate Supabase retry of something already delivered, possibly by a
        // different instance or a previous deploy. Acknowledge; send nothing.
        this.logger.log(`[AUTH_HOOK] idempotent replay acknowledged correlationId=${correlationId}`);
        return;

      case "CONFLICT":
        this.logger.error(
          `[AUTH_HOOK] webhook-id reused with a different payload correlationId=${correlationId}`,
        );
        throw new ConflictException({
          code: "SUPABASE_AUTH_HOOK_ID_REUSED_WITH_DIFFERENT_PAYLOAD",
          message: "طلب غير صالح",
        });

      case "IN_FLIGHT":
        return this.awaitOtherInstance(webhookId, correlationId);

      case "UNCERTAIN":
        // A previous attempt may have put a message on the wire. Re-sending would be a
        // second real WhatsApp to a real handset, so this id is retired for good. The user
        // can ask for another code, which arrives under a fresh webhook-id.
        this.logger.warn(
          `[AUTH_HOOK] delivery outcome unknown, refusing to resend correlationId=${correlationId}`,
        );
        throw new ServiceUnavailableException({
          code: "SUPABASE_AUTH_HOOK_DELIVERY_UNCERTAIN",
          message: "تعذر تأكيد إرسال رمز التحقق. اطلب رمزاً جديداً",
        });

      case "EXHAUSTED":
        this.logger.error(
          `[AUTH_HOOK] retry ceiling reached for webhook correlationId=${correlationId}`,
        );
        throw new ServiceUnavailableException({
          code: "SUPABASE_AUTH_HOOK_RETRY_EXHAUSTED",
          message: "تعذر إرسال رمز التحقق حالياً. حاول مرة أخرى",
        });

      case "CLAIMED":
        break;
    }

    // The claim succeeded, so a dispatch is now certain to be attempted and the attempt is
    // recorded. A provider failure still counts — see recordRecipientAttempt.
    this.recordRecipientAttempt(recipientKey, now);

    let result: WhatsAppOtpSendResult;
    try {
      result = await this.attemptSend(destination, otp, correlationId);
    } catch (error) {
      // The provider threw rather than returning a result, so we never learned whether Meta
      // accepted anything. Ambiguity is always UNCERTAIN.
      await this.durable.markUncertain(webhookId, "OTP_DISPATCH_THREW");
      throw error;
    }

    if (result.success) {
      await this.durable.complete(webhookId, result.providerAcceptedMessageId ?? null);
      return;
    }

    if (this.isExplicitRefusal(result)) {
      // Meta answered with an error, so nothing was delivered and a bounded retry under the
      // same id is safe.
      await this.durable.fail(webhookId, result.errorCode ?? null);
    } else {
      await this.durable.markUncertain(webhookId, result.errorCode ?? null);
    }

    throw this.deliveryFailure(result);
  }

  /**
   * Another instance holds a live lease on this webhook-id.
   *
   * Polls briefly — well inside Supabase's hook budget — in case that instance finishes and
   * we can honestly answer 200. If it has not finished, the answer is a retryable 503
   * rather than a fabricated success: only the lease holder knows whether the message went
   * out, and claiming otherwise would tell the user to wait for a code that may never come.
   */
  private async awaitOtherInstance(webhookId: string, correlationId: string): Promise<void> {
    const deadline = Date.now() + CROSS_INSTANCE_WAIT_MS;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, CROSS_INSTANCE_POLL_MS));

      const state = await this.durable.peekStatus(webhookId);
      if (state === "SUCCEEDED") {
        this.logger.log(
          `[AUTH_HOOK] concurrent delivery completed elsewhere correlationId=${correlationId}`,
        );
        return;
      }
      if (state && state !== "IN_FLIGHT") break;
    }

    this.logger.warn(
      `[AUTH_HOOK] another instance is still dispatching this webhook correlationId=${correlationId}`,
    );
    throw new ServiceUnavailableException({
      code: "SUPABASE_AUTH_HOOK_DELIVERY_IN_PROGRESS",
      message: "تعذر إرسال رمز التحقق حالياً. حاول مرة أخرى",
    });
  }
}
