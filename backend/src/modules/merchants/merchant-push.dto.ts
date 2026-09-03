import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class PushSubscriptionKeysDto {
  @IsString()
  @MinLength(8)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  auth!: string;
}

export class ExplicitRegisterPushSubscriptionDto {
  @IsString()
  @MinLength(8)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  device_label?: string;

  @IsOptional()
  @IsString()
  user_agent?: string;
}

export class ExplicitTestPushSubscriptionDto {
  @IsOptional()
  @IsUUID()
  subscription_id?: string;
}

export class RegisterPushSubscriptionDto {
  @IsUUID()
  merchant_id!: string;

  @IsString()
  @MinLength(8)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @IsOptional()
  @IsString()
  device_label?: string;

  @IsOptional()
  @IsString()
  user_agent?: string;
}

export class ListPushSubscriptionsQueryDto {
  @IsUUID()
  merchant_id!: string;
}

export class TestPushSubscriptionDto {
  @IsUUID()
  merchant_id!: string;

  @IsOptional()
  @IsUUID()
  subscription_id?: string;
}

export class AcknowledgeNotificationDto {
  @IsOptional()
  @IsUUID()
  device_id?: string;

  @IsOptional()
  @IsBoolean()
  opened?: boolean;
}

export class UpsertMerchantAlertSettingsFields {
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
