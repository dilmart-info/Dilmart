# Skill: Catalog & Growth — DilMart-Store

## Mission

Improve product discovery, categories, offers, and growth hooks without breaking marketplace integrity.

## Scope

- categories and subcategories
- product cards
- store pages
- search/sort/filter
- recently viewed
- wishlist
- offers
- campaign source tracking
- homepage merchandising

## Rules

- Growth hooks must use minimal allowlisted payloads.
- No PII in analytics/growth events unless explicitly approved.
- Product availability must reflect backend truth.
- Search/filter UI must not imply unavailable products are purchasable.
- Visual Search/Image-to-Product Retrieval is future phase, not launch requirement.

## Recommended Events

```txt
product.viewed
store.viewed
wishlist.added
wishlist.removed
cart.item_added
checkout.started
checkout.submitted
reentry.source_captured
```

Keep payloads minimal:

```txt
productId, merchantId, categoryId, sourceSurface, path, campaignId/campaignSource optional
```

## Output Required

```md
# Catalog/Growth Review

## Goal

...

## Data/Events

- ...

## UX Changes

- ...

## Privacy Review

- ...

## Verdict

PASS / PASS WITH NOTES / FAIL
```
