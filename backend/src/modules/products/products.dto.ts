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

  // ─── Marketplace Segmentation Fields ──────────────────────────────────────
  /**
   * Who can see this product.
   * Values: 'customer' | 'business' | 'wholesale' | 'all'
   * Default: ['all']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  target_audience?: string[];

  /**
   * Business types or domain tags this product targets.
   * Values: generic configurable strings, e.g. 'all'
   * Default: ['all']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  business_type_tags?: string[];

  /**
   * Product use cases (multi-value generic tags).
   * Values: generic category/use-case strings
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  product_use_cases?: string[];

  /**
   * Surfaces where this product appears.
   * Values: 'web_store' | 'customer_app' | 'all'
   * Default: ['web_store']
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

  /** True if this is a B2B/wholesale offer. */
  @IsOptional()
  @IsBoolean()
  is_b2b_offer?: boolean;

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

export class MerchantProductImportPreviewDto {
  @IsUUID("4")
  merchant_id!: string;
}

export class MerchantProductImportConfirmDto {
  @IsUUID("4")
  import_id!: string;

  @IsUUID("4")
  merchant_id!: string;
}

export class MerchantProductDuplicateDto {
  @IsUUID("4")
  merchant_id!: string;
}

export class MerchantBulkActionDto {
  @IsUUID("4")
  merchant_id!: string;

  @IsArray()
  @IsUUID("4", { each: true })
  product_ids!: string[];

  @IsIn(["activate", "deactivate", "update_stock", "change_category", "adjust_price_percent", "archive"])
  action!: "activate" | "deactivate" | "update_stock" | "change_category" | "adjust_price_percent" | "archive";

  @IsOptional()
  payload?: Record<string, any>;
}

export class MerchantQuickAddProductDto {
  @IsUUID("4")
  merchant_id!: string;

  @IsString()
  name!: string;

  @IsUUID("4")
  category_id!: string;

  @IsNumber()
  @Min(0.01)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateProductStatusDto {
  @IsBoolean()
  is_active!: boolean;

  /**
   * Optional on the DTO class for platform admin compatibility.
   * Required at runtime for all merchant roles (merchant_owner, merchant_manager, merchant_staff),
   * where omission throws BadRequestException("merchant_id is required.").
   */
  @IsOptional()
  @IsUUID("4")
  merchant_id?: string;
}
