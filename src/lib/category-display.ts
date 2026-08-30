/** Presentation-only helpers for category discovery tiles. No data is mutated. */

/** Separator glyphs that must never survive as the last token of a short label. */
const SEPARATORS = new Set(["—", "–", "-", "|", "،", ","]);

/**
 * Shorten a long category name for a compact discovery tile.
 *
 * The full name stays available to assistive tech and tooltips; this only picks
 * the leading words that fit a two-line tile label. A future CMS `display_label`
 * field should replace this heuristic.
 */
export function toCategoryDisplayLabel(name: string, maxChars = 14): string {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;

  const words = clean.split(" ");
  const picked: string[] = [];
  for (const word of words) {
    if (SEPARATORS.has(word)) {
      if (picked.length >= 2) break;
      continue;
    }
    const next = picked.length === 0 ? word : `${picked.join(" ")} ${word}`;
    if (next.length > maxChars && picked.length >= 2) break;
    picked.push(word);
    if (picked.join(" ").length >= maxChars) break;
  }
  while (picked.length > 1 && SEPARATORS.has(picked[picked.length - 1])) picked.pop();
  return picked.length > 0 ? picked.join(" ") : clean.slice(0, maxChars);
}

/** First visible character of a category name, used by the designed image fallback. */
export function categoryInitial(name: string): string {
  const clean = String(name ?? "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return clean ? Array.from(clean)[0] : "•";
}

const LIGHT_INK = "#F7F4EF";
const DARK_INK = "#14110F";

function parseColor(input: string): [number, number, number] | null {
  const value = input.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** Relative luminance per WCAG 2.1, `null` when the color cannot be parsed. */
export function colorLuminance(color?: string | null): number | null {
  if (!color) return null;
  const parsed = parseColor(color);
  if (!parsed) return null;
  const [r, g, b] = parsed.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Ink color guaranteed to stay readable on `background`.
 *
 * A category may set `background_color` without `text_color`; that combination
 * must never produce dark-on-dark text.
 */
export function readableTextColor(background?: string | null, preferred?: string | null): string {
  const explicit = String(preferred ?? "").trim();
  if (explicit) return explicit;
  const luminance = colorLuminance(background);
  if (luminance == null) return DARK_INK;
  return luminance < 0.45 ? LIGHT_INK : DARK_INK;
}

/**
 * Cutout artwork (transparent or studio-isolated product compositions) must be
 * contained so the product is never sliced; photography is covered so the tile
 * never shows blank bands.
 */
export function isCutoutArtwork(url?: string | null): boolean {
  const value = String(url ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value.startsWith("data:image/svg")) return true;
  if (value.startsWith("data:image/png")) return true;
  const path = value.split("?")[0];
  return path.endsWith(".png") || path.endsWith(".webp.png") || path.endsWith(".svg");
}

/** Dedicated category artwork wins; the legacy photo is the fallback. */
export function resolveCategoryTileImage(
  category: { icon_url?: string | null; image_url?: string | null },
  fallbackImage: string,
): string {
  const icon = String(category.icon_url ?? "").trim();
  if (icon) return icon;
  const image = String(category.image_url ?? "").trim();
  if (image) return image;
  return fallbackImage;
}
