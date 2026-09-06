import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import type { MarketplaceHomeProduct } from "@/lib/marketplace-home.types";
import HeroSlider from "@/components/HeroSlider";
import CategoryGrid from "@/components/CategoryGrid";
import ProductSection from "@/components/ProductSection";
import MerchantSection from "@/components/MerchantSection";
import BrandRail from "@/components/BrandRail";
import HomeDiscoveryFeed from "@/components/home/HomeDiscoveryFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Sparkles, Star, Tag, Truck, ShieldCheck, RotateCcw, Headphones } from "lucide-react";
import {
  filterRootStorefrontCategories,
  NEUTRAL_CATEGORY_PLACEHOLDER,
  type StorefrontCategory,
} from "@/lib/category-hierarchy";
import {
  FIXTURE_CATEGORIES,
  FIXTURE_OFFER_PRODUCTS,
  FIXTURE_BEST_SELLERS,
  FIXTURE_NEW_ARRIVALS,
  FIXTURE_MERCHANTS,
  FIXTURE_BRANDS,
  isMarketplaceVisualFixturesEnabled,
} from "@/lib/marketplace-fixtures";
import { HOMEPAGE_HERO_SLIDES, HOMEPAGE_SIDE_CARDS } from "@/config/homepage-hero";


function HomeDiscoverSkeleton() {
  return (
    <div className="container space-y-3 py-3" dir="rtl">
      <Skeleton className="h-[20rem] w-full rounded-2xl bg-muted/40" />
      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl bg-muted/30" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-60 rounded-2xl bg-muted/30" />
        ))}
      </div>
    </div>
  );
}

