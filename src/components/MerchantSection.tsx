import { Link } from "react-router-dom";
import { ChevronLeft, Store } from "lucide-react";

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

export default function MerchantSection({
  merchants,
  title = "المتاجر المعتمدة في ديلمارت",
  subtitle = "تسوق مباشرة من كبرى الشركات والمتاجر الموثوقة",
  viewAllHref = "/stores",
  viewAllLabel = "عرض كل المتاجر",
}: MerchantSectionProps) {
  if (merchants.length === 0) return null;

  return (
    <section className="container py-5 md:py-8" dir="rtl">
      <div className="mb-4 md:mb-6 flex items-end justify-between gap-3 text-right">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-primary" />
            <h2 className="font-tajawal text-xl sm:text-2xl md:text-3xl font-extrabold text-navy">
              {title}
            </h2>
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground font-medium pr-3">{subtitle}</p>
          )}
        </div>
        <Link
          to={viewAllHref}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary hover:text-primary-hover hover:underline transition-colors"
        >
          <span>{viewAllLabel}</span>
          <ChevronLeft size={14} />
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {merchants.map((m) => (
          <Link
            key={m.id}
            to={`/store/${m.slug}`}
            className="flex w-[11rem] sm:w-[13rem] shrink-0 items-center gap-3 rounded-2xl border border-border/80 bg-white p-3 text-right shadow-sm transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
          >
            {m.logo_url ? (
              <img
                src={m.logo_url}
                alt={m.display_name}
                loading="lazy"
                className="h-11 w-11 rounded-xl object-cover border border-border shrink-0 bg-surface-light"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Store size={20} strokeWidth={2} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span className="line-clamp-1 text-xs sm:text-sm font-extrabold text-navy group-hover:text-primary">
                {m.display_name}
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground block mt-0.5">
                متجر معتمد ✓
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
