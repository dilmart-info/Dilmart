import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { startConstantTimeBudget } from "./otp-constant-time.util";
import { normalizeIraqiPhone } from "../../common/validators/iraqi-phone.validator";
import { OtpChallengeService } from "./otp-challenge.service";

export interface CompleteClaimInput {
  actionToken: string;
  newPassword?: string;
  email?: string;
}

/** Stable machine-readable code @supabase/auth-js sets when a password is rejected as weak. */
const WEAK_PASSWORD_CODE = "weak_password";
/** Structured code returned to API clients so the UI can localise without parsing messages. */
const WEAK_PASSWORD_ERROR_CODE = "WEAK_PASSWORD";
const WEAK_PASSWORD_MESSAGE_AR =
  "كلمة المرور هذه غير آمنة أو ظهرت في تسريبات معروفة. اختر كلمة مرور مختلفة.";

/**
 * True only for a password Supabase Auth rejected as weak, classified by the stable code alone.
 *
 * Never by the error name, message text or HTTP status — the same strict rule the password-reset
 * saga uses. `AuthWeakPasswordError` carrying no `code` is an unproven rejection and stays generic.
 *
 * This classification is load-bearing: a rejection carrying this code proves Supabase refused the
 * password BEFORE changing it, which is what makes releasing a post-merge reservation safe. An
 * ambiguous failure — timeout, transport error, 5xx, unknown SDK error — proves nothing about
 * whether the mutation ran, so it must never reach that path.
 */
function isWeakPasswordRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === WEAK_PASSWORD_CODE;
}

/**
 * Service-owned encoding of the saga's auth outcome, stored as a prefix on `last_error`.
 *
 * It answers a question a later attempt cannot otherwise ask: did the previous attempt leave the
 * password in a KNOWN state? A saga sitting at `account_merged` whose last failure was a timeout may
 * have had its password written by a response that was lost in transit, so the outcome is unknown and
 * no later attempt may act as if it were not.
 *
 * Both outcomes are prefixed, and that is the point rather than a formality. `last_error` also holds
 * raw SDK, transport and runtime text, so a single trusted marker sharing that namespace with
 * arbitrary strings can be impersonated by an upstream message that merely starts the same way.
 * Because every failure this service records is written under one of these two prefixes, an upstream
 * message can only ever appear AFTER a prefix, never as one.
 *
 * A value carrying neither prefix — anything written before this encoding existed — is UNKNOWN. Only
 * an exact `PROVEN_UNCHANGED_PREFIX` match means proven, so the unrecognised case fails closed.
 */
const AUTH_OUTCOME_NAMESPACE = "CLAIM_AUTH_OUTCOME:";
/** The previous attempt ended in a deterministic weak-password rejection: the password was not written. */
const PROVEN_UNCHANGED_PREFIX = `${AUTH_OUTCOME_NAMESPACE}PROVEN_UNCHANGED_WEAK_PASSWORD|`;
/** Everything else. Says nothing about whether the password mutation ran. */
const UNPROVEN_FAILURE_PREFIX = `${AUTH_OUTCOME_NAMESPACE}UNPROVEN_FAILURE|`;

/** The localized, structured rejection. Thrown in place of the generic password-update failure. */
function weakPasswordException(): BadRequestException {
  return new BadRequestException({
    code: WEAK_PASSWORD_ERROR_CODE,
    message: WEAK_PASSWORD_MESSAGE_AR,
  });
}

@Injectable()
export class AccountClaimService {
  private readonly logger = new Logger(AccountClaimService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly otpChallenge: OtpChallengeService
  ) {}

