import { IsNumber, Min } from "class-validator";
import { Type } from "class-transformer";

export class LoyaltyPreviewDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  subtotal!: number;
}

export class LoyaltyRedeemDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  points!: number;
}
