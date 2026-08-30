import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

