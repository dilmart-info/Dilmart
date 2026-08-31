import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { classifyDesktopQuickLinkHref } from "@/lib/desktop-quick-link-href";

const LINK_CLASS =
  "inline-flex items-center gap-1.5 font-bold text-xs text-foreground/80 hover:text-primary transition-colors py-1 px-3 rounded-md hover:bg-primary/10";

export default function DesktopQuickLinksBar() {
  const { data: links } = useQuery({
    queryKey: ["desktop-quick-links"],
    queryFn: () => apiClient.listDesktopQuickLinks(),
  });

  if (!links || links.length === 0) {
    return null;
  }

  return (
    <div className="w-full border-b border-border/70 bg-surface-light/80 backdrop-blur-md">
      <div className="container">
        <div
          dir="rtl"
          className="flex h-8 items-center justify-between overflow-x-auto whitespace-nowrap text-xs [scrollbar-width:none]"
        >
          <div className="flex items-center gap-1.5">
            {links.map((item) => {
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
