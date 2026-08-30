import { Controller, Get, Query } from "@nestjs/common";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { MerchantsService } from "./merchants.service";

@Controller("merchant")
export class MerchantDashboardController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get("dashboard")
  @Roles("merchant_owner", "merchant_manager", "merchant_staff", "admin", "super_admin")
  getMerchantDashboard(
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
    @Query("merchant_id") merchantId?: string
  ) {
    return this.merchantsService.getMyMerchantDashboard(
      {
        actor_role: actor?.actorRole,
        actor_id: actor?.actorId,
      },
      merchantId
    );
  }
}

