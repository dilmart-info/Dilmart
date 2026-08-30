import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export type MerchantSectionMerchant = {
  id: string;
  slug: string;
  display_name: string;
  logo_url?: string | null;
};

type MerchantSectionProps = {
  merchants: MerchantSectionMerchant[];
  title?: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
};

/**
 * Seller/store entities on the platform — NOT product brands. See `BrandRail` for
 * the real brands section. Was previously mislabeled "العلامات التجارية".
 */
export default function MerchantSection({
  merchants,
  title = "المتاجر الموثوقة",
  subtitle = "متاجر وشركات موثوقة داخل المنصة",
  viewAllHref = "/stores",
  viewAllLabel = "عرض الكل",
}: MerchantSectionProps) {
  return (
    <section className="container py-4 md:py-5" dir="rtl">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="font-display text-lg font-semibold md:text-xl">{title}</h2>
          <p className="text-xs text-muted-foreground md:text-sm">{subtitle}</p>
        </div>
        <Link
          to={viewAllHref}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-DilMart-store-gold hover:text-DilMart-store-gold-bright md:text-sm"
        >
          <span>{viewAllLabel}</span>
          <ChevronLeft size={16} />
        </Link>
      </div>
      {merchants.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:gap-3">
          {merchants.map((m) => (
            <Link
              key={m.id}
              to={`/store/${m.slug}`}
              className="flex w-[9rem] shrink-0 items-center gap-2 rounded-xl border border-DilMart-store-gold/15 bg-card/85 p-2 text-right shadow-sm transition-colors hover:border-DilMart-store-gold/35 md:w-[10rem]"
            >
              {m.logo_url ? (
                <img src={m.logo_url} alt={m.display_name} loading="lazy" className="h-9 w-9 rounded-full object-cover md:h-10 md:w-10" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold md:h-10 md:w-10">
                  {m.display_name.slice(0, 2)}
                </div>
              )}
              <span className="line-clamp-2 text-xs font-semibold leading-snug">{m.display_name}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-DilMart-store-gold/20 bg-card/40 p-4 text-center text-sm text-muted-foreground">
          لا توجد متاجر موثوقة للعرض حالياً.
        </div>
      )}
    </section>
  );
}
