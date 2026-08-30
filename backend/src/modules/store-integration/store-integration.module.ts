import { Module } from "@nestjs/common";
import { StoreIntegrationController } from "./store-integration.controller";
import { StoreIntegrationService } from "./store-integration.service";
import { ProductVisibilityService } from "./product-visibility.service";
import { ProductPurchaseEligibilityService } from "./product-purchase-eligibility.service";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [StoreIntegrationController],
  providers: [
    StoreIntegrationService,
    ProductVisibilityService,
    ProductPurchaseEligibilityService,
  ],
  exports: [
    StoreIntegrationService,
    ProductVisibilityService,
    ProductPurchaseEligibilityService,
  ],
})
export class StoreIntegrationModule {}

