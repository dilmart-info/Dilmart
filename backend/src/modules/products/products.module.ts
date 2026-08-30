import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { ScopeResolverModule } from "../scope-resolver/scope-resolver.module";
import { AuditModule } from "../audit/audit.module";
import { CategoriesModule } from "../categories/categories.module";
import { AdminMerchantProductsImportController } from "./admin-merchant-products-import.controller";
import { MerchantProductsController } from "./merchant-products.controller";
import { ProductContentBulkService } from "./product-content-bulk.service";
import { ProductImportService } from "./product-import.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [SupabaseAdminModule, ScopeResolverModule, AuditModule, CategoriesModule],
  controllers: [ProductsController, MerchantProductsController, AdminMerchantProductsImportController],
  providers: [ProductsService, ProductImportService, ProductContentBulkService],
  exports: [ProductsService, ProductImportService, ProductContentBulkService],
})
export class ProductsModule {}
