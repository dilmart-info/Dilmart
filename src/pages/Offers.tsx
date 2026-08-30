import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ProductCard from "@/components/ProductCard";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Percent } from "lucide-react";
import { storeConfig } from "@/config/store";
import { apiClient } from "@/lib/api-client";

export default function Offers() {
  const { data: offersPayload, isLoading } = useQuery({
    queryKey: ["marketplace-offers"],
    queryFn: () => apiClient.getMarketplaceOffers(),
  });
  const products = offersPayload?.items ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <div className="border-b border-DilMart-store-gold/10 bg-gradient-to-b from-card/60 to-background">
        <div className="container py-14 text-center md:py-20">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-DilMart-store-gold/25 bg-DilMart-store-gold/10 px-4 py-1.5 text-xs font-medium text-DilMart-store-gold-bright">
            <Percent size={14} strokeWidth={1.5} />
            عروض مختارة
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">قيمة بلا صخب</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground leading-relaxed md:text-base">
            خصومات مدروسة على منتجات مختارة عبر المتاجر في {storeConfig.brand.ar}.
          </p>
        </div>
      </div>

      <main className="container flex-1 py-10 md:py-12">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl bg-muted/30" />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-DilMart-store-gold/25 bg-card/30 py-24 text-center">
            <p className="text-muted-foreground">لا توجد عروض نشطة حالياً.</p>
          </div>
        )}
      </main>

      <Footer />
      <WhatsAppButton />
    </div>
  );
}
