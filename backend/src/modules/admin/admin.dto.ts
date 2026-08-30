import { IsEmail, IsString, MinLength } from "class-validator";

export class CreateAgentDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(2)
  full_name!: string;

  @IsString()
  @MinLength(10)
  phone!: string;
}

export class UpdateLoyaltySettingsDto {
  points_per_dinar?: number;
  dinar_per_point?: number;
  min_spend_to_redeem?: number;
  points_expiry_days?: number;
  is_active?: boolean;
}
