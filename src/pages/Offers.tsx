import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ProductCard from "@/components/ProductCard";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Percent, TriangleAlert } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useEffect } from "react";

export default function Offers() {
  useEffect(() => {
    document.title = "العروض | DILMART";
  }, []);

  const {
    data: offersPayload,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["marketplace-offers"],
    queryFn: () => apiClient.getMarketplaceOffers(),
    retry: false,
  });

  const products = offersPayload?.items ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <div className="border-b border-border bg-gradient-to-l from-muted/50 to-background">
        <div className="container py-12 text-center md:py-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-xs font-bold text-primary">
            <Percent size={14} strokeWidth={2} />
            عروض مميزة
          </div>
          <h1 className="font-display text-3xl font-black tracking-tight text-foreground md:text-4xl">
            عروض وتخفيضات
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground leading-relaxed md:text-base">
            اكتشف العروض المتاحة حالياً على منتجات مختارة في ديلمارت.
          </p>
        </div>
      </div>

      <main className="container flex-1 py-10 md:py-12">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="rounded-2xl border border-dashed border-destructive/30 bg-card/40 px-6 py-20 text-center"
          >
            <TriangleAlert className="mx-auto h-8 w-8 text-destructive/80" strokeWidth={1.5} aria-hidden />
            <p className="mt-4 text-base font-bold text-foreground">تعذر تحميل العروض</p>
            <p className="mt-2 text-sm text-muted-foreground">
              حدث خطأ أثناء تحميل قائمة العروض. يمكنك إعادة المحاولة الآن.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="rounded-full px-8"
              >
                {isFetching ? "...جارِ إعادة المحاولة" : "إعادة المحاولة"}
              </Button>
              <Button asChild variant="outline" className="rounded-full px-8">
                <Link to="/products">تصفّح المنتجات</Link>
              </Button>
            </div>
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
            <p className="text-base font-bold text-foreground">لا توجد عروض نشطة حالياً.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              تصفّح تشكيلة المنتجات المتوفرة عبر المنصة.
            </p>
            <Button asChild className="mt-8 rounded-full px-8">
              <Link to="/products">تصفّح المنتجات</Link>
            </Button>
          </div>
        )}
      </main>

      <Footer />
      <WhatsAppButton />
    </div>
  );
}
