import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { Link } from "react-router-dom";
import CategoryTileVisual, { type CategoryTileItem } from "@/components/category/CategoryTileVisual";

export type CategoryGridItem = CategoryTileItem & {
  is_featured?: boolean | null;
  layout_variant?: "normal" | "wide" | "promo" | string | null;
  is_active?: boolean | null;
};

type CategoryGridProps = {
  title?: string;
  subtitle?: string;
  items: CategoryGridItem[];
  fallbackImage: string;
  viewAllHref?: string;
  viewAllLabel?: string;
};

const MOBILE_VISIBLE = 8;

function categoryHref(slug: string) {
  return `/products?category=${encodeURIComponent(slug)}`;
}

export default function CategoryGrid({
  title = "تسوق حسب الفئات",
  subtitle = "استكشف تشكيلاتنا المتنوعة من المنتجات الأصلية",
  items,
  fallbackImage,
  viewAllHref = "/products",
  viewAllLabel = "عرض كل الأقسام",
}: CategoryGridProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [railOverflows, setRailOverflows] = useState(false);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return;
    const measure = () => setRailOverflows(rail.scrollWidth > rail.clientWidth + 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [items.length]);

  const scrollRail = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.round(rail.clientWidth * 0.8), behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <section className="container py-3.5 md:py-5" dir="rtl">
      {/* Section Header */}
      <div className="mb-3 md:mb-4 flex items-end justify-between gap-3 text-right">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-primary" />
            <h2 className="font-tajawal text-xl sm:text-2xl md:text-3xl font-extrabold text-navy">
              {title}
            </h2>
          </div>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground font-medium pr-3">{subtitle}</p>}
        </div>
        {viewAllHref && (
          <Link
            to={viewAllHref}
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-hover hover:underline transition-colors shrink-0"
          >
            <span>{viewAllLabel}</span>
            <ChevronLeft size={14} />
          </Link>
        )}
      </div>

      {/* Mobile — 4 columns compact grid */}
      <div className="grid grid-cols-4 gap-2 sm:gap-2.5 md:hidden">
        {items.slice(0, MOBILE_VISIBLE).map((cat) => (
          <Link
            key={cat.id}
            to={categoryHref(cat.slug)}
            aria-label={cat.name}
            title={cat.name}
            className="group flex flex-col items-center text-center p-2 rounded-xl bg-white border border-border/80 shadow-sm transition-all active:scale-95 hover:border-primary/40"
          >
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-surface-light flex items-center justify-center mb-1.5 overflow-hidden group-hover:scale-105 transition-transform">
              <img
                src={cat.image_url || fallbackImage}
                alt={cat.name}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = fallbackImage;
                }}
              />
            </div>
            <span className="font-tajawal text-[11px] sm:text-xs font-extrabold text-navy leading-tight line-clamp-1 group-hover:text-primary transition-colors">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>

      {/* Desktop & Tablet — Horizontal Rail / Grid */}
      <div className="relative hidden md:block">
        <div
          ref={railRef}
          className="flex gap-3.5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((cat) => (
            <Link
              key={cat.id}
              to={categoryHref(cat.slug)}
              aria-label={cat.name}
              title={cat.name}
              className="group flex w-[136px] shrink-0 flex-col items-center text-center p-2.5 rounded-2xl bg-white border border-border/80 shadow-sm transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-1"
            >
              <div className="h-24 w-24 rounded-xl bg-surface-light flex items-center justify-center mb-2 overflow-hidden group-hover:scale-105 transition-transform">
                <img
                  src={cat.image_url || fallbackImage}
                  alt={cat.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = fallbackImage;
                  }}
                />
              </div>
              <span className="font-tajawal text-xs sm:text-sm font-extrabold text-navy leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>

        {railOverflows && (
          <>
            <button
              type="button"
              onClick={() => scrollRail(1)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md border border-border text-foreground hover:text-primary transition-all"
              aria-label="تمرير لليمين"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={() => scrollRail(-1)}
              className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md border border-border text-foreground hover:text-primary transition-all"
              aria-label="تمرير لليسار"
            >
              <ChevronLeft size={18} />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
