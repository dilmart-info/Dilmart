import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

/** Mobile shows two dense rows; the rest stay one tap away behind "view all". */
const MOBILE_VISIBLE = 8;

function categoryHref(slug: string) {
  return `/products?category=${encodeURIComponent(slug)}`;
}

export default function CategoryGrid({
  title,
  subtitle,
  items,
  fallbackImage,
  viewAllHref,
  viewAllLabel = "عرض كل الأقسام",
}: CategoryGridProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [railOverflows, setRailOverflows] = useState(false);

  // Arrows only appear when the rail actually has hidden items.
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
    <section className="container py-6 md:py-8">
      {(title || subtitle) && (
        <div className="mb-4 flex items-end justify-between gap-3 text-right">
          <div className="space-y-1">
            {title && <h2 className="font-display text-2xl font-semibold md:text-3xl">{title}</h2>}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {viewAllHref ? (
            <Link to={viewAllHref} className="shrink-0 text-xs font-semibold text-DilMart-store-gold hover:underline">
              {viewAllLabel}
            </Link>
          ) : null}
        </div>
      )}

      {/* Mobile — compact four-column discovery grid. */}
      <div className="grid grid-cols-4 gap-x-2 gap-y-4 md:hidden">
        {items.slice(0, MOBILE_VISIBLE).map((cat) => (
          <Link key={cat.id} to={categoryHref(cat.slug)} aria-label={cat.name} title={cat.name} className="group block">
            <CategoryTileVisual category={cat} fallbackImage={fallbackImage} labelClassName="text-[11px] md:text-[12px]" />
          </Link>
        ))}
      </div>

      {/* Desktop — horizontal category rail. */}
      <div className="relative hidden md:block">
        <div
          ref={railRef}
          className="flex gap-3 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((cat) => (
            <Link
              key={cat.id}
              to={categoryHref(cat.slug)}
              aria-label={cat.name}
              title={cat.name}
              className="group block w-[104px] shrink-0"
            >
              <CategoryTileVisual category={cat} fallbackImage={fallbackImage} labelClassName="text-[11px] md:text-[12px]" />
            </Link>
          ))}
        </div>
        {railOverflows ? (
          <>
            <button
              type="button"
              aria-label="الأقسام السابقة"
              onClick={() => scrollRail(1)}
              className="absolute -right-3 top-[40%] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-DilMart-store-gold/25 bg-background/95 text-foreground shadow-sm hover:border-DilMart-store-gold/60"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              aria-label="الأقسام التالية"
              onClick={() => scrollRail(-1)}
              className="absolute -left-3 top-[40%] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-DilMart-store-gold/25 bg-background/95 text-foreground shadow-sm hover:border-DilMart-store-gold/60"
            >
              <ChevronLeft size={18} />
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
