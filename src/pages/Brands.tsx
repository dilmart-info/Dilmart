import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tag, TriangleAlert } from "lucide-react";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import BrandTileVisual from "@/components/brand/BrandTileVisual";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { storeConfig } from "@/config/store";
import { apiClient } from "@/lib/api-client";
import { toBrandProductsHref } from "@/lib/marketplace-brands.types";

/** Single grid-level placeholder while the brand list loads — matches `Stores.tsx`. */
function BrandsGridSkeleton() {
  return (
    <div className="rounded-2xl border border-DilMart-store-gold/10 bg-card/20 p-4 md:p-6" aria-busy="true" aria-label="جاري التحميل">
      <Skeleton className="min-h-[22rem] w-full rounded-xl bg-muted/35 md:min-h-[28rem]" />
    </div>
  );
}

/**
 * A failed `GET /marketplace/brands` is NOT the same state as a successful
 * response with zero brands — telling the customer "no brands exist" on a
 * transient network/backend failure would be false. `onRetry` re-runs the
 * same query (react-query `refetch`), never a full page reload.
 */
function BrandsErrorState({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-dashed border-destructive/30 bg-card/30 px-6 py-20 text-center"
    >
      <TriangleAlert className="mx-auto h-8 w-8 text-destructive/80" strokeWidth={1.5} aria-hidden />
      <p className="mt-4 text-base font-semibold text-foreground">تعذر تحميل العلامات التجارية</p>
      <p className="mt-2 text-sm text-muted-foreground">حدث خطأ أثناء تحميل العلامات التجارية. حاول مرة أخرى.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={onRetry} disabled={isRetrying} className="rounded-full px-8">
          {isRetrying ? "...جارِ إعادة المحاولة" : "إعادة المحاولة"}
        </Button>
        <Button asChild type="button" variant="outline" className="rounded-full px-8">
          <Link to="/products">تصفّح المنتجات</Link>
        </Button>
      </div>
    </div>
  );
}

export default function Brands() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["marketplace-brands"],
    queryFn: () => apiClient.getMarketplaceBrands(),
  });

  const brands = data?.brands ?? [];
  const showResultsMeta = !isLoading && !isError && brands.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="border-b border-DilMart-store-gold/10 bg-gradient-to-l from-card/80 to-background">
          <div className="container py-10 md:py-14">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.28em] text-DilMart-store-gold">{storeConfig.brand.en}</p>
            <div className="flex flex-wrap items-end gap-4">
              <Tag className="h-10 w-10 text-DilMart-store-gold/80" strokeWidth={1.25} />
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl">كل العلامات التجارية</h1>
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground leading-relaxed">اختر العلامة التجارية وتصفح منتجاتها</p>
              </div>
            </div>
          </div>
        </div>

        <div className="container py-8 md:py-10">
          {showResultsMeta && <p className="mb-6 text-sm text-muted-foreground">عرض {brands.length} علامة تجارية</p>}

          {isLoading ? (
            <BrandsGridSkeleton />
          ) : isError ? (
            <BrandsErrorState onRetry={() => refetch()} isRetrying={isFetching} />
          ) : brands.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 lg:gap-x-4">
              {brands.map((brand) => (
                <Link
                  key={brand.name}
                  to={toBrandProductsHref(brand.name)}
                  aria-label={brand.name}
                  title={brand.name}
                  className="group block"
                >
                  <BrandTileVisual brand={brand} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-DilMart-store-gold/20 bg-card/30 px-6 py-20 text-center">
              <p className="text-muted-foreground">لا توجد علامات تجارية معروضة حالياً.</p>
              <p className="mt-2 text-sm text-muted-foreground">يمكنك تصفّح جميع المنتجات مباشرة.</p>
              <Button asChild className="mt-8 rounded-full px-8">
                <Link to="/products">تصفّح المنتجات</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
