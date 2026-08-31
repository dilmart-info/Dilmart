import { Link } from "react-router-dom";
import { storeConfig } from "@/config/store";

type BrandMarkProps = {
  variant?: "header" | "footer" | "mobile";
  asHomeLink?: boolean;
  className?: string;
  theme?: "light" | "navy";
};

/**
 * Official DilMart Logo Asset URLs (from /logo/ directory)
 */
export const DILMART_LOGO_FULL = "/logo/dilmart-store-logo.png";
export const DILMART_ICON_ONLY = "/logo/dilmart-store-icon-only.png";
export const DILMART_APP_ICON = "/logo/dilmart-store-icon-only2.png";

/**
 * Official DilMart Marketplace Brand Mark
 * Uses the official brand mark assets located in the project's logo directory.
 */
export function BrandMark({
  variant = "header",
  asHomeLink = false,
  className = "",
  theme = "light",
}: BrandMarkProps) {
  const isFooter = variant === "footer";
  const isMobile = variant === "mobile";
  const isNavyTheme = theme === "navy" || isFooter;

  const inner = (
    <div
      className={`flex items-center gap-2.5 select-none ${className}`}
      dir="rtl"
      role="group"
      aria-label={`${storeConfig.brand.ar} ${storeConfig.brand.en}`}
    >
      {isFooter ? (
        // Footer (Navy background): App icon + white typography
        <div className="flex items-center gap-3">
          <img
            src={DILMART_APP_ICON}
            alt="DilMart Icon"
            className="h-11 w-11 rounded-xl shadow-sm object-contain"
            loading="eager"
          />
          <div className="flex flex-col text-right">
            <div className="flex items-center gap-1.5">
              <span className="font-tajawal text-2xl font-black text-white tracking-tight leading-none">
                {storeConfig.brand.ar}
              </span>
              <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white">
                MARKET
              </span>
            </div>
            <span className="font-manrope text-[11px] font-extrabold uppercase tracking-[0.25em] text-blue-200/80 mt-1">
              {storeConfig.brand.en}
            </span>
          </div>
        </div>
      ) : isMobile ? (
        // Mobile Header (Navy background): App icon with white D+M and orange dot + white wordmark
        <div className="flex items-center gap-2">
          <img
            src={DILMART_APP_ICON}
            alt="DilMart"
            className="h-8 w-8 rounded-lg shadow-sm object-contain"
            loading="eager"
          />
          <div className="flex flex-col text-right">
            <div className="flex items-center gap-1">
              <span className="font-tajawal text-lg font-black text-white tracking-tight leading-none">
                {storeConfig.brand.ar}
              </span>
              <span className="rounded bg-accent px-1 py-0.2 text-[8px] font-black text-white">
                MARKET
              </span>
            </div>
            <span className="font-manrope text-[8px] font-extrabold uppercase tracking-[0.2em] text-blue-200">
              {storeConfig.brand.en}
            </span>
          </div>
        </div>
      ) : (
        // Desktop Header: Official full horizontal logo image
        <div className="flex items-center">
          <img
            src={DILMART_LOGO_FULL}
            alt="DilMart | ديلمارت"
            className="h-10 w-auto object-contain max-w-[200px]"
            loading="eager"
          />
        </div>
      )}
    </div>
  );

  if (asHomeLink) {
    return (
      <Link
        to="/"
        className="flex-shrink-0 outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
