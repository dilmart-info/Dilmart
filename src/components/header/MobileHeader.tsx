import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PackageSearch, WalletCards } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import SearchBar from "@/components/SearchBar";

type MobileHeaderProps = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSearch: (e: React.FormEvent) => void;
};

export default function MobileHeader({ searchQuery, setSearchQuery, onSearch }: MobileHeaderProps) {
  const [compact, setCompact] = useState(false);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (tickingRef.current) return;

      tickingRef.current = true;
      window.requestAnimationFrame(() => {
        const scrollingDown = currentScrollY > lastScrollYRef.current;

        if (currentScrollY < 30) {
          setCompact(false);
        } else if (currentScrollY > 60 && scrollingDown) {
          setCompact(true);
        }

        lastScrollYRef.current = currentScrollY;
        tickingRef.current = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="md:hidden border-b border-DilMart-store-gold/15 bg-gradient-to-b from-black via-[#17110b] to-[#1f1710]/95 shadow-[0_6px_18px_rgba(0,0,0,0.25)]">
      <div className="container py-2" dir="rtl">
        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            compact ? "max-h-0 opacity-0 pointer-events-none" : "max-h-20 opacity-100 mb-2"
          }`}
        >
          <div className="flex items-center justify-between">
            <Link
              to="/wallet"
              className="inline-flex min-w-[3.25rem] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-foreground/90 transition-colors hover:bg-DilMart-store-gold/10 hover:text-DilMart-store-gold"
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
              className="inline-flex min-w-[3.8rem] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-foreground/90 transition-colors hover:bg-DilMart-store-gold/10 hover:text-DilMart-store-gold"
              aria-label="تتبع طلبك"
            >
              <PackageSearch size={17} strokeWidth={1.8} />
              <span>تتبع طلبك</span>
            </Link>
          </div>
        </div>

        <SearchBar value={searchQuery} onChange={setSearchQuery} onSubmit={onSearch} className="w-full" />
      </div>
    </div>
  );
}
