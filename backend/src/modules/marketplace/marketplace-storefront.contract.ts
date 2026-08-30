/**
 * `GET /marketplace/merchants/:slug` — public merchant DTO (M1.2+).
 *
 * Only **active** merchants (`status = 'active'`) are returned; otherwise **404**.
 * The query uses an explicit column allowlist — **never** `select('*')` — so internal or future
 * sensitive columns are not exposed by this route.
 *
 * Allowlist (Supabase `select` string, comma-separated):
 * `id`, `slug`, `name_ar`, `name_en`, `display_name`, `description`, `logo_url`, `banner_url`
 *
 * ## Storefront `/store/:slug` UX — M2.6 (no API/DTO changes)
 *
 * - **Hero:** descriptive subline; **single** primary CTA → in-page anchor `#store-products`; optional text link to `/stores`.
 * - **Grid:** heading «منتجات المتجر»; count line uses **visible row count only** (no total/cap disclosure in UI).
 * - **Empty / merchant error:** primary CTA `/products`, secondary `/stores` — no `merchant_id` query on `/products`.
 * - **No** trust-marketing claims added in UI.
 */

export const MARKETPLACE_PUBLIC_MERCHANT_SELECT =
  "id, slug, name_ar, name_en, display_name, description, logo_url, banner_url" as const;
