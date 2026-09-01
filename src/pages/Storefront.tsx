import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { ApiError } from "@/lib/api-core";
import type { MarketplacePublicMerchant, MarketplaceStorefrontProduct } from "@/lib/marketplace-storefront.types";
import { ChevronDown, MessageCircle, Store, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { trackGrowthHookEvent } from "@/lib/growth-hooks";
import { startTrackedWhatsAppIntent } from "@/lib/whatsapp-assisted";
import { toast } from "sonner";

const STOREFRONT_PRODUCT_LIMIT = 48;

function StorefrontRecoveryActions() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <Button asChild className="rounded-full px-8">
        <Link to="/products">تصفّح المنتجات</Link>
      </Button>
      <Button asChild variant="outline" className="rounded-full px-8">
        <Link to="/stores">تصفّح المتاجر</Link>
      </Button>
    </div>
  );
}

function StorefrontProductsSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4 md:p-6" aria-busy="true" aria-label="جاري التحميل">
      <Skeleton className="min-h-[18rem] w-full rounded-xl bg-muted/40 md:min-h-[22rem]" />
    </div>
  );
}

export default function Storefront() {
  const { slug } = useParams();

  const {
    data: merchant,
    isLoading: merchantLoading,
    isError: merchantIsError,
    error: merchantError,
    refetch: refetchMerchant,
    isFetching: merchantFetching,
  } = useQuery({
    queryKey: ["marketplace-merchant", slug],
    queryFn: () => apiClient.getMarketplaceMerchantBySlug(slug!),
    enabled: !!slug,
    retry: false,
  });

  const {
    data: productsResult,
    isLoading: productsLoading,
    isError: productsIsError,
    refetch: refetchProducts,
    isFetching: productsFetching,
  } = useQuery({
    queryKey: ["marketplace-store-products", merchant?.id],
    queryFn: () =>
      apiClient.getMarketplaceProducts({
        merchant_id: merchant!.id,
        limit: STOREFRONT_PRODUCT_LIMIT,
        offset: 0,
      }),
    enabled: !!merchant?.id,
    retry: false,
  });

  const products: MarketplaceStorefrontProduct[] = productsResult?.items ?? [];

  useEffect(() => {
    if (merchant?.display_name) {
      document.title = `${merchant.display_name} | DILMART`;
    } else {
      document.title = "المتجر | DILMART";
    }
  }, [merchant?.display_name]);

  if (merchantLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="container flex-1 py-12">
          <Skeleton className="mb-8 h-32 w-full max-w-2xl rounded-2xl bg-muted/40" />
          <StorefrontProductsSkeleton />
        </main>
        <Footer />
      </div>
    );
  }

  if (merchantIsError || !merchant) {
    const isNotFound = merchantError instanceof ApiError ? merchantError.status === 404 : false;

    if (isNotFound || (!merchantIsError && !merchant)) {
      return (
        <div className="flex min-h-screen flex-col bg-background">
          <Header />
          <main className="container flex-1 px-4 py-24 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-6">
              <Store className="h-8 w-8" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">المتجر غير موجود أو غير متاح</h1>
            <p className="mt-2 text-sm text-muted-foreground">قد يكون الرابط غير صحيح أو المتجر غير نشط حالياً.</p>
            <StorefrontRecoveryActions />
          </main>
          <Footer />
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="container flex-1 px-4 py-24 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-6">
            <TriangleAlert className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">تعذر تحميل المتجر</h1>
          <p className="mt-2 text-sm text-muted-foreground">حدث خطأ أثناء الاتصال بالخادم لجلب بيانات المتجر. حاول مرة أخرى.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              onClick={() => void refetchMerchant()}
              disabled={merchantFetching}
              className="rounded-full px-8"
            >
              {merchantFetching ? "...جارِ إعادة المحاولة" : "إعادة المحاولة"}
            </Button>
            <Button asChild variant="outline" className="rounded-full px-8">
              <Link to="/stores">تصفّح المتاجر</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <StorefrontContent
      merchant={merchant}
      products={products}
      productsLoading={productsLoading}
      productsIsError={productsIsError}
      productsFetching={productsFetching}
      onRetryProducts={() => void refetchProducts()}
    />
  );
}

function StorefrontContent({
  merchant,
  products,
  productsLoading,
  productsIsError,
  productsFetching,
  onRetryProducts,
}: {
  merchant: MarketplacePublicMerchant;
  products: MarketplaceStorefrontProduct[];
  productsLoading: boolean;
  productsIsError: boolean;
  productsFetching: boolean;
  onRetryProducts: () => void;
}) {
  const showCount = !productsLoading && !productsIsError && products.length > 0;

  useEffect(() => {
    trackGrowthHookEvent("store.viewed", {
      sourceSurface: "storefront",
      merchantId: merchant.id,
      path: `/store/${merchant.slug}`,
    });
  }, [merchant.id, merchant.slug]);

  const handleStoreWhatsApp = async () => {
    try {
      await startTrackedWhatsAppIntent({
        merchantId: merchant.id,
        merchantName: merchant.display_name,
        sourceSurface: "store",
        completionLink: `${window.location.origin}/checkout`,
      });
    } catch (error: any) {
      toast.error(error?.message || "تعذّر فتح مسار واتساب.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="border-b border-border">
          {merchant.banner_url ? (
            <div className="relative h-36 w-full overflow-hidden md:h-48">
              <img
                src={merchant.banner_url}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 to-background/90" />
            </div>
          ) : null}
          <div className="bg-gradient-to-l from-muted/40 to-background">
            <div className="container py-8 md:py-12">
              <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-8">
                {merchant.logo_url ? (
                  <img
                    src={merchant.logo_url}
                    alt=""
                    className="h-20 w-20 rounded-2xl border border-border bg-card object-cover shadow-sm md:h-24 md:w-24"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-muted text-lg font-bold text-muted-foreground md:h-24 md:w-24">
                    {merchant.display_name.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-right">
                  <h1 className="font-display text-2xl font-black text-foreground md:text-3xl">
                    {merchant.display_name}
                  </h1>
                  {merchant.description ? (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {merchant.description}
                    </p>
                  ) : (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      استعرض المنتجات المتاحة في المتجر عبر القائمة أدناه.
                    </p>
                  )}
                  <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-start">
                    <Button asChild size="lg" className="rounded-full px-7">
                      <a href="#store-products" className="inline-flex items-center justify-center gap-2">
                        <span>المنتجات</span>
                        <ChevronDown className="h-4 w-4 opacity-80" strokeWidth={2} />
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="rounded-full px-7 gap-2"
                      onClick={() => void handleStoreWhatsApp()}
                    >
                      <MessageCircle className="h-4 w-4 text-emerald-600" />
                      <span>استفسار عبر واتساب</span>
                    </Button>
                    <Button asChild variant="ghost" size="lg" className="rounded-full px-6 text-muted-foreground">
                      <Link to="/stores">تصفّح كل المتاجر</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="store-products" className="container scroll-mt-24 py-10 md:scroll-mt-28 md:py-12">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground md:text-2xl">
              منتجات المتجر
            </h2>
            {showCount && (
              <p className="text-sm font-medium text-muted-foreground">عرض {products.length} منتجاً</p>
            )}
          </div>

          <div className="mt-8">
            {productsLoading ? (
              <StorefrontProductsSkeleton />
            ) : productsIsError ? (
              <div
                role="alert"
                className="rounded-2xl border border-dashed border-destructive/30 bg-card/40 px-6 py-16 text-center"
              >
                <TriangleAlert className="mx-auto h-8 w-8 text-destructive/80" strokeWidth={1.5} aria-hidden />
                <p className="mt-4 text-base font-bold text-foreground">تعذر تحميل منتجات المتجر</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  حدث خطأ أثناء جلب المنتجات. حاول مرة أخرى دون الحاجة لإعادة تحميل الصفحة.
                </p>
                <Button
                  type="button"
                  onClick={onRetryProducts}
                  disabled={productsFetching}
                  className="mt-6 rounded-full px-8"
                >
                  {productsFetching ? "...جارِ إعادة المحاولة" : "إعادة المحاولة"}
                </Button>
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
                <p className="text-base font-bold text-foreground">لا توجد منتجات في هذا المتجر حالياً.</p>
                <p className="mt-2 text-sm text-muted-foreground">يمكنك تصفح المنتجات في المتاجر الأخرى.</p>
                <StorefrontRecoveryActions />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
