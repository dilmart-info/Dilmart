# Internal Pilot Runbook — DilMart-Store

**Version:** P1 hardening complete — 2026-05-12  
**Audience:** Internal team only (admin operators, QA testers, on-call engineer)  
**Platform:** COD-first multi-vendor marketplace for Iraq  
**Deployment:** Render (backend web service + frontend static site)

> This is an internal pilot, not a public launch. Traffic is expected from a small, known group of testers only. Do not share the frontend URL publicly.

---

## 1. Pilot Scope

### In scope

- Admin operators creating and managing orders end-to-end
- One or two approved pilot merchants listing products
- Internal testers placing guest and authenticated orders (COD only)
- Delivery agent assignment and lifecycle transitions
- Finance: accrual → COD remittance → payable → payout batch (draft/approve/settle)
- Admin panel: analytics overview, merchant ledger, reconciliation views

### Out of scope for this pilot

- Electronic payment gateway (not active)
- Public traffic or marketing links
- Multi-merchant cart (one order = one merchant enforced at backend)
- Mobile app builds (Capacitor targets exist but are not piloted)
- External webhook alert delivery (unless `OUTBOUND_ALERT_WEBHOOK_URL` is configured)

---

## 2. Pre-Launch Gate — Must Complete Before First Test

Work through this list in order. Every item is blocking.

### 2a. Database migrations

```bash
# From repo root — requires Supabase CLI and project access
supabase db push
```

This applies all migrations in `supabase/migrations/`, ending with:

- `20260502120000_p0_place_order_server_pricing_atomic_stock.sql`
- `20260512100000_p2_desktop_quick_links_rls_hardening.sql`
- `20260512200000_p1_6_payout_batch_atomic_rpc.sql` ← creates `create_payout_batch_atomic` RPC

**Verify after push:**

```sql
-- Run in Supabase SQL editor
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'place_order',
    'create_payout_batch_atomic',
    'process_cod_remittance_to_platform',
    'transition_delivery_status'
  );
-- Must return 4 rows
```

### 2b. Backend environment variables (Render dashboard)

Set all of the following in the `DilMart-store-backend` Render service before deploying:

| Variable                    | Required | Notes                                                                  |
| --------------------------- | -------- | ---------------------------------------------------------------------- |
| `SUPABASE_URL`              | **Yes**  | `https://<ref>.supabase.co`                                            |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes**  | Service-role JWT — never expose                                        |
| `FRONTEND_ORIGINS`          | **Yes**  | Exact frontend URL, e.g. `https://DilMart-store-frontend.onrender.com` |
| `NODE_ENV`                  | Yes      | `production` — already in `render.yaml`                                |

### 2c. Frontend environment variables (Render dashboard)

Set all of the following in the `DilMart-store-frontend` Render service:

| Variable                        | Required | Notes                                            |
| ------------------------------- | -------- | ------------------------------------------------ |
| `VITE_SUPABASE_URL`             | **Yes**  | Same value as backend `SUPABASE_URL`             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **Yes**  | Supabase anon key (safe to expose to browser)    |
| `VITE_SUPABASE_PROJECT_ID`      | **Yes**  | Short ref ID, e.g. `ztplxqlthuqkuktbznbo`        |
| `VITE_STORE_API_BASE_URL`       | **Yes**  | `https://DilMart-store-backend.onrender.com/api` |

See `docs/ENVIRONMENT_SETUP.md` for full reference.

### 2d. Deployment order

1. Deploy **backend** first.
2. Confirm health: `GET https://DilMart-store-backend.onrender.com/api/health` → `{ ok: true }`
3. Set `VITE_STORE_API_BASE_URL` on frontend with the confirmed backend URL.
4. Set `FRONTEND_ORIGINS` on backend with the confirmed frontend URL.
5. Deploy **frontend**.
6. Open frontend in browser — confirm it loads without CORS errors in DevTools.

### 2e. Build verification (pre-deploy)

```bash
cd backend && npm run build             # must exit 0
npm run build                           # frontend — must exit 0
npm run arch:guard                      # must report 0 violations
cd backend && npm run test:policy       # must pass 18/18
cd backend && npm run test:commercial   # must pass 6/6
```

---

## 3. User Roles & Access Matrix

