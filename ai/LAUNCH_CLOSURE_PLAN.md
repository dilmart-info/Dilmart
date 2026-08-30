# DilMart-Store Launch Closure Plan

## Verdict

Current target should be **Pilot/Beta after P0 closure**, not public launch immediately.

---

## Phase LC-1 — P0 Security & Data Integrity

### LC-1.1 Secure checkout identity and loyalty

- Do not accept final `user_id` from body.
- Authenticated user identity comes from token/session.
- Guest checkout uses null user context.
- Validate points balance server-side.
- Prevent spending points for another user.

### LC-1.2 Persist delivery geo fields

- Ensure frontend sends `latitude`, `longitude`, `map_url` consistently.
- Ensure backend DTO accepts them.
- Ensure `CheckoutService.submit()` passes them to RPC/order insert.
- Ensure admin/delivery views can use them.

### LC-1.3 Remove direct Supabase business bypasses

- Move DesktopQuickLinks CRUD to backend API.
- Remove admin merchant fallback direct `supabase.from("merchants")`.
- Re-run `npm run arch:guard`.

---

## Phase LC-2 — Operational QA

- Checkout smoke tests.
- Coupon/loyalty tests.
- Mixed merchant rejection.
- Stock insufficiency.
- Admin order lifecycle.
- Merchant own-order visibility.
- Delivery assignment/status.
- COD collection and merchant settlement path.

---

## Phase LC-3 — Deployment Readiness

- Staging Supabase project.
- Staging Render backend.
- Staging Netlify frontend.
- Separate env variables.
- Migration strategy.
- Backup/rollback plan.
- Post-deploy smoke test.

---

## Phase LC-4 — Public Launch Polish

- Fix or baseline lint.
- UI polish for home/category/product/cart/checkout.
- Error/loading states.
- Admin/Merchant runbook.
- Customer support/WhatsApp flow.
