import { Link } from "react-router-dom";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import type { MarketplaceHomeProduct } from "@/lib/marketplace-home.types";

type ProductSectionProps = {
  title: string;
  href: string;
  products: MarketplaceHomeProduct[];
  horizontal?: boolean;
  titleIcon?: LucideIcon;
};

export default function ProductSection({ title, href, products, horizontal = false, titleIcon: TitleIcon }: ProductSectionProps) {
  if (products.length === 0) return null;

  return (
    <section className="container py-6 md:py-10" dir="rtl">
      <div className="mb-5 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-right font-display text-2xl font-semibold md:text-3xl">
          <span>{title}</span>
          {TitleIcon && <TitleIcon size={20} className="text-DilMart-store-gold-bright" strokeWidth={1.75} />}
        </h2>
        <Link to={href} className="inline-flex items-center gap-1 text-sm font-semibold text-DilMart-store-gold hover:text-DilMart-store-gold-bright">
          <span>عرض الكل</span>
          <ChevronLeft size={16} />
        </Link>
      </div>
      {horizontal ? (
        <div className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {products.map((p) => (
            <div key={p.id} className="w-[12rem] shrink-0 md:w-[15rem]">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}
