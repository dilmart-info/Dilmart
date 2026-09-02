import { BadRequestException, Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { ProductsService } from "./products.service";
import { ProductImportService } from "./product-import.service";
import {
  MerchantBulkActionDto,
  MerchantProductDuplicateDto,
  MerchantProductImportConfirmDto,
  MerchantProductImportPreviewDto,
  MerchantQuickAddProductDto,
} from "./products.dto";

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
    @Body() body: MerchantProductImportPreviewDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("CSV file is required.");
    }
    if (!body?.merchant_id) {
      throw new BadRequestException("merchant_id is required.");
    }
    return this.productImportService.previewForMerchant(file.buffer, file.originalname, body.merchant_id, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("import/confirm")
  @Roles("merchant_owner", "merchant_manager")
  confirmImport(
    @Body() payload: MerchantProductImportConfirmDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    if (!payload?.merchant_id) {
      throw new BadRequestException("merchant_id is required.");
    }
    return this.productImportService.confirmForMerchant(payload.import_id, payload.merchant_id, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("bulk-action")
  @Roles("merchant_owner", "merchant_manager")
  bulkAction(
    @Body() payload: MerchantBulkActionDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    if (!payload?.merchant_id) {
      throw new BadRequestException("merchant_id is required.");
    }
    return this.productsService.performBulkAction(payload, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("quick-add")
  @Roles("merchant_owner", "merchant_manager")
  quickAdd(
    @Body() payload: MerchantQuickAddProductDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    if (!payload?.merchant_id) {
      throw new BadRequestException("merchant_id is required.");
    }
    return this.productsService.quickAddProduct(payload, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post(":id/duplicate")
  @Roles("merchant_owner", "merchant_manager")
  duplicateProduct(
    @Param("id") id: string,
    @Body() body: MerchantProductDuplicateDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    if (!body?.merchant_id) {
      throw new BadRequestException("merchant_id is required.");
    }
    return this.productsService.duplicateProduct(id, body.merchant_id, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }
}
