# Batch M3.1 — Store Readiness Contract Implementation Report

## Status

**Completed**

Scope implemented: Store readiness contract (backend + admin/merchant UI) with activation guardrails.

---

## 1) Objectives Implemented

- Introduce a clear, machine-readable **Store Readiness Contract**.
- Prevent accidental merchant activation when critical readiness requirements are missing.
- Surface readiness state to both platform admin and merchant operators.
- Improve admin operational workflow with readiness-first controls and filters.

---

## 2) Backend Implementation

## A) Readiness Endpoint

Added:

- `GET /api/merchants/:id/readiness`

Files:

- `backend/src/modules/merchants/merchants.controller.ts`
- `backend/src/modules/merchants/merchants.service.ts`

Behavior:

- Computes readiness score and checklist for the target merchant.
- Applies role-aware scope resolution (admin vs merchant actor).
- Returns:
  - `score`
  - `is_ready`
  - `passed_checks`
  - `total_checks`
  - `checklist[]`
  - supporting stats (`products_count`, `active_products_count`, `categorized_products_count`)

## B) Readiness Contract Checks (current version)

- `profile_completed` (display name exists)
- `contact_completed` (phone/whatsapp/email exists)
- `address_completed` (city + address exist)
- `has_products`
- `has_active_products`
- `has_categorized_products`
- `merchant_is_active` (state reflection check)

## C) Activation Guardrail

Updated:

- `updateMerchantStatus(id, payload)` in `merchants.service.ts`

Behavior:

- When target status is `active`, service evaluates readiness first.
- If requirements are incomplete, activation is blocked with:
  - `ForbiddenException`
  - code: `MERCHANT_NOT_READY`
  - `missing_checks[]` (labels and keys for missing requirements)

This guard is backend-enforced (not UI-only), so policy remains consistent for all clients.

---

## 3) Frontend Implementation

## A) API Client Support

Added:

- `apiClient.getMerchantReadiness(merchantId)`

File:

- `src/lib/api-client.ts`

## B) Admin Merchant Detail Enhancements

File:

- `src/pages/admin/MerchantDetail.tsx`

Implemented:

- Readiness card with:
  - score progress bar
  - readiness status badge/text
  - full checklist with pass/fail per item
- Action controls from same page:
  - `تفعيل الآن` (enabled only when readiness complete)
  - `تعليق الآن` (for active merchants)
- Better activation failure handling when backend returns `MERCHANT_NOT_READY`.

## C) Merchant Settings Visibility

File:

- `src/pages/merchant/Settings.tsx`

Implemented:

- Merchant-facing readiness summary card:
  - score
  - readiness state
  - progress bar
- Auto-refresh readiness state after saving merchant settings.

## D) Admin Merchants Table (Operational UX)

File:

- `src/pages/admin/Merchants.tsx`

Implemented:

- Added readiness column with per-merchant score badge.
- Persistent missing-items preview for non-ready merchants.
- Quick link: `اذهب للإكمال` to merchant detail page.
- Improved activation error messaging in table actions.
- Added operational filters:
  - by status (`draft/active/suspended/archived`)
  - by readiness (`ready/not_ready`)
- Added empty-state row for filter results.

---

## 4) Validation Notes

- Lint checks were run for modified implementation files.
- No new lint errors were introduced in touched files.

---

## 5) Operational Impact

- Activation quality improves by enforcing minimum store readiness.
- Admin can now prioritize non-ready merchants quickly using table filters.
- Merchant teams can self-track readiness progress from settings page.
- Platform risk of “active but commercially incomplete merchant” is reduced.

---

## 6) Non-Goals (not included in M3.1)

- Per-domain policy expansion beyond current readiness checks.
- Delivery/Loyalty scope redesign (belongs to later M3 batches).
- Automated notification workflows for missing readiness items.

---

## 7) Completion Verdict

**M3.1 scope is implemented and operationally usable.**

The platform now has a concrete readiness contract, backend enforcement for activation, and UI coverage for both admins and merchants.
