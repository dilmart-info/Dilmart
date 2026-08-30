import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsInt()
  sort_order!: number;

  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @IsOptional()
  @IsString()
  image_url?: string | null;

  @IsOptional()
  @IsString()
  icon_url?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(["normal", "wide", "promo"])
  layout_variant?: "normal" | "wide" | "promo";

  @IsOptional()
  @IsString()
  background_color?: string | null;

  @IsOptional()
  @IsString()
  text_color?: string | null;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  @IsOptional()
  @IsString()
  image_url?: string | null;

  @IsOptional()
  @IsString()
  icon_url?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(["normal", "wide", "promo"])
  layout_variant?: "normal" | "wide" | "promo";

  @IsOptional()
  @IsString()
  background_color?: string | null;

  @IsOptional()
  @IsString()
  text_color?: string | null;
}
