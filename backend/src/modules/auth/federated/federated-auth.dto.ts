/**
 * STORE-PR4 — Federated auth request DTOs. Fields are @IsOptional so the service performs the
 * authoritative bounded validation + returns the safe structured error (§14.5). Decorators are still
 * required so the global whitelist:true ValidationPipe does not strip them.
 */
import { Type } from "class-transformer";
import { IsOptional, IsString, ValidateNested } from "class-validator";

export class FederatedDeviceDto {
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() appVersion?: string;
  @IsOptional() @IsString() deviceId?: string;
}

export class RefreshDto {
  @IsOptional() @IsString() refreshToken?: string;
  @IsOptional() @ValidateNested() @Type(() => FederatedDeviceDto) device?: FederatedDeviceDto;
}

export class LogoutDto {
  @IsOptional() @IsString() refreshToken?: string;
}
