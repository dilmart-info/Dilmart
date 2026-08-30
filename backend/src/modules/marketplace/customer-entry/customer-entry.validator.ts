/**
 * Target-path allowlist for the Customer Gateway discovery surface.
 */

const SLUG_REGEX = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

export function isValidSlug(slug: unknown): slug is string {
  if (typeof slug !== "string") return false;
  if (!slug || slug.length > 128) return false;
  if (slug !== slug.toLowerCase()) return false;
  if (slug.includes("_") || slug.includes(" ") || slug.includes(".")) return false;
  return SLUG_REGEX.test(slug);
}

export function validateTargetPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  if (path !== trimmed) return null;
  if (trimmed.includes("..") || trimmed.includes("\\") || trimmed.includes("://") || trimmed.startsWith("//")) return null;

  if (trimmed === "/" || trimmed === "/products" || trimmed === "/offers" || trimmed === "/stores") {
    return trimmed;
  }

  const categoryMatch = trimmed.match(/^\/category\/([^/]+)$/);
  if (categoryMatch) {
    const slug = categoryMatch[1];
    return isValidSlug(slug) ? trimmed : null;
  }

  const productMatch = trimmed.match(/^\/product\/([^/]+)$/);
  if (productMatch) {
    const slug = productMatch[1];
    return isValidSlug(slug) ? trimmed : null;
  }

  const storeMatch = trimmed.match(/^\/store\/([^/]+)$/);
  if (storeMatch) {
    const slug = storeMatch[1];
    return isValidSlug(slug) ? trimmed : null;
  }

  const brandMatch = trimmed.match(/^\/products\?brand=([^&]+)$/);
  if (brandMatch) {
    return trimmed;
  }

  return null;
}

export function categoryTarget(slug: unknown): string | null {
  return isValidSlug(slug) ? `/category/${slug}` : null;
}

export function productTarget(slug: unknown): string | null {
  return isValidSlug(slug) ? `/product/${slug}` : null;
}

const BRAND_NAME_SAFE_REGEX = /^[\p{L}\p{N}\s.\-&'+/]{1,100}$/u;

export function brandTarget(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || !BRAND_NAME_SAFE_REGEX.test(trimmed)) return null;
  if (trimmed.includes("<") || trimmed.includes(">") || trimmed.includes('"') || trimmed.includes("`")) return null;
  return `/products?brand=${encodeURIComponent(trimmed)}`;
}