  async requestClaimFromProvisional(actor: ActorContext, phone: string) {
    if (!actor.actorId) {
      throw new ForbiddenException("يجب تسجيل الدخول كمسخدم مؤقت لإرسال طلب الاستلام");
    }

    const normalizedPhone = normalizeIraqiPhone(phone);

    // Verify actor is provisional customer
    const { data: profile } = await this.supabaseAdmin.client
      .from("profiles")
      .select("id, account_type, phone")
      .eq("id", actor.actorId)
      .maybeSingle();

    if (profile && profile.account_type && profile.account_type !== "provisional_customer") {
      throw new BadRequestException("هذا الحساب دائم وموثق بالفعل ولا يحتاج إلى استلام");
    }

    // Verify requested phone matches profile phone or order phone for this provisional user
    let allowedPhone = profile?.phone ? normalizeIraqiPhone(profile.phone) : null;

    if (!allowedPhone) {
      // Check latest order for this provisional user
      const { data: latestOrder } = await this.supabaseAdmin.client
        .from("orders")
        .select("customer_phone")
        .eq("user_id", actor.actorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestOrder?.customer_phone) {
        allowedPhone = normalizeIraqiPhone(latestOrder.customer_phone);
      }
    }

    // Reject Claim if the original phone cannot be resolved from Profile or Order
    if (!allowedPhone) {
      throw new BadRequestException("لم يتم العثور على رقم هاتف مسجل لهذا الحساب المؤقت في ملفك الشخصي أو طلباتك");
    }

    if (allowedPhone !== normalizedPhone) {
      throw new BadRequestException("رقم الهاتف المدخل لا يطابق رقم الهاتف المرتبط بالحساب المؤقت");
    }

    return this.otpChallenge.createChallenge({
      phone: normalizedPhone,
      purpose: "claim_account",
      subjectUserId: actor.actorId,
    });
  }

  async recoverClaimByOrder(orderNumber: string, phone: string) {
    // TEMPORARY TIMING MITIGATION — see otp-constant-time.util.ts. Started before any
    // work so a matching and a non-matching order settle into the same distribution.
    const budget = startConstantTimeBudget();

    // Runs before the order lookup on purpose: the result depends only on server
    // configuration, so failing here cannot reveal whether the order or phone exists.
    this.otpChallenge.assertDeliveryReady();

    const normalizedPhone = normalizeIraqiPhone(phone);

    // Query order safely matching order_number and phone
    const { data: order } = await this.supabaseAdmin.client
      .from("orders")
      .select("id, user_id, customer_phone")
      .eq("order_number", orderNumber.trim())
      .maybeSingle();

    let requestId: string | null = null;

    if (order && order.user_id) {
      const orderPhoneNormalized = normalizeIraqiPhone(order.customer_phone);
      if (orderPhoneNormalized === normalizedPhone) {
        try {
          const challenge = await this.otpChallenge.createChallenge({
            phone: normalizedPhone,
            purpose: "claim_account",
            subjectUserId: order.user_id,
          });
          requestId = this.otpChallenge.issueRequestHandle(challenge.challenge_id);
        } catch (err: any) {
          // Per-send failures are account-dependent, so they stay silent here to preserve
          // anti-enumeration. Channel-level misconfiguration was already rejected by the
          // readiness check above, which fails identically for every caller.
          this.logger.error(
            `[ACCOUNT_CLAIM_RECOVER] OTP delivery failed (swallowed): code=${err?.response?.code || err?.code || "unknown"}`,
          );
        }
      }
    }

    // Always hand back a request id. A decoy is returned when the order/phone pair did
    // not match or the send failed, so the response shape is identical in every case and
    // the caller can still reach the verify step.
    const response = {
      request_id: requestId ?? this.otpChallenge.issueDecoyRequestHandle(),
      message: "إذا كانت البيانات صحيحة، فقد تم إرسال رمز التوثيق إلى رقم الهاتف المرتبط بالطلب",
    };
    await budget.settle();
    return response;
  }

  private async updateSagaStage(input: {
    tokenId: string;
    reservationId: string;
    operationType: string;
    sourceUserId: string;
    targetUserId?: string | null;
    stage: string;
    lastError?: string | null;
  }) {
    const { error } = await this.supabaseAdmin.client.from("auth_action_operations").upsert({
      token_id: input.tokenId,
      reservation_id: input.reservationId,
      operation_type: input.operationType,
      source_user_id: input.sourceUserId,
      target_user_id: input.targetUserId || null,
      stage: input.stage,
      last_error: input.lastError || null,
      updated_at: new Date().toISOString(),
      ...(input.stage === "completed" ? { completed_at: new Date().toISOString() } : {}),
    }, { onConflict: "token_id" });

    if (error) {
      this.logger.error(`Failed to update auth action saga stage: ${error.message}`);
      throw new BadRequestException(`فشل تحديث مرحلة العملية: ${error.message}`);
    }
  }

