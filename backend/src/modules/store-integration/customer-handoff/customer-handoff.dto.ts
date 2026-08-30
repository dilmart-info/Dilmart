/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Request DTOs.
 * Fields are @IsOptional so the service performs the authoritative bounded validation and
 * returns the safe structured error contract (§14.5) rather than a raw pipe 400. Decorators
 * are still required so the global `whitelist:true` ValidationPipe does not strip them.
 */
import { Type } from "class-transformer";
import { IsOptional, IsString, ValidateNested } from "class-validator";

export class PrepareHandoffDto {
  @IsOptional()
  @IsString()
  state?: string;
}

export class RedeemDeviceDto {
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class RedeemHandoffDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RedeemDeviceDto)
  device?: RedeemDeviceDto;
}
