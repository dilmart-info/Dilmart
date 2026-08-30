import { Body, Controller, Post } from "@nestjs/common";
import { UploadsService } from "./uploads.service";
import { UploadProductImageDto } from "./uploads.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import type { ActorContext } from "../../common/authz/actor-context.decorator";

@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("products/image")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  uploadProductImage(@Body() payload: UploadProductImageDto, @CurrentActor() actor: ActorContext) {
    return this.uploadsService.uploadProductImage(payload, actor);
  }
}
