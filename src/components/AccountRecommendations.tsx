import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import type { MarketplaceHomeProduct } from "@/lib/marketplace-home.types";

type AccountRecommendationsProps = {
  title?: string;
  subtitle?: string;
};

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <Link to={href} className="inline-flex items-center gap-1 text-sm font-semibold text-DilMart-store-gold hover:text-DilMart-store-gold-bright">
        عرض الكل
        <ChevronLeft size={16} />
      </Link>
      <h3 className="text-xl font-bold">{title}</h3>
    </div>
  );
}

export default function AccountRecommendations({
  title = "منتجات مقترحة لك",
  subtitle = "حاليًا توصيات عامة، وقريبًا ستصبح ذكية حسب طلباتك السابقة.",
}: AccountRecommendationsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["account-recommendations-home"],
    queryFn: () => apiClient.getMarketplaceHome(),
  });

  const bestSellers = ((data?.featuredProducts ?? []) as MarketplaceHomeProduct[]).slice(0, 4);
  const newArrivals = ((data?.newProducts ?? []) as MarketplaceHomeProduct[]).slice(0, 4);
  const offers = ((data?.offerProducts ?? []) as MarketplaceHomeProduct[]).slice(0, 4);
  const hasAny = bestSellers.length > 0 || newArrivals.length > 0 || offers.length > 0;

  if (isLoading) {
    return (
      <section className="mt-12 border-t border-DilMart-store-gold/10 pt-8" dir="rtl">
        <Skeleton className="mb-3 h-7 w-48" />
        <Skeleton className="mb-8 h-4 w-72" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (!hasAny) return null;

  return (
    <section className="mt-12 border-t border-DilMart-store-gold/10 pt-8" dir="rtl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {bestSellers.length > 0 && (
        <div className="mb-10">
          <SectionHeader title="الأكثر مبيعًا" href="/products" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {bestSellers.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      {newArrivals.length > 0 && (
        <div className="mb-10">
          <SectionHeader title="وصل حديثًا" href="/products?sort=newest" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {newArrivals.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <div>
          <SectionHeader title="عروض مختارة" href="/offers" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {offers.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
