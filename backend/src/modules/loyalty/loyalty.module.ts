import { Module } from "@nestjs/common";
import { LoyaltyController } from "./loyalty.controller";
import { LoyaltyService } from "./loyalty.service";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
})
export class LoyaltyModule {}

