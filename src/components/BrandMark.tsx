import { Link } from "react-router-dom";
import { storeConfig } from "@/config/store";

type BrandMarkProps = {
  /** في الهيدر: أصغر قليلاً؛ في الفوتر: الحجم الحالي */
  variant?: "header" | "footer";
  /** إذا وُجد، يُلف العلامة برابط للرئيسية */
  asHomeLink?: boolean;
  className?: string;
};

/**
 * هوية بصرية موحّدة: أيقونة + اسم عربي (خط العرض) + اسم إنجليزي بخط صغير — كما في الفوتر.
 */
export function BrandMark({ variant = "footer", asHomeLink = false, className = "" }: BrandMarkProps) {
  const isHeader = variant === "header";
  const iconClass = isHeader ? "h-9 w-9 md:h-10 md:w-10" : "h-12 w-12 md:h-14 md:w-14";
  const arClass = isHeader
    ? "font-display text-xl md:text-2xl font-semibold tracking-tight text-DilMart-store-gold-bright leading-tight"
    : "font-display text-2xl md:text-3xl font-semibold tracking-tight text-DilMart-store-gold-bright leading-tight";
  const enClass = isHeader
    ? "mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground md:text-xs"
    : "mt-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground md:text-sm";

  const inner = (
    <div
      className={`flex items-center gap-3 md:gap-4 ${className}`}
      dir="rtl"
      role="group"
      aria-label={`${storeConfig.brand.ar} ${storeConfig.brand.en}`}
    >
      <picture className={`${iconClass} shrink-0 select-none opacity-95`}>
        <source srcSet={storeConfig.iconWebpUrl} type="image/webp" />
        <img
          src={storeConfig.iconUrl}
          alt=""
          width={56}
          height={56}
          className="h-full w-full object-contain"
          draggable={false}
        />
      </picture>
      <div className="flex min-w-0 flex-col items-start text-right">
        <span className={arClass}>{storeConfig.brand.ar}</span>
        <span className={enClass}>{storeConfig.brand.en}</span>
      </div>
    </div>
  );

  if (asHomeLink) {
    return (
      <Link to="/" className="flex-shrink-0 outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-DilMart-store-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {inner}
      </Link>
    );
  }

  return inner;
}
