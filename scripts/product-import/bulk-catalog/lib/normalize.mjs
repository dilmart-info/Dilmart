/**
 * Deterministic slug + SKU normalization.
 */
export function normalizeSku(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function arabicSlugPart(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Stable deterministic slug: <name-slug>-<sku-lower>
 */
export function buildDeterministicSlug(name, sku) {
  const n = arabicSlugPart(name) || "product";
  const s = normalizeSku(sku).toLowerCase();
  if (!s) throw new Error("SLUG_REQUIRES_SKU");
  return `${n}-${s}`.slice(0, 180);
}
