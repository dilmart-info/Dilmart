# Batch M3.0 — Merchant Operations Audit Report

## Status

**Completed (audit only)**  
Scope: Admin + merchant operational surfaces, with focus on multi-merchant readiness gaps.

---

## 1) Executive Findings

The platform public marketplace (M1/M2) is strong, but admin operations are still **partially single-merchant oriented** in behavior and UX.

Current state is mixed:

- Some surfaces are already multi-merchant aware (`OrdersPage`, `ProductsPage`, `CouponsPage`, `InventoryPage`).
- Some critical control surfaces remain global/non-scoped and can’t be managed per merchant clearly (`Delivery`, `Loyalty`, parts of analytics).
- Admin mental model is not yet centralized around **merchant context first**.

---

## 2) Surface-by-Surface Audit

## A) Products (`/admin/products`) — **Partially Ready**

**What exists**
- Platform scope page uses `ProductsPage` with merchant filter and merchant name column.
- Backend `ProductsService.listProducts` supports `merchant_id` scope and merchant embed.

**Gaps**
- Filter defaults and admin workflow still allow operating without explicit merchant context.
- ProductForm currently defaults merchant to first available merchant when admin creates new product; this can cause accidental cross-merchant mistakes.

**Risk**
- Wrong-merchant product creation/updates by admin.

---

## B) Orders (`/admin/orders`) — **Partially Ready**

**What exists**
- `OrdersPage` has merchant filter in platform scope and merchant label per row.
- Backend `OrdersService.listOrders` supports merchant scoping.

**Gaps**
- Status values are raw internal keys in UI (`new`, `contacted`, etc.) instead of clear merchant-facing labels.
- No explicit “active merchant context badge” in header.

**Risk**
- Operational confusion, slower triage at scale.

---

## C) Inventory (`/admin/inventory`) — **Now Improved / Partially Ready**

**What exists**
- Scope-aware query.
- Merchant name column added in platform scope.
- Stock adjust respects merchant scope for merchant users.

**Gaps**
- No merchant filter dropdown yet in admin inventory page (all products list only + search).

**Risk**
- High-volume catalogs become hard to operate quickly.

---

## D) Coupons (`/admin/coupons`) — **Partially Ready**

**What exists**
- Platform can create merchant-specific and global coupons.
- Merchant filter exists.
- Backend scoping is implemented in `CouponsService`.

**Gaps**
- “Global” coupon vs merchant coupon impact is not clearly explained in admin UX.
- No readiness checks to prevent invalid commercial states.

**Risk**
- Misconfigured coupons and inconsistent commercial behavior.

---

## E) Delivery (`/admin/delivery`) — **Not Multi-Merchant Ready**

**What exists**
- Global shipping companies + governorate pricing.

**Critical gap**
- No merchant scope in UI or backend route behavior.
- Delivery settings appear platform-wide only.

**Risk**
- If merchants need differentiated delivery policies, current model can’t support clear ownership.

---

## F) Loyalty (`/admin/loyalty`) — **Not Multi-Merchant Ready**

**What exists**
- Global loyalty settings managed through admin endpoints.

**Critical gap**
- No merchant-specific loyalty model or scoped admin/merchant controls.
- No clarity if loyalty is intentionally platform-global policy.

**Risk**
- Business ambiguity and future conflicts between platform vs merchant control.

---

## G) Merchants Management (`/admin/merchants`) — **Foundational Only**

**What exists**
- Merchant create/list/status update.
- Owner assignment endpoint exists.

**Gaps**
- Readiness indicators are missing (logo/description/products/category coverage).
- No operational checklist per merchant.

**Risk**
- Merchants can be “active” but not commercially ready.

---

## H) Dashboard / Analytics (`/admin`) — **Global, not operationally segmented**

**What exists**
- Strong global summary metrics/charts.

**Gaps**
- No merchant segmentation controls.
- Not built as operations cockpit (readiness, missing setup, quality gaps).

**Risk**
- Good BI view, weaker day-to-day merchant operations governance.

---

## 3) Root Causes

1. M1/M2 optimized public marketplace first (correct by phase objective).
2. Admin operations grew with mixed legacy/global assumptions.
3. Missing explicit **platform vs merchant ownership map** for some domains (delivery, loyalty, visibility controls).

---

## 4) Priority Gaps (Ranked)

1. **Store Readiness contract missing** (activation != commercial readiness).
2. **Catalog/Product readiness visibility missing** in admin and merchant views.
3. **Delivery/Loyalty scope ambiguity** (global vs merchant).
4. **Admin cockpit clarity gap** (no unified readiness and next actions).
5. **Merchant control boundaries undocumented** (what merchant controls vs what platform controls).

---

## 5) M3.1+ Recommended Execution Map

- **M3.1:** Store Readiness Contract (hard gate definition)
- **M3.2:** Product Readiness & catalog quality surfacing
- **M3.3:** Merchant dashboard clarity cockpit
- **M3.4:** Catalog management tightening
- **M3.5:** Merchandising controls aligned with M2.2 signals
- **M3.6:** Coupon/offer commercial clarity
- **M3.7:** Merchant-platform boundary map
- **M3.8:** Lightweight admin governance layer
- **M3.9:** Commercial readiness rulebook closure

---

## 6) Risks If Unaddressed

- Multi-merchant complexity scales faster than admin clarity.
- Merchant onboarding quality remains inconsistent.
- Platform policy decisions (delivery/loyalty) become implicit and conflict-prone.
- Operational overhead rises due to missing context-driven controls.

---

## 7) Audit DoD (Met)

- [x] Reviewed core operational surfaces (orders/products/inventory/coupons/delivery/loyalty/merchants/dashboard).
- [x] Identified readiness/control/ownership gaps.
- [x] Produced ranked priorities and executable sequence for next batches.
- [x] Stayed within M3.0 audit-only scope (no redesign implementation in this batch).

---

## 8) Conclusion

The project is now at the correct transition point:

- Public marketplace layer is strong (M1/M2),
- but admin/merchant operations need M3 execution to become truly scalable and commercially governable.

This audit confirms M3 direction is valid and should proceed starting from **M3.1 Store Readiness Contract**.
