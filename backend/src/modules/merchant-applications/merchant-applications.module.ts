import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { AdminMerchantApplicationsController, MerchantApplicationsController } from "./merchant-applications.controller";
import { MerchantApplicationsService } from "./merchant-applications.service";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [MerchantApplicationsController, AdminMerchantApplicationsController],
  providers: [MerchantApplicationsService],
})
export class MerchantApplicationsModule {}
