import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import BrandTileVisual from "@/components/brand/BrandTileVisual";
import { toBrandProductsHref, type MarketplaceBrand } from "@/lib/marketplace-brands.types";

type BrandRailProps = {
  title?: string;
  subtitle?: string;
  brands: MarketplaceBrand[];
  loading?: boolean;
  viewAllHref?: string;
  viewAllLabel?: string;
};

function BrandRailSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1" aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="w-[112px] shrink-0 md:w-[128px]">
          <div className="h-6 w-full animate-pulse rounded-full bg-muted/40" />
          <div className="mt-2 aspect-square w-full animate-pulse rounded-2xl bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

/** Real product brands — NOT merchants/stores. See `MerchantSection` for those. */
export default function BrandRail({
  title = "العلامات التجارية",
  subtitle = "تسوق حسب العلامة التجارية",
  brands,
  loading = false,
  viewAllHref,
  viewAllLabel = "عرض الكل",
}: BrandRailProps) {
  // Loading-only content is a false promise once resolved empty; hide rather than
  // show a weak permanent placeholder.
  if (!loading && brands.length === 0) return null;

  return (
    <section className="container py-4 md:py-5" dir="rtl">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="font-display text-lg font-semibold md:text-xl">{title}</h2>
          <p className="text-xs text-muted-foreground md:text-sm">{subtitle}</p>
        </div>
        {viewAllHref ? (
          <Link
            to={viewAllHref}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-DilMart-store-gold hover:text-DilMart-store-gold-bright md:text-sm"
          >
            <span>{viewAllLabel}</span>
            <ChevronLeft size={16} />
          </Link>
        ) : null}
      </div>
      {loading ? (
        <BrandRailSkeleton />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:thin]">
          {brands.map((brand) => (
            <Link
              key={brand.name}
              to={toBrandProductsHref(brand.name)}
              aria-label={brand.name}
              title={brand.name}
              className="group block w-[112px] shrink-0 md:w-[128px]"
            >
              <BrandTileVisual brand={brand} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
