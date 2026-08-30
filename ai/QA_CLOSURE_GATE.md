# QA_CLOSURE_GATE.md — DilMart-Store

هذا الملف يحدد متى نعتبر المهمة أو المرحلة مغلقة.

---

## 1. Verdict Levels

### PASS

- التغيير يعمل.
- لا توجد regression واضحة.
- validation المناسب نجح.
- لا توجد مخاطر إطلاق مفتوحة ضمن scope المهمة.

### PASS WITH NOTES

- التغيير يعمل.
- يوجد فشل baseline قديم أو نقص اختبار غير قاتل.
- لا يوجد P0 جديد.
- يجب توثيق الملاحظات بدقة.

### FAIL

- Build مكسور بسبب التغيير.
- Auth/scope مكسور.
- Direct Supabase bypass جديد.
- Checkout/order/finance/delivery invariant مكسور.
- data loss أو security risk.
- console/runtime error مؤثر.

---

## 2. Launch Closure Gates

قبل الإطلاق العام يجب أن تكون هذه البوابات مغلقة:

### Gate 1 — Architecture Authority

- لا direct Supabase business bypass غير معتمد في الواجهة.
- `npm run arch:guard` ينجح أو توجد allow-list موثقة ومراجعة.
- كل critical flows تمر عبر backend API.

### Gate 2 — Checkout Integrity

- server-side pricing.
- server-side merchant resolution.
- one-merchant invariant.
- stock atomicity.
- coupon validation server-side.
- loyalty points secure server-side.
- geo fields persisted.

### Gate 3 — Auth & Scope

- Admin endpoints guarded.
- Merchant endpoints scoped server-side.
- Delivery/agent endpoints scoped.
- Customer identity cannot be spoofed through body params.

### Gate 4 — Order Lifecycle

- order creation.
- order status transitions.
- cancellation/failure/return.
- merchant visibility.
- admin operations.
- customer tracking.

### Gate 5 — Delivery Lifecycle

- assignment.
- pickup.
- in transit.
- delivered.
- failed/returned.
- COD collection impact.

### Gate 6 — Finance & Settlement

- merchant ledger/payables.
- courier/company settlement.
- COD collection/remittance.
- reversals/disputes.
- auditability.

### Gate 7 — UI/UX Production Readiness

- mobile checkout usable.
- Arabic/RTL clean.
- no broken CTAs.
- loading/error/empty states.
- no severe console errors.

### Gate 8 — Deployment Readiness

- staging/prod separated.
- env variables documented.
- Render backend build verified.
- Netlify frontend build verified.
- backup/rollback plan exists.

---

## 3. Minimum Validation Matrix

```txt
Frontend build             npm run build
Frontend tests             npm run test
Architecture guard         npm run arch:guard
Frontend lint              npm run lint
Backend build              cd backend && npm run build
Backend policy tests       cd backend && npm run test:policy
Backend commercial tests   cd backend && npm run test:commercial
Backend lint               cd backend && npm run lint
```

If a command is known to fail from baseline, document:

- exact command
- exact failure class
- whether the current task worsened it
- remediation phase

---

## 4. Manual Smoke Tests

For launch closure, manually verify:

1. Customer opens marketplace.
2. Customer views category/product/store.
3. Customer adds product to cart.
4. Cart blocks mixed-merchant item or resets intentionally.
5. Customer submits checkout with address + phone + geo if available.
6. Admin sees order.
7. Merchant sees own order only.
8. Admin assigns delivery.
9. Delivery status progresses.
10. COD collection/settlement appears correctly.
11. Merchant finance/payable reflects expected values.
12. No unauthorized data visible across merchants.
