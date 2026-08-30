import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useEffect, useMemo } from "react";
import {
  getHomeHeroMessagingExperiment,
  recordHomeHeroExperimentExposure,
} from "@/lib/experiments";
import { apiClient } from "@/lib/api-client";
import type { MarketplaceHomeProduct } from "@/lib/marketplace-home.types";
import HeroSlider from "@/components/HeroSlider";
import CategoryGrid from "@/components/CategoryGrid";
import ProductSection from "@/components/ProductSection";
import MerchantSection from "@/components/MerchantSection";
import BrandRail from "@/components/BrandRail";
import HomeDiscoveryFeed from "@/components/home/HomeDiscoveryFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Trophy } from "lucide-react";
import {
  filterRootStorefrontCategories,
  NEUTRAL_CATEGORY_PLACEHOLDER,
  type StorefrontCategory,
} from "@/lib/category-hierarchy";
import menSalonSlide from "../../assets/slide-1.png";
import womenSalonSlide from "../../assets/slide-2.png";

/** M2.3 — single page-level placeholder for discover area (merchants + categories + buckets) while home loads. */
function HomeDiscoverSkeleton() {
  return (
    <div className="container space-y-5 py-6">
      <Skeleton className="h-[24rem] w-full rounded-2xl bg-muted/35" />
      <Skeleton className="h-36 w-full rounded-2xl bg-muted/35" />
      <Skeleton className="h-60 w-full rounded-2xl bg-muted/35" />
    </div>
  );
}

