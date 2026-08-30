/**
 * STORE-PR6A — Customer Order Summary module (spec §33).
 *
 * A dedicated submodule under store-integration, separate from Customer Handoff and Barber integration. It
 * reuses the SHARED asymmetric key ring (via its own CustomerHandoffConfig instance — crypto material only) but
 * NEVER the Handoff business verifier and NEVER the Barber HMAC secret. On boot, when the independent
 * STORE_CUSTOMER_ORDER_SUMMARY_ENABLED flag is enabled, it validates the key ring is importable (fail closed).
 */
import { Module, OnModuleInit } from "@nestjs/common";
import { SupabaseAdminModule } from "../../supabase-admin/supabase-admin.module";
import { CustomerHandoffConfig } from "../customer-handoff/customer-handoff.config";
import { CustomerOrderSummaryConfig } from "./customer-order-summary.config";
import { CustomerOrderSummaryAssertionService } from "./customer-order-summary-assertion.service";
import { CustomerOrderSummaryRepository } from "./customer-order-summary.repository";
import { CustomerOrderSummaryService } from "./customer-order-summary.service";
import { CustomerOrderSummaryController } from "./customer-order-summary.controller";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [CustomerOrderSummaryController],
  providers: [
    // Own instance of the reviewed handoff config — used ONLY for the shared key ring + clock tolerance.
    CustomerHandoffConfig,
    CustomerOrderSummaryConfig,
    CustomerOrderSummaryAssertionService,
    CustomerOrderSummaryRepository,
    CustomerOrderSummaryService,
  ],
  exports: [CustomerOrderSummaryService],
})
export class CustomerOrderSummaryModule implements OnModuleInit {
  constructor(private readonly config: CustomerOrderSummaryConfig) {}

  async onModuleInit(): Promise<void> {
    // When enabled, fail closed if the shared key ring cannot be parsed/imported.
    await this.config.assertOnBoot();
  }
}
