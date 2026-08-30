import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class GetMerchantSettingsQueryDto {
  @IsUUID()
  merchant_id!: string;
}

export class UpsertMerchantSettingsDto {
  @IsUUID()
  merchant_id!: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;

  @IsOptional()
  @IsString()
  whatsapp_phone?: string;

  @IsOptional()
  @IsString()
  support_email?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  delivery_notes?: string;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsBoolean()
  push_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sound_enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  sound_repeat_interval_seconds?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(1800)
  sound_max_duration_seconds?: number;
}

export class CreateMerchantDto {
  @IsString()
  slug!: string;

  @IsString()
  name_ar!: string;

  @IsString()
  name_en!: string;

  @IsString()
  display_name!: string;
}

export class UpdateMerchantDto {
  @IsString()
  display_name!: string;
}

/** Full merchant lifecycle (matches frontend MerchantStatus) — the activation guard in
 *  updateMerchantStatus only special-cases "active"; every other transition (draft/suspended/
 *  archived/pending_review/rejected) is a plain status write, so the type should say so honestly
 *  rather than a callers having to cast around a narrower union that doesn't match reality. */
export class UpdateMerchantStatusDto {
  @IsString()
  status!: "draft" | "pending_review" | "active" | "suspended" | "rejected" | "archived";
}

export class AssignMerchantOwnerDto {
  @IsUUID()
  user_id!: string;
}

export class MerchantSafeUpdateDto {
  @IsOptional()
  @IsString()
  name_ar?: string;

  @IsOptional()
  @IsString()
  name_en?: string;

  @IsOptional()
  @IsString()
  display_name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  business_type?: string | null;
}

export class SettingsSafeUpdateDto {
  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  contact_phone?: string | null;

  @IsOptional()
  @IsString()
  whatsapp_phone?: string | null;

  @IsOptional()
  @IsString()
  support_email?: string | null;
}

export class OwnerSafeUpdateDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;
}

export class UpdateMerchantRegistrationDetailsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MerchantSafeUpdateDto)
  merchant?: MerchantSafeUpdateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SettingsSafeUpdateDto)
  settings?: SettingsSafeUpdateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerSafeUpdateDto)
  owner?: OwnerSafeUpdateDto;
}
