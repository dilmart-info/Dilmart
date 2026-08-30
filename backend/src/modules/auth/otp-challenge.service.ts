import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { normalizeIraqiPhone } from "../../common/validators/iraqi-phone.validator";
import { OtpDeliveryService } from "./otp-delivery.service";
import {
  issueChallengeHandle,
  issueDecoyHandle,
  resolveOtpRequestHandle,
} from "./otp-request-handle.util";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OtpPurpose = "claim_account" | "password_reset" | "verify_phone";

export interface CreateChallengeInput {
  phone: string;
  purpose: OtpPurpose;
  subjectUserId?: string | null;
  createdIpHash?: string | null;
  userAgentHash?: string | null;
}

export interface VerifyOtpInput {
  challengeId: string;
  otp: string;
  phone?: string;
}

@Injectable()
export class OtpChallengeService {
  private readonly logger = new Logger(OtpChallengeService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly otpDelivery: OtpDeliveryService
  ) {}

  private isProductionRuntime(): boolean {
    return (process.env.NODE_ENV || "").toLowerCase() === "production";
  }

  private getHmacSecret(): string {
    const secret = process.env.OTP_HMAC_SECRET?.trim();
    if (secret) return secret;
    if (this.isProductionRuntime()) {
      throw new ServiceUnavailableException({
        code: "OTP_HMAC_SECRET_MISSING",
        message: "إعدادات أمان رمز التحقق غير مكتملة",
      });
    }
    return "default_local_dev_otp_hmac_secret_key_32_bytes";
  }

  private getActionTokenSecret(): string {
    const secret = process.env.OTP_TOKEN_SECRET?.trim();
    if (secret) return secret;
    if (this.isProductionRuntime()) {
      throw new ServiceUnavailableException({
        code: "OTP_TOKEN_SECRET_MISSING",
        message: "إعدادات أمان رمز التحقق غير مكتملة",
      });
    }
    return "default_local_dev_token_secret_key_32";
  }

  /**
   * Keys the AES-256-GCM envelope around request handles. Separate from the OTP digest
   * key and the action-token key: three purposes, three keys, so compromising one does
   * not compromise the others.
   */
  private getRequestHandleSecret(): string {
    const secret = process.env.OTP_REQUEST_HANDLE_SECRET?.trim();
    if (secret) return secret;
    if (this.isProductionRuntime()) {
      throw new ServiceUnavailableException({
        code: "OTP_REQUEST_HANDLE_SECRET_MISSING",
        message: "إعدادات أمان رمز التحقق غير مكتملة",
      });
    }
    return "default_local_dev_request_handle_secret_32";
  }

  private assertDistinctOtpSecrets(): void {
    if (!this.isProductionRuntime()) return;
    const hmac = process.env.OTP_HMAC_SECRET?.trim();
    const token = process.env.OTP_TOKEN_SECRET?.trim();
    const handle = process.env.OTP_REQUEST_HANDLE_SECRET?.trim();

    if (!hmac || !token) {
      throw new ServiceUnavailableException({
        code: "OTP_SECRETS_MISSING",
        message: "إعدادات أمان رمز التحقق غير مكتملة",
      });
    }
    if (!handle) {
      throw new ServiceUnavailableException({
        code: "OTP_REQUEST_HANDLE_SECRET_MISSING",
        message: "إعدادات أمان رمز التحقق غير مكتملة",
      });
    }
    // All three must differ pairwise. Reusing one value across purposes would let a leak
    // of the OTP digest key also forge request handles, or vice versa.
    if (hmac === token || hmac === handle || token === handle) {
      throw new ServiceUnavailableException({
        code: "OTP_SECRETS_MUST_DIFFER",
        message: "إعدادات أمان رمز التحقق غير مكتملة",
      });
    }
  }

  /**
   * Channel readiness, independent of any account. Anti-enumeration endpoints call this
   * before looking anything up so a switched-off or misconfigured channel surfaces as a
   * real error instead of hiding behind the generic success message.
   */
  assertDeliveryReady(): void {
    this.assertDistinctOtpSecrets();
    this.otpDelivery.assertProviderReady();
  }

  /** Opaque handle for a real challenge, safe to hand to an unauthenticated caller. */
  issueRequestHandle(challengeId: string): string {
    return issueChallengeHandle(this.getRequestHandleSecret(), challengeId);
  }

