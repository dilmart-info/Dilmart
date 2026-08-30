import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class RegisterMerchantApplicationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  owner_full_name!: string;

  @IsString()
  owner_phone!: string;

  @IsString()
  store_name_ar!: string;

  @IsString()
  store_name_en!: string;

  @IsString()
  display_name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "slug must be kebab-case lowercase." })
  slug!: string;

  @IsString()
  city!: string;

  @IsString()
  address!: string;

  @IsString()
  contact_phone!: string;

  @IsOptional()
  @IsEmail()
  support_email?: string;

  @IsOptional()
  @IsString()
  business_type?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class RejectMerchantApplicationDto {
  @IsString()
  reason!: string;
}