| Role                     | Created by                                 | Can do                                         |
| ------------------------ | ------------------------------------------ | ---------------------------------------------- |
| `super_admin`            | Supabase SQL / admin bootstrap             | Everything — all admin routes, all finance     |
| `admin`                  | super_admin via Supabase                   | Same as super_admin for pilot purposes         |
| `merchant_owner`         | Admin approves merchant application        | Own products, own orders (no PII), own ledger  |
| `merchant_manager`       | merchant_owner                             | Same as owner except role assignment           |
| `merchant_staff`         | merchant_owner                             | Read-only merchant scope                       |
| `delivery_agent`         | Admin creates via `POST /api/admin/agents` | Delivery lifecycle on assigned orders only     |
| Customer (authenticated) | Self-register via Supabase Auth            | Place orders, track own orders, loyalty points |
| Customer (guest)         | No account needed                          | Place orders, track by order_number + phone    |

### Bootstrap admin account

Admin role is assigned directly in the database. Run once via Supabase SQL editor:

```sql
UPDATE profiles
SET role = 'super_admin'
WHERE id = '<your-user-uuid>';
```

---

## 4. Golden Path Smoke Tests

Run these in order. Each step must pass before proceeding. Detailed assertions are in `docs/order-lifecycle-smoke-checklist.md`.

| #   | Section                 | Flow                                                                                       |
| --- | ----------------------- | ------------------------------------------------------------------------------------------ |
| A   | Checkout                | Guest order, authenticated order with points, over-balance attempt                         |
| B   | Merchant visibility     | Merchant sees own orders only, no PII in detail view                                       |
| C   | Agent assignment        | Company match, inactive agent rejection, missing company rejection                         |
| D   | Delivery (normal)       | picked_up → in_transit → delivered; finance accrual fires; loyalty credited                |
| E   | Failure/cancellation    | failed with reason_code; cancel already-delivered → 403                                    |
| F   | Admin override delivery | Override to delivered; finance accrual fires; idempotency on duplicate                     |
| G   | COD remittance          | `process_cod_remittance_to_platform` RPC; second call idempotent                           |
| H   | Loyalty guest claim     | Phone-matched guest order points credited on registration                                  |
| I   | Order tracking (public) | Valid order_number + phone returns status; wrong phone returns `{ found: false }`          |
| J   | Payout batch            | Create batch (payable entries only); empty result when no payable entries; approve; settle |

---

## 5. Health Check & Monitoring

### Backend health

```
GET /api/health
→ { "ok": true, "service": "DilMart-store-backend" }
```

Returns 200 when the Node process is alive. Does **not** ping the database — a 200 here does not guarantee DB connectivity.

### Database connectivity check

```bash
# Via Supabase dashboard → SQL editor
SELECT COUNT(*) FROM orders LIMIT 1;
-- Any result (including 0) confirms connectivity.
```

### Slow-request log

The backend logs any request taking > 1 000 ms:

```
[slow-request] POST /api/checkout/submit status=201 duration=1450ms
```

Watch Render logs during smoke tests. Consistently slow requests (> 2 s) on the free plan are typically cold-start effects and self-resolve after the first request warms the instance.

### Key endpoints to verify after deploy

| Endpoint                                 | Auth                    | Expected                           |
| ---------------------------------------- | ----------------------- | ---------------------------------- |
| `GET /api/health`                        | None                    | `{ ok: true }`                     |
| `GET /api/catalog/categories`            | None                    | Array of categories                |
| `GET /api/merchants/storefront-default`  | None                    | Default merchant info              |
| `POST /api/checkout/submit`              | Optional                | Order created                      |
| `GET /api/orders`                        | Bearer (admin/merchant) | Order list                         |
| `POST /api/admin/finance/payout-batches` | Bearer (admin)          | Batch created or `{ empty: true }` |

---

## 6. Admin Operations Playbook

### 6a. Approve a merchant application

```
GET  /api/admin/merchant-applications      # list pending
POST /api/admin/merchant-applications/:id/approve
```

### 6b. Assign delivery company to an order

```
POST /api/admin/orders/:id/delivery/assign-company
Body: { "delivery_company_id": "<uuid>" }
```

Required before an agent can be assigned.

### 6c. Override delivery status (admin only)

```
POST /api/admin/orders/:id/admin-override-delivery
Body: { "next_status": "delivered", "reason": "Manual confirmation" }
```

Finance accrual fires automatically on override to `delivered`.

### 6d. Create payout batch

```
POST /api/admin/finance/payout-batches
Body: { "merchant_id": "<uuid>" }
```

Returns `{ ok: true, batch, entries_count }` or `{ ok: true, empty: true, message }`.  
Only `payable` ledger entries are included (entries in `accrued` state are NOT eligible — they must pass COD remittance first).

### 6e. Approve and settle payout batch

```
POST /api/admin/finance/payout-batches/:id/approve
POST /api/admin/finance/payout-batches/:id/settle
```

