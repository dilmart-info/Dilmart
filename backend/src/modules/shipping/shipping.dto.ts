import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateDeliveryCompanyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(["gross_remittance", "net_remittance"])
  cod_remittance_mode?: "gross_remittance" | "net_remittance";

  @IsOptional()
  @IsBoolean()
  allow_courier_fee_offset?: boolean;

  @IsOptional()
  @IsIn(["daily", "weekly", "custom"])
  default_remittance_cycle?: "daily" | "weekly" | "custom";

  @IsOptional()
  @IsString()
  remittance_notes?: string;
}

export class UpsertDeliveryPriceDto {
  @IsUUID()
  governorate_id!: string;

  @IsNumber()
  price!: number;
}

export class UpdateDeliveryCompanyPolicyDto {
  @IsOptional()
  @IsIn(["gross_remittance", "net_remittance"])
  cod_remittance_mode?: "gross_remittance" | "net_remittance";

  @IsOptional()
  @IsBoolean()
  allow_courier_fee_offset?: boolean;

  @IsOptional()
  @IsIn(["daily", "weekly", "custom"])
  default_remittance_cycle?: "daily" | "weekly" | "custom";

  @IsOptional()
  @IsString()
  remittance_notes?: string | null;
}
