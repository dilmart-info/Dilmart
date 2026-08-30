import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [ConfigModule, SupabaseAdminModule],
  controllers: [HealthController],
})
export class HealthModule {}

