import { Controller, Get, Query, UsePipes, ValidationPipe } from "@nestjs/common";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { MerchantsService } from "./merchants.service";
import { LegacyMerchantDashboardQueryDto } from "./merchants.dto";

@Controller("merchant")
export class MerchantDashboardController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get("dashboard")
  @Roles("super_admin", "admin")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  getMerchantDashboard(
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
    @Query() query?: LegacyMerchantDashboardQueryDto
  ) {
    return this.merchantsService.getMyMerchantDashboard(
      {
        actor_role: actor?.actorRole,
        actor_id: actor?.actorId,
      },
      query?.merchant_id
    );
  }
}

