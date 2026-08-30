import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class UploadProductImageDto {
  /** Client hint only; the server picks extension from detected image type. */
  @IsString()
  @MaxLength(255)
  file_name!: string;

  @IsString()
  @MaxLength(64)
  content_type!: string;

  @IsString()
  @MaxLength(12_000_000)
  base64_data!: string;

  /** Required for merchant roles when not uploading for a specific product (e.g. logo). */
  @IsOptional()
  @IsUUID()
  merchant_id?: string;

  /** When set, must belong to the caller's merchant (or any merchant for platform admins). */
  @IsOptional()
  @IsUUID()
  product_id?: string;
}