  private async getSagaOperation(tokenId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("auth_action_operations")
      .select("*")
      .eq("token_id", tokenId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed to fetch auth action saga: ${error.message}`);
    }
    return data;
  }

  async completeClaim(input: CompleteClaimInput) {
    if (!input.newPassword || input.newPassword.length < 6) {
      throw new BadRequestException("كلمة المرور يجب أن لا تقل عن 6 أحرف");
    }

    // Reserve token (saga start)
    const tokenInfo = await this.otpChallenge.reserveActionToken(input.actionToken, "claim_account");
    const sourceUserId = tokenInfo.userId;
    const verifiedPhone = tokenInfo.verifiedPhone;
    const tokenId = tokenInfo.tokenId;
    const reservationId = tokenInfo.reservationId;

    // Retrieve or initialize saga state
    let saga = await this.getSagaOperation(tokenId);
    /** What the PREVIOUS attempt recorded. Read before this attempt overwrites the row. */
    const priorLastError: string | null = saga?.last_error ?? null;
    /** True when this request did not perform the merge — it resumed from an earlier one. */
    const resumedFromAccountMerged = saga?.stage === "account_merged";
    if (!saga) {
      await this.updateSagaStage({
        tokenId,
        reservationId,
        operationType: "claim_account",
        sourceUserId,
        stage: "reserved",
      });
      saga = { stage: "reserved" };
    } else {
      // Update saga with new reservation_id to keep ownership current. `lastError` is carried
      // through deliberately: the upsert replaces the row, so dropping it here would erase the
      // previous attempt's outcome and make an unknown auth state look like a clean checkpoint.
      await this.updateSagaStage({
        tokenId,
        reservationId,
        operationType: "claim_account",
        sourceUserId,
        targetUserId: saga.target_user_id,
        stage: saga.stage,
        lastError: saga.last_error,
      });
    }

    let irreversibleSideEffectApplied = ["auth_updated", "account_merged", "profile_updated", "token_consumed"].includes(saga.stage);

    /**
     * The one authoritative answer to "which permanent account did this claim merge into".
     *
     * Resolved once — from the durable saga on a retry, or from the phone identity on the first
     * attempt — and then written on EVERY subsequent saga upsert, the error path included. Losing it
     * would strand the operation: a retry could not resume from `account_merged` without rediscovering
     * a target that was already authoritatively chosen.
     */
    let resolvedTargetUserId: string | null = saga.target_user_id || null;
    /** Set only where the proof exists: Supabase rejected the password with the stable weak code. */
    let deterministicWeakPasswordRejected = false;

    try {
      // 1. Get source profile and verify phone matching
      const { data: sourceProfile, error: profileErr } = await this.supabaseAdmin.client
        .from("profiles")
        .select("*")
        .eq("id", sourceUserId)
        .maybeSingle();

      if (profileErr || !sourceProfile) {
        throw new BadRequestException("فشل قراءة الملف الشخصي للمستخدم المؤقت");
      }

      const profilePhone = sourceProfile.phone ? normalizeIraqiPhone(sourceProfile.phone) : null;
      if (profilePhone && profilePhone !== verifiedPhone) {
        throw new ForbiddenException("رقم الهاتف الموثق لا يطابق رقم الهاتف المسجل بالحساب المؤقت");
      }

      // Check if another verified customer account exists for this exact verified phone
      let targetPermanentUserId = resolvedTargetUserId;

      if (!targetPermanentUserId) {
        const { data: phoneIdentity, error: identityErr } = await this.supabaseAdmin.client
          .from("customer_phone_identities")
          .select("user_id, is_verified")
          .eq("phone_normalized", verifiedPhone)
          .eq("is_verified", true)
          .neq("user_id", sourceUserId)
          .maybeSingle();

        if (identityErr) {
          throw new BadRequestException("فشل التحقق من هوية الهاتف");
        }

        if (phoneIdentity && phoneIdentity.user_id) {
          targetPermanentUserId = phoneIdentity.user_id;
        }
      }

      if (targetPermanentUserId) {
        // --- Merge Flow ---
        // Step A: Database Merge (if not already merged)
        if (saga.stage === "reserved") {
          const { data: mergeResult, error: mergeError } = await this.supabaseAdmin.client.rpc(
            "merge_provisional_customer_account",
            {
              p_source_user_id: sourceUserId,
              p_target_user_id: targetPermanentUserId,
            }
          );

          if (mergeError) {
            this.logger.error(`Failed to merge provisional account: ${mergeError.message}`);
            throw new BadRequestException("فشلت عملية دمج الحساب المؤقت بالحساب القديم");
          }

          irreversibleSideEffectApplied = true;
          // Pinned BEFORE the stage write, and mirrored onto the in-memory saga, so every later
          // write — including the error recording in the catch — carries the merged target.
          resolvedTargetUserId = targetPermanentUserId;
          saga.target_user_id = targetPermanentUserId;
          await this.updateSagaStage({
            tokenId,
            reservationId,
            operationType: "claim_account",
            sourceUserId,
            targetUserId: targetPermanentUserId,
            stage: "account_merged",
          });
          saga.stage = "account_merged";
        }

        // Step B: Update Auth Password
        if (saga.stage === "account_merged") {
          const { error: updateAuthError } = await this.supabaseAdmin.client.auth.admin.updateUserById(targetPermanentUserId, {
            password: input.newPassword,
          });

          if (updateAuthError) {
            this.logger.error(`Failed to update auth password: ${updateAuthError.message}`);
            if (isWeakPasswordRejection(updateAuthError)) {
              // Recorded HERE, at the only site where the proof exists. The catch must not re-derive
              // this from the thrown BadRequestException: an unrelated failure that happened to carry
              // a similar client-facing payload would then reach a release path it has not earned.
              deterministicWeakPasswordRejected = true;
              throw weakPasswordException();
            }
            throw new BadRequestException("فشل تحديث كلمة المرور للحساب");
          }

          await this.updateSagaStage({
            tokenId,
            reservationId,
            operationType: "claim_account",
            sourceUserId,
            targetUserId: targetPermanentUserId,
            stage: "auth_updated",
          });
          saga.stage = "auth_updated";
        }

        // Step C: Consume Action Token
        if (saga.stage === "auth_updated") {
          await this.otpChallenge.consumeActionToken(tokenId, reservationId);
          await this.updateSagaStage({
            tokenId,
            reservationId,
            operationType: "claim_account",
            sourceUserId,
            targetUserId: targetPermanentUserId,
            stage: "completed",
          });
        }

        return {
          success: true,
          merged: true,
          user_id: targetPermanentUserId,
          message: "تم دمج حسابك المؤقت بحسابك القديم بنجاح",
        };

      } else {
        // --- Upgrade Flow ---
        // Step A: Update Auth Password & Metadata
        if (saga.stage === "reserved") {
          const { error: updateAuthError } = await this.supabaseAdmin.client.auth.admin.updateUserById(
            sourceUserId,
            {
              password: input.newPassword,
              user_metadata: {
                account_type: "customer",
                phone_verified: true,
              },
              app_metadata: {
                account_type: "customer",
              },
            }
          );

          if (updateAuthError) {
            this.logger.error(`Failed to update auth password: ${updateAuthError.message}`);
            // Thrown BEFORE irreversibleSideEffectApplied is set, exactly as before, so the token
            // is still released by the catch. Only the client-facing payload changes.
            if (isWeakPasswordRejection(updateAuthError)) throw weakPasswordException();
            throw new BadRequestException("فشل تحديث كلمة المرور للحساب");
          }

          irreversibleSideEffectApplied = true;
          await this.updateSagaStage({
            tokenId,
            reservationId,
            operationType: "claim_account",
            sourceUserId,
            stage: "auth_updated",
          });
          saga.stage = "auth_updated";
        }

        // Step B: Update database profile and identity
        if (saga.stage === "auth_updated") {
          const { error: profileErr } = await this.supabaseAdmin.client
            .from("profiles")
            .update({
              account_type: "customer",
              phone: verifiedPhone,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sourceUserId);

          if (profileErr) {
            this.logger.error(`Failed to update profile: ${profileErr.message}`);
            throw new BadRequestException("فشل تحديث بيانات الملف الشخصي");
          }

          const { error: identityErr } = await this.supabaseAdmin.client.from("customer_phone_identities").upsert(
            {
              user_id: sourceUserId,
              phone_normalized: verifiedPhone,
              is_verified: true,
              verified_at: new Date().toISOString(),
              verification_source: "claim_account_otp",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

          if (identityErr) {
            this.logger.error(`Failed to upsert phone identity: ${identityErr.message}`);
            throw new BadRequestException("فشل تسجيل هوية الهاتف الموثق");
          }

          await this.updateSagaStage({
            tokenId,
            reservationId,
            operationType: "claim_account",
            sourceUserId,
            stage: "profile_updated",
          });
          saga.stage = "profile_updated";
        }

        // Step C: Consume Action Token
        if (saga.stage === "profile_updated") {
          await this.otpChallenge.consumeActionToken(tokenId, reservationId);
          await this.updateSagaStage({
            tokenId,
            reservationId,
            operationType: "claim_account",
            sourceUserId,
            stage: "completed",
          });
        }

        return {
          success: true,
          merged: false,
          user_id: sourceUserId,
          message: "تم توثيق رقم الهاتف واستلام الحساب المؤقت بنجاح",
        };
      }
    } catch (err: any) {
      const failureDescription = err.message || String(err);

      /**
       * A merge cannot be undone, so a post-merge failure normally keeps the reservation: the
       * request cannot prove the account is in a state another attempt may safely resume from.
       *
       * A deterministic `weak_password` rejection is the one case where it can. Supabase validates
       * the password before writing it, so that code proves the auth mutation did NOT happen, and
       * the merge that DID happen is already recorded at `account_merged` with its exact target.
       * The claim is therefore resumable, and holding the reservation for the rest of its five-minute
       * lease only punishes a user who is about to type a stronger password.
       *
       * Every condition is required. Deterministic proof — not the thrown exception's payload, which
       * an unrelated failure could imitate. The durable checkpoint. The known target. And the last
       * condition, which is about the SAGA rather than this request:
       *
       * this attempt proves ITS OWN password was not written, but a resumed attempt inherits whatever
       * the previous one left behind. If that one died on a timeout after Supabase had already
       * accepted the password, the response was lost and the outcome is unknown — the claim may in
       * fact be complete. Releasing there would hand a still-active one-time credential back into an
       * unresolved state, so an unknown prior outcome keeps the conservative retain, and stays
       * unknown: the proven prefix below is written only when the release was actually permitted, so
       * the ambiguity is sticky rather than papered over by the next deterministic rejection.
       */
      const priorAuthOutcomeUnknown =
        resumedFromAccountMerged && !(priorLastError ?? "").startsWith(PROVEN_UNCHANGED_PREFIX);

      const canReleaseAfterMerge =
        deterministicWeakPasswordRejected &&
        saga?.stage === "account_merged" &&
        Boolean(resolvedTargetUserId) &&
        !priorAuthOutcomeUnknown;

      // `resolvedTargetUserId`, never `saga.target_user_id`, so a first attempt that merged and then
      // failed cannot record the operation with a null target and strand its own retry.
      //
      // The proven prefix is attached only when the release was permitted, which is what makes an
      // unknown outcome stick. Everything else is written under the unproven prefix — including
      // upstream text that happens to begin with the proven prefix, which lands after this one and so
      // cannot be read back as a proof.
      await this.updateSagaStage({
        tokenId,
        reservationId,
        operationType: "claim_account",
        sourceUserId,
        targetUserId: resolvedTargetUserId,
        stage: saga?.stage || "reserved",
        lastError: `${canReleaseAfterMerge ? PROVEN_UNCHANGED_PREFIX : UNPROVEN_FAILURE_PREFIX}${failureDescription}`,
      });
      // Reaching this line means the checkpoint above is durable. If it had failed it would have
      // thrown, and no release would be attempted — the fail-closed direction.

      if (!irreversibleSideEffectApplied || canReleaseAfterMerge) {
        try {
          // The RPC releases only a row still reserved by THIS reservation_id, so a slow request
          // cannot release a reservation a newer attempt has since taken.
          await this.otpChallenge.releaseActionTokenReservation(tokenId, reservationId);
        } catch (releaseErr: any) {
          // Nothing is fabricated here: the original failure is still thrown, the token is not
          // consumed, and the saga stays at its recorded checkpoint. The user waits out the lease.
          this.logger.error(`Failed to release ActionToken reservation on error rollback: ${releaseErr.message}`);
        }
      }
      throw err;
    }
  }
}
