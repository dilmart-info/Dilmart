# Refactor Baseline & Governance Sync Report (R0)

**Date:** 2026-06-30  
**Phase:** Phase R0 — Refactor Baseline & Governance Sync  
**Status:** Completed (Documentation & Tooling only)

---

## Executive Summary

This report establishes the baseline architecture, current repository state, and governance constraints for the **DilMart-Store** repository. Before starting any major codebase refactoring (Phases R1–R4), we align the documentation to define the project's true identity, its core business rules, and the strict constraints governing the AI agents.

This report reflects the **actual current repository state** as of June 30, 2026, distinguishing it from historical reports (such as the Phase 1 Analysis Report dated 2026-05-04).

**Zero runtime code modifications, database migrations, or production configuration adjustments** have been introduced in this sync phase.

---

## 1. Current Architecture Snapshot

DilMart-Store is a full-stack e-commerce marketplace platform tailored for the Iraqi market.

- **Backend**: NestJS (TypeScript) modular monolith.
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui.
- **Database**: Supabase / PostgreSQL.
- **State Management**: Zustand + React Query (TanStack Query) on the frontend.
- **External Delivery Aggregator**: Jenni (Al-Zaeem Express) integration for shipping.

---

## 2. Backend Module Snapshot

The backend is fully operational and structured into ~33 modules. In contrast to historical stages where key modules were stubs:

1. **CartModule**: Fully implemented and active. It is utilized in the B2B Barber App cart/checkout flow. It exports `CartService` and `CartCheckoutService`, and wires them to `CartController`.
2. **UsersModule**: Fully implemented. It manages user settings and profiles, exporting `UsersService` wired to `UsersController`.
3. **AdminModule**: Handles dashboard statistics, merchant approvals, and catalog oversight.
4. **CheckoutModule**: Processes checkout payloads, calculates prices, and orchestrates order creation via `/api/checkout/preview` and `/api/checkout/submit`.
5. **OrdersModule**: Manages state, transitions, and query scopes for orders.
6. **ProductsModule**: Handles merchant-scoped inventory and product moderation.
7. **ShippingModule**: Manages delivery policies, regions, and pricing.
8. **LoyaltyModule**: Manages points accrual and settings.
9. **WebhooksModule**: Exists as an entry point for handling external webhook integrations.

---

## 3. Frontend Architecture Snapshot

The frontend is a single-page application (SPA) structured around three main user roles:

1. **Customer App**: Features product catalogs, client-side cart (via Zustand), profile overview, and a checkout page.
2. **Merchant Panel**: Accessible by registered sellers to manage products, view their specific order queues, and check status.
3. **Admin Dashboard**: Permits platform operators to approve merchants, monitor payments, review analytics, and override order states.

---

## 4. API Authority State & Direct Supabase Status

In the current repository state:

- **API Authority**: The backend NestJS API is the absolute authority for all commerce, dashboard, and data flows.
- **Supabase Client Usage**: Direct database calls (such as `supabase.from` or `supabase.rpc`) have been **completely eliminated** from the frontend `src/` directory. All data and business flows now route through the NestJS backend via `apiClient` defined in `src/lib/api-client.ts`.
- **Architecture Guard**: An active guard (`npm run arch:guard`) scans all TypeScript files to enforce that no direct Supabase database calls are introduced. The only allowed imports in `supabase-guard-allowlist.json` are restricted to auth/session bootstrapping (e.g., `getSession`, `signInWithPassword`, `signOut`, `signUp`, and `onAuthStateChange`).
- **Pending Review Auth logout**: `src/pages/merchant/Pending.tsx` is allowed in the allowlist because its only use of `supabase` is the auth-only `supabase.auth.signOut()` operation, with zero direct database queries or RPC calls.

---

## 5. Auth/Session State

Authentication is bootstrapped using Supabase Auth on the client side.

- **Process**: The frontend extracts the JWT token from `supabase.auth.getSession()` and attaches it as a Bearer token in the `Authorization` header of NestJS API requests.
- **Validation**: The backend role guard (`roles.guard.ts`) decrypts the token to populate the user context.
- **Role Authority**: Direct Supabase table reads for roles or merchant memberships have been completely removed. Auth and role resolution rely solely on the backend-authoritative `/auth/context` endpoint.

---

## 6. Cart Current State

