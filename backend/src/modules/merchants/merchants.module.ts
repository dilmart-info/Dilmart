import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MerchantDashboardController } from "./merchant-dashboard.controller";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { ScopeResolverModule } from "../scope-resolver/scope-resolver.module";
import { MerchantsController } from "./merchants.controller";
import { MerchantsService } from "./merchants.service";
import { MerchantNotificationsController } from "./merchant-notifications.controller";
import { MerchantNotificationsService } from "./merchant-notifications.service";
import { MerchantPushController } from "./merchant-push.controller";
import { MerchantPushService } from "./merchant-push.service";

@Module({
  imports: [SupabaseAdminModule, ScopeResolverModule, ConfigModule],
  controllers: [
    MerchantsController,
    MerchantDashboardController,
    MerchantNotificationsController,
    MerchantPushController,
  ],
  providers: [MerchantsService, MerchantNotificationsService, MerchantPushService],
  exports: [MerchantsService, MerchantNotificationsService, MerchantPushService],
})
export class MerchantsModule {}
