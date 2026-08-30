import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { AuditService } from "./audit.service";

@Module({
  imports: [SupabaseAdminModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
