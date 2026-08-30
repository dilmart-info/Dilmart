import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

export type CancellationActorType = "merchant" | "customer" | "admin" | "system";

export interface CancelOrderParams {
  orderId: string;
  actorType: CancellationActorType;
  actorId?: string | null;
  reasonCode?: string | null;
  notes?: string | null;
  expectedMerchantId?: string | null;
  markMerchantRejected?: boolean;
  idempotencyKey?: string | null;
}

@Injectable()
export class OrderCancellationService {
  private readonly logger = new Logger(OrderCancellationService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async cancelOrder(params: CancelOrderParams) {
    const {
      orderId,
      actorType,
      actorId = null,
      reasonCode = null,
      notes = null,
      expectedMerchantId = null,
      markMerchantRejected = false,
      idempotencyKey = null,
    } = params;

    const effectiveIdempotencyKey = idempotencyKey || `${actorType}-cancel:${orderId}:${reasonCode || "default"}`;

    const { data: result, error } = await this.supabaseAdmin.client.rpc("cancel_order_atomic", {
      p_order_id: orderId,
      p_actor_type: actorType,
      p_actor_id: actorId,
      p_reason_code: reasonCode,
      p_notes: notes,
      p_expected_merchant_id: expectedMerchantId,
      p_mark_merchant_rejected: markMerchantRejected,
      p_idempotency_key: effectiveIdempotencyKey,
    });

    if (error) {
      this.logger.error(`Atomic cancellation RPC failed for order ${orderId}: ${error.message}`);

      if (error.message.includes("JENNI_SHIPMENT_DISPATCHED")) {
        throw new BadRequestException({
          code: "JENNI_SHIPMENT_DISPATCHED",
          message: "لا يمكن إلغاء الطلب محلياً لوجود شحنة نشطة مع شركة التوصيل جني. يرجى التواصل مع الإدارة أو إلغاء الشحنة أولاً.",
        });
      }

      if (error.message.includes("Cannot cancel completed order")) {
        throw new BadRequestException({
          code: "ORDER_IMMUTABLE",
          message: "لا يمكن إلغاء طلب مكتمل أو مسترجع",
        });
      }

      if (error.message.includes("Merchant scope mismatch") || error.message.includes("not found")) {
        throw new ForbiddenException("الطلب غير موجود أو غير تابع لهذا التاجر");
      }

      throw new BadRequestException(error.message || "فشلت عملية إلغاء الطلب");
    }

    const orderNumber = result?.order_number || "";
    const isAlreadyCancelled = result?.already_cancelled === true;

    // Notifications are handled asynchronously via the PostgreSQL transaction outbox table

    return {
      success: true,
      ...result,
    };
  }
}
