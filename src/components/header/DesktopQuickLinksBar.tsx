import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/api-client";
import { classifyDesktopQuickLinkHref } from "@/lib/desktop-quick-link-href";

const LINK_CLASS = "font-medium text-foreground transition-colors hover:text-DilMart-store-gold-bright";

export default function DesktopQuickLinksBar() {
  const { data: links } = useQuery({
    queryKey: ["desktop-quick-links"],
    queryFn: () => apiClient.listDesktopQuickLinks(),
  });

  if (!links || links.length === 0) return null;

  return (
    <div className="w-full border-t border-DilMart-store-gold/30 bg-[linear-gradient(90deg,rgba(238,210,145,0.40)_0%,rgba(205,164,88,0.34)_40%,rgba(128,95,43,0.32)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <div className="container">
        <div dir="rtl" className="flex h-11 items-center gap-5 overflow-x-auto whitespace-nowrap text-sm [scrollbar-width:none]">
          {links.map((item) => {
            // Defense in depth — the backend already filters invalid hrefs out of this response
            // (DilMart-STORE-DESKTOP-QUICK-LINKS-SECURITY-047/048), but this component never
            // trusts that alone: it classifies every href itself before deciding whether to
            // render it as clickable navigation. Policy is internal-only — no external anchor path.
            const classification = classifyDesktopQuickLinkHref(item.href);
            if (classification === "VALID_INTERNAL") {
              return (
                <Link key={item.id} to={item.href} className={LINK_CLASS}>
                  {item.label}
                </Link>
              );
            }
            // Invalid href — render the label as inert text, never a clickable navigation target.
            return (
              <span key={item.id} className="font-medium text-muted-foreground/60">
                {item.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
