# Batch M5.3 — Commercial Policy Persistence & Source of Record Implementation Report

## Status

**Completed (Baseline + Fallback)**

Scope delivered: server-side policy assignment APIs, admin assignment persistence, and policy resolution in product/coupon workflows with safe local fallback.

---

## 1) Backend Implementation

Files:

- `backend/src/modules/admin/admin.service.ts`
- `backend/src/modules/admin/admin.controller.ts`

Added:

- Static canonical profiles on backend (`balanced`, `strict`) as contract source for this baseline.
- `GET /api/admin/commercial-policy/profiles`
- `GET /api/admin/commercial-policy/assignment?merchant_id=...`
  - merchant role support via scope resolver
  - returns default profile when assignment is missing
  - soft fallback response when assignment table is unavailable
- `POST /api/admin/commercial-policy/assignment/:merchantId`
  - admin-only upsert for persistent assignment
  - audit log entry on update

---

## 2) Frontend Integration

Files:

- `src/lib/api-client.ts`
- `src/lib/commercial-policy-profiles.ts`
- `src/pages/admin/MerchantDetail.tsx`
- `src/pages/admin/ProductForm.tsx`
- `src/components/scoped/CouponsPage.tsx`

Added:

- API client methods for profile list, assignment read, assignment write.
- Async policy resolver that prefers server assignment and falls back to local profile state.
- Admin merchant detail now persists assignment through server API.
- Product and coupon validation now resolve active policy from server-first flow.

---

## 3) Operational Behavior

- When backend assignment storage is available, policy behavior is consistent across operators/devices.
- When unavailable, existing local M4 policy behavior remains active without blocking operator workflows.

---

## 4) Completion Verdict

**Done.** M5.3 baseline establishes a server source-of-record path for commercial policy assignments while preserving resilient fallback behavior.

