/**
 * cart.dto.ts
 *
 * Request DTOs for Phase 4B Cart endpoints and Phase 5A Cart Checkout.
 *
 * Security contract:
 *   - Client NEVER sends price, unit_price, discount_price, or line_total.
 *   - Backend fetches all pricing from DB and rejects any price field if sent.
 *   - Only productId and quantity are accepted from the client for cart operations.
 *   - For checkout, client sends delivery details only; prices are re-fetched from DB.
 */

import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { IsIraqiPhone } from "../../common/validators/iraqi-phone.validator";
import { NoHtmlTags } from "../../common/validators/no-html-tags.validator";

export class AddCartItemDto {
  /**
   * UUID of the product to add.
   * Backend will fetch product details, price, and visibility from DB.
   * Client must NOT send price — it will be ignored if present.
   */
  @IsUUID()
  productId!: string;

  /**
   * Quantity to add. Must be ≥ 1.
   * Backend enforces min_order_qty and max_order_qty from the product record.
   */
  @IsInt()
  @Min(1)
  @Max(9999)
  quantity!: number;
}

export class UpdateCartItemDto {
  /**
   * New quantity. Must be ≥ 1.
   * To remove an item, use DELETE /cart/items/:itemId instead.
   */
  @IsInt()
  @Min(1)
  @Max(9999)
  quantity!: number;
}

/**
 * CartCheckoutPreviewDto — Phase 5A
 *
 * Used for POST /cart/checkout/preview.
 * Requires governorate_id to calculate Jenni delivery cost.
 * Other fields are optional and used for coupon validation.
 */
export class CartCheckoutPreviewDto {
  @IsUUID()
  governorate_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  coupon_code?: string;
}

/**
 * CartCheckoutSubmitDto — Phase 5A
 *
 * Used for POST /cart/checkout.
 * All delivery address fields required except nearest_landmark, notes, GPS.
 * Prices are NEVER accepted from client — re-fetched from DB.
 */
export class CartCheckoutSubmitDto {
  @IsString()
  @MaxLength(100)
  @NoHtmlTags()
  customer_name!: string;

  @IsIraqiPhone({ message: "رقم الهاتف يجب أن يكون بصيغة عراقية صحيحة (07XXXXXXXXX أو +9647XXXXXXXXX)." })
  customer_phone!: string;

  @IsUUID()
  governorate_id!: string;

  @IsString()
  @MaxLength(200)
  @NoHtmlTags()
  area!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @NoHtmlTags()
  nearest_landmark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @NoHtmlTags()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  coupon_code?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\//, { message: "map_url must be a valid HTTP/HTTPS URL." })
  map_url?: string | null;

  /**
   * Client-generated idempotency key (UUID v4).
   * When supplied, enables:
   *   - at-most-once order creation
   *   - completed-attempt replay returning existing order
   *   - lost-response recovery via GET /cart/checkout/attempts/:attemptId
   * When omitted (old mobile clients), server generates one internally.
   */
  @IsOptional()
  @IsUUID()
  checkout_attempt_id?: string;
}
