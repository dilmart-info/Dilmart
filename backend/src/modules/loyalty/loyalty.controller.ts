import { Body, Controller, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { LoyaltyService } from "./loyalty.service";
import { LoyaltyPreviewDto, LoyaltyRedeemDto } from "./loyalty.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { ActorContext, CurrentActor } from "../../common/authz/actor-context.decorator";

@Controller("loyalty")
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Post("preview")
  @HttpCode(200)
  @Roles("authenticated")
  preview(@Body() payload: LoyaltyPreviewDto, @CurrentActor() actor: ActorContext) {
    if (!actor.actorId) {
      throw new UnauthorizedException("Authentication required for loyalty operations.");
    }
    return this.loyaltyService.preview(actor.actorId, payload.subtotal);
  }

  @Post("redeem")
  @Roles("authenticated")
  redeem(@Body() payload: LoyaltyRedeemDto, @CurrentActor() actor: ActorContext) {
    if (!actor.actorId) {
      throw new UnauthorizedException("Authentication required for loyalty operations.");
    }
    return this.loyaltyService.redeem(actor.actorId, payload.points);
  }
}

