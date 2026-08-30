# PROJECT_CONTEXT.md — DilMart-Store

> هذا هو المرجع التشغيلي والمعماري لمشروع DilMart-Store. يجب على أي AI Agent قراءته قبل تنفيذ تعديلات مؤثرة.

---

## 1. تعريف المشروع

**DilMart-Store** هو Marketplace مستقل متعدد التجار لبيع المنتجات في العراق، مرتبط استراتيجيًا بمنظومة DilMart لكنه منفصل عنها ككود ومنتج.

المشروع الحالي ليس منصة حجز صالونات وليس جزءًا من تطبيق الحلاق. هو متجر/ماركت بليس لمنتجات متعددة، مع إدارة تجار، منتجات، أقسام، مخزون، طلبات، توصيل، تحصيل، وتسويات مالية.

---

## 2. الفصل عن DilMart الرئيسي

- DilMart booking/barber platform مشروع منفصل.
- Cylendra projects منفصلة عن DilMart projects.
- DilMart-Store قد يتكامل لاحقًا مع تطبيقات DilMart عبر API فقط.
- لا يجوز خلط bookings/barbers/salon services داخل DilMart-Store إلا بقرار تكامل واضح.

---

## 3. النموذج التجاري

الإطلاق الحالي مصمم حول:

- Marketplace متعدد التجار.
- كل طلب مرتبط بتاجر واحد فقط.
- Cash on Delivery هو نمط الدفع الأساسي.
- Admin يشرف على التجار، المنتجات، الطلبات، التوصيل، والتحصيل.
- Merchant يدير منتجاته وطلباته وماليته ضمن scope خاص به.
- Delivery يمكن أن يكون عبر شركة توصيل أو مناديب/agents.
- Customer PII يجب أن يبقى محميًا ولا يظهر للتاجر إلا بالقدر التشغيلي المسموح.

---

## 4. التقنية المستخدمة

### Frontend

```txt
React 18
TypeScript
Vite
React Router
TanStack Query
Zustand
Tailwind CSS
Radix/shadcn-style components
Capacitor Android/iOS wrappers
```

### Backend

```txt
NestJS modular monolith
TypeScript
Supabase client server-side
Role/authorization guards
Controllers + Services
```

### Database

```txt
Supabase/Postgres
Migrations
RLS/policies
RPC functions for atomic operations
Storage for images/assets
```

### Deployment

```txt
Frontend: Netlify-capable
Backend: Render-capable
Mobile wrapper: Capacitor
```

---

## 5. بنية المشروع العامة

```txt
src/                         Frontend React/Vite
  pages/                     Customer/Admin/Merchant pages
  components/                Shared UI + feature components
  hooks/                     Auth/state/query hooks
  lib/                       API client, stores, utilities
  integrations/supabase/     Supabase auth/client transitional layer
backend/
  src/modules/               NestJS feature modules
  tests/                     Backend policy/commercial tests
supabase/
  migrations/                DB schema/RPC/RLS evolution
docs/                        Architecture and implementation reports
governance/                  Existing governance files
ai/                          AI governance pack added by this package
```

---

## 6. Core Domains

1. Auth & Identity
2. Admin Console
3. Merchant Console
4. Product Catalog
5. Categories
6. Inventory
7. Cart
8. Checkout
9. Coupons/Offers/Loyalty
10. Orders
11. Delivery Companies & Agents
12. Delivery Intelligence
13. Finance/Settlements
14. Notifications/WhatsApp intents
15. Analytics
16. Staging/Production Operations

---

## 7. Current Known Readiness

### Strong Areas

- Frontend production build succeeds.
- Backend build succeeds.
- Existing backend policy/commercial tests pass.
- Checkout server-pricing and atomic stock RPC exist.
- Admin/Merchant modules are broad.
- Finance and delivery models are advanced.
- One-merchant order strategy is correct for launch.

### Launch Blockers / Risks

- Checkout and loyalty must not trust frontend `user_id` or `points_spent`.
- Delivery geo fields from checkout must be persisted end-to-end.
- Remaining frontend direct Supabase business access must be removed or justified.
- Lint currently has many errors and must be handled as a cleanup phase or explicit baseline.
- Frontend test coverage is very thin.
- Full operational QA for order → delivery → collection → settlement is required.

---

## 8. One-Merchant Rule

For launch:

```txt
One cart = one merchant.
One checkout = one merchant.
One order = one merchant.
```

This is not a limitation bug. It is a deliberate business architecture decision to simplify:

- fulfillment
- COD collection
- courier assignment
- merchant settlement
- returns/refunds
- disputes

Any code change must preserve this unless a future Multi-Merchant Checkout phase is formally approved.

---

## 9. Checkout Invariants

Checkout must be backend-authoritative.

Frontend may send:

- selected product IDs
- quantities
- customer contact/address fields
- optional coupon code
- optional geo fields

Frontend must not be trusted for:

- price
- merchant identity
- discount amount
- points balance
- user identity
- stock availability
- final totals

Backend/DB must verify and compute:

- product exists and active
- product belongs to one merchant
- stock availability
- coupon validity
- loyalty redemption eligibility
- delivery fee/policy
- final order snapshot
- atomic stock deduction/reservation

---

## 10. Finance Invariants

Finance is operational truth, not UI labels.

All transitions must be:

- server-side
- idempotent where possible
- auditable
- tied to order/payment/delivery state
- protected by role/scope

Important concepts:

- COD collection
- merchant payable
- courier payout
- platform commission
- manual adjustments
- disputes
- reversals
- settlement batches

Do not update finance tables directly from frontend.

---

## 11. Delivery Invariants

Delivery state must not drift from order state.

The system supports:

- company assignment
- agent assignment
- pickup/in-transit/delivered/failed/returned events
- delivery intelligence queue/risk/aging
- collection/remittance interactions for COD

Any delivery transition may affect:

- customer communication
- admin queue
- finance collection
- settlement eligibility
- merchant visibility

---

## 12. Privacy and Scope

- Admin has global operational visibility.
- Merchant must only access merchant-scoped data.
- Delivery agent/company should access only delivery-relevant information.
- Customer PII must not be overexposed to merchants or public endpoints.
- Do not expose Supabase service role or secrets to frontend.

---

## 13. Launch Strategy

Recommended path:

```txt
Internal QA → Staging Pilot → Limited Merchant Pilot → Public Launch
```

Do not launch publicly until:

- P0 blockers are closed.
- staging/prod are separated.
- real checkout smoke test passes.
- delivery/finance settlement smoke test passes.
- admin and merchant role boundaries are verified.
- architecture guard has no unapproved business bypasses.
