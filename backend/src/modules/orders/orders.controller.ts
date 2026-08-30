import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Res, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { Roles } from "../../common/authz/roles.decorator";
import { ActorContext, CurrentActor } from "../../common/authz/actor-context.decorator";
import { JenniStickerService } from "../jenni/jenni-sticker.service";
import { JenniClientService } from "../jenni/jenni-client.service";
import {
  AdminOverrideDeliveryStatusDto,
  AgentOrdersQueryDto,
  CancelOrderDto,
  CreateManualOrderDto,
  CreateOrderDto,
  DeliveryFailureDto,
  DeliveryStatusNoteDto,
  GetOrderDetailQueryDto,
  MerchantAcceptOrderDto,
  MerchantRejectOrderDto,
  TrackOrderDto,
  UpdateOrderAgentDto,
  UpdateOrderNotesDto,
  UpdateOrderStatusDto,
} from "./orders.dto";

import { OrderReturnsService } from "./order-returns.service";
import {
  CustomerCancelOrderDto,
  CreateReturnRequestDto,
  ReviewReturnRequestDto,
  ReviewCancellationRequestDto,
  CompleteRefundDto,
  MerchantReviewReturnRequestDto,
  AdminReviewReturnRequestDto,
} from "./orders.dto";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly jenniStickerService: JenniStickerService,
    private readonly jenniClientService: JenniClientService,
    private readonly orderReturnsService: OrderReturnsService,
  ) {}

  @Get()
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  list(
    @Query("merchant_id") merchantId?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("date_from") dateFrom?: string,
    @Query("date_to") dateTo?: string,
    @Query("merchant_decision_status") merchantDecisionStatus?: string,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.ordersService.listOrders({
      merchant_id: merchantId,
      status,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      date_from: dateFrom,
      date_to: dateTo,
      merchant_decision_status: merchantDecisionStatus,
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post()
  @Roles("super_admin", "admin")
  create(@Body() payload: CreateOrderDto) {
    return this.ordersService.createOrder(payload);
  }

  @Post("manual")
  @Roles("super_admin", "admin")
  createManual(
    @Body() payload: CreateManualOrderDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.ordersService.createManualOrder({ ...payload, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Get("agents/list")
  @Roles("super_admin", "admin")
  getAgents() {
    return this.ordersService.getAgents();
  }

  @Get("agents/:agentId/orders")
  @Roles("super_admin", "admin", "agent")
  getAgentOrders(@Param("agentId") agentId: string, @Query() query: AgentOrdersQueryDto, @CurrentActor() actor: ActorContext) {
    if (actor.actorRole === "agent" && agentId !== actor.actorId) {
      throw new ForbiddenException("Agent can only view own orders.");
    }
    return this.ordersService.getAgentOrders(agentId, query);
  }

  @Get("my-orders")
  @Roles("authenticated")
  getMyOrders(@CurrentActor() actor: ActorContext) {
    return this.ordersService.getMyOrders(actor);
  }

  @Get(":id/detail")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getDetail(
    @Param("id") id: string,
    @Query() query: GetOrderDetailQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.ordersService.getOrderDetail(id, { ...query, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Get(":id")
  @Roles("super_admin", "admin")
  getById(@Param("id") id: string) {
    return this.ordersService.getOrder(id);
  }

  @Post(":id/cancel")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  cancel(@Param("id") id: string, @Body() body: CancelOrderDto, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.ordersService.cancelOrder(id, body.reason, actor);
  }

  @Post(":id/admin-override-delivery")
  @Roles("super_admin", "admin")
  adminOverrideDelivery(
    @Param("id") id: string,
    @Body() body: AdminOverrideDeliveryStatusDto,
    @CurrentActor() actor?: ActorContext,
  ) {
    return this.ordersService.adminOverrideDeliveryStatus(id, body.next_status, body.reason, actor);
  }

  @Post(":id/status")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  updateStatus(
    @Param("id") id: string,
    @Body() payload: UpdateOrderStatusDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.ordersService.updateOrderStatus(id, { ...payload, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Post(":id/merchant-accept")
  @Roles("merchant_owner", "merchant_manager")
  merchantAccept(
    @Param("id") id: string,
    @Body() payload: MerchantAcceptOrderDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.ordersService.merchantAcceptOrder(id, payload, actor);
  }

  @Post(":id/merchant-reject")
  @Roles("merchant_owner", "merchant_manager")
  merchantReject(
    @Param("id") id: string,
    @Body() payload: MerchantRejectOrderDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.ordersService.merchantRejectOrder(id, payload, actor);
  }

  @Post(":id/notes")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  updateNotes(
    @Param("id") id: string,
    @Body() payload: UpdateOrderNotesDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.ordersService.updateOrderNotes(id, { ...payload, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Post(":id/agent")
  @Roles("super_admin", "admin")
  updateAgent(@Param("id") id: string, @Body() payload: UpdateOrderAgentDto, @CurrentActor() actor: ActorContext) {
    return this.ordersService.updateOrderAgent(id, payload, actor);
  }

  @Post(":id/delivery/picked-up")
  @Roles("super_admin", "admin", "agent")
  markPickedUp(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.ordersService.markDeliveryPickedUp(id, actor);
  }

  @Post(":id/delivery/in-transit")
  @Roles("super_admin", "admin", "agent")
  markInTransit(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.ordersService.markDeliveryInTransit(id, actor);
  }

  @Post(":id/delivery/delivered")
  @Roles("super_admin", "admin", "agent")
  markDeliveryDelivered(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.ordersService.markDeliveryDelivered(id, actor);
  }

  @Post(":id/delivery/failed")
  @Roles("super_admin", "admin", "agent")
  markDeliveryFailed(@Param("id") id: string, @Body() payload: DeliveryFailureDto, @CurrentActor() actor: ActorContext) {
    return this.ordersService.markDeliveryFailed(id, payload, actor);
  }

  @Post(":id/delivery/note")
  @Roles("super_admin", "admin", "agent")
  addDeliveryNote(@Param("id") id: string, @Body() payload: DeliveryStatusNoteDto, @CurrentActor() actor: ActorContext) {
    return this.ordersService.addDeliveryNote(id, payload.notes ?? "", actor);
  }

  @Get(":id/delivery/events")
  @Roles("super_admin", "admin", "agent")
  listDeliveryEvents(@Param("id") id: string, @Query("limit") limit: string | undefined, @CurrentActor() actor: ActorContext) {
    return this.ordersService.listDeliveryEvents(id, limit ? Number(limit) : 100, actor);
  }

  @Post("track")
  track(@Body() payload: TrackOrderDto) {
    return this.ordersService.trackOrder(payload);
  }

  // ── Jenni Sticker (proxy — no storage) ──────────────────────────────────

  @Get(":id/jenni-sticker")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  async getJenniSticker(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
    @Res() res: any,
  ) {
    // Service resolves user_id → merchant_id internally via merchant_users table
    const pdfBuffer = await this.jenniStickerService.getStickerForOrder(
      id,
      actor.actorRole,
      actor.actorId,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="sticker-${id}.pdf"`);
    res.send(pdfBuffer);
  }

  // ── Jenni Cancel Shipment ───────────────────────────────────────────────

  @Delete(":id/jenni-shipment")
  @Roles("super_admin", "admin")
  async cancelJenniShipment(@Param("id") id: string) {
    return this.ordersService.cancelJenniShipment(id);
  }

  // ── Jenni Modify COD ───────────────────────────────────────────────────

  @Patch(":id/jenni-cod")
  @Roles("super_admin", "admin")
  async modifyJenniCod(@Param("id") id: string, @Body() body: { amount_iqd: number }) {
    return this.ordersService.modifyJenniCod(id, body.amount_iqd);
  }

  // ── Customer Cancellation & Return Requests ─────────────────────────────

  @Post(":id/customer-cancel")
  @Roles("authenticated")
  async customerCancelOrder(
    @Param("id") id: string,
    @Body() payload: CustomerCancelOrderDto,
    @CurrentActor() actor: ActorContext,
  ) {
    if (!actor.actorId) throw new UnauthorizedException("يجب تسجيل الدخول للإلغاء");
    return this.orderReturnsService.requestCustomerCancellation({
      orderId: id,
      actorId: actor.actorId,
      reasonCode: payload.reason_code,
      reasonDetails: payload.reason_details,
    });
  }

  @Post(":id/return-request")
  @Roles("authenticated")
  async createReturnRequest(
    @Param("id") id: string,
    @Body() payload: CreateReturnRequestDto,
    @CurrentActor() actor: ActorContext,
  ) {
    if (!actor.actorId) throw new UnauthorizedException("يجب تسجيل الدخول لتقديم طلب إرجاع");
    return this.orderReturnsService.createReturnRequest({
      orderId: id,
      actorId: actor.actorId,
      reasonCode: payload.reason_code,
      reasonDetails: payload.reason_details,
    });
  }

  @Get(":id/return-request")
  @Roles("authenticated")
  async getReturnRequestStatus(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ) {
    if (!actor.actorId) throw new UnauthorizedException("يجب تسجيل الدخول للاستعلام");
    return this.orderReturnsService.getReturnRequestStatus(id, actor.actorId);
  }

  // ── Merchant Scoped Cancellation & Return Endpoints ────────────────────────

  @Get("merchant/cancellation-requests")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  async listMerchantCancellationRequests(@CurrentActor() actor: ActorContext) {
    return this.orderReturnsService.listCancellationRequests(actor);
  }

  @Post("merchant/cancellation-requests/:id/review")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  async reviewMerchantCancellationRequest(
    @Param("id") id: string,
    @Body() payload: ReviewCancellationRequestDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.orderReturnsService.reviewCancellationRequest({
      requestId: id,
      actor,
      decision: payload.decision,
      reviewNotes: payload.review_notes,
    });
  }

  @Get("merchant/return-requests")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  async listMerchantReturnRequests(@CurrentActor() actor: ActorContext) {
    return this.orderReturnsService.listReturnRequests(actor);
  }

  @Post("merchant/return-requests/:id/review")
  @Roles("merchant_owner", "merchant_manager")
  async reviewMerchantReturnRequest(
    @Param("id") id: string,
    @Body() payload: MerchantReviewReturnRequestDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.orderReturnsService.reviewReturnRequest({
      returnRequestId: id,
      actor,
      decision: payload.action,
      merchantNotes: payload.merchant_notes,
    });
  }

  // ── Admin Global Cancellation & Return Endpoints ──────────────────────────

  @Get("admin/cancellation-requests")
  @Roles("super_admin", "admin")
  async listAdminCancellationRequests(@CurrentActor() actor: ActorContext) {
    return this.orderReturnsService.listCancellationRequests(actor);
  }

  @Post("admin/cancellation-requests/:id/review")
  @Roles("super_admin", "admin")
  async reviewAdminCancellationRequest(
    @Param("id") id: string,
    @Body() payload: ReviewCancellationRequestDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.orderReturnsService.reviewCancellationRequest({
      requestId: id,
      actor,
      decision: payload.decision,
      reviewNotes: payload.review_notes,
    });
  }

  @Get("admin/return-requests")
  @Roles("super_admin", "admin")
  async listAdminReturnRequests(@CurrentActor() actor: ActorContext) {
    return this.orderReturnsService.listReturnRequests(actor);
  }

  @Post("admin/return-requests/:id/review")
  @Roles("super_admin", "admin")
  async reviewAdminReturnRequest(
    @Param("id") id: string,
    @Body() payload: AdminReviewReturnRequestDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.orderReturnsService.reviewReturnRequest({
      returnRequestId: id,
      actor,
      decision: payload.action,
      adminNotes: payload.admin_notes,
    });
  }

  @Post("admin/return-requests/:id/mark-received")
  @Roles("super_admin", "admin")
  async markReturnItemReceived(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.orderReturnsService.markReturnItemReceived(id, actor);
  }

  @Post("admin/return-requests/:id/complete-refund")
  @Roles("super_admin", "admin")
  async completeManualRefund(
    @Param("id") id: string,
    @Body() payload: CompleteRefundDto,
    @CurrentActor() actor: ActorContext,
  ) {
    return this.orderReturnsService.completeManualRefund({
      returnRequestId: id,
      actor,
      refundAmount: payload.refund_amount,
      refundReference: payload.refund_reference,
      adminNotes: payload.admin_notes,
    });
  }
}

