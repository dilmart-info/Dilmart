# Batch M2.5 — Merchant Discovery (`/stores`)  
## Implementation report

### Summary

`/stores` now has refined **intro** copy, **results meta** («عرض n من total متجر» + current sort) when the list is non-empty, a **single grid-level** loading skeleton, and an **empty state** with **تصفّح المنتجات** → `/products` only (no home redirect). **No API or DTO changes.**

### Files

| File | Change |
|------|--------|
| `src/pages/Stores.tsx` | `StoresGridSkeleton`, `sortLabelAr`, results meta, empty CTA, intro |
| `backend/src/modules/marketplace/marketplace-stores.contract.ts` | M2.5 storefront UX subsection |

### Manual verification matrix

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Non-empty list | Count line + sort line | | Pending QA |
| Loading | Single skeleton block | | Pending QA |
| Empty | Message + `/products` button only | | Pending QA |
| Sort | featured / newest / name unchanged | | Pending QA |
| Card badge | «مميز» only if `is_featured` | | Pending QA |
