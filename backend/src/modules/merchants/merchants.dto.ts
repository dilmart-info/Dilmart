import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { Type } from "class-transformer";

@ValidatorConstraint({ name: "isDateRangeValid", async: false })
export class IsDateRangeValidConstraint implements ValidatorConstraintInterface {
  validate(_: any, args: ValidationArguments) {
    const obj = args.object as { from?: string; to?: string };
    if (obj.from && obj.to) {
      const fromTime = new Date(obj.from).getTime();
      const toTime = new Date(obj.to).getTime();
      if (isNaN(fromTime) || isNaN(toTime)) return true;
      return fromTime <= toTime;
    }
    return true;
  }

  defaultMessage() {
    return "'from' date must be earlier than or equal to 'to' date.";
  }
}

export class MerchantFinanceStatementQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @IsIn(["pending", "accrued", "payable", "in_payout", "settled", "reversed", "disputed"])
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @Validate(IsDateRangeValidConstraint)
  to?: string;
}

export class MerchantPayoutHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "approved", "processing", "settled", "cancelled"])
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @Validate(IsDateRangeValidConstraint)
  to?: string;
}

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

export class ListMerchantCustomersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