- **Frontend**: Handled client-side via Zustand state.
- **Backend**: `CartModule` is fully implemented and manages persistent cart states for integrated client environments (specifically the B2B Barber App integration), connecting to `CartService` and `CartCheckoutService`.
- **Checkout Integration**: During checkout, the cart items are processed by the NestJS backend which validates prices, stock limits, and single-merchant constraints.

---

## 7. Checkout Current State

- **Process**: The frontend POSTs cart items, coupon codes, and shipping details to `POST /api/checkout/submit` or `POST /api/checkout/preview`.
- **Operations**: NestJS `CheckoutService` computes prices, checks stock, applies coupons, calculates delivery fee, and creates the order.
- **Area Selection**: The neighborhood/area selection utilizes a text input fallback where specific region dropdown constraints are undergoing further backend alignment.

---

## 8. Finance/Order/Delivery Invariants

The following business rules are absolute and must be preserved:

1. **Single Merchant per Order**: A checkout cart must only contain products from a single merchant. Mixed-merchant carts are rejected.
2. **State Atomicity**: Order status, delivery status, and collection/remittance states must never drift.
3. **Ledger Invariance**: Financial events (revenue accrual, merchant payout status) must be recorded using database constraints to prevent duplicate bookings.

---

## 9. Jenni Integration Current State

The NestJS shipping aggregator module (`JenniModule`) is fully integrated and has successfully completed the delivery cycle for **Jenni Pilot Order #1 (Order DUK-260627-9163)**.

- **Dispatch**: Shipping payloads are dispatched when an order transitions to approved status.
- **Webhook**: Automated status updates are received via the webhook ingress endpoint (`POST /v2/push/update-status` aliased appropriately), updating the order's delivery status.
- **Safety Guards (Kill-switches)**: Delivery dispatch and provisioning flows are guarded by strict environment checks:
  - `JENNI_ALLOW_SHIPMENT_DISPATCH` (must be `true` for dispatch to execute; set to `false` by default to prevent accidental calls during development).
  - `JENNI_ALLOW_MERCHANT_PROVISIONING` (disabled).
  - `JENNI_ALLOW_STORE_PROVISIONING` (disabled).
  - `JENNI_DIAGNOSTICS_ENABLED` (disabled).

---

## 10. Security/Secrets & Rate Limiting

- **Rate Limiting**: Rate limiting **is configured and active** in the NestJS backend. `AppModule` imports `ThrottlerModule` and registers a global `ThrottlerGuard` providing a default limit of 120 requests per 60 seconds per IP.
- **Security Headers**: `Helmet` is registered in `main.ts` with CSP temporarily disabled to prevent asset load issues.
- **Secrets**: Environment variables are loaded via local `.env` and `.env.production` files.

---

## 11. Known Stale Docs

- Document files in `docs/` referencing `Saba Store` or `متجر سبأ` are outdated. The project name has been synchronized across all active documentation to **DilMart-Store (متجر ستايلي)**.
- The historical `PHASE_1_ANALYSIS_REPORT.md` (dated 2026-05-04) reflects old claims of direct Supabase usage and empty module stubs, which have since been fully resolved.

---

## 12. Recommended Next Refactor PRs

To safely refactor the codebase, the following sequence of Pull Requests is recommended:

1. **PR-R1: API Security & Role Mapping Hardening**  
   _Objective_: Further harden the actor-to-scope resolution in NestJS controllers and resolve any remaining transitional controller parameters.
2. **PR-R2: Token Caching & Performance Optimization**  
   _Objective_: Implement short-lived caching for profile lookups during role verification to reduce database queries.
3. **PR-R3: Checkout Validation Gaps**  
   _Objective_: Enforce regex phone format validation in NestJS DTOs and resolve region dropdown mapping.
4. **PR-R4: Admin UI Placeholder Replacements**  
   _Objective_: Replace admin placeholder pages (`FinanceReconciliation.tsx`, `Inventory.tsx`, `Coupons.tsx`) with dynamic components calling backend REST APIs.

---

## 13. Risks and Non-Goals

- **Non-Goals**:
  - Do not implement electronic payment gateways (launch remains Cash-on-Delivery only).
  - Do not implement multi-merchant order processing.
  - Do not add appointment booking features or catalog integrations with DilMart-main.
- **Risks**:
  - Regressions during role caching optimization if cache invalidation is misconfigured.

---

## 14. Manual Verification Checklist

- [x] Run `npm run arch:guard` to verify no new direct Supabase client imports exist.
- [x] Verify that no runtime logic, database schemas, or configs have been modified.
- [x] Verify that all project branding references to "Saba" have been replaced with "DilMart Store".
