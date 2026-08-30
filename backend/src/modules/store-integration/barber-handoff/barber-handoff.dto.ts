/**
 * Barber Handoff request DTOs. Fields are @IsOptional so the service performs the authoritative
 * bounded validation and returns the safe structured error contract rather than a raw pipe 400.
 */
import { IsOptional, IsString } from "class-validator";

export class PrepareBarberHandoffDto {
  @IsOptional()
  @IsString()
  state?: string;
}

export class RedeemBarberHandoffDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;
}
