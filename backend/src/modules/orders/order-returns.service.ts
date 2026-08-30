import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { OrderCancellationService } from "./order-cancellation.service";
import { DeliveryOperationsService } from "../shipping/delivery-operations.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { ActorContext } from "../../common/authz/actor-context.decorator";

export interface CustomerCancelInput {
  orderId: string;
  actorId: string;
  reasonCode?: string;
  reasonDetails?: string;
}

export interface CreateReturnRequestInput {
  orderId: string;
  actorId: string;
  reasonCode: string;
  reasonDetails?: string;
  evidenceUrls?: string[];
}

export interface ReviewCancellationRequestInput {
  requestId: string;
  actor: ActorContext;
  decision: "approved" | "rejected";
  reviewNotes?: string;
}

export interface ReviewReturnRequestInput {
  returnRequestId: string;
  actor: ActorContext;
  decision: "approved" | "rejected" | "awaiting_item" | "completed" | "approve" | "reject";
  adminNotes?: string;
  merchantNotes?: string;
}

export interface CompleteRefundInput {
  returnRequestId: string;
  actor: ActorContext;
  refundAmount: number;
  refundReference: string;
  adminNotes?: string;
}

const DEFAULT_RETURN_WINDOW_DAYS = 7;

@Injectable()
export class OrderReturnsService {
  private readonly logger = new Logger(OrderReturnsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly orderCancellationService: OrderCancellationService,
    private readonly deliveryOps: DeliveryOperationsService,
    private readonly scopeResolver: ScopeResolverService
  ) {}

  private isMerchantRole(role?: string) {
    return role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff";
  }

