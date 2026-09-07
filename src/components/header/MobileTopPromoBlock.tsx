import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PackageSearch } from "lucide-react";
import { DILMART_APP_ICON } from "@/components/BrandMark";
import { storeConfig } from "@/config/store";
import SearchBar from "@/components/SearchBar";

type MobileTopPromoBlockProps = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSearch: (e: React.FormEvent) => void;
};

export default function MobileTopPromoBlock({
  searchQuery,
  setSearchQuery,
  onSearch,
}: MobileTopPromoBlockProps) {
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const [compact, setCompact] = useState(false);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);

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

        if (currentScrollY < 30) {
          setCompact(false);
        } else if (currentScrollY > 70 && scrollingDown) {
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
    <div
      data-testid="mobile-top-promo-block"
      className="md:hidden mobile-safe-area-top bg-navy text-white shadow-md border-b border-white/10"
    >
      {/* ── Top Micro Bar ─────────────────────────────────────────────── */}
      <div className="container py-2" dir="rtl">
        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            compact ? "max-h-0 opacity-0 pointer-events-none mb-0" : "max-h-20 opacity-100 mb-2"
          }`}
        >
          <div className="grid grid-cols-[1fr_auto_1fr] min-h-9 items-center gap-2">
            {/* Right: DilMart Blue App Logo */}
            <div className="flex items-center justify-start">
              <Link
                to="/"
                className="inline-flex items-center focus:outline-none"
                aria-label="الرئيسية"
              >
                <img
                  src={DILMART_APP_ICON}
                  alt="ديلمارت"
                  className="h-8 w-8 rounded-lg shadow-sm object-contain"
                  loading="eager"
                />
              </Link>
            </div>

            {/* Center: Brand Wordmark */}
            <Link
              to="/"
              className="flex flex-col items-center justify-center text-center select-none outline-none"
              aria-label={`${storeConfig.brand.ar} ${storeConfig.brand.en}`}
            >
              <span className="font-tajawal text-lg font-black text-white tracking-tight leading-none">
                {storeConfig.brand.ar}
              </span>
              <span className="font-manrope text-[9px] font-extrabold uppercase tracking-[0.2em] text-blue-200 leading-none mt-0.5">
                {storeConfig.brand.en}
              </span>
            </Link>

            {/* Left: Track Order Shortcut */}
            <div className="flex items-center justify-end">
              <Link
                to="/track-order"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-blue-200 hover:text-white bg-white/10 shrink-0"
                aria-label="تتبع طلبك"
              >
                <PackageSearch size={14} className="text-accent" />
                <span>تتبع</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Search Bar in Mobile Header */}
        <div className="pb-1">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={onSearch}
            placeholder="ابحث في ديلمارت..."
          />
        </div>
      </div>
    </div>
  );
}
