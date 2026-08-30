import { Module } from "@nestjs/common";
import { ScopeResolverModule } from "../scope-resolver/scope-resolver.module";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  imports: [SupabaseAdminModule, ScopeResolverModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}

