import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [ConfigModule, SupabaseAdminModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

