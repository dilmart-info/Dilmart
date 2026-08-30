import { useState } from "react";

import {
  categoryInitial,
  isCutoutArtwork,
  readableTextColor,
  resolveCategoryTileImage,
  toCategoryDisplayLabel,
} from "@/lib/category-display";

export type CategoryTileItem = {
  id: string;
  name: string;
  slug: string;
  image_url?: string | null;
  icon_url?: string | null;
  background_color?: string | null;
  text_color?: string | null;
};

/** Warm neutral artwork surface — one shared value keeps the rail and the grid identical. */
export const CATEGORY_TILE_SURFACE = "#EFE9E1";

type CategoryTileVisualProps = {
  category: CategoryTileItem;
  fallbackImage: string;
  selected?: boolean;
  /** Compact rails use a slightly smaller label than the mobile discovery grid. */
  labelClassName?: string;
};

/**
 * Image-dominant category tile: artwork square on top, label underneath.
 *
 * The label never sits on the artwork, so a category `background_color` can never
 * make the name unreadable.
 */
export default function CategoryTileVisual({
  category,
  fallbackImage,
  selected = false,
  labelClassName = "text-[11px] md:text-[12px]",
}: CategoryTileVisualProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const src = resolveCategoryTileImage(category, fallbackImage);
  // Keyed by source: a category that receives new artwork retries instead of
  // staying stuck on the previous failure.
  const broken = failedSrc === src;
  const surface = category.background_color?.trim() || CATEGORY_TILE_SURFACE;
  const contained = isCutoutArtwork(src);

  return (
    <>
      <span
        className={`relative block aspect-[1/1.05] w-full overflow-hidden rounded-t-2xl rounded-b-none transition-shadow ${
          selected ? "ring-2 ring-DilMart-store-gold" : "ring-1 ring-black/5"
        }`}
        style={{ backgroundColor: surface }}
      >
        {broken ? (
          <span className="flex h-full w-full items-center justify-center">
            <span
              className="font-display text-2xl font-semibold opacity-70"
              style={{ color: readableTextColor(surface, category.text_color) }}
              aria-hidden
            >
              {categoryInitial(category.name)}
            </span>
          </span>
        ) : (
          <img
            src={src}
            alt=""
            aria-hidden
            loading="lazy"
            className={`h-full w-full transition-transform duration-300 md:group-hover:scale-[1.04] ${
              contained ? "object-contain p-2.5" : "object-cover"
            }`}
            onError={() => setFailedSrc(src)}
          />
        )}
      </span>
      <span
        className={`mt-[6px] block line-clamp-2 text-center font-semibold leading-[1.28] text-foreground ${labelClassName}`}
      >
        {toCategoryDisplayLabel(category.name)}
      </span>
    </>
  );
}
