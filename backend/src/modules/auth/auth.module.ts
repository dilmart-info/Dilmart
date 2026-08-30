import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OtpDeliveryService } from "./otp-delivery.service";
import { OtpChallengeService } from "./otp-challenge.service";
import { AccountClaimService } from "./account-claim.service";
import { PasswordRecoveryService } from "./password-recovery.service";
import { WhatsAppOtpProvider } from "./whatsapp-otp.provider";
import { SupabaseAuthHookController } from "./supabase-auth-hook.controller";
import { SupabaseAuthHookService } from "./supabase-auth-hook.service";
import { AuthHookIdempotencyService } from "./auth-hook-idempotency.service";
import { PhoneIdentityService } from "./phone-identity.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [SupabaseAdminModule, AuditModule],
  controllers: [AuthController, SupabaseAuthHookController],
  providers: [
    AuthService,
    WhatsAppOtpProvider,
    OtpDeliveryService,
    OtpChallengeService,
    AccountClaimService,
    PasswordRecoveryService,
    AuthHookIdempotencyService,
    PhoneIdentityService,
    SupabaseAuthHookService,
  ],
  exports: [
    AuthService,
    WhatsAppOtpProvider,
    OtpDeliveryService,
    OtpChallengeService,
    AccountClaimService,
    PasswordRecoveryService,
    AuthHookIdempotencyService,
    PhoneIdentityService,
    SupabaseAuthHookService,
  ],
})
export class AuthModule {}
