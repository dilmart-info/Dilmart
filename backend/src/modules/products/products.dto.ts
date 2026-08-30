import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

export class UpsertProductDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Required on create (enforced in service). Optional on update; empty → null for legacy. */
  @IsOptional()
  @IsString()
  short_description?: string | null;

  @IsNumber()
  price!: number;

  @IsOptional()
  @IsNumber()
  discount_price?: number | null;

  @IsOptional()
  @IsUUID()
  category_id?: string | null;

  @IsNumber()
  stock!: number;

  @IsNumber()
  purchase_price!: number;

  @IsNumber()
  low_stock_threshold!: number;

  @IsBoolean()
  is_active!: boolean;

  @IsOptional()
  @IsBoolean()
  is_published?: boolean;

  @IsOptional()
  @IsIn(["public", "private", "archived"])
  visibility_status?: "public" | "private" | "archived";

  @IsBoolean()
  is_featured!: boolean;

  @IsBoolean()
  is_new!: boolean;

  @IsBoolean()
  is_best_seller!: boolean;

  @IsOptional()
  @IsString()
  offer_ends_at?: string | null;

  @IsArray()
  images!: string[];

  @IsOptional()
  @IsString()
  brand?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sizes?: string[];

  @IsOptional()
  @IsString()
  dimensions?: string | null;

  @IsOptional()
  @IsNumber()
  weight_grams?: number | null;

  @IsBoolean()
  loyalty_points_enabled!: boolean;

  @IsUUID()
  merchant_id!: string;

  /** Optional create-time merchant identity; updates may only repeat the existing value. */
  @IsOptional()
  @IsString()
  merchant_sku?: string | null;

  // ─── B2B Segmentation Fields ───────────────────────────────────────────────

  /**
   * Who can see this product.
   * Values: 'customer' | 'barber_staff' | 'salon_owner' | 'professional_buyer' | 'all'
   * Default: ['all']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  target_audience?: string[];

  /**
   * Business types this product targets.
   * Values: 'men_barbershop' | 'women_salon' | 'nail_studio' | 'beauty_center' | 'spa' | 'all'
   * Default: ['all']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  business_type_tags?: string[];

  /**
   * Product use cases (multi-value).
   * Values: 'personal_tool' | 'barber_tool' | 'salon_equipment' | 'consumable' |
   *         'furniture' | 'professional_cosmetic' | 'setup_package' | 'wholesale' |
   *         'nail_tool' | 'beauty_equipment' | 'hair_care' | 'beard_care' | 'sterilization'
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  product_use_cases?: string[];

  /**
   * Surfaces where this product appears.
   * Values: 'web_store' | 'barber_app' | 'customer_app' | 'all'
   * Default: ['web_store'] — products are NOT exposed to barber_app unless configured.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visible_in?: string[];

  /**
   * How this product can be purchased.
   * Values: 'retail' | 'b2b' | 'wholesale' | 'quote_request'
   * Default: ['retail']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  purchase_mode?: string[];

  /** True if this is a B2B-specific offer with special pricing. */
  @IsOptional()
  @IsBoolean()
  is_b2b_offer?: boolean;

  /** True if buyer must be a verified DilMart salon to purchase. */
  @IsOptional()
  @IsBoolean()
  requires_verified_salon?: boolean;

  /** Minimum order quantity for B2B/wholesale. */
  @IsOptional()
  @IsNumber()
  min_order_qty?: number | null;

  /** Maximum order quantity. */
  @IsOptional()
  @IsNumber()
  max_order_qty?: number | null;
}

export class ProductScopeQueryDto {
  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class ListProductsQueryDto {
  @IsOptional()
  @IsUUID()
  merchant_id?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsIn(["all", "ready", "not_ready"])
  readiness?: "all" | "ready" | "not_ready";
}

