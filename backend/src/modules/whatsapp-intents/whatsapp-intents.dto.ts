import { IsArray, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class WhatsAppIntentCartItemDto {
  @IsUUID()
  product_id!: string;

  @IsString()
  product_name!: string;

  @Type(() => Number)
  quantity!: number;

  @Type(() => Number)
  price!: number;
}

export class CreateWhatsAppIntentDto {
  @IsUUID()
  merchant_id!: string;

  @IsOptional()
  @IsUUID()
  product_id?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppIntentCartItemDto)
  cart?: WhatsAppIntentCartItemDto[];

  @IsIn(["product", "store", "cart"])
  source_surface!: "product" | "store" | "cart";

  @IsOptional()
  @IsString()
  session_id?: string;
}

export class MerchantIntentMetricsQueryDto {
  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class ResolveWhatsAppIntentQueryDto {
  @IsString()
  intent_token!: string;
}
