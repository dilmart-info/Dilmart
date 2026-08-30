/**
 * Barber Handoff module — a dedicated submodule under store-integration, sibling of
 * customer-handoff. NEVER reuses the Barber HMAC verifier/secret, and never touches the Customer
 * federated session system — its own independent key ring, config, DB tables, and cookie.
 * Validates security-critical config on boot when the feature is enabled (fail closed).
 */
import { Module, OnModuleInit } from "@nestjs/common";
import { SupabaseAdminModule } from "../../supabase-admin/supabase-admin.module";
import { StoreIntegrationModule } from "../store-integration.module";
import { BarberHandoffController } from "./barber-handoff.controller";
import { BarberWebSessionController } from "./barber-web-session.controller";
import { BarberHandoffService } from "./barber-handoff.service";
import { BarberHandoffAssertionService } from "./barber-handoff-assertion.service";
import { BarberHandoffRepository } from "./barber-handoff-repository";
import { BarberHandoffConfig } from "./barber-handoff.config";

@Module({
  // StoreIntegrationModule provides ProductVisibilityService — reused so segment computation has
  // exactly one implementation, shared with the native X-Store-Session exchange.
  imports: [SupabaseAdminModule, StoreIntegrationModule],
  controllers: [BarberHandoffController, BarberWebSessionController],
  providers: [BarberHandoffConfig, BarberHandoffAssertionService, BarberHandoffRepository, BarberHandoffService],
  exports: [BarberHandoffService],
})
export class BarberHandoffModule implements OnModuleInit {
  constructor(private readonly config: BarberHandoffConfig) {}

  async onModuleInit(): Promise<void> {
    await this.config.assertOnBoot();
  }
}
