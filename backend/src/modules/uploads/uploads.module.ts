import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
