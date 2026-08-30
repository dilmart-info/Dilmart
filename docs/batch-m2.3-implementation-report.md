# Batch M2.3 — Homepage Discovery Optimization  
## Implementation report

**Scope:** `src/pages/Index.tsx` only (no API, no storefront/PDP/listing logic changes).

### Binding decisions applied

| Rule | Implementation |
|------|----------------|
| Merchants strip always visible | Section always rendered after load; cards → `/store/:slug`; heading action **كل المتاجر** → `/stores`; empty → dashed panel + **تصفّح كل المتاجر** → `/stores` |
| Single page-level skeleton | `HomeDiscoverSkeleton` — one block while `homeLoading`; no per-bucket skeletons |
| Hero minimal | Single CTA **استكشف المنتجات** → `/products` (removed secondary offers button) |
| CTA mapping | Best sellers → `/products`; new → `/products?sort=newest`; offers → `/offers`; merchants heading → `/stores` |
| All buckets empty | One **اكتشف المنتجات والمتاجر** fallback with buttons → `/products` and `/stores` |
| No duplicate empty bucket sections | Only non-empty buckets render; otherwise only the fallback block |

Value props + editorial render **after** home data resolves (same branch as discover content) so the page does not show static blocks above a loading discover area.

### CTA map (reference)

| Section | Primary action link | Label |
|---------|---------------------|--------|
| Hero | `/products` | استكشف المنتجات |
| Merchants (heading) | `/stores` | كل المتاجر |
| Merchants (empty) | `/stores` | تصفّح كل المتاجر |
| Best sellers (heading) | `/products` | كل المنتجات |
| New (heading) | `/products?sort=newest` | عرض الكل |
| Offers (heading) | `/offers` | صفحة العروض |
| Fallback | `/products`, `/stores` | استكشف المنتجات / المتاجر |
| Editorial | `/products` | تسوّق الآن |

### Files touched

- `src/pages/Index.tsx`

### Manual verification matrix

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Loading | Hero + one skeleton only | | Pending QA |
| Merchants + data | Grid + كل المتاجر | | Pending QA |
| Merchants empty | Empty panel + CTA to /stores | | Pending QA |
| All buckets empty | Single fallback, two CTAs | | Pending QA |
| Partial buckets | Only filled sections | | Pending QA |
| Hero | One CTA only | | Pending QA |

### Regression notes

- Offers removed from hero; users reach offers via buckets, footer, or direct `/offers`.
