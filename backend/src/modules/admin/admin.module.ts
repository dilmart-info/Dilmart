import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FinanceModule } from "../finance/finance.module";
import { MerchantsModule } from "../merchants/merchants.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ShippingModule } from "../shipping/shipping.module";
import { JenniModule } from "../jenni/jenni.module";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { ScopeResolverModule } from "../scope-resolver/scope-resolver.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { DeliveryIntelligenceService } from "./delivery-intelligence.service";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminOperationalAlertsService } from "./admin-operational-alerts.service";

@Module({
  imports: [
    SupabaseAdminModule,
    AuditModule,
    FinanceModule,
    MerchantsModule,
    NotificationsModule,
    ShippingModule,
    JenniModule,
    ScopeResolverModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    DeliveryIntelligenceService,
    AdminAnalyticsService,
    AdminCustomersService,
    AdminOperationalAlertsService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
