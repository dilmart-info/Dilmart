import { Link } from "react-router-dom";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import type { MarketplaceHomeProduct } from "@/lib/marketplace-home.types";

type ProductSectionProps = {
  title: string;
  subtitle?: string;
  href: string;
  products: MarketplaceHomeProduct[];
  horizontal?: boolean;
  titleIcon?: LucideIcon;
  badge?: string;
};

export default function ProductSection({
  title,
  subtitle,
  href,
  products,
  horizontal = false,
  titleIcon: TitleIcon,
  badge,
}: ProductSectionProps) {
  if (products.length === 0) return null;

  return (
    <section className="container py-5 md:py-8" dir="rtl">
      {/* Section Header */}
      <div className="mb-4 md:mb-6 flex items-end justify-between gap-3 text-right">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-primary" />
            <h2 className="font-tajawal text-xl sm:text-2xl md:text-3xl font-extrabold text-navy flex items-center gap-2">
              <span>{title}</span>
              {TitleIcon && <TitleIcon size={22} className="text-accent shrink-0" strokeWidth={2.2} />}
              {badge && (
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-black text-accent">
                  {badge}
                </span>
              )}
            </h2>
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground font-medium pr-3">{subtitle}</p>
          )}
        </div>

        <Link
          to={href}
          className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-primary hover:text-primary-hover hover:underline transition-colors shrink-0"
        >
          <span>عرض الكل</span>
          <ChevronLeft size={16} />
        </Link>
      </div>

      {/* Grid or Horizontal Scroll */}
      {horizontal ? (
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {products.map((p) => (
            <div key={p.id} className="w-[11rem] sm:w-[13rem] md:w-[15rem] shrink-0">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-y-5">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}
