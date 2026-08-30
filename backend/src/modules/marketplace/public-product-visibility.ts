/**
 * Single source of truth for "is this product allowed to appear on any public marketplace
 * surface" (storefront list/detail/suggested/home, search, etc).
 *
 * A product must satisfy ALL three triple-state flags before it is publicly listable:
 * - `is_active`         — merchant/admin turned the product on.
 * - `is_published`      — merchant/admin explicitly published it (distinct from "active").
 * - `visibility_status` — must be exactly `"public"` (not `"private"` or `"archived"`).
 *
 * This exists because product import (Gate 1, DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001)
 * creates products with `is_active=false`, `is_published=false`, `visibility_status=private`
 * by default — a pilot/draft merchant's catalog must never leak onto the live storefront
 * before the merchant and products are explicitly approved and activated.
 */
export function isPubliclyListableProduct(p: {
  is_active?: boolean | null;
  is_published?: boolean | null;
  visibility_status?: string | null;
}): boolean {
  return p.is_active === true && p.is_published === true && p.visibility_status === "public";
}

/**
 * Single source of truth for applying the triple-state public-visibility filter (see
 * `isPubliclyListableProduct` above) directly on a Supabase `products` query.
 *
 * MUST be applied to every marketplace/storefront query against `products` that is reachable by
 * an anonymous/public visitor (category pages, search/listing, by-ids lookups, offers, brand
 * facets, home sections, suggested products, product detail) — see `marketplace.service.ts`.
 * Internal/merchant/admin-facing product queries (merchant dashboard, admin catalog tools) must
 * NOT use this helper, since a merchant must be able to see/manage their own unpublished/private
 * products.
 *
 * Also apply the merchant's own active-status filter (`.eq("merchants.status", "active")`)
 * wherever the query already embeds `merchants!inner(...)` — this helper only covers the
 * `products` table's own three flags, not the parent merchant's status.
 */
// Untyped `query`/return on purpose: `SupabaseClient` here has no `Database` generic, so
// `PostgrestFilterBuilder`'s own generics are already effectively opaque at every call site in
// this file. Threading that same builder through a *generic* wrapper function additionally
// forces TypeScript to re-resolve its recursive conditional types, which blows up with
// "Type instantiation is excessively deep" (TS2589). Plain `any` here is no less type-safe than
// the un-wrapped `.eq(...)` chains already used everywhere else in `marketplace.service.ts`.
export function applyPublicProductFilters(query: any): any {
  return query.eq("is_active", true).eq("is_published", true).eq("visibility_status", "public");
}
