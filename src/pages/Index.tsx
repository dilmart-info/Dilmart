import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import { Flame, Sparkles, Star, Tag, Trophy, Truck, ShieldCheck, RotateCcw, Zap } from "lucide-react";
import {
  filterRootStorefrontCategories,
  NEUTRAL_CATEGORY_PLACEHOLDER,
  type StorefrontCategory,
} from "@/lib/category-hierarchy";

function HomeDiscoverSkeleton() {
  return (
    <div className="container space-y-6 py-6" dir="rtl">
      <Skeleton className="h-[22rem] w-full rounded-2xl bg-muted/40" />
      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl bg-muted/30" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl bg-muted/30" />
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
    return filterRootStorefrontCategories(rows);
  }, [homeData?.categories]);

  const offers = (homeData?.offerProducts ?? []) as MarketplaceHomeProduct[];
  const featured = (homeData?.featuredProducts ?? []) as MarketplaceHomeProduct[];
  const news = (homeData?.newProducts ?? []) as MarketplaceHomeProduct[];
  const featuredMerchants = homeData?.featuredMerchants ?? [];
  const brands = brandsData?.brands ?? [];

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

  const heroSlides = [
    {
      id: "hero-mega-deals",
      badge: "عروض كبرى",
      title: "تخفيضات ديلمارت الكبرى تصل إلى 50%",
      subtitle: "آلاف المنتجات بأفضل الأسعار مع توصيل سريع لجميع محافظات العراق والدفع عند الاستلام.",
      valueProps: ["منتجات أصلية 100%", "دفع آمن عند الاستلام", "ضمان استرجاع", "توصيل لكافة المحافظات"],
      ctaLabel: "تسوق العروض الآن",
      href: "/offers",
      image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1600&q=85&auto=format&fit=crop",
    },
    {
      id: "hero-new-arrivals",
      badge: "وصل حديثاً",
      title: "أحدث المنتجات والماركات العالمية",
      subtitle: "تشكيلة متجددة يومياً من الأجهزة، الإلكترونيات، العناية، والمزيد.",
      valueProps: ["أحدث الإصدارات", "ماركات معتمدة", "شحن سريع ومباشر", "خدمة عملاء متواصلة"],
      ctaLabel: "استكشف الجديد",
      href: "/products?sort=newest",
      image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&q=85&auto=format&fit=crop",
    },
    {
      id: "hero-top-stores",
      badge: "متاجر رسمية",
      title: "تسوق مباشرة من كبرى المتاجر والشركات",
      subtitle: "وجهتك الموثوقة للتسوق الإلكتروني مع عروض حصرية يومية وتغطية لكافة محافظات العراق.",
      valueProps: ["متاجر موثقة", "أسعار منافسة", "توصيل مباشر", "فحص الطلب قبل الاستلام"],
      ctaLabel: "تصفح المتاجر",
      href: "/stores",
      image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600&q=85&auto=format&fit=crop",
    },
  ];

  const sideCards = [
    {
      id: "side-flash-deals",
      badge: "خصم يصل 40%",
      title: "عروض وتخفيضات اليوم الحصرية",
      href: "/offers",
      image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=800&q=85&auto=format&fit=crop",
    },
    {
      id: "side-stores",
      badge: "متاجر مميزة",
      title: "دليل المتاجر الرسمية المعتمدة",
      href: "/stores",
      image: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&q=85&auto=format&fit=crop",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary selection:text-white">
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <Header />

      {/* ── Main Content ──────────────────────────────────────────────────── */}
      <main className="flex-1 space-y-2 md:space-y-4">
        {homeLoading ? (
          <HomeDiscoverSkeleton />
        ) : (
          <>
            {/* 1. Hero Promo Slider & Side Promo Banners */}
            <HeroSlider slides={heroSlides} sideCards={sideCards} loading={false} />

            {/* 2. Trust Value Propositions Bar (Desktop & Mobile) */}
            <section className="container py-2" dir="rtl">
              <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-right">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Truck size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <h4 className="font-tajawal text-xs sm:text-sm font-extrabold text-navy">توصيل لكافة المحافظات</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground">شحن سريع ومباشر لباب المنزل</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ShieldCheck size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <h4 className="font-tajawal text-xs sm:text-sm font-extrabold text-navy">منتجات أصلية 100%</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground">ضمان الجودة من المتاجر المعتمدة</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <RotateCcw size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <h4 className="font-tajawal text-xs sm:text-sm font-extrabold text-navy">دفع عند الاستلام</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground">افحص طلبك وادفع بأمان</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Zap size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <h4 className="font-tajawal text-xs sm:text-sm font-extrabold text-navy">عروض يومية حصرية</h4>
                      <p className="text-[10px] sm:text-[11px] text-muted-foreground">أسعار منافسة وتخفيضات مستمرة</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Top Categories Discovery */}
            <CategoryGrid
              title="تسوق حسب الفئات"
              subtitle="استكشف تشكيلاتنا الواسعة والمختارة بعناية"
              items={topCategories}
              fallbackImage={NEUTRAL_CATEGORY_PLACEHOLDER}
              viewAllHref="/products"
              viewAllLabel="عرض كل الأقسام"
            />

            {/* 4. Flash Deals & Offers (if present) */}
            {offers.length > 0 && (
              <ProductSection
                title="عروض وتخفيضات اليوم"
                subtitle="خصومات حصرية لفترة محدودة على منتجات مختارة"
                href="/offers"
                products={offers}
                horizontal
                titleIcon={Flame}
                badge="عروض كبرى 🔥"
              />
            )}

            {/* 5. Featured Products / Best Sellers */}
            {featured.length > 0 && (
              <ProductSection
                title="المنتجات المميزة والأكثر طلباً"
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
            <section className="container py-8 md:py-12" dir="rtl">
              <div className="mb-6 flex items-center justify-between gap-3 text-right">
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
