import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { CouponsService } from "./coupons.service";
import { ListCouponsQueryDto, UpsertCouponDto, ValidateCouponDto } from "./coupons.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor } from "../../common/authz/actor-context.decorator";

@Controller("coupons")
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @Get()
  list(
    @Query() query: ListCouponsQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.couponsService.listCoupons({
      merchant_id: query.merchant_id,
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("validate")
  validate(@Body() payload: ValidateCouponDto) {
    return this.couponsService.validateCoupon(payload);
  }

  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  @Post()
  upsert(
    @Body() payload: UpsertCouponDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.couponsService.upsertCoupon({
      ...payload,
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  @Delete(":id")
  delete(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ListCouponsQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.couponsService.deleteCoupon(id, query.merchant_id, {
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }
}
