/**
 * STORE-PR4 — Federated Store Session core module.
 *
 * Provides the concrete FEDERATED_SESSION_ISSUER (consumed by the PR3 CustomerHandoffModule via DI) and
 * exports the session verifier foundation for STORE-PR5. Does NOT modify the global RolesGuard or attach
 * to any existing customer endpoint. On boot it validates the signing/verification config when the feature
 * is enabled (fail closed).
 */
import { Module, OnModuleInit } from "@nestjs/common";
import { SupabaseAdminModule } from "../../supabase-admin/supabase-admin.module";
import { FederatedAuthConfig } from "./federated-auth.config";
import { FederatedAccessTokenService } from "./federated-access-token.service";
import { FederatedRefreshTokenService } from "./federated-refresh-token.service";
import { FederatedSessionRepository } from "./federated-session-repository";
import { FederatedSessionVerifierService } from "./federated-session-verifier.service";
import { FederatedSessionIssuerService } from "./federated-session-issuer.service";
import { FederatedAuthService } from "./federated-auth.service";
import { FederatedAuthController } from "./federated-auth.controller";
import { FEDERATED_SESSION_ISSUER } from "../../store-integration/customer-handoff/federated-session-issuer";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [FederatedAuthController],
  providers: [
    FederatedAuthConfig,
    FederatedAccessTokenService,
    FederatedRefreshTokenService,
    FederatedSessionRepository,
    FederatedSessionVerifierService,
    FederatedSessionIssuerService,
    FederatedAuthService,
    // Bind the PR3 issuer token to the concrete STORE-PR4 implementation.
    { provide: FEDERATED_SESSION_ISSUER, useExisting: FederatedSessionIssuerService },
  ],
  exports: [
    FEDERATED_SESSION_ISSUER, // consumed by CustomerHandoffModule
    FederatedSessionVerifierService, // consumed by STORE-PR5 dual actor resolver
    FederatedAuthConfig, // STORE-PR5: consumed by the dual actor resolver for token classification
    FederatedAuthService, // internal revoke foundation
  ],
})
export class FederatedAuthModule implements OnModuleInit {
  constructor(private readonly config: FederatedAuthConfig) {}
  async onModuleInit(): Promise<void> {
    await this.config.assertOnBoot();
  }
}
