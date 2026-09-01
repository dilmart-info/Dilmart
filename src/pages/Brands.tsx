import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tag, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import BrandTileVisual from "@/components/brand/BrandTileVisual";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { toBrandProductsHref } from "@/lib/marketplace-brands.types";

function BrandsGridSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4 md:p-6" aria-busy="true" aria-label="جاري التحميل">
      <Skeleton className="min-h-[22rem] w-full rounded-xl bg-muted/40 md:min-h-[28rem]" />
    </div>
  );
}

function BrandsErrorState({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-dashed border-destructive/30 bg-card/40 px-6 py-20 text-center"
    >
      <TriangleAlert className="mx-auto h-8 w-8 text-destructive/80" strokeWidth={1.5} aria-hidden />
      <p className="mt-4 text-base font-bold text-foreground">تعذر تحميل العلامات التجارية</p>
      <p className="mt-2 text-sm text-muted-foreground">حدث خطأ أثناء تحميل العلامات التجارية. حاول مرة أخرى.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
  useEffect(() => {
    document.title = "العلامات التجارية | DILMART";
  }, []);

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
        <div className="border-b border-border bg-gradient-to-l from-muted/50 to-background">
          <div className="container py-10 md:py-14">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Tag className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">العلامات التجارية</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                  استكشف العلامات التجارية المتوفرة وتصفّح منتجاتها عبر المنصة.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="container py-8 md:py-10">
          {showResultsMeta && (
            <p className="mb-6 text-sm font-medium text-muted-foreground">عرض {brands.length} علامة تجارية</p>
          )}

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
            <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
              <p className="text-base font-bold text-foreground">لا توجد علامات تجارية معروضة حالياً.</p>
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
