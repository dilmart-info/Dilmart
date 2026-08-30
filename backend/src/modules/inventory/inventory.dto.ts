import { IsInt, IsOptional, IsString, IsUUID } from "class-validator";

export class GetInventoryQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}

export class AdjustInventoryDto {
  @IsUUID()
  product_id!: string;

  @IsInt()
  delta!: number;

  @IsOptional()
  @IsUUID()
  merchant_id?: string;
}
