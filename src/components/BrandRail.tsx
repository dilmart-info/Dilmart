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
    <div className="flex gap-3 overflow-x-auto pb-2" aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="w-[112px] shrink-0 md:w-[130px]">
          <div className="aspect-square w-full animate-pulse rounded-2xl bg-muted/40" />
          <div className="mt-2 h-4 w-3/4 mx-auto animate-pulse rounded-md bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

export default function BrandRail({
  title = "العلامات التجارية المعتمدة",
  subtitle = "أشهر الماركات العالمية والمحلية الموثوقة",
  brands,
  loading = false,
  viewAllHref = "/brands",
  viewAllLabel = "عرض كل الماركات",
}: BrandRailProps) {
  if (!loading && brands.length === 0) return null;

  return (
    <section className="container py-3.5 md:py-5" dir="rtl">
      <div className="mb-3 md:mb-4 flex items-end justify-between gap-3 text-right">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-primary" />
            <h2 className="font-tajawal text-xl sm:text-2xl md:text-3xl font-extrabold text-navy">
              {title}
            </h2>
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground font-medium pr-3">{subtitle}</p>
          )}
        </div>
        {viewAllHref ? (
          <Link
            to={viewAllHref}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:text-primary-hover hover:underline transition-colors"
          >
            <span>{viewAllLabel}</span>
            <ChevronLeft size={14} />
          </Link>
        ) : null}
      </div>

      {loading ? (
        <BrandRailSkeleton />
      ) : (
        <div className="flex gap-3.5 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {brands.map((b) => (
            <Link
              key={b.id}
              to={toBrandProductsHref(b.slug)}
              className="group flex w-[100px] sm:w-[115px] md:w-[125px] shrink-0 flex-col items-center text-center p-2 rounded-2xl bg-white border border-border/80 shadow-sm transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-1"
            >
              <BrandTileVisual brand={b} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
