import { Link } from "react-router-dom";
import { storeConfig } from "@/config/store";
import { ShoppingBag } from "lucide-react";

type BrandMarkProps = {
  variant?: "header" | "footer" | "mobile";
  asHomeLink?: boolean;
  className?: string;
  theme?: "light" | "navy";
};

/**
 * Modern DilMart Marketplace Brand Mark
 * Trustworthy, bold, mass-market marketplace branding with Primary Blue & Deep Navy.
 */
export function BrandMark({
  variant = "header",
  asHomeLink = false,
  className = "",
  theme = "light",
}: BrandMarkProps) {
  const isHeader = variant === "header";
  const isFooter = variant === "footer";
  const isMobile = variant === "mobile";

  const isNavyTheme = theme === "navy" || isFooter;

  const arClass = isFooter
    ? "font-tajawal text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-none"
    : isMobile
    ? "font-tajawal text-xl font-extrabold tracking-tight text-white leading-none"
    : "font-tajawal text-2xl md:text-2xl font-black tracking-tight text-navy leading-none";

  const enClass = isFooter
    ? "font-manrope text-[11px] font-bold uppercase tracking-[0.25em] text-blue-300/80 mt-1"
    : isMobile
    ? "font-manrope text-[9px] font-bold uppercase tracking-[0.2em] text-blue-200/90 mt-0.5"
    : "font-manrope text-[10px] font-bold uppercase tracking-[0.22em] text-primary mt-0.5";

  const inner = (
    <div
      className={`flex items-center gap-2.5 md:gap-3 select-none ${className}`}
      dir="rtl"
      role="group"
      aria-label={`${storeConfig.brand.ar} ${storeConfig.brand.en}`}
    >
      <div className="relative flex items-center justify-center">
        <div
          className={`flex items-center justify-center rounded-xl transition-transform duration-200 ${
            isFooter
              ? "h-11 w-11 bg-gradient-to-br from-primary to-blue-700 shadow-md shadow-primary/20"
              : isMobile
              ? "h-9 w-9 bg-white shadow-sm"
              : "h-10 w-10 bg-gradient-to-br from-primary to-blue-700 shadow-sm shadow-primary/30"
          }`}
        >
          <ShoppingBag
            className={
              isMobile
                ? "text-primary"
                : "text-white"
            }
            size={isFooter ? 22 : isMobile ? 18 : 20}
            strokeWidth={2.3}
          />
        </div>
        {/* Accent Orange Dot / Badge */}
        <span
          className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-accent ring-2 ring-white"
          aria-hidden="true"
        />
      </div>

      <div className="flex min-w-0 flex-col items-start text-right">
        <div className="flex items-center gap-1.5">
          <span className={arClass}>{storeConfig.brand.ar}</span>
          <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[9px] font-extrabold text-accent">
            MARKET
          </span>
        </div>
        <span className={enClass}>{storeConfig.brand.en}</span>
      </div>
    </div>
  );

  if (asHomeLink) {
    return (
      <Link
        to="/"
        className="flex-shrink-0 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
