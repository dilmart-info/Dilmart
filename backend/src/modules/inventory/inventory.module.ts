import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { ScopeResolverModule } from "../scope-resolver/scope-resolver.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [SupabaseAdminModule, ScopeResolverModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
