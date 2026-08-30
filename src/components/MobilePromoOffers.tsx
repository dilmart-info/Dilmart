import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MarketplaceHomeProduct } from "@/lib/marketplace-home.types";

type PromoSlide = {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  href: string;
};

const FALLBACK_PROMO_SLIDES: PromoSlide[] = [
  {
    id: "promo-1",
    image: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=1400&q=80&auto=format&fit=crop",
    title: "عروض الحلاقة الاحترافية",
    subtitle: "خصومات وروابط مباشرة لصفحة العروض",
    href: "/offers",
  },
  {
    id: "promo-2",
    image: "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=1400&q=80&auto=format&fit=crop",
    title: "ماكينات وتشطيبات دقيقة",
    subtitle: "تشكيلة مختارة للمحترفين والهواة",
    href: "/offers",
  },
  {
    id: "promo-3",
    image: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=1400&q=80&auto=format&fit=crop",
    title: "منتجات العناية اليومية",
    subtitle: "اكتشف العروض الجديدة كل يوم",
    href: "/offers",
  },
];

type MobilePromoOffersProps = {
  offers: MarketplaceHomeProduct[];
};

export default function MobilePromoOffers({ offers }: MobilePromoOffersProps) {
  const [activeSlide, setActiveSlide] = useState(0);

  const promoSlides = useMemo<PromoSlide[]>(() => {
    const fromOffers = offers
      .filter((p) => p.is_mobile_promo && p.slug && (p.mobile_promo_image_url || p.images?.[0]))
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        image: p.mobile_promo_image_url || p.images?.[0] || FALLBACK_PROMO_SLIDES[0].image,
        title: p.name,
        subtitle: "عرض خاص لفترة محدودة",
        href: `/product/${p.slug}`,
      }));

    if (fromOffers.length > 0) return fromOffers;

    const offerFallback = offers
      .filter((p) => p.slug && p.images?.[0])
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        image: p.images?.[0] || FALLBACK_PROMO_SLIDES[0].image,
        title: p.name,
        subtitle: "عرض خاص لفترة محدودة",
        href: `/product/${p.slug}`,
      }));

    return offerFallback.length > 0 ? offerFallback : FALLBACK_PROMO_SLIDES;
  }, [offers]);

  const slideCount = promoSlides.length;
  const currentSlide = promoSlides[activeSlide] ?? promoSlides[0];

  useEffect(() => {
    if (slideCount <= 1) return;
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slideCount);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [slideCount]);

  useEffect(() => {
    if (activeSlide >= slideCount) setActiveSlide(0);
  }, [activeSlide, slideCount]);

  return (
    <section className="container pb-2 pt-1 md:hidden" dir="rtl">
      <Link
        to={currentSlide.href}
        className="group relative block overflow-hidden rounded-[1.75rem] border border-DilMart-store-gold/15 bg-black/70 shadow-[0_10px_26px_rgba(0,0,0,0.38)]"
        aria-label="عروض خاصة"
      >
        <img
          src={currentSlide.image}
          alt={currentSlide.title}
          loading="lazy"
          className="h-[150px] w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <div className="absolute bottom-0 right-0 left-0 p-3 text-right">
          <p className="line-clamp-1 text-sm font-semibold text-white">{currentSlide.title}</p>
          <p className="mt-1 text-xs text-white/85">{currentSlide.subtitle}</p>
        </div>
      </Link>
    </section>
  );
}