  async requestCustomerCancellation(input: CustomerCancelInput) {
    // 1. Fetch order details.
    //
    // provider_shipment_id is NOT a column of public.orders — it belongs to
    // order_delivery_integrations. Selecting it made PostgREST fail the whole query with 42703,
    // and the old `if (error || !order)` collapsed that into "order not found", so EVERY customer
    // cancellation returned a false 404 and never reached the atomic RPC. Carrier state is read
    // from the canonical table below instead.
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id, status, user_id, merchant_id, delivery_status, merchant_decision_status, order_number")
      .eq("id", input.orderId)
      .maybeSingle();

    // A query failure and a genuinely missing order are different things and must not be conflated.
    if (error) {
      this.logger.error(`Failed to load order ${input.orderId} for customer cancellation: ${error.message}`);
      throw error;
    }
    if (!order) {
      throw new NotFoundException("الطلب غير موجود");
    }

    // Verify ownership
    if (order.user_id !== input.actorId) {
      throw new ForbiddenException("غير مسموح بإلغاء طلب لا يخص هذا الحساب");
    }

    if (order.status === "cancelled") {
      return {
        cancelled: true,
        can_request_return: false,
        message: "الطلب ملغى بالفعل",
      };
    }

    // Check eligibility for instant cancellation (new/pending status and no active Jenni dispatch).
    const isNewOrPending = (order.status === "new" || order.status === "pending") && order.merchant_decision_status === "pending";

    // Canonical carrier state. No row means no Jenni integration, which is a valid, cancellable
    // state. A query ERROR is not: it tells us nothing about the shipment, so it fails closed
    // rather than being read as "no active shipment".
    const { data: jenniIntegration, error: integrationError } = await this.supabaseAdmin.client
      .from("order_delivery_integrations")
      .select("provider_shipment_id, dispatch_status")
      .eq("order_id", input.orderId)
      .eq("provider_code", "jenni")
      .maybeSingle();

    if (integrationError) {
      this.logger.error(
        `Failed to read Jenni integration for order ${input.orderId}: ${integrationError.message}`,
      );
      throw integrationError;
    }

    const hasCarrierShipmentId = Boolean(jenniIntegration?.provider_shipment_id?.trim());
    const hasActiveShipment =
      hasCarrierShipmentId ||
      jenniIntegration?.dispatch_status === "dispatched" ||
      order.delivery_status === "dispatched" ||
      order.delivery_status === "in_transit";

    if (isNewOrPending && !hasActiveShipment) {
      // Execute atomic cancellation immediately
      const cancelResult = await this.orderCancellationService.cancelOrder({
        orderId: input.orderId,
        actorType: "customer",
        actorId: input.actorId,
        reasonCode: input.reasonCode || "customer_requested_cancellation",
      });

      return {
        cancelled: true,
        can_request_return: false,
        message: "تم إلغاء الطلب وإعادة العناصر إلى المخزون بنجاح",
        cancellation_details: cancelResult,
      };
    }

    // If order is in preparing status and not yet shipped, create a pending cancellation request for review
    if ((order.status === "preparing" || order.merchant_decision_status === "accepted") && !hasActiveShipment) {
      // Check existing active cancellation request
      const { data: existingReq } = await this.supabaseAdmin.client
        .from("order_cancellation_requests")
        .select("id, status")
        .eq("order_id", input.orderId)
        .eq("status", "pending")
        .maybeSingle();

      if (existingReq) {
        throw new ConflictException("يوجد طلب إلغاء قيد المراجعة لهذا الطلب بالفعل");
      }

      const { data: createdReq, error: insertErr } = await this.supabaseAdmin.client
        .from("order_cancellation_requests")
        .insert({
          order_id: input.orderId,
          user_id: input.actorId,
          reason_code: input.reasonCode || "customer_cancellation_review",
          notes: input.reasonDetails ?? null,
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertErr) {
        this.logger.error(`Failed to create cancellation request: ${insertErr.message}`);
        throw new BadRequestException("فشل تقديم طلب الإلغاء للمراجعة");
      }

      // Insert admin notification
      await this.supabaseAdmin.client.from("admin_notifications").insert({
        title: `طلب إلغاء من العميل للطلب #${order.order_number}`,
        message: `الطلب قيد التجهيز. السبب: ${input.reasonCode || "بدون سبب"}`,
        link: `/admin/cancellation-requests/${createdReq.id}`,
      } as any);

      return {
        cancelled: false,
        cancellation_requested: true,
        can_request_return: false,
        message: "الطلب قيد التجهيز. تم تقديم طلب الإلغاء وهو قيد مراجعة الإدارة والتاجر حالياً.",
        request_id: createdReq.id,
      };
    }

    // If order is dispatched, in_transit, or delivered, redirect to return request
    return {
      cancelled: false,
      cancellation_requested: false,
      can_request_return: true,
      message: "الطلب تم شحنه أو تسليمه. يمكنك تقديم طلب إرجاع.",
    };
  }

  async createReturnRequest(input: CreateReturnRequestInput) {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id, status, delivery_status, delivered_at, user_id, merchant_id, order_number, created_at, updated_at")
      .eq("id", input.orderId)
      .maybeSingle();

    if (error || !order) {
      throw new NotFoundException("الطلب غير موجود");
    }

    if (order.user_id !== input.actorId) {
      throw new ForbiddenException("غير مسموح بتقديم طلب إرجاع لطلب لا يخص هذا الحساب");
    }

    // Return request is only allowed if order is delivered
    const isDelivered = order.status === "delivered" || order.delivery_status === "delivered";
    if (!isDelivered) {
      throw new BadRequestException("يمكن تقديم طلب الإرجاع فقط للطلبات المسلّمة بنجاح (delivered)");
    }

    if (!order.delivered_at) {
      throw new BadRequestException("تعذر التحقق من تاريخ التسليم المؤكد للطلب");
    }

    // Validate return window strictly from delivered_at
    const returnWindowDays = Number(process.env.RETURN_WINDOW_DAYS || DEFAULT_RETURN_WINDOW_DAYS);
    const deliveryTimestamp = new Date(order.delivered_at).getTime();
    const windowDeadline = new Date(deliveryTimestamp + returnWindowDays * 24 * 60 * 60 * 1000);

    if (new Date() > windowDeadline) {
      throw new BadRequestException(`انتهت المهلة المسموحة لتقديم طلب الإرجاع (${returnWindowDays} أيام من تاريخ التسليم الفعلية)`);
    }

    // Check if return request already exists
    const { data: existing } = await this.supabaseAdmin.client
      .from("order_return_requests")
      .select("id, status")
      .eq("order_id", input.orderId)
      .maybeSingle();

    if (existing) {
      throw new ConflictException("يوجد طلب إرجاع مسبق لهذا الطلب بالفعل");
    }

    const { data: returnReq, error: insertError } = await this.supabaseAdmin.client
      .from("order_return_requests")
      .insert({
        order_id: input.orderId,
        customer_id: input.actorId,
        merchant_id: order.merchant_id,
        reason_code: input.reasonCode,
        reason_details: input.reasonDetails ?? null,
        evidence_urls: input.evidenceUrls ?? null,
        status: "pending_review",
        refund_status: "pending_manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, status, created_at")
      .single();

    if (insertError) {
      this.logger.error(`Failed to create return request: ${insertError.message}`);
      throw new BadRequestException("فشل تقديم طلب الإرجاع");
    }

    // Insert admin notification
    await this.supabaseAdmin.client.from("admin_notifications").insert({
      title: `طلب إرجاع جديد للطلب #${order.order_number}`,
      message: `السبب: ${input.reasonCode}`,
      link: `/admin/return-requests/${returnReq.id}`,
    } as any);

    return {
      ok: true,
      return_request_id: returnReq.id,
      status: returnReq.status,
      message: "تم تقديم طلب الإرجاع وهو قيد المراجعة حالياً",
    };
  }

  async getReturnRequestStatus(orderId: string, actorId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("order_return_requests")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    if (data.customer_id !== actorId) {
      throw new ForbiddenException("غير مسموح بالاطلاع على هذا الطلب");
    }

    return data;
  }

  // ── Workflows with Strict Authorization Scoping ──────────────────────────

  async listCancellationRequests(actor: ActorContext) {
    let req = this.supabaseAdmin.client
      .from("order_cancellation_requests")
      .select("*, orders!inner(order_number, total, merchant_id, status)")
      .order("created_at", { ascending: false });

    if (this.isMerchantRole(actor.actorRole)) {
      const merchantId = await this.scopeResolver.resolveMerchantScope(undefined, actor.actorRole, actor.actorId);
      if (!merchantId) throw new ForbiddenException("يتطلب الوصول تحديد نطاق المتجر التابع له التاجر");
      req = req.eq("orders.merchant_id", merchantId);
    }

    const { data, error } = await req;
    if (error) throw error;
    return data ?? [];
  }

  async reviewCancellationRequest(input: ReviewCancellationRequestInput) {
    // Merchant ownership scoping check
    if (this.isMerchantRole(input.actor.actorRole)) {
      const { data: req, error } = await this.supabaseAdmin.client
        .from("order_cancellation_requests")
        .select("*, orders!inner(merchant_id)")
        .eq("id", input.requestId)
        .maybeSingle();

      if (error || !req) throw new NotFoundException("طلب الإلغاء غير موجود");

      const merchantId = await this.scopeResolver.resolveMerchantScope(undefined, input.actor.actorRole, input.actor.actorId);
      if ((req as any).orders?.merchant_id !== merchantId) {
        throw new ForbiddenException("غير مسموح بمراجعة طلب إلغاء لمتجر آخر");
      }
    }

    const { data: res, error: rpcError } = await this.supabaseAdmin.client.rpc(
      "review_cancellation_request_atomic" as any,
      {
        p_request_id: input.requestId,
        p_action: input.decision === "approved" ? "approve" : "reject",
        p_reviewed_by: input.actor.actorId,
        p_notes: input.reviewNotes || "",
      }
    );

    if (rpcError) {
      this.logger.error(`Failed to review cancellation request atomically: ${rpcError.message}`);
      throw new BadRequestException(rpcError.message || "فشلت عملية مراجعة طلب إلغاء الطلب");
    }

    return {
      ok: res.success,
      status: res.status,
      cancelResult: res.cancellation_result,
    };
  }

  async listReturnRequests(actor: ActorContext) {
    let req = this.supabaseAdmin.client
      .from("order_return_requests")
      .select("*, orders(order_number, total, merchant_id, status)")
      .order("created_at", { ascending: false });

    if (this.isMerchantRole(actor.actorRole)) {
      const merchantId = await this.scopeResolver.resolveMerchantScope(undefined, actor.actorRole, actor.actorId);
      if (!merchantId) throw new ForbiddenException("يتطلب الوصول تحديد نطاق المتجر التابع له التاجر");
      req = req.eq("merchant_id", merchantId);
    }

    const { data, error } = await req;
    if (error) throw error;
    return data ?? [];
  }

  async reviewReturnRequest(input: ReviewReturnRequestInput) {
    // Normalize decision aliases
    const decisionRaw = String(input.decision);
    const decision = (
      decisionRaw === "approve" ? "approved" :
      decisionRaw === "reject" ? "rejected" :
      decisionRaw
    ) as "approved" | "rejected" | "awaiting_item" | "item_received" | "completed";

    // Block completed from admin review — only via completeManualRefund
    if (decision === "completed") {
      throw new BadRequestException(
        "الحالة 'completed' لا تُعيَّن هنا — استخدم مسار complete-refund بعد استلام المنتج."
      );
    }

    let expectedMerchantId: string | null = null;
    if (this.isMerchantRole(input.actor.actorRole)) {
      const resolved = await this.scopeResolver.resolveMerchantScope(
        undefined,
        input.actor.actorRole,
        input.actor.actorId
      );

      if (!resolved) {
        throw new ForbiddenException("تعذر تحديد نطاق المتجر لهذا المستخدم");
      }
      expectedMerchantId = resolved;
    }

    const { data: res, error: rpcError } = await this.supabaseAdmin.client.rpc(
      "review_return_request_atomic" as any,
      {
        p_return_request_id: input.returnRequestId,
        p_decision: decision,
        p_actor_id: input.actor.actorId,
        p_admin_notes: input.adminNotes || "",
        p_merchant_notes: input.merchantNotes || "",
        p_expected_merchant_id: expectedMerchantId,
      }
    );

    if (rpcError) {
      this.logger.error(`Failed to review return request atomically: ${rpcError.message}`);
      throw new BadRequestException(rpcError.message || "فشلت عملية مراجعة طلب الإرجاع");
    }

    return { ok: res.success, status: res.status };
  }

  async markReturnItemReceived(returnRequestId: string, actor: ActorContext) {
    if (this.isMerchantRole(actor.actorRole)) {
      throw new ForbiddenException("هذا الإجراء مقتصر على إدارة المنصة الفنية فقط");
    }

    const { data: req, error } = await this.supabaseAdmin.client
      .from("order_return_requests")
      .select("*, orders(id, total, status)")
      .eq("id", returnRequestId)
      .maybeSingle();

    if (error || !req) throw new NotFoundException("طلب الإرجاع غير موجود");

    if (req.status === "item_received" || req.status === "completed") {
      return { ok: true, already_received: true, status: req.status };
    }

    const { data: res, error: rpcError } = await this.supabaseAdmin.client.rpc(
      "mark_return_item_received_atomic" as any,
      {
        p_request_id: returnRequestId,
        p_actor_id: actor.actorId,
        p_notes: "المنتج مسترجع وتم استلامه في مخزن المنصة",
      }
    );

    if (rpcError) {
      this.logger.error(`Failed to mark return item received atomically: ${rpcError.message}`);
      throw new BadRequestException(rpcError.message || "فشل تسجيل استلام منتج المرتجع");
    }

    return { ok: res.success, status: res.status, already_received: false };
  }

  async completeManualRefund(input: CompleteRefundInput) {
    if (this.isMerchantRole(input.actor.actorRole)) {
      throw new ForbiddenException("تسجيل الاسترداد المالي مقتصر على إدارة المنصة الفنية فقط");
    }

    const { data: res, error: rpcError } = await this.supabaseAdmin.client.rpc(
      "complete_return_refund_atomic" as any,
      {
        p_request_id: input.returnRequestId,
        p_refund_amount: input.refundAmount,
        p_refund_reference: input.refundReference,
        p_notes: input.adminNotes || "",
      }
    );

    if (rpcError) {
      this.logger.error(`Failed to complete return refund atomically: ${rpcError.message}`);
      throw new BadRequestException(rpcError.message || "فشلت عملية إكمال الاسترداد المالي");
    }

    return {
      ok: res.success,
      already_completed: Boolean(res.already_completed),
      refund_amount: res.refund_amount ?? input.refundAmount,
      refund_reference: res.refund_reference ?? input.refundReference,
    };
  }
}
