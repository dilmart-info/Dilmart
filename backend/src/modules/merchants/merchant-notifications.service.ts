import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { ActorContext } from "../../common/authz/actor-context.decorator";

@Injectable()
export class MerchantNotificationsService {
  private readonly logger = new Logger(MerchantNotificationsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  async listNotifications(merchantId: string, actor: ActorContext, limit?: number) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(merchantId, actor.actorRole, actor.actorId);
    if (!resolvedMerchantId) {
      throw new ForbiddenException("Merchant scope is required.");
    }

    // Default limit is 50. Clamp limit between 1 and 100, and handle NaN.
    let resolvedLimit = 50;
    if (limit !== undefined && limit !== null) {
      if (Number.isNaN(limit)) {
        resolvedLimit = 50;
      } else {
        resolvedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
      }
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_notifications")
      .select("*")
      .eq("merchant_id", resolvedMerchantId)
      .order("created_at", { ascending: false })
      .limit(resolvedLimit);

    if (error) {
      this.logger.error(`Failed to list merchant notifications: ${error.message}`);
      throw error;
    }

    return data;
  }

  async markAsRead(id: string, actor: ActorContext) {
    const { data: notification, error: fetchError } = await this.supabaseAdmin.client
      .from("merchant_notifications")
      .select("merchant_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      this.logger.error(`Failed to fetch notification for read update: ${fetchError.message}`);
      throw fetchError;
    }

    if (!notification) {
      throw new NotFoundException("Notification not found.");
    }

    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(notification.merchant_id, actor.actorRole, actor.actorId);
    if (!resolvedMerchantId) {
      throw new ForbiddenException("Access denied to this merchant scope.");
    }

    const { error } = await this.supabaseAdmin.client
      .from("merchant_notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("merchant_id", resolvedMerchantId);

    if (error) {
      this.logger.error(`Failed to mark notification as read: ${error.message}`);
      throw error;
    }

    return { success: true };
  }

  async markAllAsRead(merchantId: string, actor: ActorContext) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(merchantId, actor.actorRole, actor.actorId);
    if (!resolvedMerchantId) {
      throw new ForbiddenException("Merchant scope is required.");
    }

    const { error } = await this.supabaseAdmin.client
      .from("merchant_notifications")
      .update({ is_read: true })
      .eq("merchant_id", resolvedMerchantId)
      .eq("is_read", false);

    if (error) {
      this.logger.error(`Failed to mark all notifications as read: ${error.message}`);
      throw error;
    }

    return { success: true };
  }

  /**
   * Idempotent acknowledgement for new-order alerts.
   * Safe to call repeatedly; does not allow cross-merchant ack.
   */
  async acknowledge(
    id: string,
    actor: ActorContext,
    options?: { deviceId?: string; opened?: boolean },
  ) {
    if (!actor.actorId) {
      throw new ForbiddenException("Actor context required");
    }

    const { data: notification, error: fetchError } = await this.supabaseAdmin.client
      .from("merchant_notifications")
      .select("merchant_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      this.logger.error(`Failed to fetch notification for acknowledge: ${fetchError.message}`);
      throw fetchError;
    }
    if (!notification) {
      throw new NotFoundException("Notification not found.");
    }

    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(
      notification.merchant_id,
      actor.actorRole,
      actor.actorId,
    );
    if (!resolvedMerchantId) {
      throw new ForbiddenException("Access denied to this merchant scope.");
    }

    const { data: updated, error } = await this.supabaseAdmin.client.rpc(
      "acknowledge_merchant_notification_atomic",
      {
        p_notification_id: id,
        p_expected_merchant_id: resolvedMerchantId,
        p_actor_id: actor.actorId,
        p_device_id: options?.deviceId || null,
        p_opened: Boolean(options?.opened),
      },
    );

    if (error) {
      this.logger.error(`Failed to acknowledge notification: ${error.message}`);
      throw new BadRequestException(`فشل تأكيد الإشعار: ${error.message}`);
    }

    return updated;
  }
}
