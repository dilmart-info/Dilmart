/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff module.
 *
 * A dedicated submodule under store-integration. NEVER reuses the Barber HMAC verifier/secret.
 * On boot it validates security-critical config when the feature is enabled (fail closed), and
 * enforces the B1 gate: STORE_FEDERATED_AUTH_ENABLED=true without a concrete FederatedSessionIssuer
 * (installed by STORE-PR4) fails application startup — the incomplete redeem path can never activate.
 */
import { Inject, Module, OnModuleInit, Optional } from "@nestjs/common";
import { SupabaseAdminModule } from "../../supabase-admin/supabase-admin.module";
import { FederatedAuthModule } from "../../auth/federated/federated-auth.module";
import { CustomerHandoffController } from "./customer-handoff.controller";
import { CustomerHandoffService } from "./customer-handoff.service";
import { CustomerHandoffAssertionService } from "./customer-handoff-assertion.service";
import { CustomerHandoffIdentityService } from "./customer-handoff-identity.service";
import { CustomerHandoffRepository } from "./customer-handoff-repository";
import { CustomerShadowProvisionerService } from "./customer-shadow-provisioner.service";
import { CustomerHandoffConfig } from "./customer-handoff.config";
import { FEDERATED_SESSION_ISSUER, FederatedSessionIssuer } from "./federated-session-issuer";

@Module({
  // FederatedAuthModule (STORE-PR4) provides the concrete FEDERATED_SESSION_ISSUER consumed below.
  imports: [SupabaseAdminModule, FederatedAuthModule],
  controllers: [CustomerHandoffController],
  providers: [
    CustomerHandoffConfig,
    CustomerHandoffAssertionService,
    CustomerHandoffIdentityService,
    CustomerShadowProvisionerService,
    CustomerHandoffRepository,
    CustomerHandoffService,
    // NOTE: FEDERATED_SESSION_ISSUER is intentionally NOT provided in STORE-PR3.
  ],
  exports: [CustomerHandoffService],
})
export class CustomerHandoffModule implements OnModuleInit {
  constructor(
    private readonly config: CustomerHandoffConfig,
    @Optional() @Inject(FEDERATED_SESSION_ISSUER) private readonly sessionIssuer?: FederatedSessionIssuer,
  ) {}

  async onModuleInit(): Promise<void> {
    // Validates key ring / URL / secret / TTLs AND the B6 per-instance-limiter deployment gate (when enabled).
    await this.config.assertOnBoot();
    // B1: a claim that federated auth is enabled without a COMPLETE session issuer must fail startup. A
    // complete issuer is a bound provider that exposes a callable redeemAndIssue(...) (a stub / wrong-shaped
    // object is not enough).
    if (this.config.federatedAuthEnabled) {
      const issuer = this.sessionIssuer as { redeemAndIssue?: unknown } | undefined;
      if (!issuer || typeof issuer.redeemAndIssue !== "function") {
        throw new Error(
          "STORE_FEDERATED_AUTH_ENABLED=true but no complete FederatedSessionIssuer (with a callable " +
            "redeemAndIssue) is installed. The federated session issuer is delivered by STORE-PR4; refusing to start (fail closed).",
        );
      }
    }
  }
}
