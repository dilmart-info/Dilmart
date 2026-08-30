/**
 * cart.module.ts
 *
 * Phase 4B + Phase 5A + B2B Idempotency — B2B Cart Module.
 *
 * Imports:
 *   - SupabaseAdminModule   — DB access (service_role key)
 *   - StoreIntegrationModule — X-Store-Session verification
 *   - FinanceModule          — OrderFinanceService for financial snapshot (Phase 5A)
 *   - JenniModule            — JenniPricingService for delivery cost (Phase 5A)
 *   - OrdersModule           — CheckoutAttemptsService for B2B idempotency (Task 062)
 */

import { Module } from "@nestjs/common";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { CartCheckoutService } from "./cart-checkout.service";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { StoreIntegrationModule } from "../store-integration/store-integration.module";
import { FinanceModule } from "../finance/finance.module";
import { JenniModule } from "../jenni/jenni.module";
import { OrdersModule } from "../orders/orders.module";

@Module({
  imports: [
    SupabaseAdminModule,
    StoreIntegrationModule,
    FinanceModule,
    JenniModule,
    OrdersModule,
  ],
  controllers: [CartController],
  providers: [CartService, CartCheckoutService],
  exports: [CartService, CartCheckoutService],
})
export class CartModule {}