  /** Opaque handle that resolves to nothing, used when no account matched. */
  issueDecoyRequestHandle(): string {
    return issueDecoyHandle(this.getRequestHandleSecret());
  }

  /**
   * Accepts either a raw challenge id (authenticated claim flow, which may return one
   * directly) or an opaque request handle. Decoys and tampered handles resolve to null so
   * the caller sees the same failure as a wrong code.
   */
  resolveChallengeReference(reference: string): string | null {
    const resolved = resolveOtpRequestHandle(this.getRequestHandleSecret(), reference);
    if (resolved) {
      return resolved.kind === "challenge" ? resolved.challengeId : null;
    }
    // Not a handle — treat as a raw challenge id for the authenticated claim flow.
    return UUID_PATTERN.test(reference) ? reference : null;
  }

  private computeOtpDigest(challengeId: string, otp: string, phone: string): string {
    const secret = this.getHmacSecret();
    return crypto
      .createHmac("sha256", secret)
      .update(`${challengeId}:${otp.trim()}:${phone}`)
      .digest("hex");
  }

  private computeActionTokenDigest(token: string): string {
    const secret = this.getActionTokenSecret();
    return crypto.createHmac("sha256", secret).update(token).digest("hex");
  }

  async createChallenge(input: CreateChallengeInput) {
    this.assertDistinctOtpSecrets();
    const phone = normalizeIraqiPhone(input.phone);
    const ttlSeconds = parseInt(process.env.OTP_TTL_SECONDS || "300", 10);
    const resendSeconds = parseInt(process.env.OTP_RESEND_SECONDS || "60", 10);
    const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);

    // Check for recent active challenge to enforce resend cooldown
    const { data: activeChallenges } = await this.supabaseAdmin.client
      .from("auth_otp_challenges")
      .select("id, last_sent_at, send_count")
      .eq("phone_normalized", phone)
      .eq("purpose", input.purpose)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("last_sent_at", { ascending: false })
      .limit(1);

