# CURSOR_EXECUTION_RULES.md — DilMart-Store

## Purpose

هذه القواعد مخصصة لـ Cursor / Antigravity عند تنفيذ تعديلات على DilMart-Store.

---

## 1. Before Coding

لا تبدأ بالتعديل مباشرة. أولًا:

1. اقرأ ملفات `/ai` المطلوبة.
2. صنّف المهمة A/B/C/D/E.
3. افحص الملفات ذات الصلة.
4. حدّد هل التغيير يمس P0/P1 launch blockers.
5. اكتب Pre-Coding Diagnosis مختصر.

---

## 2. Editing Rules

- غيّر أقل عدد ممكن من الملفات.
- لا تعيد كتابة ملف كبير إذا كان patch صغير يكفي.
- حافظ على أسماء الـ APIs والـ types قدر الإمكان.
- إذا غيّرت contract، حدّث كل callers والـ docs/tests.
- لا تستخدم `any` كحل سريع إلا مع سبب موثق.
- لا تضف dependency دون تقرير سبب.
- لا تضف fallback يخفي فشل backend.

---

## 3. Backend Rules

- Controllers thin.
- Services own business logic.
- Validate DTOs for write endpoints.
- Authorization server-side.
- Merchant/customer/admin scope server-side.
- Do not trust frontend identity or totals.
- Add tests for sensitive changes when possible.

---

## 4. Frontend Rules

- UI calls backend APIs via `src/lib/api-*` layers.
- No new business-critical Supabase reads/writes.
- React Query keys must include relevant scope.
- Loading/error/empty states must be handled.
- Mobile-first and RTL must remain good.
- Console errors are not acceptable in launch closure tasks.

---

## 5. Supabase/Migration Rules

- Never edit applied migrations.
- Add new timestamped migration.
- Use idempotent migration statements when safe.
- Lock down dangerous RPCs where needed.
- Avoid service_role-only assumptions in frontend.
- Document new tables/functions/policies.

---

## 6. Validation Priority

For launch closure work, validation order:

1. Build/typecheck frontend.
2. Build backend.
3. Architecture guard.
4. Backend policy/commercial tests.
5. Targeted tests for touched domain.
6. Lint status, clearly marked baseline vs new.
7. Manual smoke test path.

---

## 7. Required Final Output

```md
# Cursor Implementation Report

## Task Type

A/B/C/D/E

## Summary

...

## Files Changed

...

## Validation Commands

- command: result

## Known Existing Failures

...

## New Risks

...

## Final Verdict

PASS / PASS WITH NOTES / FAIL
```
