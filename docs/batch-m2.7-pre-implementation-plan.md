# Batch M2.7 — Product Detail Conversion (`/product/:slug`)  
## Pre-implementation plan only (no code in this document)

**Status:** For review before coding.  
**Scope boundary:** **`ProductDetail.tsx`** (and **PDP-local** helpers/styles colocated there) — **information hierarchy**, **price/discount/CTA clarity**, **suggested block presentation**, **stock / add-to-cart**, **light trust cues**. **No** reviews/ratings, **no** new recommendation logic or API fields, **no** homepage/storefront/search/listing work.

---

## 1. Binding constraints (non-negotiable)

| In scope | Out of scope |
|----------|----------------|
| Layout/copy/order of **existing** PDP blocks | New ML/embedding “similar products” |
| **Suggested products** = existing `GET /marketplace/suggested` (same category, exclude id) | Changing backend ranking beyond documented defaults |
| **Cart / stock** UX using existing `stock`, `discount_price`, `price` | Inventory reservation, multi-warehouse |
| **Merchant context** using existing `merchants` embed (`id`, `slug`, `display_name`) | Merchant search, new merchant fields on product DTO |
| Optional **error/empty** recovery links | Full PDP redesign in other files |

**Default:** **No API / DTO changes** — `marketplace-product-detail.contract.ts` allowlist unchanged unless explicitly approved.

---

## 2. Audit — current behavior (`ProductDetail.tsx`, contracts)

### 2.1 Structure (top → bottom)

1. **Breadcrumbs:** الرئيسية → المنتجات → (optional) **merchant** → product name.
2. **Gallery:** main image + thumbs; placeholder on error.
3. **Right column (info):**
   - **H1** — `product.name`.
   - **Price row** — discount price + strikethrough + **% badge** OR single price.
   - **Description** — “عن المنتج” card when present.
   - **Availability** — “متوفر للطلب” / low-stock warning / “غير متوفر”.
   - **Loyalty** — conditional block with points.
   - **Two micro “trust” lines** — packaging/WhatsApp + “تجربة فاخرة” wording (`ShieldCheck`, `Sparkles`).
   - **CTAs:** **أضف إلى السلة** + wishlist; **إتمام الطلب** (links checkout, adds to cart); **طلب عبر واتساب** (platform `storeConfig` number); **استفسار عن المنتج**.

### 2.2 Hierarchy gaps

| Gap | Detail |
|-----|--------|
| **Merchant** | Only in **breadcrumb**, not as a clear “sold by” line next to title — conversion path to `/store/:slug` is easy to miss. |
| **Price vs title** | Order is title → price — OK; **discount %** is clear. |
| **CTA density** | Many actions (cart, wishlist, checkout, 2× WhatsApp, inquiry) — risk of **choice overload** without visual primary/secondary hierarchy. |
| **WhatsApp** | Uses **platform** WhatsApp from `storeConfig`, not merchant-specific — may or may not match ops expectations (document, don’t “fix” without product decision). |

### 2.3 Suggested products

- Section **«قد يعجبك أيضاً»**; grid of `ProductCard`; only if `items.length > 0`.
- **API:** same `category_id`, exclude current id, `created_at` desc, limit 8 — **not** personalized.
- **Gap:** No subtitle explaining **non-personalized** / same-category browse.

### 2.4 Stock / add-to-cart

- **OOS:** primary button disabled, label “غير متوفر”; no add.
- **Low stock:** “بقي n فقط” when `stock < 5`.
- **In stock:** green “متوفر للطلب”.
- **Gap:** Quantity is always **implicitly 1** per add — OK for marketplace; optional microcopy if product wants explicit “الكمية: 1”.

### 2.5 Loading & error

- **Loading:** two-column skeleton.
- **404/error:** title + short text + **العودة للمنتجات** only — optional alignment with M2.6 recovery pattern (`/products` + `/stores`) **if** product approves (still PDP-only file).

### 2.6 Trust / marketing copy

- “**فاخرة**” in Sparkles line may conflict with M2.2 **label honesty** tone — candidate for **neutral** wording in M2.7.
- Shield line is operational (packaging + WhatsApp) — generally safe.

---

## 3. Target UX / contract plan (exact — implementation phase)

### 3.1 Information hierarchy (recommended order)

1. **Breadcrumbs** — keep; ensure **merchant** link remains visible when embed present.
2. **Title** — `h1` unchanged.
3. **Merchant context** — **new or elevated** line under title: **«من متجر: [display_name]»** with `Link` to `/store/:slug` (embed required). **No** new fields.
4. **Price block** — keep discount/strike/% ; optional **visual grouping** (single bordered card) for price + availability snapshot.
5. **Availability + stock** — keep logic; tighten **Arabic** for clarity (OOS vs low vs in stock).
6. **Description** — keep position after price or after availability — **pick one** flow in implementation (recommend: price → availability → description → CTAs for “buy” focus).
7. **Loyalty** — keep; optional demotion if it competes with primary CTA (spacing only).

### 3.2 CTA hierarchy

- **Primary:** **أضف إلى السلة** (when in stock) — full width emphasis.
- **Secondary:** wishlist, **إتمام الطلب**, WhatsApp — group as **secondary** row or collapsible “طرق أخرى” **only if** usability review asks; default **light** visual weight difference (outline vs solid) without removing flows.

### 3.3 Suggested products

- Keep heading; add **subtitle**: e.g. «منتجات أخرى من نفس القسم» — clarifies **not** personalized recommendations.
- Optional: **max height** / horizontal scroll on mobile — only if layout breaks (scope minimal).

### 3.4 Trust cues

- **Replace** subjective “فاخرة” line with **neutral** fulfillment copy (e.g. read description + photos) **or** remove second Sparkles line if redundant.
- **No** new trust badges implying ratings or guarantees not in contract.

### 3.5 Error state (optional)

- Mirror **M2.6-style** recovery: primary `/products`, optional `/stores` — **single** decision.

### 3.6 Documentation

- Add **`marketplace-product-detail.contract.ts`** (or `ProductDetail` file header) **“Storefront PDP UX — M2.7”** subsection: hierarchy rules, suggested semantics, no reviews.

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| **Merchant line** duplicates breadcrumb | Keep one **prominent** pattern; avoid three mentions of merchant |
| **CTA** changes hurt conversion | Ship copy/layout only; A/B not in scope |
| Scope creep to **checkout** | Touch only `ProductDetail.tsx` |

---

## 5. Definition of Done (implementation phase)

1. **Clear** visual/text **order**: title → merchant (when present) → price/discount → availability → description → primary commerce actions.  
2. **Suggested** section has **honest** subtitle about same-category / non-personalized.  
3. **Stock** and **add-to-cart** states are legible; OOS cannot add.  
4. **No** reviews, **no** new APIs, **no** changes to home/storefront/search pages.  
5. **Implementation report** + manual matrix: in stock, OOS, low stock, with/without discount, with/without suggested, mobile.

---

## 6. Explicitly deferred

- **M2.8** — Browse performance / payload discipline.  
- **Merchant-specific WhatsApp** — data + policy not in M2.7.  
- **Global unique slugs** — data model follow-up.

---

## 7. Approval gate

Proceed when:

- Product approves **merchant line** placement and **suggested** subtitle wording.  
- Decision on **error state** recovery (products-only vs products + stores).  
- Confirmation **no** DTO/API expansion.
