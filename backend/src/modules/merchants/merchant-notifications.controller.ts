import { Controller, Get, Post, Param, Query, Body, ForbiddenException } from "@nestjs/common";
import { MerchantNotificationsService } from "./merchant-notifications.service";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor, ActorContext } from "../../common/authz/actor-context.decorator";
import { AcknowledgeNotificationDto } from "./merchant-push.dto";

@Controller("merchant/notifications")
@Roles("merchant_owner", "merchant_manager", "merchant_staff", "admin", "super_admin")
export class MerchantNotificationsController {
  constructor(private readonly notificationsService: MerchantNotificationsService) {}

  @Get()
  async listNotifications(
    @Query("merchant_id") merchantId: string,
    @Query("limit") limit?: string,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) {
      throw new ForbiddenException("Actor context required");
    }
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.notificationsService.listNotifications(merchantId, actor, parsedLimit);
  }

  @Post(":id/acknowledge")
  async acknowledge(
    @Param("id") id: string,
    @Body() body: AcknowledgeNotificationDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) {
      throw new ForbiddenException("Actor context required");
    }
    return this.notificationsService.acknowledge(id, actor, {
      deviceId: body?.device_id,
      opened: body?.opened === true,
    });
  }

  @Post(":id/read")
  async markAsRead(
    @Param("id") id: string,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) {
      throw new ForbiddenException("Actor context required");
    }
    return this.notificationsService.markAsRead(id, actor);
  }

  @Post("mark-all-read")
  async markAllAsRead(
    @Body("merchant_id") merchantIdBody: string | undefined,
    @Query("merchant_id") merchantIdQuery: string | undefined,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) {
      throw new ForbiddenException("Actor context required");
    }
    const merchantId = merchantIdBody ?? merchantIdQuery;
    if (!merchantId) {
      throw new ForbiddenException("Merchant ID is required.");
    }
    return this.notificationsService.markAllAsRead(merchantId, actor);
  }

  @Post("read-all")
  async readAll(
    @Body("merchant_id") merchantIdBody: string | undefined,
    @Query("merchant_id") merchantIdQuery: string | undefined,
    @CurrentActor() actor?: ActorContext,
  ) {
    if (!actor) {
      throw new ForbiddenException("Actor context required");
    }
    const merchantId = merchantIdBody ?? merchantIdQuery;
    if (!merchantId) {
      throw new ForbiddenException("Merchant ID is required.");
    }
    return this.notificationsService.markAllAsRead(merchantId, actor);
  }
}
