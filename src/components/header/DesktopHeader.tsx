import { Link } from "react-router-dom";
import { PackageSearch } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import SearchBar from "@/components/SearchBar";
import IconNav, { CategoryDrawerTrigger, type CategoryNode } from "@/components/IconNav";
import DesktopQuickLinksBar from "@/components/header/DesktopQuickLinksBar";

type DesktopHeaderProps = {
  categories: CategoryNode[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSearch: (e: React.FormEvent) => void;
};

export default function DesktopHeader({ categories, searchQuery, setSearchQuery, onSearch }: DesktopHeaderProps) {
  return (
    <div className="hidden border-b border-DilMart-store-gold/10 bg-background/90 backdrop-blur-xl md:block">
      <div className="border-b border-DilMart-store-gold/10">
        <div className="container flex h-8 items-center justify-between text-xs text-muted-foreground" dir="rtl">
          <Link
            to="/track-order"
            className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-DilMart-store-gold"
          >
            <PackageSearch size={13} strokeWidth={1.6} />
            <span>تتبع طلبك</span>
          </Link>
          <span className="font-medium tracking-wide">توصيل لكل المحافظات</span>
        </div>
      </div>
      <div className="container py-2 md:py-3">
        <div className="flex items-center gap-1.5 md:gap-3" dir="rtl">
          <Link to="/" className="flex shrink-0">
            <BrandMark variant="header" asHomeLink />
          </Link>

          <CategoryDrawerTrigger categories={categories} className="hidden md:flex" />

          <div className="min-w-0 flex-1">
            <SearchBar value={searchQuery} onChange={setSearchQuery} onSubmit={onSearch} />
          </div>

          <IconNav categories={categories} />
        </div>
      </div>
      <DesktopQuickLinksBar />
    </div>
  );
}
