import { Transform } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class UpdateCustomerProfileDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString({ message: "full_name must be a string." })
  @IsNotEmpty({ message: "full_name cannot be empty." })
  @MinLength(2, { message: "full_name must be at least 2 characters." })
  @MaxLength(100, { message: "full_name cannot exceed 100 characters." })
  full_name!: string;
}

export class UpsertCustomerAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  recipient_name!: string;

  @IsString()
  recipient_phone!: string;

  @IsOptional()
  @IsUUID()
  governorate_id?: string | null;

  @IsString()
  area!: string;

  @IsOptional()
  @IsString()
  nearest_landmark?: string | null;

  @IsOptional()
  @IsString()
  map_url?: string | null;

  @IsOptional()
  @IsString()
  delivery_notes?: string | null;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class GetCustomerOrdersQueryDto {
  @IsOptional()
  @IsString()
  limit?: string;
}

export class RequestAccountDeletionDto {
  @IsBoolean({ message: "confirmed must be a boolean." })
  @IsNotEmpty({ message: "confirmed is required." })
  confirmed!: boolean;

  @IsOptional()
  @IsString({ message: "reason must be a string." })
  @MaxLength(500, { message: "reason cannot exceed 500 characters." })
  reason?: string;
}

