import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CheckoutService } from "./checkout.service";
import { CheckoutPreviewDto, CheckoutSubmitDto } from "./checkout.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { ActorContext, CurrentActor } from "../../common/authz/actor-context.decorator";
import { CheckoutAttemptsService } from "../orders/checkout-attempts.service";

@Controller("checkout")
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly checkoutAttemptsService: CheckoutAttemptsService
  ) {}

  @Post("preview")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  preview(@Body() payload: CheckoutPreviewDto) {
    return this.checkoutService.preview(payload);
  }

  @Post("submit")
  @Roles("authenticated")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  submit(@Body() payload: CheckoutSubmitDto, @CurrentActor() actor: ActorContext) {
    return this.checkoutService.submit(payload, actor.actorId);
  }

  @Get("attempts/:attemptId")
  @Roles("authenticated")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  getAttemptStatus(
    @Param("attemptId") attemptId: string,
    @CurrentActor() actor: ActorContext
  ) {
    return this.checkoutAttemptsService.getAttemptStatus(actor, attemptId);
  }
}

