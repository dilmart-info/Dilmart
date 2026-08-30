/**
 * # `GET /api/marketplace/merchants` — public merchant discovery (M1.5+)
 *
 * Paginated **active** merchants only (`status = 'active'`). No `search` / `q` parameters in M1.5.
 *
 * ## Response rows — **merchant card DTO** (minimal; not the storefront profile allowlist)
 * Columns: {@link MARKETPLACE_MERCHANT_CARD_SELECT} — card-oriented fields only.
 *
 * ## Sort (`sort` query param; default **`featured`**)
 * - **`featured`** — `is_featured` **DESC**, then `created_at` **DESC** (deterministic tie-break).
 * - **`newest`** — `created_at` **DESC**.
 * - **`name`** — `display_name` **ASC**.
 *
 * Invalid or missing `sort` is treated as **`featured`**.
 *
 * ## Storefront `/stores` UX — M2.5 (no API changes)
 *
 * - **Intro** copy explains browse → pick sort → enter store.
 * - **Results line** when `items.length > 0`: «عرض n من total متجر» (page slice + total count); optional **current sort** line.
 * - **Loading:** single grid-level skeleton (not per-card skeletons).
 * - **Empty state:** CTA to `/products` only — no forced navigation to `/`.
 * - **Cards:** card DTO only; «مميز» when `is_featured`; no extra fields.
 * - **No** `search` / `q` parameters.
 *
 * @see marketplace-ranking.contract.ts — glossary (merchant **featured** ≠ product “featured” bucket on home).
 */

export const MARKETPLACE_MERCHANT_CARD_SELECT = "id, slug, display_name, logo_url, is_featured" as const;

export type MarketplaceMerchantDiscoverySort = "featured" | "newest" | "name";
