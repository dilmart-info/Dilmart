import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

// ─── View Models (Role-Based Projection) ─────────────────────────────────────

export interface OrderItemView {
  id: string;
  product_id: string;
  product_name: string;
  price: number;
  quantity: number;
}

/** What a merchant sees for an order — NO customer contact data. */
export interface MerchantFulfillmentOrderView {
  id: string;
  order_number: string;
  merchant_id: string;
  status: string;
  channel: string | null;
  created_at: string;
  updated_at: string | null;
  subtotal: number;
  discount: number;
  delivery_cost: number;
  total: number;
  payment_method: string | null;
  merchant_notes: string | null;
  governorate_name: string | null;
  items: OrderItemView[];
}

/** What delivery/agent sees — includes all contact details. */
export interface DeliveryOrderView {
  id: string;
  order_number: string;
  status: string;
  delivery_status?: string;
  customer_name: string;
  customer_phone: string;
  governorate: string | null;
  area: string;
  nearest_landmark: string | null;
  map_url: string | null;
  delivery_notes: string | null;
  total: number;
  payment_method: string | null;
  items: OrderItemView[];
}

export class CreateOrderDto {
  @IsString()
  customer_name!: string;

  @IsString()
  customer_phone!: string;

  @IsUUID()
  governorate_id!: string;

  @IsString()
  area!: string;

  @IsOptional()
  @IsUUID()
  merchant_id?: string;

  @IsOptional()
  @IsUUID()
  checkout_attempt_id?: string;

  @IsOptional()
  save_address?: boolean;
}

export class UpdateOrderStatusDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class MerchantAcceptOrderDto {
  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class MerchantRejectOrderDto {
  @IsString()
  @IsIn([
    "out_of_stock",
    "insufficient_quantity",
    "variant_unavailable",
    "product_discontinued",
    "product_damaged_or_not_ready",
    "wrong_price",
    "wrong_product_info",
    "cannot_prepare_in_time",
    "temporary_store_issue",
    "duplicate_or_suspicious",
    "order_needs_admin_review",
  ])
  reason_code!: string;

  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}


export class UpdateOrderNotesDto {
  @IsString()
  admin_notes!: string;

  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class UpdateOrderAgentDto {
  @IsOptional()
  @IsUUID()
  agent_id?: string | null;
}

export class GetOrderDetailQueryDto {
  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class AgentOrdersQueryDto {
  @IsString()
  mode!: "current" | "history";
}

export class TrackOrderDto {
  @IsString()
  order_number!: string;

  @IsString()
  phone!: string;
}

export class CancelOrderDto {
  @IsString()
  reason!: string;
}

export class AdminOverrideDeliveryStatusDto {
  @IsString()
  next_status!: string;

  @IsString()
  reason!: string;
}

export class DeliveryStatusNoteDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DeliveryFailureDto {
  @IsString()
  reason_code!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ManualOrderItemDto {
  @IsUUID()
  product_id!: string;

  @IsString()
  product_name!: string;

  @Type(() => Number)
  @IsNumber()
  price!: number;

  @Type(() => Number)
  @IsNumber()
  quantity!: number;
}

export class CreateManualOrderDto {
  @IsString()
  customer_name!: string;

  @IsString()
  customer_phone!: string;

  @IsUUID()
  governorate_id!: string;

  @IsString()
  area!: string;

  @IsOptional()
  @IsString()
  nearest_landmark?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @Type(() => Number)
  @IsNumber()
  delivery_cost!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualOrderItemDto)
  items!: ManualOrderItemDto[];

  @IsOptional()
  @IsUUID()
  intent_id?: string;

  @IsOptional()
  @IsIn(["whatsapp_assisted", "manual_assisted"])
  channel?: "whatsapp_assisted" | "manual_assisted";
}

export class CustomerCancelOrderDto {
  @IsOptional()
  @IsString()
  reason_code?: string;

  @IsOptional()
  @IsString()
  reason_details?: string;
}

export class CreateOrderReturnRequestDto {
  @IsString()
  reason_code!: string;

  @IsOptional()
  @IsString()
  reason_details?: string;

  @IsOptional()
  @IsArray()
  evidence_urls?: string[];
}

export class CreateReturnRequestDto extends CreateOrderReturnRequestDto {}

export class MerchantReviewReturnRequestDto {
  @IsString()
  @IsIn(["approve", "reject", "approved", "rejected"])
  action!: "approve" | "reject" | "approved" | "rejected";

  @IsOptional()
  @IsString()
  merchant_notes?: string;
}

export class AdminReviewReturnRequestDto {
  @IsString()
  @IsIn(["approve", "reject", "approved", "rejected", "awaiting_item"])
  action!: "approve" | "reject" | "approved" | "rejected" | "awaiting_item";

  @IsOptional()
  @IsString()
  admin_notes?: string;
}

export class ReviewReturnRequestDto {
  @IsString()
  @IsIn(["approved", "rejected", "awaiting_item", "approve", "reject"])
  decision!: "approved" | "rejected" | "awaiting_item" | "approve" | "reject";

  @IsOptional()
  @IsString()
  admin_notes?: string;

  @IsOptional()
  @IsString()
  merchant_notes?: string;
}

export class ReviewCancellationRequestDto {
  @IsString()
  @IsIn(["approved", "rejected"])
  decision!: "approved" | "rejected";

  @IsOptional()
  @IsString()
  review_notes?: string;
}

export class CompleteRefundDto {
  @Type(() => Number)
  @IsNumber()
  refund_amount!: number;

  @IsString()
  refund_reference!: string;

  @IsOptional()
  @IsString()
  admin_notes?: string;
}

export class AdminMarkReturnReceivedDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
