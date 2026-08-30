import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
