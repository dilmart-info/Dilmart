import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { CouponsService } from "./coupons.service";
import { UpsertCouponDto, ValidateCouponDto } from "./coupons.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor } from "../../common/authz/actor-context.decorator";

@Controller("coupons")
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @Get()
  list(@Query("merchant_id") merchantId?: string, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.couponsService.listCoupons({ merchant_id: merchantId, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Post("validate")
  validate(@Body() payload: ValidateCouponDto) {
    return this.couponsService.validateCoupon(payload);
  }

  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  @Post()
  upsert(@Body() payload: UpsertCouponDto, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.couponsService.upsertCoupon({ ...payload, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  @Delete(":id")
  delete(
    @Param("id") id: string,
    @Query("merchant_id") merchantId?: string,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.couponsService.deleteCoupon(id, merchantId, { actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }
}
