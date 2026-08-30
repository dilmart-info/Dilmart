import { BadRequestException, Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { ProductsService } from "./products.service";
import { ProductImportService } from "./product-import.service";

@Controller("merchant/products")
export class MerchantProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productImportService: ProductImportService,
  ) {}

  @Get("import-template")
  @Roles("merchant_owner", "merchant_manager")
  async getImportTemplate(@Res() res: any) {
    const template = await this.productImportService.getImportTemplate();
    res.setHeader("Content-Type", template.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${template.filename}"`);
    res.send(template.body);
  }

  @Post("import/preview")
  @Roles("merchant_owner", "merchant_manager")
  @UseInterceptors(FileInterceptor("file"))
  previewImport(
    @UploadedFile() file: any,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("CSV file is required.");
    }
    return this.productImportService.previewForMerchant(file.buffer, file.originalname, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("import/confirm")
  @Roles("merchant_owner", "merchant_manager")
  confirmImport(
    @Body() payload: { import_id: string },
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productImportService.confirmForMerchant(payload.import_id, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("bulk-action")
  @Roles("merchant_owner", "merchant_manager")
  bulkAction(
    @Body()
    payload: {
      product_ids: string[];
      action: "activate" | "deactivate" | "update_stock" | "change_category" | "adjust_price_percent" | "archive";
      payload?: Record<string, any>;
    },
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productsService.performBulkAction(payload, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("quick-add")
  @Roles("merchant_owner", "merchant_manager")
  quickAdd(
    @Body()
    payload: {
      name: string;
      category_id: string;
      price: number;
      stock?: number;
      image_url?: string;
      description?: string;
      is_active?: boolean;
    },
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productsService.quickAddProduct(payload, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post(":id/duplicate")
  @Roles("merchant_owner", "merchant_manager")
  duplicateProduct(@Param("id") id: string, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.productsService.duplicateProduct(id, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }
}

