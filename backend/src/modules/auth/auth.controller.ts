import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Roles } from "../../common/authz/roles.decorator";
import { ActorContext, CurrentActor } from "../../common/authz/actor-context.decorator";
import { AuthService } from "./auth.service";
import { CreateProvisionalUserDto } from "./create-provisional-user.dto";
import { AccountClaimService } from "./account-claim.service";
import { OtpChallengeService } from "./otp-challenge.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import {
  CompleteClaimDto,
  RecoverClaimByOrderDto,
  RequestAccountClaimDto,
  VerifyOtpDto,
} from "./account-claim.dto";
import {
  CompletePasswordResetDto,
  RequestPasswordResetDto,
} from "./password-recovery.dto";
import { CheckPhoneAvailabilityDto } from "./phone-identity.dto";
import { PhoneIdentityService } from "./phone-identity.service";

/**
 * Both verify endpoints accept an opaque `request_id` or a raw `challenge_id`. Anything
 * that does not resolve — a decoy, a tampered handle, a missing field — collapses to the
 * same unresolvable value, so the response is indistinguishable from a wrong code.
 */
function resolveOtpReference(
  otpChallengeService: OtpChallengeService,
  payload: VerifyOtpDto
): string {
  const reference = payload.request_id?.trim() || payload.challenge_id?.trim() || "";
  if (!reference) return UNRESOLVABLE_CHALLENGE_REFERENCE;
  return (
    otpChallengeService.resolveChallengeReference(reference) ??
    UNRESOLVABLE_CHALLENGE_REFERENCE
  );
}

/** A syntactically valid uuid that can never match a stored challenge. */
const UNRESOLVABLE_CHALLENGE_REFERENCE = "00000000-0000-4000-8000-000000000000";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountClaimService: AccountClaimService,
    private readonly otpChallengeService: OtpChallengeService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
    private readonly phoneIdentityService: PhoneIdentityService
  ) {}

  @Get("context")
  @Roles("authenticated")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  getContext(@CurrentActor() actor: ActorContext) {
    return this.authService.getContext(actor);
  }

  @Post("create-provisional-user")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Header("Cache-Control", "no-store")
  createProvisionalUser(@Body() payload: CreateProvisionalUserDto) {
    return this.authService.createProvisionalUser(payload);
  }

  // --- Account Claim Endpoints ---

  @Post("account-claim/request")
  @Roles("authenticated")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  requestAccountClaim(
    @CurrentActor() actor: ActorContext,
    @Body() payload: RequestAccountClaimDto
  ) {
    return this.accountClaimService.requestClaimFromProvisional(actor, payload.phone);
  }

  @Post("account-claim/recover")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  recoverClaimByOrder(@Body() payload: RecoverClaimByOrderDto) {
    return this.accountClaimService.recoverClaimByOrder(
      payload.order_number,
      payload.phone
    );
  }

  @Post("account-claim/verify")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  verifyAccountClaimOtp(@Body() payload: VerifyOtpDto) {
    return this.otpChallengeService.verifyOtp({
      challengeId: resolveOtpReference(this.otpChallengeService, payload),
      otp: payload.otp,
    });
  }

  @Post("account-claim/complete")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  completeAccountClaim(@Body() payload: CompleteClaimDto) {
    return this.accountClaimService.completeClaim({
      actionToken: payload.action_token,
      newPassword: payload.new_password,
      email: payload.email,
    });
  }

  // --- Password Reset Endpoints ---

  @Post("password-reset/request")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  requestPasswordReset(@Body() payload: RequestPasswordResetDto) {
    return this.passwordRecoveryService.requestPasswordReset(payload.phone);
  }

  @Post("password-reset/verify")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  verifyPasswordResetOtp(@Body() payload: VerifyOtpDto) {
    return this.passwordRecoveryService.verifyPasswordResetOtp(
      resolveOtpReference(this.otpChallengeService, payload),
      payload.otp
    );
  }

  @Post("password-reset/complete")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  completePasswordReset(@Body() payload: CompletePasswordResetDto) {
    return this.passwordRecoveryService.completePasswordReset({
      actionToken: payload.action_token,
      newPassword: payload.new_password,
    });
  }

  // --- Verified Phone Linking ---
  //
  // Supabase Auth owns the verification. These endpoints only ask "is this number free?"
  // beforehand and "mirror what you already verified" afterwards. Neither of them can make
  // a phone verified, which is why neither is a route to claiming somebody's number.

  @Post("phone-identity/check")
  @Roles("authenticated")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  checkPhoneAvailability(
    @CurrentActor() actor: ActorContext,
    @Body() payload: CheckPhoneAvailabilityDto,
  ) {
    return this.phoneIdentityService.checkAvailability(actor, payload.phone);
  }

  /**
   * Takes no phone: the number is read from the caller's own auth record, so the client
   * cannot assert one. Run after verifyOtp({ type: "phone_change" }) has succeeded.
   */
  @Post("phone-identity/sync")
  @Roles("authenticated")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  syncPhoneIdentity(@CurrentActor() actor: ActorContext) {
    return this.phoneIdentityService.syncVerifiedPhone(actor);
  }
}
