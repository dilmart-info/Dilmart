import { Module } from "@nestjs/common";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { FinanceModule } from "../finance/finance.module";
import { JenniModule } from "../jenni/jenni.module";
import { OrdersModule } from "../orders/orders.module";
import { StoreIntegrationModule } from "../store-integration/store-integration.module";

@Module({
  imports: [
    SupabaseAdminModule,
    FinanceModule,
    JenniModule,
    OrdersModule,
    StoreIntegrationModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}

