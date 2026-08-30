import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { IsIraqiPhone } from "../../common/validators/iraqi-phone.validator";
import { NoHtmlTags } from "../../common/validators/no-html-tags.validator";

/** Client sends only identity + quantity; prices and merchant come from the database. */
export class CheckoutItemDto {
  @IsUUID()
  product_id!: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}

export class CheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsOptional()
  @IsUUID()
  merchant_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  coupon_code?: string;

  /** Required for Jenni delivery fee in preview totals. */
  @IsOptional()
  @IsUUID()
  governorate_id?: string;
}

export class CheckoutSubmitDto extends CheckoutPreviewDto {
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
  @IsNumber()
  @Type(() => Number)
  points_spent?: number;

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

  @IsOptional()
  @IsUUID()
  checkout_attempt_id?: string;

  @IsOptional()
  save_address?: boolean;
}

