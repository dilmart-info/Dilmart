/**
 * Verified phone linking.
 *
 * The production audit is unambiguous: 22 auth users, **zero** of them with a usable phone
 * on the auth record, and 7 profiles carrying a phone that nothing ever verified. Those 7
 * are unproven claims — a phone typed into a checkout form is not evidence that the person
 * holds the SIM. So there is no backfill here, phone_confirmed_at is never written by hand,
 * and profiles.phone is never treated as proof of anything.
 *
 * The only way a phone becomes linked is the user proving it: Supabase Auth issues the
 * code, Supabase Auth verifies it, and this service runs afterwards to mirror the result
 * that Supabase already established. It reads the phone from the auth record via the user's
 * own token — never from the request body — so a caller cannot claim a number by asking.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { AuditService } from "../audit/audit.service";
import type { ActorContext } from "../../common/authz/actor-context.decorator";
import { maskPhoneForLogs, toWhatsAppE164 } from "./otp-phone.util";

export interface PhoneAvailabilityResult {
  /** False when some *other* auth identity already holds this number. */
  available: boolean;
  /** True when the caller already owns it — the UI shows "already linked", not an error. */
  alreadyMine: boolean;
}

export interface PhoneLinkResult {
  linked: true;
  phoneMasked: string;
}

@Injectable()
export class PhoneIdentityService {
  private readonly logger = new Logger(PhoneIdentityService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly audit: AuditService,
  ) {}

  /** Rejects anything that is not a valid Iraqi mobile number, in one place. */
  private normalize(rawPhone: string | undefined | null): string {
    const phone = rawPhone?.trim();
    if (!phone) {
      throw new BadRequestException({
        code: "PHONE_REQUIRED",
        message: "رقم الهاتف مطلوب",
      });
    }
    try {
      return toWhatsAppE164(phone);
    } catch {
      throw new BadRequestException({
        code: "PHONE_INVALID",
        message: "رقم هاتف غير صالح",
      });
    }
  }

  /**
   * Is this number free for the caller to claim?
   *
   * Answered before the OTP is sent, so a user does not burn a code on a number they can
   * never link. Deliberately says nothing about *who* holds it — that would turn this into
   * a lookup service for "does this person have an account".
   */
  async checkAvailability(actor: ActorContext, rawPhone: string): Promise<PhoneAvailabilityResult> {
    const userId = this.requireActorId(actor);
    const normalized = this.normalize(rawPhone);
    const owner = await this.findVerifiedOwner(normalized);

    return {
      available: owner === null || owner === userId,
      alreadyMine: owner === userId,
    };
  }

  /**
   * Which auth user has *proven* this number, if any.
   *
   * Only the verified identity table counts. profiles.phone is excluded on purpose: seven
   * of them exist today with nothing behind them, and letting an unproven row block a real
   * verification would lock people out of their own numbers.
   */
  private async findVerifiedOwner(normalized: string): Promise<string | null> {
    const { data, error } = await this.supabaseAdmin.client
      .from("customer_phone_identities")
      .select("user_id")
      .eq("phone_normalized", normalized)
      .eq("is_verified", true)
      .maybeSingle();

    if (error) {
      this.logger.error(`[PHONE_LINK] Ownership lookup failed (${error.code ?? "query"})`);
      throw new ConflictException({
        code: "PHONE_LOOKUP_FAILED",
        message: "تعذر التحقق من رقم الهاتف حالياً",
      });
    }

    return (data as { user_id?: string } | null)?.user_id ?? null;
  }