These operations use direct table writes (not yet atomic RPCs — P2 hardening). Run them deliberately and one at a time.

### 6f. Reconciliation queries

**Detect orphaned batches (no items):**

```sql
SELECT b.id, b.merchant_id, b.status, b.created_at, COUNT(i.id) AS item_count
FROM merchant_payout_batches b
LEFT JOIN merchant_payout_batch_items i ON i.payout_batch_id = b.id
GROUP BY b.id
HAVING COUNT(i.id) = 0;
-- Safe to DELETE draft batches with 0 items from the old non-atomic code path.
```

**Detect unaccrued delivered orders (finance missed):**

```sql
SELECT o.id, o.order_number, o.merchant_id, o.settlement_status
FROM orders o
WHERE o.status = 'delivered'
  AND o.settlement_status = 'not_accrued'
  AND o.financial_snapshot_version > 0;
-- Should return 0 rows. If not, use admin override to re-trigger accrual.
```

---

## 7. Troubleshooting

### T1: Auth context fails — user gets 401 on authenticated routes

**Symptoms:** `POST /api/checkout/submit`, `GET /api/orders` return 401 or empty actor context.

**Checklist:**

1. Confirm `Authorization: Bearer <supabase-jwt>` header is present in the request (check browser DevTools → Network).
2. Confirm `SUPABASE_URL` on backend matches the project that issued the JWT (same project ref).
3. Check Render backend logs for `[auth] context resolution failed` — indicates JWT verification error.
4. Confirm the Supabase project is not paused (free tier pauses after inactivity).
5. Confirm `SUPABASE_SERVICE_ROLE_KEY` is current — if the key was rotated in the Supabase dashboard after deploy, redeploy backend with the new key.

---

### T2: Checkout fails — `POST /api/checkout/submit` returns 400 or 422

**Symptoms:** Frontend cart submits but order is not created.

**Checklist:**

1. Confirm at least one product in the cart has `is_published = true` and `inventory_quantity > 0`.
2. Confirm a `delivery_company_id` + price exists for the selected governorate (check `delivery_prices` table).
3. Check backend logs for the exact validation error — the response body's `message` field identifies which DTO field failed.
4. If `points_spent` is in the request, confirm the authenticated user's `profiles.points ≥ points_spent`.
5. The pricing is server-authoritative — frontend cart totals are recalculated by the backend. A mismatch does not block the order; the backend total wins.

---

### T3: Order not visible in admin

**Symptoms:** `GET /api/orders` as admin returns empty or omits a specific order.

**Checklist:**

1. Confirm the request carries a valid admin JWT (role = `admin` or `super_admin`).
2. Confirm the order exists in DB: `SELECT id, order_number, status FROM orders ORDER BY created_at DESC LIMIT 10;`
3. If the order exists in DB but the API returns empty, check if a merchant-scoped `merchant_id` query param was accidentally sent — admin routes without that param return all orders.
4. Check `orders.merchant_id` — if it is null, the order was created without a merchant context and may be filtered by some views.

---

### T4: Finance accrual missing after order delivered

**Symptoms:** Order shows `status = delivered` but `settlement_status = not_accrued` and no `merchant_ledger_entries` rows exist for the order.

**Checklist:**

1. Query: `SELECT settlement_status, financial_snapshot_version FROM orders WHERE id = '<order-id>';`
2. If `financial_snapshot_version = 0`, the order was submitted without a complete financial snapshot — accrual is deliberately blocked. Use the admin override route to re-drive delivery to `delivered`; accrual fires inside `handleOrderStatusTransition`.
3. If `financial_snapshot_version > 0` but `settlement_status = not_accrued`, a process crash may have occurred after delivery but before accrual committed. Use:
   ```
   POST /api/admin/orders/:id/admin-override-delivery
   Body: { "next_status": "delivered", "reason": "manual finance recovery" }
   ```
   The guard `settlement_status = accrued` short-circuits duplicate accrual — this is idempotent.
4. Confirm `merchant_ledger_entries` rows now exist for the order with `entry_type IN ('order_accrual', 'commission_charge')`.

---

### T5: Payout batch RPC fails

**Symptoms:** `POST /api/admin/finance/payout-batches` returns 500 or `{ error: { code: 'PGRST202' } }`.

**Checklist:**

