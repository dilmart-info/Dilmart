import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { ProductContentBulkUpdateDto } from "./product-content-bulk.dto";
import { ProductContentBulkService } from "./product-content-bulk.service";
import { ProductImportService } from "./product-import.service";

/**
 * Admin-on-behalf-of-merchant product import + content bulk update.
 */
@Controller("admin/merchants/:merchantId/products")
export class AdminMerchantProductsImportController {
  constructor(
    private readonly productImportService: ProductImportService,
    private readonly productContentBulkService: ProductContentBulkService,
  ) {}

  @Get("import-template")
  @Roles("super_admin", "admin")
  async getImportTemplate(@Res() res: { setHeader: (k: string, v: string) => void; send: (b: string) => void }) {
    const template = await this.productImportService.getImportTemplate();
    res.setHeader("Content-Type", template.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${template.filename}"`);
    res.send(template.body);
  }

  @Post("import/preview")
  @Roles("super_admin", "admin")
  @UseInterceptors(FileInterceptor("file"))
  previewImport(
    @Param("merchantId") merchantId: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("CSV file is required.");
    }
    return this.productImportService.previewForAdmin(merchantId, file.buffer, file.originalname, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("import/confirm")
  @Roles("super_admin", "admin")
  confirmImport(
    @Param("merchantId") merchantId: string,
    @Body() payload: { import_id: string },
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productImportService.confirmForAdmin(merchantId, payload.import_id, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("content/bulk-update")
  @Roles("super_admin", "admin")
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  bulkUpdateContent(
    @Param("merchantId") merchantId: string,
    @Body() payload: ProductContentBulkUpdateDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productContentBulkService.bulkUpdateContent(merchantId, payload, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }
}
