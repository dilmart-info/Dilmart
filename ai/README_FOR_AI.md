# AI Workspace README — DilMart-Store

هذا الملف هو نقطة الدخول الأولى لأي AI Developer يعمل داخل مشروع **DilMart-Store** عبر Cursor / Antigravity / Claude Code / Lovable أو أي وكيل تطوير آخر.

المشروع ليس موقعًا عامًا ولا قالب متجر بسيط. هو Marketplace تشغيلي متعدد التجار في العراق، مع Checkout، طلبات، مخزون، توصيل، COD، تسويات مالية، لوحة Admin، لوحة Merchant، وذكاء توصيل.

---

## Required Reading Order

قبل أي تعديل غير بسيط، اقرأ بالترتيب:

```txt
/ai/README_FOR_AI.md
/ai/PROJECT_CONTEXT.md
/ai/AGENTS.md
/ai/CURSOR_EXECUTION_RULES.md
/ai/QA_CLOSURE_GATE.md
```

إذا كانت المهمة تتعلق بالتصميم أو الواجهة:

```txt
/ai/DESIGN.md
/ai/VISUAL_QA_GATE.md
/ai/SKILLS/STORE_UI_UX_MARKETPLACE_RTL_SKILL.md
```

إذا كانت المهمة تتعلق بالباكند أو API أو Auth أو صلاحيات أو Supabase:

```txt
/ai/SKILLS/STORE_BACKEND_API_AUTHORITY_SKILL.md
/ai/SKILLS/STORE_SUPABASE_RLS_RPC_SKILL.md
/ai/SKILLS/STORE_SECURITY_PRIVACY_AUDIT_SKILL.md
```

إذا كانت المهمة تتعلق بالطلبات أو checkout أو الكوبونات أو النقاط أو المخزون أو التسعير:

```txt
/ai/SKILLS/STORE_CHECKOUT_ORDER_FINANCE_QA_SKILL.md
/ai/SKILLS/STORE_BACKEND_API_AUTHORITY_SKILL.md
```

إذا كانت المهمة تتعلق بالتوصيل أو المناديب أو شركات التوصيل أو ذكاء التوصيل:

```txt
/ai/SKILLS/STORE_DELIVERY_INTELLIGENCE_QA_SKILL.md
```

إذا كانت المهمة تتعلق بلوحة Admin أو Merchant:

```txt
/ai/SKILLS/STORE_ADMIN_MERCHANT_OPS_SKILL.md
```

إذا كانت المهمة تتعلق بالإطلاق، staging/prod، الأداء، الكاش، أو Render/Netlify:

```txt
/ai/SKILLS/STORE_PERFORMANCE_STAGING_DEPLOYMENT_SKILL.md
```

---

## Task Classification

قبل التعديل صنّف المهمة:

### A — UI/Text/Static

- نصوص، spacing، ألوان، ترتيب بلوكات، صور، سلايدات.

### B — Functional UI / API Read

- صفحة تعرض بيانات من API، فلاتر، بحث، state، pagination، dashboard read-only.

### C — Operational Flow

- Checkout، طلبات، كوبونات، نقاط، مخزون، تسعير، توصيل، تحصيل، Merchant actions.

### D — Backend / Database / Security / Architecture

- Auth، RolesGuard، RLS، RPC، migrations، Finance، Settlement، Delivery lifecycle، API contracts.

### E — Launch Closure / Production Hardening

- إصلاح P0/P1، فصل staging/prod، CI checks، monitoring، performance، smoke tests.

---

## Non-Negotiable Rules

1. Backend API هو مصدر الحقيقة لكل business-critical flow.
2. لا تضف direct Supabase business reads/writes في الواجهة.
3. لا تثق بأي `user_id`, `merchant_id`, `price`, `discount`, `points`, أو `stock` قادم من العميل.
4. Checkout والتسعير والكوبونات والنقاط والمخزون يجب أن تُحسب وتُثبت في backend/RPC/DB بشكل آمن.
5. كل عملية مالية أو توصيل أو order status يجب أن تكون auditable وقابلة للتتبع.
6. One merchant per cart/order قيد إجباري للإطلاق الحالي.
7. لا تضف multi-merchant checkout إلا كمرحلة معمارية مستقلة.
8. لا تضف payment gateway أو UI يوحي بوجود دفع إلكتروني production-ready قبل اكتمال provider/webhook/idempotency/reconciliation.
9. لا تغيّر migrations قديمة بعد تطبيقها؛ أضف migration جديدًا فقط.
10. لا تغيّر `.env` أو production config أو secrets.
11. لا تعمل DROP/TRUNCATE أو destructive SQL.
12. لا تكسر Arabic/RTL/mobile-first UX.
13. لا تدّعي النجاح بدون validation report.

---

## Current Launch-Blocking Focus

هذه النسخة تحتاج **Launch Closure Phase** قبل الإطلاق العام. الأولويات الحالية:

```txt
P0-1 Secure checkout user identity and loyalty points.
P0-2 Ensure checkout persists delivery geo fields: latitude, longitude, map_url.
P0-3 Remove remaining frontend direct Supabase business access.
P0-4 Add backend APIs for DesktopQuickLinks and any remaining admin/merchant fallbacks.
P0-5 Validate single-merchant, stock, coupon, pricing, and settlement invariants end-to-end.
P1-1 Reduce lint failures or explicitly stage lint cleanup.
P1-2 Add scenario tests for checkout/order/delivery/finance.
P1-3 Prepare staging/prod environment separation.
```

---

## Required Pre-Coding Diagnosis

```md
# Pre-Coding Diagnosis

## Task Type

A / B / C / D / E

## Files Inspected

- `path/file`: reason

## Current Behavior

- ...

## Problem

- ...

## Proposed Minimal Change

- ...

## Risk Areas

- Auth/Identity:
- Merchant Scope:
- Checkout:
- Pricing/Coupon/Loyalty:
- Inventory:
- Orders:
- Delivery:
- Finance/Settlement:
- Supabase/RLS/RPC:
- UI/RTL/Mobile:

## Assumptions

- ...
```

---

## Required Implementation Report

```md
# Implementation Report

## Summary

- ...

## Files Changed

- `path/file`: reason

## Business Impact

- Customer:
- Merchant:
- Admin:
- Delivery:
- Finance:

## Technical Impact

- Frontend:
- Backend:
- Supabase/Migrations:
- API Contracts:
- Auth/Authorization:

## Validation

- Frontend typecheck/build:
- Backend build:
- Frontend lint:
- Backend lint:
- Tests:
- Architecture guard:
- Manual QA:
- Console/network errors:

## Final Verdict

PASS / PASS WITH NOTES / FAIL
```