    if (activeChallenges && activeChallenges.length > 0) {
      const last = activeChallenges[0];
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(last.last_sent_at).getTime()) / 1000
      );
      if (elapsedSeconds < resendSeconds) {
        throw new BadRequestException({
          code: "OTP_RESEND_COOLDOWN",
          message: `يرجى الانتظار ${resendSeconds - elapsedSeconds} ثانية قبل إعادة طلب الرمز`,
          resend_after: resendSeconds - elapsedSeconds,
        });
      }

      // Expire previous active challenges for this phone/purpose
      await this.supabaseAdmin.client
        .from("auth_otp_challenges")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("phone_normalized", phone)
        .eq("purpose", input.purpose)
        .eq("status", "active");
    }

    const challengeId = crypto.randomUUID();
    // Cryptographically secure 6-digit numeric OTP generation
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const digest = this.computeOtpDigest(challengeId, rawCode, phone);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const { error } = await this.supabaseAdmin.client
      .from("auth_otp_challenges")
      .insert({
        id: challengeId,
        purpose: input.purpose,
        subject_user_id: input.subjectUserId || null,
        phone_normalized: phone,
        otp_digest: digest,
        status: "active",
        expires_at: expiresAt.toISOString(),
        attempt_count: 0,
        max_attempts: maxAttempts,
        send_count: 1,
        last_sent_at: now.toISOString(),
        created_ip_hash: input.createdIpHash || null,
        user_agent_hash: input.userAgentHash || null,
      });

    if (error) {
      this.logger.error(`Failed to create OTP challenge: ${error.message}`);
      throw new BadRequestException("فشل إنشاء طلب توثيق الرمز");
    }

    // Send OTP via provider. On failure, expire/delete the challenge so it is not
    // left looking like an active/sent challenge (delivery-failure bug fix).
    try {
      await this.otpDelivery.sendOtp({
        phone,
        code: rawCode,
        purpose: input.purpose,
        correlationId: challengeId,
      });
    } catch (deliveryError) {
      await this.cleanupFailedChallenge(challengeId);
      throw deliveryError;
    }

    return {
      challenge_id: challengeId,
      expires_at: expiresAt.toISOString(),
      resend_after: resendSeconds,
    };
  }

  /**
   * Best-effort cleanup when OTP was never successfully submitted to the provider.
   * Prefer expire; if that fails, delete so resend cooldown is not blocked.
   */
  private async cleanupFailedChallenge(challengeId: string): Promise<void> {
    const { error: cleanupError } = await this.supabaseAdmin.client
      .from("auth_otp_challenges")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", challengeId);

    if (!cleanupError) return;

    this.logger.error(
      `[OTP][CRITICAL] Failed to expire undelivered challenge id=${challengeId}: ${cleanupError.message}`,
    );

    const { error: deleteError } = await this.supabaseAdmin.client
      .from("auth_otp_challenges")
      .delete()
      .eq("id", challengeId);

    if (deleteError) {
      this.logger.error(
        `[OTP][CRITICAL] Failed to delete undelivered challenge id=${challengeId}: ${deleteError.message}`,
      );
    }
  }

  async verifyOtp(input: VerifyOtpInput) {
    const { data: challenge, error } = await this.supabaseAdmin.client
      .from("auth_otp_challenges")
      .select("*")
      .eq("id", input.challengeId)
      .maybeSingle();

    if (error || !challenge) {
      throw new NotFoundException("طلب التوثيق غير موجود أو منتهي الصلاحية");
    }

    if (challenge.status !== "active") {
      throw new BadRequestException(`رمز التوثيق غير نشط (${challenge.status})`);
    }

    if (new Date(challenge.expires_at) < new Date()) {
      await this.supabaseAdmin.client
        .from("auth_otp_challenges")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", challenge.id);
      throw new BadRequestException("انتهت فترة صلاحية رمز التوثيق");
    }

    if (challenge.attempt_count >= challenge.max_attempts) {
      await this.supabaseAdmin.client
        .from("auth_otp_challenges")
        .update({ status: "blocked", updated_at: new Date().toISOString() })
        .eq("id", challenge.id);
      throw new ForbiddenException("تجاوزت الحد الأقصى للمحاولات المسموح بها");
    }

    const candidateDigest = this.computeOtpDigest(
      challenge.id,
      input.otp,
      challenge.phone_normalized
    );

    const isMatch = crypto.timingSafeEqual(
      Buffer.from(candidateDigest),
      Buffer.from(challenge.otp_digest)
    );

    const newAttempts = challenge.attempt_count + 1;

    if (!isMatch) {
      const isBlocked = newAttempts >= challenge.max_attempts;
      await this.supabaseAdmin.client
        .from("auth_otp_challenges")
        .update({
          attempt_count: newAttempts,
          status: isBlocked ? "blocked" : "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", challenge.id);

      throw new BadRequestException(
        isBlocked
          ? "تجاوزت الحد الأقصى للمحاولات المسموح بها"
          : `رمز التوثيق غير صحيح. المحاولات المتبقية: ${challenge.max_attempts - newAttempts}`
      );
    }

    // OTP Verified successfully! Mark challenge verified and issue action token
    const rawActionToken = crypto.randomBytes(32).toString("hex");
    const actionTokenDigest = this.computeActionTokenDigest(rawActionToken);
    const tokenTtlSeconds = 600; // 10 minutes
    const tokenExpiresAt = new Date(Date.now() + tokenTtlSeconds * 1000);

    // Resolve user ID for token
    const userId = challenge.subject_user_id;

    if (userId) {
      await this.supabaseAdmin.client.from("auth_action_tokens").insert({
        purpose: challenge.purpose,
        user_id: userId,
        phone_normalized: challenge.phone_normalized,
        challenge_id: challenge.id,
        token_digest: actionTokenDigest,
        expires_at: tokenExpiresAt.toISOString(),
      });
    }

    await this.supabaseAdmin.client
      .from("auth_otp_challenges")
      .update({
        status: "verified",
        attempt_count: newAttempts,
        consumed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", challenge.id);

    return {
      success: true,
      action_token: rawActionToken,
      expires_in: tokenTtlSeconds,
      phone_normalized: challenge.phone_normalized,
      subject_user_id: challenge.subject_user_id,
      purpose: challenge.purpose,
    };
  }

  async reserveActionToken(rawToken: string, expectedPurpose: string) {
    const digest = this.computeActionTokenDigest(rawToken);

    const { data: rows, error } = await this.supabaseAdmin.client.rpc("reserve_auth_action_token" as any, {
      p_token_digest: digest,
      p_expected_purpose: expectedPurpose,
    });

    const tokenRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    if (error || !tokenRow) {
      const { data: existing } = await this.supabaseAdmin.client
        .from("auth_action_tokens")
        .select("consumed_at, expires_at, purpose, status")
        .eq("token_digest", digest)
        .maybeSingle();

      if (!existing) {
        throw new UnauthorizedException("رمز الإجراء غير صحيح أو غير موجود");
      }
      if (existing.consumed_at || existing.status === "consumed" || existing.status === "reserved") {
        throw new ConflictException("تم استخدام أو حجز رمز الإجراء هذا سابقاً");
      }
      if (new Date(existing.expires_at) < new Date()) {
        throw new BadRequestException("انتهت صلاحية رمز الإجراء");
      }
      if (existing.purpose !== expectedPurpose) {
        throw new ForbiddenException("رمز الإجراء غير مخصص لهذا العمل");
      }
      throw new BadRequestException("فشل حجز رمز الإجراء");
    }

    return {
      tokenId: tokenRow.id,
      reservationId: tokenRow.reservation_id,
      userId: tokenRow.user_id,
      verifiedPhone: tokenRow.phone_normalized,
      challengeId: tokenRow.challenge_id,
      purpose: tokenRow.purpose,
    };
  }

  async releaseActionTokenReservation(tokenId: string, reservationId: string) {
    const { error } = await this.supabaseAdmin.client.rpc("release_auth_action_token_reservation" as any, {
      p_token_id: tokenId,
      p_reservation_id: reservationId,
    });
    if (error) {
      this.logger.error(`Failed to release ActionToken reservation: ${error.message}`);
      throw new BadRequestException("فشل إرجاع حجز رمز العمل الموثق");
    }
  }

  async consumeActionToken(tokenId: string, reservationId: string) {
    const { error } = await this.supabaseAdmin.client.rpc("consume_auth_action_token" as any, {
      p_token_id: tokenId,
      p_reservation_id: reservationId,
    });
    if (error) {
      this.logger.error(`Failed to consume ActionToken: ${error.message}`);
      throw new BadRequestException("فشل استهلاك رمز العمل الموثق");
    }
  }

  async beginPasswordResetFinalization(tokenId: string, reservationId: string, requestFingerprint: string) {
    const { data: success, error } = await this.supabaseAdmin.client.rpc("begin_password_reset_finalization" as any, {
      p_token_id: tokenId,
      p_reservation_id: reservationId,
      p_request_fingerprint: requestFingerprint,
    });
    if (error || !success) {
      this.logger.error(`Failed to begin password reset finalization: ${error?.message || "unknown"}`);
      throw new BadRequestException("فشل بدء المعالجة النهائية لرمز العمل");
    }
  }

  /**
   * Returns a password-reset token from `finalizing` back to `active` after Supabase Auth
   * DETERMINISTICALLY rejected the submitted password, which proves the password was not changed.
   *
   * Only ever call this for a proven `weak_password` classification. An ambiguous failure — timeout,
   * transport error, 5xx, unknown SDK error — must leave the token finalizing so the existing
   * same-fingerprint reconciliation can decide, because there the password may in fact have changed.
   *
   * The RPC re-validates the exact token, reservation and request fingerprint, so a stale abort from
   * an earlier attempt cannot cancel a newer one, and it is idempotent if this response is lost.
   */
  async abortPasswordResetFinalization(tokenId: string, reservationId: string, requestFingerprint: string) {
    const { data: success, error } = await this.supabaseAdmin.client.rpc("abort_password_reset_finalization" as any, {
      p_token_id: tokenId,
      p_reservation_id: reservationId,
      p_request_fingerprint: requestFingerprint,
    });
    if (error || !success) {
      this.logger.error(`Failed to abort password reset finalization: ${error?.message || "unknown"}`);
      throw new BadRequestException("فشل إلغاء المعالجة النهائية لرمز العمل");
    }
  }

  async validateAndConsumeActionToken(rawToken: string, expectedPurpose: string) {
    const tokenInfo = await this.reserveActionToken(rawToken, expectedPurpose);
    await this.consumeActionToken(tokenInfo.tokenId, tokenInfo.reservationId);
    return tokenInfo;
  }
}
