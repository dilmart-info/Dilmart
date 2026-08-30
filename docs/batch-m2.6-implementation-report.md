# Batch M2.6 — Storefront (`/store/:slug`)  
## Implementation report

### Summary

Storefront hero includes a **subline**, **one CTA** (anchor to `#store-products`), optional **تصفّح المتاجر** → `/stores`. Product section has heading **منتجات المتجر**, **count** (`عرض n منتجاً`) when rows exist — **no** cap/total messaging. **Empty** and **error** states use **تصفّح المنتجات** + **المتاجر**. **No** API/DTO changes; **no** `/products?merchant_id`.

### Files

| File | Change |
|------|--------|
| `src/pages/Storefront.tsx` | Hero, grid section, skeletons, recovery actions, contract comments in code |
| `backend/.../marketplace-storefront.contract.ts` | M2.6 UX comment block |

### Manual verification matrix

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Hero CTA | Scrolls to grid | | Pending QA |
| Count | Only `products.length`; no cap copy | | Pending QA |
| Empty | Primary + secondary CTA | | Pending QA |
| Error | Same CTAs | | Pending QA |
| No merchant_id | `/products` bare | | Pending QA |
