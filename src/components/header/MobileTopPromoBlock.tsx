import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch, WalletCards } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import SearchBar from "@/components/SearchBar";
import { apiClient } from "@/lib/api-client";
import type { MarketplaceHomeProduct } from "@/lib/marketplace-home.types";

type MobileTopPromoBlockProps = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSearch: (e: React.FormEvent) => void;
};

const MOBILE_HEADER_PROMO_BG =
  "https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=2000&q=85&auto=format&fit=crop";

export default function MobileTopPromoBlock({ searchQuery, setSearchQuery, onSearch }: MobileTopPromoBlockProps) {
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const [compact, setCompact] = useState(false);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);
  const { data: homeData } = useQuery({
    queryKey: ["marketplace-home"],
    queryFn: () => apiClient.getMarketplaceHome(),
  });
  const promoProduct = ((homeData?.offerProducts ?? []) as MarketplaceHomeProduct[]).find((p) => p.is_mobile_promo);

  useEffect(() => {
    if (!isHomePage) {
      setCompact(false);
      return;
    }
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (tickingRef.current) return;

      tickingRef.current = true;
      window.requestAnimationFrame(() => {
        const scrollingDown = currentScrollY > lastScrollYRef.current;

        if (currentScrollY < 35) {
          setCompact(false);
        } else if (currentScrollY > 75 && scrollingDown) {
          setCompact(true);
        }

        lastScrollYRef.current = currentScrollY;
        tickingRef.current = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHomePage]);

  return (
    // mobile-safe-area-top sits on this wrapper, not on SearchBar: the background keeps
    // bleeding behind the status bar while every interactive child starts below it.
    <div
      data-testid="mobile-top-promo-block"
      className={`md:hidden mobile-safe-area-top border-b ${
        isHomePage
          ? "border-DilMart-store-gold/15 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          : "border-border bg-background"
      }`}
      style={
        isHomePage
          ? {
              backgroundImage:
                `linear-gradient(135deg, rgba(11,8,3,0.86) 0%, rgba(27,18,6,0.8) 45%, rgba(58,38,8,0.76) 100%), url(${MOBILE_HEADER_PROMO_BG})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div className="container py-1.5" dir="rtl">
        {isHomePage ? (
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              compact ? "max-h-0 opacity-0 pointer-events-none" : "max-h-16 opacity-100 mb-1.5"
            }`}
          >
            <div className="flex h-10 items-center justify-between">
              <Link
                to="/auth"
                className="inline-flex min-w-[3.25rem] items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-foreground/90 transition-colors hover:bg-DilMart-store-gold/10 hover:text-DilMart-store-gold"
                aria-label="المحفظة"
              >
                <WalletCards size={17} strokeWidth={1.8} />
                <span>المحفظة</span>
              </Link>

              <Link to="/" className="flex shrink-0">
                <BrandMark variant="header" asHomeLink />
              </Link>

              <Link
                to="/track-order"
                className="inline-flex min-w-[3.8rem] items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-foreground/90 transition-colors hover:bg-DilMart-store-gold/10 hover:text-DilMart-store-gold"
                aria-label="تتبع طلبك"
              >
                <PackageSearch size={17} strokeWidth={1.8} />
                <span>تتبع طلبك</span>
              </Link>
            </div>
          </div>
        ) : null}

        <SearchBar value={searchQuery} onChange={setSearchQuery} onSubmit={onSearch} className="w-full" />

        {isHomePage ? (
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              compact ? "max-h-0 opacity-0 pointer-events-none pt-0" : "max-h-[200px] opacity-100 pt-1.5"
            }`}
          >
            <Link
              to={promoProduct?.slug ? `/product/${promoProduct.slug}` : "/offers"}
              className="group relative block h-[132px] overflow-hidden rounded-[1.1rem] bg-transparent px-3 py-2"
              aria-label="عروض مختارة"
            >
              {promoProduct?.mobile_promo_image_url || promoProduct?.images?.[0] ? (
                <img
                  src={promoProduct.mobile_promo_image_url || promoProduct.images?.[0]}
                  alt={promoProduct.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-25"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-l from-black/35 via-black/15 to-transparent" />
              <div className="relative z-10 flex h-full flex-col justify-between text-right">
                <div className="space-y-1">
                  <p className="text-[15px] font-semibold text-white">
                    {promoProduct ? promoProduct.name : "عروض مختارة للعناية والجمال"}
                  </p>
                  <p className="max-w-[14rem] text-[11px] leading-relaxed text-white/80">
                    {promoProduct ? "عرض مختار من لوحة الإدارة للموبايل." : "اكتشف منتجات مميزة من متاجر موثوقة بخصومات مستمرة."}
                  </p>
                </div>
                <div>
                  <span className="inline-flex items-center rounded-full bg-DilMart-store-gold/95 px-3.5 py-1.5 text-[11px] font-semibold text-black transition-colors group-hover:bg-DilMart-store-gold-bright">
                    تسوّق الآن
                  </span>
                </div>
              </div>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