1. **RPC not applied:** The most common cause. Run:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_schema = 'public' AND routine_name = 'create_payout_batch_atomic';
   ```
   If no row returned, `supabase db push` did not apply migration `20260512200000_p1_6_payout_batch_atomic_rpc.sql`. Re-run `supabase db push`.
2. **Permission denied:** The backend must use the service-role key. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set (not the anon key). The RPC is `REVOKE`d from `anon` and `authenticated`.
3. **No payable entries:** If `{ ok: true, empty: true }` is returned, the merchant has no `payable` ledger entries. `accrued` entries alone are not eligible — they must pass COD remittance first (`evaluatePayableTransition`).

---

### T6: CORS errors in browser

**Symptoms:** Browser console shows `Access-Control-Allow-Origin` errors. API calls fail from the frontend but work via curl.

**Checklist:**

1. Confirm `FRONTEND_ORIGINS` on the backend **exactly** matches the URL shown in the browser address bar, including protocol (`https://`), hostname, and port (if non-standard). No trailing slash.
2. If multiple origins are needed (e.g., Render URL + custom domain), separate with commas and no spaces:
   `https://DilMart-store-frontend.onrender.com,https://yourdomain.com`
3. Restart (redeploy) the backend after changing `FRONTEND_ORIGINS` — it is read once at startup.
4. Verify with: `curl -H "Origin: https://your-frontend-url.com" -I https://DilMart-store-backend.onrender.com/api/health` → response must include `Access-Control-Allow-Origin: https://your-frontend-url.com`.

---

### T7: Service-role key invalid / 401 from Supabase

**Symptoms:** Backend returns 500 or logs show `invalid_jwt` / `JWT signature mismatch` when calling Supabase.

**Checklist:**

