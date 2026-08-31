import { Link } from "react-router-dom";
import { storeConfig } from "@/config/store";

type BrandMarkProps = {
  variant?: "header" | "footer" | "mobile";
  asHomeLink?: boolean;
  className?: string;
  theme?: "light" | "navy";
};

/**
 * DilMart Brand Symbol Component
 * Visual Concept: Merged D + M architectural monogram with orange forward/directional arrow accent.
 * Status: Isolated SVG implementation. Awaiting final approved production vector master.
 */
export function DilMartBrandIcon({ className = "h-9 w-9", isNavy = false }: { className?: string; isNavy?: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 select-none`}
      aria-hidden="true"
    >
      {/* Container / Base Geometry */}
      <rect width="48" height="48" rx="12" fill={isNavy ? "#071A3D" : "#1261D8"} />
      
      {/* Monogram Base: Interlocking 'D' and 'M' Paths */}
      {/* 'D' Stem & Arch */}
      <path
        d="M12 13C12 11.8954 12.8954 11 14 11H23C27.9706 11 32 15.0294 32 20C32 24.9706 27.9706 29 23 29H18V35C18 36.1046 17.1046 37 16 37H14C12.8954 37 12 36.1046 12 35V13Z"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
      <path
        d="M18 17H22C23.6569 17 25 18.3431 25 20C25 21.6569 23.6569 23 22 23H18V17Z"
        fill={isNavy ? "#071A3D" : "#1261D8"}
      />

      {/* 'M' and Forward Directional Arrow (Accent Orange: #FF8A00) */}
      <path
        d="M26 23L33 16M33 16H27M33 16V22"
        stroke="#FF8A00"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27 37L32 30L37 37"
        stroke="#FF8A00"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Modern DilMart Marketplace Brand Mark
 * Official brand lockup: D+M Directional Symbol + Arabic & Latin wordmarks.
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

  const arClass = isFooter
    ? "font-tajawal text-2xl md:text-3xl font-black tracking-tight text-white leading-none"
    : isMobile
    ? "font-tajawal text-xl font-black tracking-tight text-white leading-none"
    : "font-tajawal text-2xl md:text-2xl font-black tracking-tight text-navy leading-none";

  const enClass = isFooter
    ? "font-manrope text-[11px] font-extrabold uppercase tracking-[0.25em] text-blue-200/80 mt-1"
    : isMobile
    ? "font-manrope text-[9px] font-extrabold uppercase tracking-[0.2em] text-blue-200 mt-0.5"
    : "font-manrope text-[10px] font-extrabold uppercase tracking-[0.22em] text-primary mt-0.5";

  const inner = (
    <div
      className={`flex items-center gap-2.5 md:gap-3 select-none ${className}`}
      dir="rtl"
      role="group"
      aria-label={`${storeConfig.brand.ar} ${storeConfig.brand.en}`}
    >
      <DilMartBrandIcon
        className={isFooter ? "h-11 w-11" : isMobile ? "h-9 w-9" : "h-10 w-10"}
        isNavy={isNavyTheme && !isFooter}
      />

      <div className="flex min-w-0 flex-col items-start text-right">
        <div className="flex items-center gap-1.5">
          <span className={arClass}>{storeConfig.brand.ar}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-black tracking-wider ${
              isNavyTheme
                ? "bg-accent text-white"
                : "bg-accent/15 text-accent"
            }`}
          >
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
