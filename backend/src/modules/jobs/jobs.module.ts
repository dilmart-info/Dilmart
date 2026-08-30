import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AnalyticsModule } from "../analytics/analytics.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { MerchantsModule } from "../merchants/merchants.module";
import { JobsService } from "./jobs.service";

@Module({
  imports: [ConfigModule, SupabaseAdminModule, AnalyticsModule, NotificationsModule, MerchantsModule],
  providers: [JobsService],
})
export class JobsModule {}

