import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../../modules/supabase-admin/supabase-admin.module";
import { SupabaseActorResolverService } from "./supabase-actor-resolver.service";

@Module({
  imports: [SupabaseAdminModule],
  providers: [SupabaseActorResolverService],
  exports: [SupabaseActorResolverService],
})
export class AuthzModule {}

