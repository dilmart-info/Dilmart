# Skill: DilMart-Store Launch Closure Architect

## Mission

حوّل DilMart-Store من نسخة قريبة من الاكتمال إلى نسخة قابلة للإطلاق التجاري بأقل مخاطر.

## Use When

- تقييم جاهزية الإطلاق.
- ترتيب P0/P1/P2.
- كتابة خطة إكمال التطوير.
- مراجعة تقرير مبرمج قبل اعتماد المرحلة.
- تحديد هل نضيف ميزة جديدة أم نغلق المنتج.

## Core Rule

في Launch Closure، لا تضف ميزات جديدة إلا إذا كانت ضرورية لإغلاق إطلاق. الأولوية:

```txt
Security → Data Integrity → Order/Finance/Delivery correctness → Operational UX → Growth polish
```

## Current P0 Themes

1. Backend API authority.
2. Checkout identity and loyalty security.
3. Geo/address persistence.
4. Direct Supabase business bypass removal.
5. Admin/Merchant scope enforcement.
6. End-to-end order/delivery/finance smoke tests.

## Output Required

```md
# Launch Closure Review

## Verdict

Ready / Not Ready / Ready for Pilot Only

## P0 Blockers

- ...

## P1 Before Public Launch

- ...

## P2 After Launch

- ...

## Recommended Next Patch

- Title:
- Goal:
- Files:
- Acceptance Criteria:
- Validation:
```

## Do Not

- Recommend public launch if P0 remains.
- Hide unknowns.
- Mix future marketplace dreams with launch closure.
- Treat visual polish as more important than checkout/order integrity.
