# Batch M2.9 — Pre-implementation plan (growth hooks foundation)

**Status:** Pre-implementation only (no feature code in this step).  
**Scope lock:** growth-hooks foundation, wishlist flow review, recently-viewed decision, lightweight browsing-memory decisions, future campaign/re-entry hooks at architecture level.  
**Explicitly out of scope:** heavy personalization, recommendation engine, marketing automation expansion, unrelated surface redesign, later M2 batches.

---

## 1) Audit (current state)

### 1.1 Wishlist flow (existing)

- `wishlist-store` is local-only persisted state (`zustand/persist`) storing **product IDs only**.
- Add/remove works from `ProductCard` and `ProductDetail`; no backend write model for wishlist events.
- Wishlist page resolves IDs via `/marketplace/products/by-ids`; no dedupe telemetry/hook events around add/remove/view.
- API now enforces max 100 IDs per request (M2.8), but client wishlist has no explicit cap strategy/UX messaging.

### 1.2 Browsing-memory signals (existing)

- There is **no recently-viewed implementation** in storefront runtime state or backend contract.
- Current memory primitives are mainly cart/wishlist persistence in local storage.
- Product detail already has natural signal points (`view PDP`, `add wishlist`, `add cart`, `open WhatsApp action`) but these are not normalized into growth hook events.

### 1.3 Architecture hook readiness (backend/frontend)

- Backend has an in-process `DomainEventBusService` with typed domain events (`ORDER_*`, `PROFILE_UPDATED`, etc.), but no storefront browse-growth events yet.
- Backend has `AuditService` with payload sanitization and size guard, suitable for compliance-safe event journaling if needed.
- Frontend has `NotificationHub` (real-time toast shell) for operational notifications, but no growth-intent hook bridge.
- No central growth-hook contract/schema currently exists for storefront behavior signals.

### 1.4 Re-entry/campaign readiness

- Re-entry entry points exist (`/wishlist`, `/products`, `/stores`, `/product/:slug`, `/thank-you`) but no shared attribution/memory context envelope.
- No lightweight architecture for future campaign ingestion (e.g., normalized source tags, session token, intent markers) without committing to automation.

---

## 2) M2.9 implementation plan (exact, strict)

Implementation should be done as **foundation-only** primitives and contracts, without adding recommendation or automation behavior.

### WP-A — Growth hook event contract (foundation)

- Introduce a minimal, versioned storefront growth-hook schema (TS-first + backend type mirror), e.g.:
  - `PRODUCT_VIEWED`
  - `WISHLIST_ADDED`
  - `WISHLIST_REMOVED`
  - `CART_ADDED_FROM_PDP`
  - `WISHLIST_OPENED`
- Include only low-risk fields: `eventType`, `occurredAt`, `productId?`, `merchantId?`, `sourceSurface`, `sessionId` (anonymous-safe), optional `campaignSource`.
- Keep this as **plumbing contract**, not behavior logic.

### WP-B — Wishlist flow hardening + hooks

- Keep current UX surface; add instrumentation hooks at existing actions (add/remove/open).
- Add explicit client discipline around ID list:
  - deterministic dedupe before fetch,
  - graceful handling when local list > 100 (truncate fetch set + local cleanup decision documented).
- Preserve existing endpoint usage; no new wishlist backend feature table in M2.9 unless strictly needed for logging.

### WP-C — Recently viewed decision + minimal memory implementation

- **Decision for M2.9:** implement **lightweight local recently-viewed memory only** (no personalization).
- Constraints:
  - fixed-size ring/list cap (proposed 20),
  - dedupe by product ID,
  - timestamp each view,
  - TTL window (proposed 30 days),
  - no cross-user merge, no server profile binding.
- Trigger point only from successful PDP load.
- If rendered UI is included in M2.9, keep it minimal and deterministic (e.g., static "شوهدت مؤخراً" block), no ranking claims.

### WP-D — Re-entry/campaign hook envelope (architecture only)

- Add optional normalized attribution envelope passed through hook events:
  - `campaignSource` (utm_source-like),
  - `campaignMedium`,
  - `campaignId`,
  - `entryPath`.
- Capture from URL/search params once per session; persist lightweight session context.
- Do **not** create campaigns, schedulers, or outbound automation.

### WP-E — Backend ingestion seam (optional but recommended for future-proofing)

- Add a thin ingestion seam (service interface or endpoint) that can accept growth-hook events with:
  - validation,
  - strict allowlist of event types,
  - payload size/key sanitization (reuse audit patterns),
  - no downstream automation.
- Storage can be deferred; if persisted now, keep append-only, low-cardinality columns.

### WP-F — Documentation contracts

- Add/extend docs for:
  - growth hook event dictionary,
  - recently-viewed local policy (cap/TTL/dedupe),
  - attribution field definitions,
  - explicit non-goals (no recommendations/automation in M2.9).

---

## 3) Risks

1. **Scope creep into personalization**
   - Risk: recently-viewed evolves into recommendations.
   - Mitigation: enforce deterministic display order (latest first) with no scoring.

2. **Privacy/compliance drift**
   - Risk: growth events accidentally include sensitive user content.
   - Mitigation: strict payload allowlist + audit-style forbidden keys + byte limits.

3. **Hook noise / low signal quality**
   - Risk: duplicate events from repeated renders/interactions.
   - Mitigation: emit on explicit user actions and successful data-load boundaries only.

4. **Wishlist >100 mismatch UX**
   - Risk: local IDs exceed API cap and produce silent truncation confusion.
   - Mitigation: documented cap strategy + optional toast/note + deterministic trimming.

5. **Future coupling too early**
   - Risk: introducing architecture that implies marketing automation.
   - Mitigation: keep interfaces neutral and passive (ingest-only, no rule engine).

---

## 4) Definition of Done (M2.9)

- [ ] Growth-hook event contract exists and is versioned/documented.
- [ ] Wishlist actions are instrumented with foundation hook events (add/remove/open) without UI redesign.
- [ ] Recently-viewed decision is implemented as lightweight local memory only (cap + TTL + dedupe), or explicitly documented if deferred.
- [ ] Re-entry attribution envelope is normalized and available to hook events.
- [ ] No recommendation logic, no personalization scoring, no marketing automation orchestration.
- [ ] No unrelated page redesign.
- [ ] Basic QA matrix verifies hook emission paths and memory behavior determinism.
- [ ] Implementation report includes structural before/after evidence (new contracts, hook points, memory policy).

---

## 5) Before implementation checklist

1. Confirm final M2.9 stance on UI exposure:
   - hook-only backend/frontend plumbing vs include small recently-viewed block in PDP/home.
2. Confirm recently-viewed policy constants:
   - cap (recommended 20),
   - TTL (recommended 30 days),
   - ordering (latest first).
3. Confirm attribution field naming:
   - align with existing URL/query conventions.
4. Decide ingestion persistence mode:
   - transient only vs append-only table in this batch.
5. Prepare QA scenarios:
   - anonymous user, logged-in user, repeated clicks, stale local storage migration.

---

## 6) Non-goals reminder for implementation PR

- No recommendation engine work.
- No heavy personalization.
- No campaign automation or outbound orchestration.
- No cross-surface redesign unrelated to hooks/memory foundation.
