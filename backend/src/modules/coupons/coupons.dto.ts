import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class ListCouponsQueryDto {
  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class ValidateCouponDto {
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  code!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  total!: number;

  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class UpsertCouponDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  code!: string;

  @IsIn(["fixed", "percentage"])
  discount_type!: "fixed" | "percentage";

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  value!: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  min_order_amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_uses?: number | null;

  @IsOptional()
  @IsISO8601()
  expires_at?: string | null;

  @IsOptional()
  @IsUUID()
  merchant_id?: string | null;

  @IsBoolean()
  is_active!: boolean;
}
