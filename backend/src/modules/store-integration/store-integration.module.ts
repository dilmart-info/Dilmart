import { Module } from "@nestjs/common";
import { ProductVisibilityService } from "./product-visibility.service";
import { ProductPurchaseEligibilityService } from "./product-purchase-eligibility.service";

@Module({
  imports: [],
  controllers: [],
  providers: [
    ProductVisibilityService,
    ProductPurchaseEligibilityService,
  ],
  exports: [
    ProductVisibilityService,
    ProductPurchaseEligibilityService,
  ],
})
export class StoreIntegrationModule {}