  private requireActorId(actor: ActorContext): string {
    const userId = actor.actorId?.trim();
    if (!userId) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "يجب تسجيل الدخول",
      });
    }
    return userId;
  }

  /**
   * Mirrors an already-verified auth phone into the application tables.
   *
   * Called after the client has run verifyOtp({ type: "phone_change" }). The phone comes
   * from Supabase Auth via the caller's own access token, so this endpoint cannot be used
   * to assert a number that was never verified — the worst a forged request achieves is
   * re-syncing the number the caller already proved.
   */
  async syncVerifiedPhone(actor: ActorContext): Promise<PhoneLinkResult> {
    const userId = this.requireActorId(actor);
    const token = actor.actorToken?.trim();
    if (!token) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "يجب تسجيل الدخول",
      });
    }

    const user = await this.supabaseAdmin.resolveUserFromAccessToken(token);
    if (!user || user.id !== userId) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "يجب تسجيل الدخول",
      });
    }

    // The authority is the auth record, not the request body.
    if (!user.phone) {
      throw new BadRequestException({
        code: "PHONE_NOT_VERIFIED",
        message: "لم يتم تأكيد رقم الهاتف بعد",
      });
    }

    // Supabase stores the phone without a leading '+'. Normalizing both sides keeps one
    // canonical representation in our tables regardless of what GoTrue returns.
    const normalized = this.normalize(user.phone);
    const masked = maskPhoneForLogs(normalized);

    const owner = await this.findVerifiedOwner(normalized);
    if (owner !== null && owner !== userId) {
      // Supabase itself enforces one phone per auth user, so reaching here means our table
      // and the auth schema disagree. Refuse rather than move a verified link between users.
      this.logger.error(`[PHONE_LINK] Verified phone already owned by another identity phone=${masked}`);
      throw new ConflictException({
        code: "PHONE_ALREADY_LINKED",
        message: "رقم الهاتف مرتبط بحساب آخر",
      });
    }

    await this.upsertPhoneIdentity(userId, normalized, masked);
    await this.syncProfilePhone(userId, normalized, masked);

    await this.audit.log({
      eventType: "PHONE_IDENTITY_LINKED",
      actor: { actorId: userId, actorRole: actor.actorRole ?? "authenticated" },
      resource: { type: "customer_phone_identity", id: userId },
      // Masked only. The audit trail records that a link happened, not what the number is.
      payload: { phone_masked: masked, source: "supabase_phone_change" },
    });

    this.logger.log(`[PHONE_LINK] Linked verified phone userId=${userId} phone=${masked}`);
    return { linked: true, phoneMasked: masked };
  }

  /**
   * Idempotent by construction: the table has a unique constraint on user_id, so a repeated
   * sync updates the same row instead of accumulating identities.
   */
  private async upsertPhoneIdentity(userId: string, normalized: string, masked: string): Promise<void> {
    const { error } = await this.supabaseAdmin.client.from("customer_phone_identities").upsert(
      {
        user_id: userId,
        phone_normalized: normalized,
        is_verified: true,
        verified_at: new Date().toISOString(),
        verification_source: "supabase_phone_change",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      // 23505 is the partial unique index on a verified phone — someone else got there first.
      if (error.code === "23505") {
        this.logger.error(`[PHONE_LINK] Verified phone uniqueness violated phone=${masked}`);
        throw new ConflictException({
          code: "PHONE_ALREADY_LINKED",
          message: "رقم الهاتف مرتبط بحساب آخر",
        });
      }
      this.logger.error(`[PHONE_LINK] Identity upsert failed (${error.code ?? "query"})`);
      throw new ConflictException({
        code: "PHONE_LINK_FAILED",
        message: "تعذر ربط رقم الهاتف حالياً",
      });
    }
  }

  /**
   * Brings profiles.phone in line with the number the user just proved.
   *
   * This is the only path that is allowed to write a phone into profiles as a verified
   * value, and it overwrites whatever unproven number was there before — that is the point.
   * A failure here is logged but does not fail the request: the verified identity row is
   * the record of truth, and the profile is a denormalized convenience.
   */
  private async syncProfilePhone(userId: string, normalized: string, masked: string): Promise<void> {
    const { error } = await this.supabaseAdmin.client
      .from("profiles")
      .update({ phone: normalized })
      .eq("id", userId);

    if (error) {
      this.logger.error(
        `[PHONE_LINK] Profile sync failed after verification userId=${userId} phone=${masked} (${error.code ?? "query"})`,
      );
    }
  }
}
