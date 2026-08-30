# Batch M2.9 — Implementation report

## Scope confirmation

Implemented strictly within approved M2.9 scope:

- Growth hooks foundation (explicit naming + minimal payloads)
- Wishlist hardening/instrumentation only
- Recently viewed as local-only browsing memory
- Re-entry attribution foundation-only envelope

Not implemented (by design):

- No backend persistence for recently viewed
- No cross-device sync
- No account/profile coupling
- No recommendation engine
- No marketing automation/campaign lifecycle engine
- No NotificationHub expansion into campaign orchestration

## Structural before/after evidence

### 1) Explicit growth hook event foundation

- Added `src/lib/growth-hooks.ts` with explicit event names:
  - `wishlist.added`
  - `wishlist.removed`
  - `wishlist.opened`
  - `product.viewed`
  - `store.viewed`
  - `reentry.link_opened`
  - `reentry.source_captured`
- Added compact payload allowlist only (`productId`, `merchantId`, `sourceSurface`, `path`, optional campaign fields).
- Event sink is non-blocking and local (foundation-only log in local storage).

### 2) Recently viewed policy constants (local-only)

- Implemented in `src/lib/growth-hooks.ts`:
  - `RECENTLY_VIEWED_MAX_ITEMS = 20`
  - newest-first ordering
  - dedupe by `productId`
  - no expiry logic (as approved)
- PDP success path now appends to local recently-viewed memory.

### 3) Wishlist hardening/instrumentation

- `src/lib/wishlist-store.ts` now emits:
  - `wishlist.added` on add
  - `wishlist.removed` on remove
- Added optional source metadata for action origin without expanding wishlist feature set.
- UI behavior remains the same (no feature expansion).

### 4) Product/store view hooks

- `src/pages/ProductDetail.tsx` emits `product.viewed` on loaded product and writes local recently viewed entry.
- `src/pages/Storefront.tsx` emits `store.viewed` when merchant storefront content loads.

### 5) Re-entry attribution foundation

- Added `src/components/ReentryTrackingHub.tsx` and mounted in router (`src/App.tsx`).
- Re-entry behavior:
  - captures lightweight attribution (`utm_source`, `utm_medium`, `utm_campaign`, entry path) once per session
  - emits `reentry.source_captured`
  - emits `reentry.link_opened` on route navigation
- No campaign engine, segmentation, or automation introduced.

## QA scenarios (manual)

### Wishlist

1. Open PDP, click favorite add/remove.
2. Confirm wishlist item state/UI unchanged.
3. Confirm events logged with names `wishlist.added` / `wishlist.removed` and minimal payload.

### Recently viewed

1. Visit >20 different PDPs.
2. Confirm local memory list length never exceeds 20.
3. Re-open a viewed product; confirm it moves to front (newest-first) with no duplicate.
4. Confirm no backend calls are introduced for recently-viewed persistence.

### Re-entry attribution

1. Open app with `?utm_source=x&utm_medium=y&utm_campaign=z`.
2. Confirm `reentry.source_captured` emitted once per session.
3. Navigate between routes; confirm `reentry.link_opened` emitted with path and optional campaign context.
4. Confirm behavior remains non-blocking if storage access fails.

### Anonymous behavior

1. In logged-out session, perform wishlist/view/navigation actions.
2. Confirm hooks still emit with no account coupling and no PII expansion.

## Validation

- Frontend typecheck/build and lint checks passed after changes.
- Changes are foundation-only and do not alter NotificationHub responsibilities.
