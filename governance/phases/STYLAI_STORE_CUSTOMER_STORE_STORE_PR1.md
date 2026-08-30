# DilMart Customer Store — STORE-PR1 (Surface Mapping)

## Task

`DilMart-CUSTOMER-STORE-STORE-PR1`

## Governing docs

- `DilMart-CUSTOMER-STORE-MASTER-001` (§2.6)
- `DilMart-CUSTOMER-STORE-DISCOVERY-001`

## PR

[#71](https://github.com/cylendralabs-blip/DilMart-Store/pull/71) — `fix/customer-app-surface-mapping`

## Status

```text
OPEN — STORE-PR1 surface mapping ready to merge after CI
Sequencing: after PR #72 (fixture repair) on main
```

## Problem

Trusted `customer_app` integration sessions collapsed to `web_store`, so customer
visibility/segment logic never ran.

## Fix

- New canonical `resolveMarketplaceSurface()` / `resolveTrustedViewerContext()` in
  `backend/src/modules/store-integration/surface-resolver.ts`
- Marketplace + cart delegate to the shared resolver
- Untrusted `?surface=customer_app|barber_app` no longer promotes privileged surfaces

## Mapping (trusted `X-Store-Session` only)

| Trusted source                            | Surface        |
| ----------------------------------------- | -------------- |
| `barber_app`                              | `barber_app`   |
| `customer_app`                            | `customer_app` |
| `store_web` / `admin` / missing / unknown | `web_store`    |

## Explicitly NOT included

One-Time Handoff, federated auth, customer-entry endpoint/UI, migrations, native/web app
changes, STORE-PR2+.

## Tests

- `backend/tests/surface-resolver.test.mjs`
- `backend/tests/marketplace-cart-surface-resolution.test.mjs`

## Database / auth / deploy

No migration. No auth contract change. Backend-only deploy.

## Sequencing note

PR #72 short-description fixture repair must be on `main` before this merge. Do **not**
duplicate or cherry-pick that fixture fix into this branch — it arrives via `origin/main`.
