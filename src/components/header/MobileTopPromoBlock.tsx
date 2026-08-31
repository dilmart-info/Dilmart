import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PackageSearch, Truck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
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
            compact ? "max-h-0 opacity-0 pointer-events-none mb-0" : "max-h-12 opacity-100 mb-2"
          }`}
        >
          <div className="flex h-9 items-center justify-between">
            {/* Delivery Guarantee Pill */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-200 bg-white/10 px-2.5 py-1 rounded-full">
              <Truck size={13} className="text-accent" />
              <span>توصيل سريع وموثوق</span>
            </div>

            {/* Brand Logo */}
            <Link to="/" className="flex shrink-0">
              <BrandMark variant="mobile" asHomeLink theme="navy" />
            </Link>

            {/* Track Order Shortcut */}
            <Link
              to="/track-order"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-blue-200 hover:text-white bg-white/10"
              aria-label="تتبع طلبك"
            >
              <PackageSearch size={14} className="text-accent" />
              <span>تتبع</span>
            </Link>
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
