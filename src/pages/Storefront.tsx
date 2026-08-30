import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import type { MarketplacePublicMerchant, MarketplaceStorefrontProduct } from "@/lib/marketplace-storefront.types";
import { ChevronDown } from "lucide-react";
import { useEffect } from "react";
import { trackGrowthHookEvent } from "@/lib/growth-hooks";
import { startTrackedWhatsAppIntent } from "@/lib/whatsapp-assisted";
import { toast } from "sonner";

const STOREFRONT_PRODUCT_LIMIT = 48;

/** M2.6 — shared recovery actions (error + empty storefront); no `/products?merchant_id`. */
function StorefrontRecoveryActions() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <Button asChild className="rounded-full px-8">
        <Link to="/products">تصفّح المنتجات</Link>
      </Button>
      <Button asChild variant="outline" className="rounded-full border-DilMart-store-gold/35 px-8">
        <Link to="/stores">المتاجر</Link>
      </Button>
    </div>
  );
}

/** Single grid-level skeleton for product area (M2.6). */
function StorefrontProductsSkeleton() {
  return (
    <div className="rounded-2xl border border-DilMart-store-gold/10 bg-card/20 p-4 md:p-6" aria-busy="true" aria-label="جاري التحميل">
      <Skeleton className="min-h-[18rem] w-full rounded-xl bg-muted/35 md:min-h-[22rem]" />
    </div>
  );
}

/**
 * Public merchant storefront — `/store/:slug`.
 * Data: `GET /marketplace/merchants/:slug` then `GET /marketplace/products?merchant_id=…` only (no legacy slug APIs, no default merchant).
 */
export default function Storefront() {
  const { slug } = useParams();

  const {
    data: merchant,
    isLoading: merchantLoading,
    isError: merchantError,
  } = useQuery({
    queryKey: ["marketplace-merchant", slug],
    queryFn: () => apiClient.getMarketplaceMerchantBySlug(slug!),
    enabled: !!slug,
    retry: false,
  });

  const { data: productsResult, isLoading: productsLoading } = useQuery({
    queryKey: ["marketplace-store-products", merchant?.id],
    queryFn: () =>
      apiClient.getMarketplaceProducts({
        merchant_id: merchant!.id,
        limit: STOREFRONT_PRODUCT_LIMIT,
        offset: 0,
      }),
    enabled: !!merchant?.id,
  });

  const products: MarketplaceStorefrontProduct[] = productsResult?.items ?? [];

  if (merchantLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="container flex-1 py-12">
          <Skeleton className="mb-8 h-32 w-full max-w-2xl rounded-2xl bg-muted/35" />
          <StorefrontProductsSkeleton />
        </main>
        <Footer />
      </div>
    );
  }

  if (merchantError || !merchant) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="container flex-1 px-4 py-24 text-center">
          <h1 className="font-display text-2xl font-semibold">المتجر غير متوفر</h1>
          <p className="mt-2 text-muted-foreground">قد يكون الرابط غير صحيح أو المتجر غير نشط.</p>
          <StorefrontRecoveryActions />
        </main>
        <Footer />
      </div>
    );
  }

  return <StorefrontContent merchant={merchant} products={products} productsLoading={productsLoading} />;
}

function StorefrontContent({
  merchant,
  products,
  productsLoading,
}: {
  merchant: MarketplacePublicMerchant;
  products: MarketplaceStorefrontProduct[];
  productsLoading: boolean;
}) {
  const showCount = !productsLoading && products.length > 0;

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
      toast.error(error?.message || "تعذّر فتح مسار واتساب المتتبع.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="border-b border-DilMart-store-gold/10">
          {merchant.banner_url ? (
            <div className="relative h-36 w-full overflow-hidden md:h-44">
              <img
                src={merchant.banner_url}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 to-background/80" />
            </div>
          ) : null}
          <div className="bg-gradient-to-l from-card/80 to-background">
            <div className="container py-10 md:py-14">
              <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-8">
                {merchant.logo_url ? (
                  <img
                    src={merchant.logo_url}
                    alt=""
                    className="h-20 w-20 rounded-2xl border border-DilMart-store-gold/15 object-cover md:h-24 md:w-24"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-DilMart-store-gold/15 bg-muted text-lg font-semibold text-muted-foreground md:h-24 md:w-24">
                    {merchant.display_name.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-right">
                  <h1 className="font-display text-3xl font-semibold md:text-4xl">{merchant.display_name}</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    صفحة المتجر على المنصة — استعرض المنتجات المتاحة في القسم أدناه.
                  </p>
                  {merchant.description ? (
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{merchant.description}</p>
                  ) : null}
                  <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    <Button asChild size="lg" className="rounded-full px-8">
                      <a href="#store-products" className="inline-flex items-center justify-center gap-2">
                        الانتقال إلى المنتجات
                        <ChevronDown className="h-4 w-4 opacity-80" strokeWidth={2} />
                      </a>
                    </Button>
                    <Button type="button" variant="outline" size="lg" className="rounded-full px-8" onClick={() => void handleStoreWhatsApp()}>
                      واتساب المتجر (Tracked)
                    </Button>
                    <Link
                      to="/stores"
                      className="text-center text-sm font-medium text-DilMart-store-gold transition-colors hover:text-DilMart-store-gold-bright sm:px-2"
                    >
                      تصفّح المتاجر
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section id="store-products" className="container scroll-mt-24 py-10 md:scroll-mt-28 md:py-12">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">منتجات المتجر</h2>

          {showCount && (
            <p className="mt-3 text-sm text-muted-foreground">عرض {products.length} منتجاً</p>
          )}

          <div className="mt-8">
            {productsLoading ? (
              <StorefrontProductsSkeleton />
            ) : products.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-DilMart-store-gold/20 bg-card/30 px-6 py-16 text-center">
                <p className="text-muted-foreground">لا توجد منتجات في هذا المتجر حالياً.</p>
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
