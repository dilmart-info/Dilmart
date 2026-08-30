import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";

export class ValidateCouponDto {
  @IsString()
  code!: string;

  @IsNumber()
  total!: number;

  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class UpsertCouponDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  code!: string;

  @IsString()
  discount_type!: "fixed" | "percentage";

  @IsNumber()
  value!: number;

  @IsNumber()
  @IsOptional()
  min_order_amount?: number;

  @IsOptional()
  @IsNumber()
  max_uses?: number | null;

  @IsOptional()
  @IsString()
  expires_at?: string | null;

  @IsOptional()
  @IsUUID()
  merchant_id?: string | null;

  @IsBoolean()
  is_active!: boolean;
}
