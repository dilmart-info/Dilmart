import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CheckoutService } from "./checkout.service";
import { CheckoutPreviewDto, CheckoutSubmitDto } from "./checkout.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { AuthSources } from "../../common/authz/auth-source";
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

  // "authenticated" allows guests through (no token → actorId undefined = guest checkout).
  // The service derives user identity exclusively from actorId, never from the request body.
  @Post("submit")
  @Roles("authenticated")
  @AuthSources("supabase", "DilMart_federated") // STORE-PR5 §14: DUAL_CUSTOMER (guest still allowed via no-token path).
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  submit(@Body() payload: CheckoutSubmitDto, @CurrentActor() actor: ActorContext) {
    // STORE-PR5 §Phase C — identity (and its source) come ONLY from the verified actor, never the body.
    // A federated actor's order is associated with actor.actorId (the Store customer) and no provisional
    // Supabase user is ever created for it.
    return this.checkoutService.submit(payload, actor.actorId, actor.authSource);
  }

  @Get("attempts/:attemptId")
  @Roles("authenticated")
  @AuthSources("supabase", "DilMart_federated") // STORE-PR5 §14: DUAL_CUSTOMER (own attempt).
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  getAttemptStatus(
    @Param("attemptId") attemptId: string,
    @CurrentActor() actor: ActorContext
  ) {
    return this.checkoutAttemptsService.getAttemptStatus(actor, attemptId);
  }
}
