import { Link } from "react-router-dom";
import { PackageSearch, PhoneCall, ShieldCheck, Store, Truck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import SearchBar from "@/components/SearchBar";
import IconNav, { CategoryDrawerTrigger, type CategoryNode } from "@/components/IconNav";
import DesktopQuickLinksBar from "@/components/header/DesktopQuickLinksBar";
import { isNative } from "@/lib/capacitor";

type DesktopHeaderProps = {
  categories: CategoryNode[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSearch: (e: React.FormEvent) => void;
};

export default function DesktopHeader({
  categories,
  searchQuery,
  setSearchQuery,
  onSearch,
}: DesktopHeaderProps) {
  const native = isNative();

  return (
    <div className="hidden md:block w-full shadow-sm bg-white">
      {/* ── Top Utility Bar (Deep Navy: #071A3D) ─────────────────────────── */}
      <div className="bg-navy text-white/90 border-b border-white/10 text-xs">
        <div className="container flex h-9 items-center justify-between" dir="rtl">
          {/* Trust Value Props (Neutral Operational Language) */}
          <div className="flex items-center gap-6 font-medium">
            <span className="inline-flex items-center gap-1.5 text-blue-200">
              <Truck size={14} className="text-accent" />
              <span>توصيل سريع وموثوق</span>
            </span>
            <span className="hidden lg:inline-flex items-center gap-1.5 text-blue-200">
              <ShieldCheck size={14} className="text-accent" />
              <span>تسوق بثقة وأمان</span>
            </span>
          </div>

          {/* Utility Quick Links */}
          <div className="flex items-center gap-5">
            <Link
              to="/track-order"
              className="inline-flex items-center gap-1.5 text-white/80 hover:text-accent transition-colors font-medium"
            >
              <PackageSearch size={14} />
              <span>تتبع طلبك</span>
            </Link>

            <Link
              to="/support"
              className="inline-flex items-center gap-1.5 text-white/80 hover:text-accent transition-colors font-medium"
            >
              <PhoneCall size={13} />
              <span>خدمة العملاء</span>
            </Link>

            {!native && (
              <Link
                to="/merchant/register"
                className="inline-flex items-center gap-1.5 text-accent font-bold hover:underline transition-all"
              >
                <Store size={13} />
                <span>انضم كتاجر</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Navigation Bar ────────────────────────────────────────────── */}
      <div className="border-b border-border/80 bg-white">
        <div className="container py-3">
          <div className="flex items-center gap-4" dir="rtl">
            {/* Logo */}
            <Link to="/" className="flex shrink-0">
              <BrandMark variant="header" asHomeLink />
            </Link>

            {/* Category Mega Drawer Trigger */}
            <CategoryDrawerTrigger categories={categories} className="hidden md:flex shrink-0" />

            {/* Omnipresent Marketplace Search */}
            <div className="min-w-0 flex-1">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                onSubmit={onSearch}
                placeholder="ابحث عن المنتجات، الماركات، والمتاجر..."
              />
            </div>

            {/* Quick Actions (Wishlist, Account, Cart) */}
            <IconNav categories={categories} />
          </div>
        </div>
      </div>

      {/* ── Quick Categories & Sub-Navigation Bar ─────────────────────────── */}
      <DesktopQuickLinksBar />
    </div>
  );
}