const Index = () => {
  const heroExperiment = useMemo(() => getHomeHeroMessagingExperiment(), []);

  useEffect(() => {
    recordHomeHeroExperimentExposure(heroExperiment.variantId);
  }, [heroExperiment.variantId]);

  const { data: homeData, isLoading: homeLoading } = useQuery({
    queryKey: ["marketplace-home"],
    queryFn: () => apiClient.getMarketplaceHome(),
  });

  const { data: brandsData, isLoading: brandsLoading } = useQuery({
    queryKey: ["marketplace-brands"],
    queryFn: () => apiClient.getMarketplaceBrands(),
  });

  const contractOk = homeData == null || homeData.contractVersion === 1;

  const topCategories = useMemo(() => {
    const rows = (homeData?.categories as StorefrontCategory[] | undefined) ?? [];
    // Roots only — children must not appear as independent home tiles.
    return filterRootStorefrontCategories(rows);
  }, [homeData?.categories]);
  const offers = homeData?.offerProducts ?? [];
  const featured = (homeData?.featuredProducts ?? []) as MarketplaceHomeProduct[];
  const news = (homeData?.newProducts ?? []) as MarketplaceHomeProduct[];
  const featuredMerchants = homeData?.featuredMerchants ?? [];
  const brands = brandsData?.brands ?? [];

  const allProductBucketsEmpty = !homeLoading && featured.length === 0 && news.length === 0 && offers.length === 0;

  // Ids already shown in curated sections — passed to the discovery feed so it never repeats them.
  // Derived from the stable `homeData` reference (not the `?? []` fallbacks) to keep the memo stable.
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
      id: "hero-favorite-brands",
      title: "وصل حديثاً من العلامات المفضلة",
      subtitle: "منتجات جديدة تماماً باستمرار مع تجربة شراء سريعة.",
      ctaLabel: "شاهد الجديد",
      href: "/products?sort=newest",
      image: "/images/home/hero/hero-slide-03.webp",
    },
    {
      id: "hero-women-salon",
      title: "جهّزي صالونك بأعلى معايير الجمال",
      subtitle: "كل ما تحتاجينه لصالون متكامل من أدوات، أجهزة، ومواد احترافية — مختارة بعناية.",
      valueProps: [
        "أجهزة تصفيف احترافية",
        "أدوات ميكاب عالية الجودة",
        "عناية متكاملة بالبشرة والشعر",
        "منتجات أصلية بضمان",
      ],
      ctaLabel: "تسوّقي الآن",
      href: "/products?search=%D8%B5%D8%A7%D9%84%D9%88%D9%86%D8%A7%D8%AA%20%D9%86%D8%B3%D8%A7%D8%A6%D9%8A%D8%A9",
      image: womenSalonSlide,
    },
    {
      id: "hero-men-salon",
      title: "احتراف الحلاقة يبدأ من أدواتك",
      subtitle: "معدات متكاملة للحلاقين — دقة، قوة، وأداء يدوم.",
      valueProps: [
        "ماكينات حلاقة احترافية",
        "شفرات ومقصات عالية الدقة",
        "أدوات تحديد وتشذيب متقدمة",
        "منتجات عناية باللحية والشعر",
      ],
      ctaLabel: "استكشف الأدوات",
      href: "/products?search=%D8%A3%D8%AF%D9%88%D8%A7%D8%AA%20%D8%AD%D9%84%D8%A7%D9%82%D8%A9",
      image: menSalonSlide,
    },
    {
      id: "hero-main",
      title: heroExperiment.copy.headline,
      subtitle: heroExperiment.copy.subline,
      ctaLabel: heroExperiment.copy.ctaLabel,
      href: "/products",
      image: "/images/home/hero/hero-slide-01.webp",
    },
    {
      id: "hero-offers",
      title: "عروض يومية بأسعار منافسة",
      subtitle: "اكتشف أحدث التخفيضات على منتجات العناية والأجهزة.",
      ctaLabel: "تصفّح العروض",
      href: "/offers",
      image: "/images/home/hero/hero-slide-04.webp",
    },
  ];
  const sideCards = [
    {
      id: "side-offers",
      title: "أدوات حلاقة احترافية",
      href: "/offers",
      image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=1200&q=85&auto=format&fit=crop",
    },
    {
      id: "side-categories",
      title: "مستحضرات وتجهيزات الصالونات",
      href: "/products",
      image: "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=1200&q=85&auto=format&fit=crop",
    },
    {
      id: "side-brands",
      title: "عناية متكاملة للرجال والنساء",
      href: "/stores",
      image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200&q=85&auto=format&fit=crop",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 pb-16">
        {!contractOk && <div className="container py-4 text-center text-xs text-amber-600">تنبيه: إصدار عقد الصفحة الرئيسية غير متوقع.</div>}

        <HeroSlider slides={heroSlides} sideCards={sideCards} loading={homeLoading} />

        {homeLoading ? (
          <HomeDiscoverSkeleton />
        ) : (
          <>
            <MerchantSection merchants={featuredMerchants} />

            <BrandRail brands={brands} loading={brandsLoading} viewAllHref="/brands" />

            <CategoryGrid
              title="الأقسام السريعة"
              subtitle="اكتشف الأقسام الأكثر طلباً بسرعة"
              items={topCategories}
              fallbackImage={NEUTRAL_CATEGORY_PLACEHOLDER}
              viewAllHref="/products"
              viewAllLabel="عرض كل الأقسام"
            />

            {/* Best-sellers is the real is_best_seller bucket (featuredProducts). A second
                "trending" section previously rendered this same array under a different name —
                removed, since no distinct trending signal exists server-side. */}
            <ProductSection title="الأكثر مبيعاً" titleIcon={Trophy} href="/products" products={featured} horizontal />
            <ProductSection title="وصل حديثاً" titleIcon={Sparkles} href="/products?sort=newest" products={news} />
            <ProductSection title="عروض مختارة" href="/offers" products={offers as MarketplaceHomeProduct[]} />

            <HomeDiscoveryFeed curatedProductIds={curatedProductIds} />
          </>
        )}

        {allProductBucketsEmpty && !homeLoading && (
          <section className="container py-10">
            <div className="rounded-2xl border border-dashed border-DilMart-store-gold/25 bg-card/40 px-6 py-12 text-center">
              <h2 className="font-display text-xl font-semibold text-foreground md:text-2xl">اكتشف المنتجات والمتاجر</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                لا توجد مجموعات مميّزة حالياً، تصفّح المنتجات أو العروض لمعرفة الجديد.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link to="/products">
                  <Button size="lg" className="rounded-full px-8">
                    استكشف المنتجات
                  </Button>
                </Link>
                <Link to="/offers">
                  <Button size="lg" variant="outline" className="rounded-full border-DilMart-store-gold/35 px-8">
                    صفحة العروض
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default Index;
