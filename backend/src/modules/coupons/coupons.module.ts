import { Module } from "@nestjs/common";
import { CouponsController } from "./coupons.controller";
import { CouponsService } from "./coupons.service";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { ScopeResolverModule } from "../scope-resolver/scope-resolver.module";

@Module({
  imports: [SupabaseAdminModule, ScopeResolverModule],
  controllers: [CouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}

