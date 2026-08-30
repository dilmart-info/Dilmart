/** Storefront category hierarchy helpers (mirrors backend category-scope policy). */

export type StorefrontCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  is_active?: boolean | null;
  is_featured?: boolean | null;
  sort_order?: number | null;
  image_url?: string | null;
  icon_url?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  [key: string]: unknown;
};

/** Neutral SVG gradient — not a barber/salon stock photo. */
export const NEUTRAL_CATEGORY_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop stop-color="#1c1917"/><stop offset="0.55" stop-color="#292524"/><stop offset="1" stop-color="#44403c"/>` +
      `</linearGradient></defs>` +
      `<rect width="640" height="480" fill="url(#g)"/>` +
      `</svg>`,
  );

export function sortStorefrontCategories<T extends StorefrontCategory>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const feat = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
    if (feat !== 0) return feat;
    const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    if (so !== 0) return so;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ar");
  });
}

export function filterRootStorefrontCategories<T extends StorefrontCategory>(categories: T[]): T[] {
  return sortStorefrontCategories(
    categories.filter((c) => !c.parent_id && c.is_active !== false),
  );
}

export function resolveCategoryImageUrl(
  cat: StorefrontCategory,
  parent?: StorefrontCategory | null,
): string {
  const own = String(cat.image_url || "").trim();
  if (own) return own;
  const icon = String(cat.icon_url || "").trim();
  if (icon) return icon;
  const parentImage = String(parent?.image_url || "").trim();
  if (parentImage) return parentImage;
  const parentIcon = String(parent?.icon_url || "").trim();
  if (parentIcon) return parentIcon;
  return NEUTRAL_CATEGORY_PLACEHOLDER;
}

export function productsCategoryHref(slug: string): string {
  return `/products?category=${encodeURIComponent(slug)}`;
}