const Index = () => {
  const { data: homeData, isLoading: homeLoading } = useQuery({
    queryKey: ["marketplace-home"],
    queryFn: () => apiClient.getMarketplaceHome(),
  });

  const { data: brandsData, isLoading: brandsLoading } = useQuery({
    queryKey: ["marketplace-brands"],
    queryFn: () => apiClient.getMarketplaceBrands(),
  });

  const topCategories = useMemo(() => {
    const rows = (homeData?.categories as StorefrontCategory[] | undefined) ?? [];
    const filtered = filterRootStorefrontCategories(rows);
    if (filtered.length > 0) return filtered;
    return isMarketplaceVisualFixturesEnabled() ? (FIXTURE_CATEGORIES as unknown as StorefrontCategory[]) : [];
  }, [homeData?.categories]);

  const offers = useMemo(() => {
    const list = (homeData?.offerProducts ?? []) as MarketplaceHomeProduct[];
    if (list.length > 0) return list;
    return isMarketplaceVisualFixturesEnabled() ? FIXTURE_OFFER_PRODUCTS : [];
  }, [homeData?.offerProducts]);

  const featured = useMemo(() => {
    const list = (homeData?.featuredProducts ?? []) as MarketplaceHomeProduct[];
    if (list.length > 0) return list;
    return isMarketplaceVisualFixturesEnabled() ? FIXTURE_BEST_SELLERS : [];
  }, [homeData?.featuredProducts]);

  const news = useMemo(() => {
    const list = (homeData?.newProducts ?? []) as MarketplaceHomeProduct[];
    if (list.length > 0) return list;
    return isMarketplaceVisualFixturesEnabled() ? FIXTURE_NEW_ARRIVALS : [];
  }, [homeData?.newProducts]);

  const featuredMerchants = useMemo(() => {
    if (homeData?.featuredMerchants && homeData.featuredMerchants.length > 0) {
      return homeData.featuredMerchants;
    }
    return isMarketplaceVisualFixturesEnabled() ? FIXTURE_MERCHANTS : [];
  }, [homeData?.featuredMerchants]);

  const brands = useMemo(() => {
    if (brandsData?.brands && brandsData.brands.length > 0) {
      return brandsData.brands;
    }
    return isMarketplaceVisualFixturesEnabled() ? FIXTURE_BRANDS.brands : [];
  }, [brandsData?.brands]);

  const curatedProductIds = useMemo(
    () =>
      [
        ...(homeData?.featuredProducts ?? []),
        ...(homeData?.newProducts ?? []),
        ...(homeData?.offerProducts ?? []),
      ]
        .map((p) => (p as MarketplaceHomeProduct).id)
        .filter((id): id is string => Boolean(id)),
    [homeData?.featuredProducts, homeData?.newProducts, homeData?.offerProducts],
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-white">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <Header />

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main className="flex-1 space-y-1 md:space-y-2">
        {homeLoading ? (
          <HomeDiscoverSkeleton />
        ) : (
          <>
            {/* 1. Hero Promo Slider & Side Promo Banners */}
            <HeroSlider slides={HOMEPAGE_HERO_SLIDES} sideCards={HOMEPAGE_SIDE_CARDS} loading={false} />

            {/* 2. Trust Value Propositions Bar (Vibrant Contrast) */}
            <section className="container py-1" dir="rtl">
              <div className="rounded-2xl border border-border/80 bg-white p-3 sm:p-3.5 shadow-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-right">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Truck size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <h4 className="font-tajawal text-xs sm:text-sm font-black text-navy leading-tight">توصيل موثوق</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium mt-0.5">شحن مباشر وسريع لباب المنزل</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ShieldCheck size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <h4 className="font-tajawal text-xs sm:text-sm font-black text-navy leading-tight">تسوق بثقة</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium mt-0.5">منتجات مختارة من متاجر معتمدة</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <RotateCcw size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <h4 className="font-tajawal text-xs sm:text-sm font-black text-navy leading-tight">دفع مرن</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium mt-0.5">فحص طلبك والدفع عند الاستلام</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Headphones size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <h4 className="font-tajawal text-xs sm:text-sm font-black text-navy leading-tight">دعم العملاء</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium mt-0.5">فريق متواصل للإجابة عن الاستفسارات</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Top Categories Discovery */}
            <CategoryGrid
              title="تسوق حسب الفئات"
              subtitle="استكشف تشكيلاتنا المتنوعة من المنتجات المختارة"
              items={topCategories}
              fallbackImage={NEUTRAL_CATEGORY_PLACEHOLDER}
              viewAllHref="/products"
              viewAllLabel="عرض كل الأقسام"
            />

            {/* 4. Flash Deals & Offers */}
            {offers.length > 0 && (
              <ProductSection
                title="عروض وتخفيضات اليوم"
                subtitle="خصومات حصرية لفترة محدودة على منتجات مختارة"
                href="/offers"
                products={offers}
                horizontal
                titleIcon={Flame}
                badge="عروض مختارة 🔥"
              />
            )}

            {/* 5. Best Sellers Section */}
            {featured.length > 0 && (
              <ProductSection
                title="الأكثر مبيعاً"
                subtitle="المنتجات الأعلى تقييماً وإقبالاً من متسوقي ديلمارت"
                href="/products?sort=best_selling"
                products={featured}
                titleIcon={Star}
              />
            )}

            {/* 6. New Arrivals */}
            {news.length > 0 && (
              <ProductSection
                title="وصل حديثاً إلى ديلمارت"
                subtitle="أحدث ما تم إضافته من منتجات مميزة"
                href="/products?sort=newest"
                products={news}
                horizontal
                titleIcon={Sparkles}
              />
            )}

            {/* 7. Verified Marketplace Stores */}
            {featuredMerchants.length > 0 && (
              <MerchantSection
                merchants={featuredMerchants}
                title="المتاجر المعتمدة في ديلمارت"
                subtitle="تسوق مباشرة من كبرى الشركات والمتاجر الموثوقة"
                viewAllHref="/stores"
                viewAllLabel="عرض كل المتاجر"
              />
            )}

            {/* 8. Official Brands Rail */}
            {brands.length > 0 && (
              <BrandRail
                title="العلامات التجارية المعتمدة"
                subtitle="أشهر الماركات العالمية والمحلية الموثوقة"
                brands={brands}
                loading={brandsLoading}
                viewAllHref="/brands"
                viewAllLabel="عرض كل الماركات"
              />
            )}

            {/* 9. Continuous Discovery Feed ("اكتشف المزيد") */}
            <section className="container py-4 md:py-6" dir="rtl">
              <div className="mb-3 md:mb-4 flex items-center justify-between gap-3 text-right">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-1 rounded-full bg-primary" />
                    <h2 className="font-tajawal text-xl sm:text-2xl md:text-3xl font-extrabold text-navy flex items-center gap-2">
                      <span>اكتشف المزيد في ديلمارت</span>
                      <Tag size={20} className="text-primary shrink-0" strokeWidth={2.2} />
                    </h2>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground font-medium pr-3">
                    تصفح تشكيلة شاملة ومتجددة من المنتجات المتاحة للتوصيل الفوري
                  </p>
                </div>
              </div>

              <HomeDiscoveryFeed curatedProductIds={curatedProductIds} />
            </section>
          </>
        )}
      </main>

      {/* ── WhatsApp Floating Action ──────────────────────────────────────── */}
      <WhatsAppButton />

      {/* ── Modern Marketplace Footer ─────────────────────────────────────── */}
      <Footer />
    </div>
  );
};

export default Index;
