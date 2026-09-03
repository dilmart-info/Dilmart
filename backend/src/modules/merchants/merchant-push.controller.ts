import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  ForbiddenException,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor, ActorContext } from "../../common/authz/actor-context.decorator";
import { MerchantPushService } from "./merchant-push.service";
import {
  ExplicitRegisterPushSubscriptionDto,
  ExplicitTestPushSubscriptionDto,
  ListPushSubscriptionsQueryDto,
  RegisterPushSubscriptionDto,
  TestPushSubscriptionDto,
} from "./merchant-push.dto";

@Controller()
export class MerchantPushController {
  constructor(private readonly pushService: MerchantPushService) {}

  @Get("merchant/push/vapid-public-key")
  @Roles("merchant_owner", "merchant_manager", "merchant_staff", "admin", "super_admin")
  getVapidPublicKey() {
    return this.pushService.getVapidPublicKey();
  }

  // ── EXPLICIT PUSH ROUTES ──

  @Get("merchants/:id/push-subscriptions")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  async listExplicit(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.listSubscriptionsExplicit(id, actor);
  }

  @Post("merchants/:id/push-subscriptions")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  async registerExplicit(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() payload: ExplicitRegisterPushSubscriptionDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.registerSubscriptionExplicit(id, payload, actor);
  }

  @Post("merchants/:id/push-subscriptions/test")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  async testExplicit(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() payload: ExplicitTestPushSubscriptionDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.sendTestNotificationExplicit(id, payload, actor);
  }

  @Delete("merchants/:id/push-subscriptions/:subscriptionId")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  async removeExplicit(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("subscriptionId", new ParseUUIDPipe({ version: "4" })) subscriptionId: string,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.deleteSubscriptionExplicit(id, subscriptionId, actor);
  }

  // ── LEGACY PUSH ROUTES (Admin oversight only; merchant roles rejected) ──

  @Get("merchant/push-subscriptions")
  @Roles("super_admin", "admin")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  async list(
    @Query() query: ListPushSubscriptionsQueryDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.listSubscriptions(query.merchant_id, actor);
  }

  @Post("merchant/push-subscriptions")
  @Roles("super_admin", "admin")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  async register(
    @Body() payload: RegisterPushSubscriptionDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.registerSubscription(payload, actor);
  }

  @Post("merchant/push-subscriptions/test")
  @Roles("super_admin", "admin")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  async test(
    @Body() payload: TestPushSubscriptionDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.sendTestNotification(payload, actor);
  }

  @Delete("merchant/push-subscriptions/:id")
  @Roles("super_admin", "admin")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  async remove(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) throw new ForbiddenException("Actor context required");
    return this.pushService.deleteSubscription(id, actor);
  }
}