1. Confirm the key in `SUPABASE_SERVICE_ROLE_KEY` is the **service-role** JWT, not the anon key. The service-role key payload has `"role":"service_role"`.
2. Decode the JWT at [jwt.io](https://jwt.io) (locally, do not paste in third-party sites) — confirm `iss` matches `SUPABASE_URL`.
3. If the key was rotated in the Supabase dashboard: copy the new service-role key from `Project Settings → API → Service role key`, update it in Render, and redeploy.
4. Check Supabase project is not paused (free tier pauses after 7 days of inactivity). Resume from the Supabase dashboard.

---

## 8. Rollback Procedure

For the internal pilot, "rollback" means reverting to the previous Render deploy — no data deletion.

1. In Render dashboard → `DilMart-store-backend` → **Deploys** → click the previous successful deploy → **Redeploy**.
2. Repeat for `DilMart-store-frontend` if frontend was also updated.
3. Database migrations cannot be automatically rolled back. For the P1-6 RPC specifically, a rollback removes the `create_payout_batch_atomic` function — the payout batch endpoint will return 500 until the migration is re-applied or the old three-write code is restored.

**Do not** run `DROP FUNCTION` or destructive SQL during a pilot incident. Preserve data for post-incident analysis.

---

## 9. Data Governance During Pilot

- All pilot orders are **real data** in the production Supabase project. Do not use dummy phone numbers that belong to real people.
- Admin-created test orders can be cancelled via `POST /api/orders/:id/cancel` (not deleted).
- Ledger entries and payout batches cannot be deleted via the API — they are append-only for audit purposes.
- Do not create payout batches for test merchants unless you intend to track them as permanent ledger history.
- The Supabase service-role key bypasses RLS — only share it with engineers who need direct DB access.

---

## 10. Escalation

| Issue                        | First responder  | Escalate to                                          |
| ---------------------------- | ---------------- | ---------------------------------------------------- |
| DB migration failed          | On-call engineer | Supabase support (if CLI error)                      |
| Render service down          | On-call engineer | Render status page                                   |
| Supabase project paused      | On-call engineer | Supabase dashboard → Resume project                  |
| Finance data inconsistency   | On-call engineer | Engineering lead — do NOT auto-remediate             |
| Service-role key compromised | Engineering lead | Rotate key in Supabase immediately, redeploy backend |

---

## 11. Automated CI Status

**No automated CI pipeline exists.** There is no `.github/workflows/` directory.

Manual gate before each deploy:

```bash
cd backend && npm run build
npm run build                           # frontend
npm run arch:guard
cd backend && npm run test:policy       # 18/18
cd backend && npm run test:commercial   # 6/6
node --test tests/p1-agent-delivery-scope.test.mjs \
  tests/p1-2-order-lifecycle-smoke.test.mjs \
  tests/p1-2a-admin-override-finance.test.mjs \
  tests/p1-2b-finance-invariants.test.mjs \
  tests/p1-6-payout-batch-atomic.test.mjs \
  tests/p1-6a-payout-eligibility.test.mjs
# Must produce: 32/32 pass
```

Adding a GitHub Actions workflow is a recommended P2 task.

---

## 12. Delivery Intelligence Note

The delivery intelligence views (`m21_delivery_intelligence_readonly_views`) compute queue metrics across all active orders. On a live production database with large order volume, these views may run slowly. During the internal pilot (small order count), this is not a concern. At public scale, a materialized-view refresh strategy or a dedicated read replica is recommended.

---

## 13. Known Limitations

Document these clearly to internal testers. Do not attempt to work around them during the pilot — file them as P2 items instead.

| Limitation                                                             | Severity  | Notes                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No public scale testing**                                            | —         | Render free tier; cold starts on first request after inactivity. Not suitable for load testing.                                                                                               |
| **No automated CI**                                                    | P2        | Manual test gate required before every deploy (see §11).                                                                                                                                      |
| **Rate limiting not implemented**                                      | P2        | No per-IP or per-user request throttling on any endpoint. Do not share the backend URL publicly.                                                                                              |
| **Delivery intelligence may slow on large queues**                     | P2        | Read-only views; no write risk, but latency increases with order volume.                                                                                                                      |
| **DB integration tests are manual**                                    | P2        | RPC and migration logic is verified by SQL text inspection and mock-only service tests. Live-DB assertions require the manual smoke checklist (§4).                                           |
| **`approvePayoutBatch` / `settlePayoutBatch` use direct table writes** | P2        | Same partial-failure risk as the old `createPayoutBatch`. These are supervised single-operator actions at low volume — acceptable for internal pilot. Atomic RPC hardening is deferred to P2. |
| **Electronic payments not active**                                     | By design | COD only for launch. No payment gateway is wired. Any UI implying card payment must be confirmed disabled before pilot.                                                                       |
| **Empty `UsersModule` / minimal `CartModule`**                         | By design | Frontend cart is in-memory (Zustand). Backend `CartModule` has no persistence. This is the approved cart strategy for launch.                                                                 |
| **No multi-merchant cart**                                             | By design | One order = one merchant, enforced at checkout. This is a permanent constraint for the current launch version.                                                                                |
| **Notification webhooks optional**                                     | —         | If `OUTBOUND_ALERT_WEBHOOK_URL` is not set, alert dispatch is silently disabled. No error is raised.                                                                                          |

---

## 14. Go / No-Go Recommendation

### Gate criteria

| #   | Criterion                                                                         | Status                                                          |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Backend API is authoritative for all checkout, order, delivery, and finance flows | **PASS** — P0 hardening complete                                |
| 2   | Server-side pricing enforced at checkout                                          | **PASS** — `place_order` RPC                                    |
| 3   | Atomic stock deduction with no oversell race                                      | **PASS** — `place_order` RPC                                    |
| 4   | Finance accrual fires on delivery (including admin override path)                 | **PASS** — P1-2a fix                                            |
| 5   | Payout batch creation is atomic (no partial-failure orphan risk)                  | **PASS** — `create_payout_batch_atomic` RPC                     |
| 6   | Payout batch only includes `payable` entries (not premature `accrued`)            | **PASS** — P1-6a fix                                            |
| 7   | Merchant isolation enforced server-side (wrong merchant data inaccessible)        | **PASS** — policy tests 18/18                                   |
| 8   | CORS configured; no real secrets in `render.yaml`                                 | **PASS** — env config complete                                  |
| 9   | Migrations verified applied (including P1-6 RPC)                                  | **MANUAL GATE** — `supabase db push` must be confirmed          |
| 10  | Environment variables set in Render dashboard                                     | **MANUAL GATE** — operator must complete §2b/2c                 |
| 11  | Golden path smoke checklist completed on live instance                            | **MANUAL GATE** — see `docs/order-lifecycle-smoke-checklist.md` |

### Recommendation: **CONDITIONAL GO — internal pilot approved**

All code-level P0 and P1 gate criteria pass. Three manual gates (migration push, env var setup, smoke checklist) must be completed by the operator before first testers are onboarded.

**Conditions for GO:**

1. `supabase db push` completes without error and the 4 RPCs are verified present (§2a).
2. All Render env vars are set and backend health returns 200 (§2d).
3. At minimum sections A, B, D, G, and J of the smoke checklist are executed and pass on the live instance.

**Do not proceed to public launch without:**

- Automated CI pipeline
- Rate limiting
- Atomic `approvePayoutBatch` / `settlePayoutBatch` RPCs (P2)
- Load / stress testing on production DB tier

---

_Cross-references: `docs/ENVIRONMENT_SETUP.md` · `docs/RENDER_DEPLOYMENT.md` · `docs/order-lifecycle-smoke-checklist.md` · `governance/CLOSURE_REPORT.md`_
