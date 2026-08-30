import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ProfilesModule } from "./modules/profiles/profiles.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { ProductsModule } from "./modules/products/products.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { CheckoutModule } from "./modules/checkout/checkout.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { CouponsModule } from "./modules/coupons/coupons.module";
import { LoyaltyModule } from "./modules/loyalty/loyalty.module";
import { MerchantsModule } from "./modules/merchants/merchants.module";
import { MerchantUsersModule } from "./modules/merchant-users/merchant-users.module";
import { MerchantApplicationsModule } from "./modules/merchant-applications/merchant-applications.module";
import { ShippingModule } from "./modules/shipping/shipping.module";
import { JenniModule } from "./modules/jenni/jenni.module";
import { UploadsModule } from "./modules/uploads/uploads.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { AdminModule } from "./modules/admin/admin.module";
import { MarketplaceModule } from "./modules/marketplace/marketplace.module";
import { SupabaseAdminModule } from "./modules/supabase-admin/supabase-admin.module";
import { ScopeResolverModule } from "./modules/scope-resolver/scope-resolver.module";
import { AuditModule } from "./modules/audit/audit.module";
import { EventsModule } from "./modules/events/events.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { WhatsAppIntentsModule } from "./modules/whatsapp-intents/whatsapp-intents.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { CustomerModule } from "./modules/customer/customer.module";
import { StoreIntegrationModule } from "./modules/store-integration/store-integration.module";
import { RolesGuard } from "./common/authz/roles.guard";
import { AuthzModule } from "./common/authz/authz.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    SupabaseAdminModule,
    ScopeResolverModule,
    AuditModule,
    EventsModule,
    AnalyticsModule,
    WhatsAppIntentsModule,
    FinanceModule,
    CustomerModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    CatalogModule,
    ProductsModule,
    CategoriesModule,
    CheckoutModule,
    OrdersModule,
    InventoryModule,
    CouponsModule,
    LoyaltyModule,
    MerchantsModule,
    MerchantUsersModule,
    MerchantApplicationsModule,
    ShippingModule,
    JenniModule,
    UploadsModule,
    NotificationsModule,
    WebhooksModule,
    JobsModule,
    AdminModule,
    MarketplaceModule,
    StoreIntegrationModule,
    AuthzModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
