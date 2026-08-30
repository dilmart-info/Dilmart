# Decision Log

## 2026-06-30

### Decision 1: Backend API Authority
- **Decision**: Backend API is the absolute source of truth for all business-critical and sensitive flows (orders, checkout, payments, finance, delivery).
- **Reason**: To avoid data drift, bypass of business rules, and security vulnerabilities associated with frontend-direct queries.
- **Impact**: Frontend direct Supabase business/data access is strictly forbidden.

### Decision 2: Single Merchant per Order Constraint
- **Decision**: The "one merchant per order/cart" constraint remains active for launch.
- **Reason**: Simplifies delivery assignment, cash collection, settlement, and refund/dispute flows for the initial launch.
- **Impact**: Carts with mixed-merchant items are rejected at checkout.

### Decision 3: Strictly Scoped Frontend Supabase Access
- **Decision**: Supabase frontend access is restricted to auth/session bootstrapping and realtime notification subscriptions, regulated strictly by an allowlist.
- **Reason**: To protect data privacy (PII) and maintain API authority.
- **Impact**: All other data fetches must go through the NestJS backend API. The `check-no-new-direct-supabase.mjs` architecture guard enforces this.

### Decision 4: Protected Jenni Dispatch
- **Decision**: Jenni dispatch operations remain protected by kill-switches and state validation guards.
- **Reason**: To prevent accidental or uncontrolled shipping requests to third-party delivery APIs during development and testing.
- **Impact**: No automated dispatch can be triggered without checking the safety guards.

### Decision 5: R0 Scope Restriction
- **Decision**: Phase R0 is strictly constrained to documentation and governance synchronization.
- **Reason**: To establish a solid alignment baseline before starting any code refactoring.
- **Impact**: Zero runtime code refactoring, zero database migrations, and zero production config changes are permitted in this phase.
