import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderCancellationService } from "./order-cancellation.service";
import { CheckoutAttemptsService } from "./checkout-attempts.service";
import { OrderReturnsService } from "./order-returns.service";
import { CustomerCheckoutEnrichmentService } from "./customer-checkout-enrichment.service";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { ScopeResolverModule } from "../scope-resolver/scope-resolver.module";
import { WhatsAppIntentsModule } from "../whatsapp-intents/whatsapp-intents.module";
import { FinanceModule } from "../finance/finance.module";
import { ShippingModule } from "../shipping/shipping.module";
import { JenniModule } from "../jenni/jenni.module";

@Module({
  imports: [
    SupabaseAdminModule,
    ScopeResolverModule,
    WhatsAppIntentsModule,
    FinanceModule,
    ShippingModule,
    JenniModule,
  ],

  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderCancellationService,
    OrderReturnsService,
    CheckoutAttemptsService,
    CustomerCheckoutEnrichmentService,
  ],
  exports: [
    OrdersService,
    OrderCancellationService,
    OrderReturnsService,
    CheckoutAttemptsService,
    CustomerCheckoutEnrichmentService,
  ],
})
export class OrdersModule {}
