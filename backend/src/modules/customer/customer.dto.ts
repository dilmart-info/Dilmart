import { IsBoolean, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
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
