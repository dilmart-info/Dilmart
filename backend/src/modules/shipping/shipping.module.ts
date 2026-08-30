import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { DeliveryOperationsService } from "./delivery-operations.service";
import { ShippingController } from "./shipping.controller";
import { ShippingService } from "./shipping.service";

@Module({
  imports: [SupabaseAdminModule, FinanceModule],
  controllers: [ShippingController],
  providers: [ShippingService, DeliveryOperationsService],
  exports: [ShippingService, DeliveryOperationsService],
})
export class ShippingModule {}
