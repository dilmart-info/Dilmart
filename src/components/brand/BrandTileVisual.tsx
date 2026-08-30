import { useState } from "react";

import { CATEGORY_TILE_SURFACE } from "@/components/category/CategoryTileVisual";
import { clampLogoScale, getBrandLogo } from "@/lib/brand-logo-registry";
import type { MarketplaceBrand } from "@/lib/marketplace-brands.types";

const SURFACE_INK = "#14110F";

// Safe-area ceiling the logo box shrinks from. A brand's optional `logoScale`
// (0.80–1.00) multiplies these, it never grows past them.
const LOGO_MAX_HEIGHT_PX = 19;
const LOGO_MAX_WIDTH_PERCENT = 76;

type BrandTileVisualProps = {
  brand: MarketplaceBrand;
};

/**
 * Brand card: logo (or brand-name text fallback) pill on top, representative
 * product image below — the reverse of `CategoryTileVisual` (image on top),
 * matching the requested AliExpress/Noon brand-row composition. Shared by the
 * home `BrandRail` and the `/brands` page so both stay visually identical.
 */
export default function BrandTileVisual({ brand }: BrandTileVisualProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);

  const hasImage = Boolean(brand.imageUrl) && !imageBroken;
  const logo = getBrandLogo(brand.name);
  const showLogo = Boolean(logo) && !logoBroken;
  const scale = clampLogoScale(logo?.logoScale);

  return (
    <>
      <span
        className="flex h-[31px] w-full items-center justify-center overflow-hidden rounded-full px-2.5 md:h-8"
        style={{ backgroundColor: CATEGORY_TILE_SURFACE }}
      >
        {showLogo ? (
          <img
            src={logo!.logoUrl}
            alt={`شعار ${brand.name}`}
            loading="lazy"
            className="w-auto object-contain object-center"
            style={{
              maxHeight: `${LOGO_MAX_HEIGHT_PX * scale}px`,
              maxWidth: `${LOGO_MAX_WIDTH_PERCENT * scale}%`,
            }}
            onError={() => setLogoBroken(true)}
          />
        ) : (
          <span
            className="truncate text-center text-[11px] font-semibold leading-[1.3] md:text-[12px]"
            style={{ color: SURFACE_INK }}
          >
            {brand.name}
          </span>
        )}
      </span>
      <span
        className="relative mt-2 block aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-black/5 transition-transform duration-300 md:group-hover:scale-[1.04]"
        style={{ backgroundColor: CATEGORY_TILE_SURFACE }}
      >
        {hasImage ? (
          <img
            src={brand.imageUrl as string}
            alt=""
            aria-hidden
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center" aria-hidden>
            <span className="font-display text-2xl font-semibold opacity-70" style={{ color: SURFACE_INK }}>
              {brand.name.trim().charAt(0) || "•"}
            </span>
          </span>
        )}
      </span>
    </>
  );
}
