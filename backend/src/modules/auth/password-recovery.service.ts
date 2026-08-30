import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import * as crypto from "crypto";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { startConstantTimeBudget } from "./otp-constant-time.util";
import { normalizeIraqiPhone } from "../../common/validators/iraqi-phone.validator";
import { OtpChallengeService } from "./otp-challenge.service";

export interface PasswordResetCompleteInput {
  actionToken: string;
  newPassword?: string;
}

/** Stable machine-readable code emitted by @supabase/auth-js when a password is rejected. The
 *  sole accepted proof of a deterministic rejection — name, message and status are never used. */
const WEAK_PASSWORD_CODE = "weak_password";
/** Structured code returned to API clients so the UI can localise without parsing messages. */
const WEAK_PASSWORD_ERROR_CODE = "WEAK_PASSWORD";
const WEAK_PASSWORD_MESSAGE_AR =
  "كلمة المرور هذه غير آمنة أو ظهرت في تسريبات معروفة. اختر كلمة مرور مختلفة.";

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly otpChallenge: OtpChallengeService
  ) {}

  async requestPasswordReset(phone: string) {
    // TEMPORARY TIMING MITIGATION — see otp-constant-time.util.ts. Started before any
    // work so both the "account exists" and "account missing" branches settle into the
    // same distribution.
    const budget = startConstantTimeBudget();

    // Runs before the account lookup on purpose: the result depends only on server
    // configuration, so failing here cannot reveal whether the phone is registered.
    this.otpChallenge.assertDeliveryReady();

    const normalizedPhone = normalizeIraqiPhone(phone);

    // Look up user by phone identity or profile phone
    const { data: identity } = await this.supabaseAdmin.client
      .from("customer_phone_identities")
      .select("user_id")
      .eq("phone_normalized", normalizedPhone)
      .maybeSingle();

    let targetUserId = identity?.user_id || null;

    if (!targetUserId) {
      const { data: profile } = await this.supabaseAdmin.client
        .from("profiles")
        .select("id")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      targetUserId = profile?.id || null;
    }

    let requestId: string | null = null;

    if (targetUserId) {
      try {
        const challenge = await this.otpChallenge.createChallenge({
          phone: normalizedPhone,
          purpose: "password_reset",
          subjectUserId: targetUserId,
        });
        requestId = this.otpChallenge.issueRequestHandle(challenge.challenge_id);
      } catch (err: any) {
        // Per-send failures are account-dependent, so they stay silent here to preserve
        // anti-enumeration. Channel-level misconfiguration was already rejected by the
        // readiness check above, which fails identically for every caller.
        this.logger.error(
          `[PASSWORD_RESET] OTP delivery failed (swallowed): code=${err?.response?.code || err?.code || "unknown"}`,
        );
      }
    }

    // Always hand back a request id. A decoy is returned when no account matched or the
    // send failed, so the response shape is identical in every case and `verify` still
    // has something to submit.
    const response = {
      request_id: requestId ?? this.otpChallenge.issueDecoyRequestHandle(),
      message: "إذا كان رقم الهاتف مسجلاً، فقد تم إرسال رمز استعادة كلمة المرور",
    };
    await budget.settle();
    return response;
  }

  async verifyPasswordResetOtp(challengeId: string, otp: string) {
    return this.otpChallenge.verifyOtp({
      challengeId,
      otp,
    });
  }

  private getActionTokenSecret(): string {
    const secret = process.env.OTP_TOKEN_SECRET?.trim();
    if (secret) {
      return secret;
    }
    if ((process.env.NODE_ENV || "").toLowerCase() === "production") {
      throw new ServiceUnavailableException({
        code: "OTP_TOKEN_SECRET_MISSING",
        message: "إعدادات أمان رمز التحقق غير مكتملة",
      });
    }
    return "default_local_dev_token_secret_key_32";
  }

  private computeActionTokenDigest(token: string): string {
    return crypto.createHmac("sha256", this.getActionTokenSecret()).update(token).digest("hex");
  }

  /**
   * True only for a password Supabase Auth rejected BEFORE changing it.
   *
   * The ONLY accepted classification is the stable machine-readable `code = 'weak_password'`, which
   * `@supabase/auth-js` sets on the rejection (and on `AuthWeakPasswordError`, whose `reasons` array
   * carries `pwned` / `length` / `characters`).
   *
   * Deliberately NOT accepted: the error name, the message text, or the HTTP status. Aborting
   * returns a reset credential to `active`, so the proof threshold is strict — if the code is
   * absent, the outcome is treated as ambiguous and the saga fails closed, even when the name is
   * `AuthWeakPasswordError`. Every other error, including a timeout or transport failure, is
   * ambiguous for the same reason: the update may have succeeded.
   */
  private isWeakPasswordRejection(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    return (error as { code?: unknown }).code === WEAK_PASSWORD_CODE;
  }

  /**
   * Aborts the finalizing attempt so the user can immediately retry with a different password, then
   * reports the rejection. Only ever called from the request that just wrote `password_update_pending`
   * and received a deterministic rejection, so the password is proven unchanged; the RPC refuses any
   * other stage. If the abort itself fails the token simply stays finalizing — exactly the
   * current behaviour — so this can never make things worse than not calling it.
   */
  private async rejectWeakPassword(tokenId: string, reservationId: string, fingerprint: string): Promise<never> {
    try {
      await this.otpChallenge.abortPasswordResetFinalization(tokenId, reservationId, fingerprint);
    } catch (abortErr: unknown) {
      const abortMessage = abortErr instanceof Error ? abortErr.message : String(abortErr);
      this.logger.error(
        `Weak-password abort failed for token ${tokenId}: ${abortMessage}. ` +
        `Token remains finalizing; the user must request a new code.`
      );
    }
    throw new BadRequestException({
      code: WEAK_PASSWORD_ERROR_CODE,
      message: WEAK_PASSWORD_MESSAGE_AR,
    });
  }

  private computePasswordFingerprint(tokenId: string, password?: string): string {
    const secret = process.env.PASSWORD_RESET_FINGERPRINT_SECRET || "default_reset_secret_key_fingerprint_32_bytes";
    return crypto.createHmac("sha256", secret).update(`${tokenId}:${password || ""}`).digest("hex");
  }

  /**
   * Updates the operation-stage for a token. Throws BadRequestException if the
   * database write fails so the caller always knows the stage was not persisted.
   */
  private async markOperationStage(
    tokenId: string,
    stage: string,
    completed = false
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      stage,
      updated_at: new Date().toISOString(),
    };

    if (completed) {
      payload.completed_at = new Date().toISOString();
    }

    const { error } = await this.supabaseAdmin.client
      .from("auth_action_operations")
      .update(payload)
      .eq("token_id", tokenId);

    if (error) {
      throw new BadRequestException(
        `فشل تحديث مرحلة عملية استعادة كلمة المرور: ${error.message}`
      );
    }
  }

  async completePasswordReset(input: PasswordResetCompleteInput) {
    if (!input.newPassword || input.newPassword.length < 6) {
      throw new BadRequestException("كلمة المرور يجب أن لا تقل عن 6 خانات");
    }

    const digest = this.computeActionTokenDigest(input.actionToken);

    // Look up the token row first to check for finalizing/consumed status
    const { data: tokenRow, error: findError } = await this.supabaseAdmin.client
      .from("auth_action_tokens")
      .select("id, status, reservation_id, user_id, purpose, expires_at")
      .eq("token_digest", digest)
      .maybeSingle();

    if (findError || !tokenRow) {
      throw new BadRequestException("توكن غير صالح أو غير موجود");
    }

    if (tokenRow.purpose !== "password_reset") {
      throw new BadRequestException("توكن غير صالح لعملية إعادة تعيين كلمة المرور");
    }

    // NOTE: expires_at check is applied AFTER consumed/finalizing paths;
    // expired tokens may still be reconciled if finalizing, or
    // return idempotent success if consumed with matching fingerprint.

    const expectedFingerprint = this.computePasswordFingerprint(tokenRow.id, input.newPassword);

    // ── consumed path ─────────────────────────────────────────────────────────
    // Accepts token_consumed (atomic consume succeeded, completed write was lost)
    // and completed (fully durable) as valid terminal stages.
    if (tokenRow.status === "consumed") {
      const { data: op } = await this.supabaseAdmin.client
        .from("auth_action_operations")
        .select("stage, operation_type, request_fingerprint")
        .eq("token_id", tokenRow.id)
        .maybeSingle();

      // Must have a valid operation record with the correct type and a terminal stage.
      if (
        !op ||
        op.operation_type !== "password_reset" ||
        !["token_consumed", "completed"].includes(op.stage) ||
        !op.request_fingerprint
      ) {
        throw new BadRequestException(
          "تعذر التحقق من عملية إعادة تعيين كلمة المرور المكتملة"
        );
      }

      if (op.request_fingerprint !== expectedFingerprint) {
        throw new BadRequestException("تم استخدام هذا التوكن بالفعل بكلمة مرور مختلفة");
      }

      // If the operation is still at token_consumed (completed write was lost),
      // attempt to promote it to completed now. Failure is recoverable because
      // token_consumed is already durable and a retry will succeed here again.
      if (op.stage === "token_consumed") {
        try {
          await this.markOperationStage(tokenRow.id, "completed", true);
        } catch (promoteErr: any) {
          this.logger.warn(
            `Reconciliation: completed-stage promotion failed for token ${tokenRow.id}: ${promoteErr.message}. ` +
            `Token remains consumed at token_consumed; retry will resolve.`
          );
          // Returning success is safe: the password was already updated and the
          // token is consumed. A retry finds consumed+token_consumed+matching fp.
        }
      }

      return {
        success: true,
        message: "تم تحديث كلمة المرور بنجاح (مكتمل بالفعل)",
      };
    }

    // ── finalizing path ───────────────────────────────────────────────────────
    // Reconciliation path — allowed even after token expiry.
    if (tokenRow.status === "finalizing") {
      const { data: op, error: opError } = await this.supabaseAdmin.client
        .from("auth_action_operations")
        .select("stage, operation_type, request_fingerprint, reservation_id")
        .eq("token_id", tokenRow.id)
        .maybeSingle();

      if (opError || !op) {
        this.logger.error(`Reconciliation Incident: Token is finalizing but operation record is missing for token ID ${tokenRow.id}`);
        throw new BadRequestException("خلل في مصالحة المعاملة: سجل العملية مفقود");
      }

      // Validate reservation ownership: prevents consuming a finalizing token with a stale Saga record.
      if (
        op.operation_type !== "password_reset" ||
        !tokenRow.reservation_id ||
        op.reservation_id !== tokenRow.reservation_id
      ) {
        throw new BadRequestException(
          "خلل في ملكية حجز عملية إعادة تعيين كلمة المرور"
        );
      }

      if (op.request_fingerprint !== expectedFingerprint) {
        throw new BadRequestException("غير مسموح بتمرير كلمة مرور مختلفة أثناء المعالجة النهائية للتوكن");
      }

      if (op.stage === "password_update_pending" || op.stage === "failed_recoverable") {
        // Re-run the password update with the same password
        const { error: updateError } = await this.supabaseAdmin.client.auth.admin.updateUserById(tokenRow.user_id, {
          password: input.newPassword,
        });

        if (updateError) {
          // Deliberately NOT unwound, even for a weak_password rejection. Reaching this branch means
          // an earlier attempt already issued an auth update whose outcome is unknown, so the
          // password may have changed; returning the token to active would let one reset credential
          // drive a second password change. The token stays finalizing and the user must request a
          // new code — the pre-existing behaviour, unchanged by this task.
          this.logger.error(`Failed to update user password in finalizing retry: ${updateError.message}`);
          await this.markOperationStage(tokenRow.id, "failed_recoverable").catch((e: any) =>
            this.logger.error(`markOperationStage(failed_recoverable) failed: ${e.message}`)
          );
          throw new BadRequestException("فشل تغيير كلمة المرور في نظام الهوية");
        }

        // Advance to auth_updated before consume
        await this.markOperationStage(tokenRow.id, "auth_updated");

        // Atomically consume token + set stage to token_consumed
        await this.otpChallenge.consumeActionToken(tokenRow.id, op.reservation_id);

        // Promote to completed — failure here is recoverable (token already consumed)
        try {
          await this.markOperationStage(tokenRow.id, "completed", true);
        } catch (promoteErr: any) {
          this.logger.warn(
            `Post-consume completed-stage write failed for token ${tokenRow.id}: ${promoteErr.message}. ` +
            `Token is consumed at token_consumed; retry will resolve.`
          );
        }

        return {
          success: true,
          message: "تم تحديث كلمة المرور بنجاح (معالجة معادة)",
        };
      }

      if (op.stage === "auth_updated") {
        // Password was already updated — only consume the token
        await this.otpChallenge.consumeActionToken(tokenRow.id, op.reservation_id);

        // Promote to completed — failure is recoverable
        try {
          await this.markOperationStage(tokenRow.id, "completed", true);
        } catch (promoteErr: any) {
          this.logger.warn(
            `Post-consume completed-stage write failed for token ${tokenRow.id}: ${promoteErr.message}. ` +
            `Token is consumed at token_consumed; retry will resolve.`
          );
        }

        return {
          success: true,
          message: "تم تحديث كلمة المرور بنجاح (تسوية معادة)",
        };
      }

      throw new BadRequestException("حالة المعاملة غير معروفة");
    }

    // ── Normal path: expires_at check applies here (active/reserved only) ─────
    if (new Date(tokenRow.expires_at) <= new Date()) {
      throw new BadRequestException("انتهت صلاحية التوكن");
    }

    // Reserve the token
    const tokenInfo = await this.otpChallenge.reserveActionToken(
      input.actionToken,
      "password_reset"
    );

    const userId = tokenInfo.userId;
    if (!userId) {
      try {
        await this.otpChallenge.releaseActionTokenReservation(tokenInfo.tokenId, tokenInfo.reservationId);
      } catch (releaseErr: any) {
        this.logger.error(`Failed to release ActionToken reservation on missing user: ${releaseErr.message}`);
      }
      throw new BadRequestException("لم يتم العثور على حساب مرتبط بتوكن الاستعادة");
    }

    const calculatedFingerprint = this.computePasswordFingerprint(tokenInfo.tokenId, input.newPassword);

    // Begin finalization: atomically mark token as finalizing and create operation record
    try {
      await this.otpChallenge.beginPasswordResetFinalization(
        tokenInfo.tokenId,
        tokenInfo.reservationId,
        calculatedFingerprint
      );
    } catch (finalErr) {
      try {
        await this.otpChallenge.releaseActionTokenReservation(tokenInfo.tokenId, tokenInfo.reservationId);
      } catch (releaseErr) {}
      throw finalErr;
    }

    // Update password in Supabase Auth
    const { error: updateError } = await this.supabaseAdmin.client.auth.admin.updateUserById(userId, {
      password: input.newPassword,
    });

    if (updateError) {
      // Deterministic rejection: Supabase validated the password before touching it, so nothing was
      // mutated. Unwind the finalization instead of stranding the token, and do NOT record
      // failed_recoverable — this attempt is over, not retryable with the same password.
      if (this.isWeakPasswordRejection(updateError)) {
        this.logger.warn(`Password rejected by identity provider during recovery for token ${tokenInfo.tokenId}`);
        await this.rejectWeakPassword(tokenInfo.tokenId, tokenInfo.reservationId, calculatedFingerprint);
      }

      // Ambiguous failure — the update may have committed. Leave the token finalizing and record
      // failed_recoverable so the same-fingerprint reconciliation retries the auth update.
      this.logger.error(`Failed to update user password in recovery: ${updateError.message}`);
      await this.markOperationStage(tokenInfo.tokenId, "failed_recoverable").catch((e: any) =>
        this.logger.error(`markOperationStage(failed_recoverable) failed: ${e.message}`)
      );
      throw new BadRequestException("فشل تغيير كلمة المرور في نظام الهوية");
    }

    // Advance to auth_updated before atomic consume
    await this.markOperationStage(tokenInfo.tokenId, "auth_updated");

    // Atomically consume token + set operation stage to token_consumed
    await this.otpChallenge.consumeActionToken(tokenInfo.tokenId, tokenInfo.reservationId);

    // Promote to completed — failure after atomic consume is recoverable
    try {
      await this.markOperationStage(tokenInfo.tokenId, "completed", true);
    } catch (promoteErr: any) {
      this.logger.warn(
        `Post-consume completed-stage write failed for token ${tokenInfo.tokenId}: ${promoteErr.message}. ` +
        `Token is consumed at token_consumed; retry will resolve.`
      );
    }

    return {
      success: true,
      message: "تم تحديث كلمة المرور بنجاح",
    };
  }
}
