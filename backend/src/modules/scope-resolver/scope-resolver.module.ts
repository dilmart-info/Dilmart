import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { ScopeResolverService } from "./scope-resolver.service";

@Module({
  imports: [SupabaseAdminModule],
  providers: [ScopeResolverService],
  exports: [ScopeResolverService],
})
export class ScopeResolverModule {}
