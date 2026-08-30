import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  ForbiddenException,
} from "@nestjs/common";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor, ActorContext } from "../../common/authz/actor-context.decorator";
import { MerchantPushService } from "./merchant-push.service";
import {
  ListPushSubscriptionsQueryDto,
  RegisterPushSubscriptionDto,
  TestPushSubscriptionDto,
} from "./merchant-push.dto";

@Controller()
@Roles("merchant_owner", "merchant_manager", "merchant_staff", "admin", "super_admin")
export class MerchantPushController {
  constructor(private readonly pushService: MerchantPushService) {}

  @Get("merchant/push/vapid-public-key")
  getVapidPublicKey() {
    return this.pushService.getVapidPublicKey();
  }

  @Get("merchant/push-subscriptions")
  async list(
    @Query() query: ListPushSubscriptionsQueryDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.listSubscriptions(query.merchant_id, actor);
  }

  @Post("merchant/push-subscriptions")
  async register(
    @Body() payload: RegisterPushSubscriptionDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.registerSubscription(payload, actor);
  }

  @Post("merchant/push-subscriptions/test")
  async test(
    @Body() payload: TestPushSubscriptionDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.sendTestNotification(payload, actor);
  }

  @Delete("merchant/push-subscriptions/:id")
  async remove(
    @Param("id") id: string,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.deleteSubscription(id, actor);
  }
}
