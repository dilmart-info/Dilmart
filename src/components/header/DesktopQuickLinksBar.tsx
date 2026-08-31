import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { classifyDesktopQuickLinkHref } from "@/lib/desktop-quick-link-href";
import { Flame, Sparkles, Star, Store, Tag } from "lucide-react";

const LINK_CLASS =
  "inline-flex items-center gap-1.5 font-semibold text-xs text-foreground/80 hover:text-primary transition-colors py-1 px-2.5 rounded-lg hover:bg-primary/10";

const DEFAULT_MARKETPLACE_QUICK_LINKS = [
  { id: "deals", label: "عروض اليوم", href: "/offers", icon: Flame, isHot: true },
  { id: "bestsellers", label: "الأكثر مبيعاً", href: "/products?sort=best_selling", icon: Star },
  { id: "new", label: "وصل حديثاً", href: "/products?sort=newest", icon: Sparkles },
  { id: "stores", label: "المتاجر الرسمية", href: "/stores", icon: Store },
  { id: "all-products", label: "جميع المنتجات", href: "/products", icon: Tag },
];

export default function DesktopQuickLinksBar() {
  const { data: links } = useQuery({
    queryKey: ["desktop-quick-links"],
    queryFn: () => apiClient.listDesktopQuickLinks(),
  });

  const hasDynamicLinks = Boolean(links && links.length > 0);

  return (
    <div className="w-full border-b border-border/70 bg-surface-light/80 backdrop-blur-md">
      <div className="container">
        <div
          dir="rtl"
          className="flex h-10 items-center justify-between overflow-x-auto whitespace-nowrap text-xs [scrollbar-width:none]"
        >
          {/* Main quick categories & hot links */}
          <div className="flex items-center gap-2">
            {DEFAULT_MARKETPLACE_QUICK_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  className={`inline-flex items-center gap-1.5 font-bold text-xs py-1.5 px-3 rounded-md transition-all ${
                    item.isHot
                      ? "bg-accent/15 text-accent hover:bg-accent hover:text-white"
                      : "text-foreground/85 hover:text-primary hover:bg-primary/10"
                  }`}
                >
                  <Icon size={14} className={item.isHot ? "text-accent" : "text-primary"} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Dynamic custom links from database (if present) */}
            {hasDynamicLinks &&
              links!.map((item) => {
                const classification = classifyDesktopQuickLinkHref(item.href);
                if (classification === "VALID_INTERNAL") {
                  return (
                    <Link key={item.id} to={item.href} className={LINK_CLASS}>
                      {item.label}
                    </Link>
                  );
                }
                return (
                  <span key={item.id} className="font-medium text-muted-foreground/60 px-2">
                    {item.label}
                  </span>
                );
              })}
          </div>

          {/* Quick Info Tag */}
          <div className="hidden xl:flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>تسوق آمن ومباشر</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
