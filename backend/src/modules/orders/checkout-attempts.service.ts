import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ActorContext } from "../../common/authz/actor-context.decorator";

export interface CreateAttemptResult {
  isExisting: boolean;
  status: "processing" | "completed" | "failed";
  orderId?: string | null;
  orderNumber?: string | null;
}

@Injectable()
export class CheckoutAttemptsService {
  private readonly logger = new Logger(CheckoutAttemptsService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  computeRequestHash(payload: any): string {
    const canonical = JSON.stringify({
      customer_name: payload.customer_name?.trim() || "",
      customer_phone: payload.customer_phone?.trim() || "",
      governorate_id: payload.governorate_id || "",
      area: payload.area?.trim() || "",
      nearest_landmark: payload.nearest_landmark?.trim() || "",
      coupon_code: payload.coupon_code?.trim() || payload.coupon_id || "",
      points_spent: Math.max(0, Math.floor(Number(payload.points_spent || 0))),
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      map_url: payload.map_url?.trim() || "",
      notes: payload.notes?.trim() || "",
      items: Array.isArray(payload.items)
        ? [...payload.items]
            .sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)))
            .map((item) => ({
              product_id: item.product_id,
              quantity: Math.max(1, Math.floor(Number(item.quantity))),
            }))
        : [],
    });

    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  async beginAttempt(
    userId: string,
    attemptId: string,
    requestHash: string
  ): Promise<CreateAttemptResult> {
    // Check existing attempt
    const { data: existing, error } = await this.supabaseAdmin.client
      .from("checkout_attempts")
      .select("*")
      .eq("id", attemptId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Error querying checkout_attempts: ${error.message}`);
      throw new BadRequestException("فشل الاستعلام عن محاولة الطلب");
    }

    if (existing) {
      if (existing.user_id !== userId) {
        throw new ForbiddenException("غير مسموح بإنشاء أو الوصول لمحاولة طلب حساب آخر");
      }

      if (existing.request_hash !== requestHash) {
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
          message: "تم استخدام مفتاح المحاولة السابق مع بيانات طلب مختلفة",
        });
      }

      // Existing attempt with matching hash
      if (existing.status === "completed" && existing.order_number) {
        return {
          isExisting: true,
          status: "completed",
          orderId: existing.order_id,
          orderNumber: existing.order_number,
        };
      }

      // If processing but order already linked
      if (existing.order_id && existing.order_number) {
        return {
          isExisting: true,
          status: "completed",
          orderId: existing.order_id,
          orderNumber: existing.order_number,
        };
      }

      return {
        isExisting: true,
        status: existing.status as any,
        orderId: existing.order_id,
        orderNumber: existing.order_number,
      };
    }

    // Insert new processing attempt with concurrency conflict handling
    const { error: insertError } = await this.supabaseAdmin.client
      .from("checkout_attempts")
      .insert({
        id: attemptId,
        user_id: userId,
        request_hash: requestHash,
        status: "processing",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      // If unique constraint error (concurrent insert race), re-fetch existing attempt
      if (insertError.code === "23505" || insertError.message.includes("duplicate key")) {
        const { data: reFetched } = await this.supabaseAdmin.client
          .from("checkout_attempts")
          .select("*")
          .eq("id", attemptId)
          .maybeSingle();
        if (reFetched) {
          if (reFetched.user_id !== userId) {
            throw new ForbiddenException("غير مسموح بإنشاء أو الوصول لمحاولة طلب حساب آخر");
          }
          if (reFetched.request_hash !== requestHash) {
            throw new ConflictException({
              code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
              message: "تم استخدام مفتاح المحاولة السابق مع بيانات طلب مختلفة",
            });
          }
          return {
            isExisting: true,
            status: reFetched.status as any,
            orderId: reFetched.order_id,
            orderNumber: reFetched.order_number,
          };
        }
      }
      this.logger.error(`Failed to insert checkout_attempt: ${insertError.message}`);
      throw new BadRequestException("فشل تسجيل محاولة الطلب الجديدة");
    }

    return {
      isExisting: false,
      status: "processing",
    };
  }

  async completeAttempt(attemptId: string, orderId: string, orderNumber: string, requestHash?: string) {
    await this.supabaseAdmin.client
      .from("checkout_attempts")
      .update({
        status: "completed",
        order_id: orderId,
        order_number: orderNumber,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", attemptId);

    // Link attempt on order row
    await this.supabaseAdmin.client
      .from("orders")
      .update({
        checkout_attempt_id: attemptId,
        checkout_request_hash: requestHash || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  }

  async failAttempt(attemptId: string, errorCode?: string) {
    await this.supabaseAdmin.client
      .from("checkout_attempts")
      .update({
        status: "failed",
        error_code: errorCode || "UNKNOWN_ERROR",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attemptId);
  }

  async getAttemptStatus(actor: ActorContext, attemptId: string) {
    if (!actor.actorId) {
      throw new ForbiddenException("يجب تسجيل الدخول للاستعلام عن محاولة الطلب");
    }

    const { data: attempt, error } = await this.supabaseAdmin.client
      .from("checkout_attempts")
      .select("*")
      .eq("id", attemptId)
      .maybeSingle();

    if (error || !attempt) {
      throw new NotFoundException("محاولة الطلب غير موجودة");
    }

    if (attempt.user_id !== actor.actorId) {
      throw new ForbiddenException("غير مسموح بإنشاء أو الوصول لمحاولة طلب حساب آخر");
    }

    return {
      id: attempt.id,
      status: attempt.status,
      order_id: attempt.order_id,
      order_number: attempt.order_number,
      error_code: attempt.error_code,
      created_at: attempt.created_at,
      completed_at: attempt.completed_at,
    };
  }

  // ─── B2B Store Session Methods ──────────────────────────────────────────────

  /**
   * Computes a canonical SHA-256 request hash for B2B cart checkout.
   *
   * Includes all fields that define a unique logical checkout request.
   * Does NOT include: session token, transient timestamps, client prices,
   * server-generated order number, or server-computed financial snapshot.
   *
   * Cart items are sourced from the resolved cart (sorted product_id + quantity).
   */
  computeB2BRequestHash(payload: {
    store_linked_profile_id: string;
    store_cart_id: string;
    customer_name: string;
    customer_phone: string;
    governorate_id: string;
    area: string;
    nearest_landmark?: string;
    notes?: string;
    latitude?: number | null;
    longitude?: number | null;
    map_url?: string | null;
  }): string {
    const canonical = JSON.stringify({
      store_linked_profile_id: payload.store_linked_profile_id,
      store_cart_id: payload.store_cart_id,
      customer_name: payload.customer_name?.trim() || "",
      customer_phone: payload.customer_phone?.trim() || "",
      governorate_id: payload.governorate_id || "",
      area: payload.area?.trim() || "",
      nearest_landmark: payload.nearest_landmark?.trim() || "",
      notes: payload.notes?.trim() || "",
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      map_url: payload.map_url?.trim() || "",
    });

    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  /**
   * Retrieves B2B checkout attempt status, scoped to store_linked_profile_id.
   *
   * For completed attempts, returns the existing order details — enabling
   * lost-response recovery without re-running product/pricing validation.
   */
  async getB2BAttemptStatus(linkedProfileId: string, attemptId: string) {
    const { data: attempt, error } = await this.supabaseAdmin.client
      .from("checkout_attempts")
      .select("*")
      .eq("id", attemptId)
      .maybeSingle();

    if (error || !attempt) {
      throw new NotFoundException("محاولة الطلب غير موجودة");
    }

    if (attempt.store_linked_profile_id !== linkedProfileId) {
      throw new ForbiddenException("غير مسموح بالوصول لمحاولة طلب مرتبطة بحساب آخر");
    }

    return {
      id: attempt.id,
      status: attempt.status,
      order_id: attempt.order_id,
      order_number: attempt.order_number,
      error_code: attempt.error_code,
      created_at: attempt.created_at,
      completed_at: attempt.completed_at,
    };
  }
}
