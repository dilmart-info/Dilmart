# DilMart-Store MASTER SPEC

## 1. Product Identity

DilMart-Store is an independent multi-vendor ecommerce marketplace platform for Iraq.

It is separate from the DilMart booking/barber platform.

The only current integration with DilMart is authentication/identity through API-level integration.

DilMart-Store must not depend on bookings, barbers, salons, or service appointments.

## 2. Core Business Model

DilMart-Store supports many merchants/vendors selling products through one marketplace.

Each merchant manages:

- Products
- Prices
- Offers
- Inventory
- Order preparation
- Merchant-side visibility

Admin controls:

- Merchant approval
- Product/category governance
- Order operations
- Delivery operations
- Finance reconciliation
- Settlements
- Disputes
- Platform policies

## 3. Architecture Position

Current system is a full-stack ecommerce marketplace:

- Backend: NestJS modular monolith
- Frontend: React + Vite
- State/query: TanStack Query + Zustand
- Database: Supabase/Postgres
- Critical logic: Postgres RPCs for atomic operations

The system is not greenfield.
It is an existing codebase estimated at approximately 78% readiness.

Therefore all future work must follow:

Stabilize → Align → Harden → Scale

## 4. Marketplace Constraint

For the current launch version:

One order must belong to one merchant only.

Mixed-merchant carts/orders are explicitly out of scope for launch.

This constraint is intentional because it simplifies:

- Delivery assignment
- Cash collection
- Merchant settlement
- Refund/return handling
- Dispute resolution

Future multi-merchant checkout may be introduced later as a separate major phase.

## 5. Source of Truth

Backend API is the authority for all business-critical flows.

Frontend must not bypass backend API for:

- Checkout
- Orders
- Payments
- Delivery state
- Merchant finance
- Admin finance
- Product moderation
- Merchant approval

Direct Supabase access from frontend is allowed only for non-critical read-only cases if explicitly approved.

## 6. Core Domains

The platform domains are:

1. Auth & Identity
2. Merchant Management
3. Product Catalog
4. Categories & Attributes
5. Inventory
6. Cart
7. Checkout
8. Orders
9. Payments
10. Delivery
11. Finance & Settlements
12. Promotions
13. Notifications
14. Admin Console
15. Search & Discovery
16. Governance & Audit

## 7. Current Known Status

### Auth

Partial.
Context and role resolution exist.
Full identity lifecycle depends on external/Supabase auth.

### Users

Missing or underdeveloped.
UsersModule has no meaningful business implementation.

### Merchants

Complete.
Merchant lifecycle, application approval/rejection, readiness, stats and finance paths exist.

### Products

Complete.
Merchant-scoped CRUD, readiness checks, import/bulk logic exist.

### Categories

Complete.
Admin category management exists.

### Cart

Partial.
Frontend cart exists.
Backend cart module is currently empty.

### Orders

Complete.
Admin, merchant, agent and customer order views/actions exist.

### Payments

Partial.
COD-first lifecycle exists.
External electronic gateway integration is not production-ready.

### Admin Panel

Complete but broad.
Admin surface is strong but may be over-concentrated.

### Notifications

Partial.
Admin notification/dispatch/retry/dead-letter flows exist.
End-user notification coverage requires verification.

### Delivery

Complete.
Delivery company/pricing policies and guarded lifecycle exist.

## 8. Payment Strategy

Launch version is Cash-on-Delivery first.

Electronic payments are future-ready but not active until:

- Provider is selected
- Webhook model is defined
- Idempotency is enforced
- Order/payment reconciliation is tested
- Admin finance visibility is complete

No UI must imply electronic payment is available unless the backend path is production-ready.

## 9. Finance Rules

Finance must remain atomic and auditable.

Cash collection, remittance, settlement, dispute, payout and reconciliation flows must not be implemented only in frontend.

All finance transitions must:

- Be server-side
- Be logged/auditable
- Prevent duplicate transitions
- Respect order/payment/delivery status constraints

## 10. Delivery Rules

Delivery status and order status must not drift.

Any transition affecting delivery must be reflected consistently in:

- order status
- delivery status
- collection status if COD
- finance/reconciliation where applicable

## 11. Admin Rules

Admin must have global visibility.

Admin can:

- Approve/reject merchants
- Govern products/categories
- Monitor all orders
- Control delivery operations
- Review finance/reconciliation
- Handle disputes
- Manage alerts/notifications

Admin actions affecting money, merchant status, product state, or delivery must be auditable.

## 12. Merchant Rules

Merchant can only access merchant-scoped data.

Merchant must not access:

- Other merchants’ products
- Other merchants’ orders
- Platform-wide finance
- Admin-only moderation state unless exposed intentionally

Every merchant-sensitive operation must validate merchant scope server-side.

## 13. Critical Risks

### P0 Risks

- Frontend direct Supabase fallback for business-critical flows
- Empty UsersModule
- Empty backend CartModule
- Payment gateway not integrated
- Status drift between order/payment/delivery/finance

### P1 Risks

- Large AdminService coupling
- Analytics/admin logic concentration
- Partial notification coverage
- Future multi-merchant checkout complexity

## 14. Launch Readiness Definition

The platform is not launch-ready until:

- Checkout is fully backend-authoritative
- Cart strategy is finalized
- User context is reliable
- Merchant scoping is proven
- Order lifecycle is tested end-to-end
- COD finance flow is tested
- Delivery lifecycle is tested
- Admin finance/reconciliation is verified
- No business-critical frontend direct Supabase fallback remains
- Manual QA passes for customer, merchant, admin and delivery flows

## 15. Development Strategy

Future work must be executed by phases.

No agent may work outside CURRENT_PHASE.

Every phase must include:

- Scope
- Out of scope
- Files likely affected
- Architecture constraints
- Tests required
- Manual QA checklist
- Closure report

## 16. Phase Roadmap

### Phase 1 — Marketplace Stabilization & API Authority

Goal:
Make backend API the authoritative business layer and remove dangerous frontend/backend inconsistencies.

Focus:

- Frontend direct Supabase fallback review
- Auth/context consistency
- Cart strategy decision
- UsersModule baseline
- API contract alignment

### Phase 2 — Checkout & Order Hardening

Goal:
Prove end-to-end order creation, stock deduction, pricing, status and merchant scoping.

### Phase 3 — COD Finance & Settlement Hardening

Goal:
Verify COD collection, remittance, settlement, disputes and reconciliation.

### Phase 4 — Delivery Lifecycle Hardening

Goal:
Ensure delivery transitions, pricing policies and state guards are consistent.

### Phase 5 — Merchant/Admin Operational QA

Goal:
Make merchant and admin panels safe for real businesses.

### Phase 6 — Launch Gate

Goal:
Final smoke, security, finance, role-based access, and manual QA closure.

## 17. Non-Goals for Current Launch

The following are explicitly out of scope for launch:

- Multi-merchant checkout
- Production electronic payment gateway
- Deep DilMart booking integration
- Barber/salon service upsell
- AI product generation
- Complex loyalty/cashback
- Cross-product ecosystem wallet

## 18. Final Operating Principle

DilMart-Store must be treated as a serious marketplace platform, not a simple ecommerce store.

Every future change must preserve:

- Merchant isolation
- Admin authority
- Backend API authority
- Financial auditability
- Delivery/payment/order consistency
