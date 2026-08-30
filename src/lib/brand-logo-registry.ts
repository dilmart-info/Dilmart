/**
 * Frontend-only presentation registry for brand logos.
 *
 * `GET /marketplace/brands` remains authoritative for which brands exist, `count`,
 * the representative product image, and the navigation target. This registry only
 * DECORATES a real brand name with an optional logo asset — it never invents a
 * brand, and a missing/failed entry always falls back to plain brand-name text in
 * the same pill (see `BrandTileVisual`). No brand data is stored or overridden here.
 *
 * Only real, trademark-safe, owner-supplied logo files may be added to `BRAND_LOGOS`.
 * Never scrape, hotlink, fabricate, or AI-generate a logo. See
 * `governance/CLOSURE_REPORT.md` for the current asset-pack request.
 */

import lattafaLogo from "@/assets/brands/lattafa-logo.svg";
import gilletteLogo from "@/assets/brands/gillette-logo.png";
import dorcoLogo from "@/assets/brands/dorco-logo.svg";
import derbyLogo from "@/assets/brands/derby-logo.png";
import beeslineLogo from "@/assets/brands/beesline-logo.png";
import omegaLogo from "@/assets/brands/omega-logo.png";
import lordLogo from "@/assets/brands/lord-logo.svg";
import vgrLogo from "@/assets/brands/vgr-logo.png";

export type BrandLogoEntry = {
  /** Statically imported asset path (Vite `import x from "..."`), never a hotlink or base64 blob. */
  logoUrl: string;
  /** Optional per-brand optical size tuning, clamped to 0.80–1.00. Omit for the full safe area. */
  logoScale?: number;
};

/**
 * Canonical normalized key -> logo entry. Only real, sourced-and-verified assets belong
 * here — see `governance/BRAND_LOGO_SOURCE_REGISTER.md` for the source, license basis,
 * and identity-confidence evidence behind every entry. Every other current production
 * brand has no entry and renders the text fallback (unverified identity, blocked/missing
 * source, or a white-only logo unusable on this light pill — see the register for why).
 */
const BRAND_LOGOS: Readonly<Record<string, BrandLogoEntry>> = {
  // VERIFIED_OFFICIAL — fetched directly from lattafa.com's own uploads path, alt="Lattafa
  // Perfumes" on the source page. Portrait emblem mark (their actual header logo, not a
  // wordmark) — object-contain naturally renders it as a small centered mark.
  lattafa: { logoUrl: lattafaLogo },
  // VERIFIED_OFFICIAL — fetched directly from gillette.com's own header, alt="gillette logo".
  gillette: { logoUrl: gilletteLogo },
  // VERIFIED_OFFICIAL — real vector wordmark fetched directly from dorcoglobal.com.
  dorco: { logoUrl: dorcoLogo, logoScale: 0.9 },
  // VERIFIED_OFFICIAL — fetched directly from derby-blades.com's own header, alt="Derby Logo".
  derby: { logoUrl: derbyLogo, logoScale: 0.85 },
  // VERIFIED_OFFICIAL — fetched directly from beesline.com's own CDN header asset.
  beesline: { logoUrl: beeslineLogo },
  // VERIFIED_OFFICIAL — fetched directly from omegabrush.com (Pennellificio Omega S.p.A.,
  // Italy, est. 1931). Store's `Omega` products are titled "Italian shaving brush" —
  // exact category + country match.
  omega: { logoUrl: omegaLogo, logoScale: 0.9 },
  // VERIFIED_OFFICIAL — real vector logo fetched directly from razorslord.com (LORD Co.,
  // Alexandria, Egypt, razor blades since 1930). Self-contained badge (blue box + white
  // wordmark), renders correctly on a light pill without needing a colored background.
  lord: { logoUrl: lordLogo },
  // VERIFIED_MANUFACTURER — fetched directly from cnvgr.com, confirmed via the site's own
  // structured data as "Ningbo VGR Electric Appliance Co.,Ltd.", exact category match
  // (hair clippers/trimmers).
  vgr: { logoUrl: vgrLogo },
};

/**
 * Explicit alias -> canonical key map. Only ever populated with a confirmed alias
 * (e.g. a brand appearing under two spellings in `products.brand`); never a fuzzy or
 * guessed mapping. Empty by default — no aliases are assumed.
 */
const BRAND_ALIASES: Readonly<Record<string, string>> = {};

const MIN_LOGO_SCALE = 0.8;
const MAX_LOGO_SCALE = 1;

/** Case-insensitive, whitespace-normalized registry key for a raw API brand name. */
export function normalizeBrandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns the registered logo entry for a brand name, or `null` if none exists. */
export function getBrandLogo(name: string): BrandLogoEntry | null {
  const key = normalizeBrandName(name);
  if (!key) return null;
  const canonicalKey = BRAND_ALIASES[key] ?? key;
  return BRAND_LOGOS[canonicalKey] ?? null;
}

/** Clamps an optional per-brand scale into the allowed optical-normalization range. */
export function clampLogoScale(scale: number | undefined): number {
  if (typeof scale !== "number" || Number.isNaN(scale)) return MAX_LOGO_SCALE;
  return Math.min(MAX_LOGO_SCALE, Math.max(MIN_LOGO_SCALE, scale));
}
