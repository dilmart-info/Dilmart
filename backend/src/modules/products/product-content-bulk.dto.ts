import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

/** Exactly these three fields; forbidNonWhitelisted rejects anything else. */
export class ProductContentBulkItemDto {
  @IsString()
  merchant_sku!: string;

  @IsString()
  short_description!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class ProductContentBulkUpdateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductContentBulkItemDto)
  items!: ProductContentBulkItemDto[];
}
