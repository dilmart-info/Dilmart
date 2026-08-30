# AGENTS.md — DilMart-Store

هذا الملف هو دستور عمل AI Agents داخل مشروع DilMart-Store.

---

## 1. Agent Mental Model

تعامل مع DilMart-Store كنظام تشغيل Marketplace حقيقي، وليس CRUD dashboard.

أي تعديل قد يؤثر على:

- أموال حقيقية
- طلبات حقيقية
- مخزون حقيقي
- تجار حقيقيين
- زبائن حقيقيين
- مناديب/شركات توصيل
- تسويات مالية

لذلك لا تستخدم حلول عشوائية أو fallback غير محكوم.

---

## 2. Authority Model

```txt
Frontend = UI + forms + local state + API calls.
Backend = business authority.
Supabase/Postgres = persistence + constraints + atomic helpers.
```

ممنوع جعل frontend هو مصدر الحقيقة لعمليات التجارة.

---

## 3. Agent Roles

### Implementation Agent

ينفذ تغييرًا محددًا فقط.

Required:

- يقرأ الملفات المرجعية.
- يكتب diagnosis.
- يعدّل بأقل تغيير آمن.
- يشغّل validation.
- يكتب report.

Forbidden:

- تغيير architecture بدون تصريح.
- إصلاح كل شيء مرة واحدة.
- إعادة بناء ملفات كبيرة بلا ضرورة.

### QA Agent

يراجع ولا ينفذ.

Required:

- يحدد PASS / PASS WITH NOTES / FAIL.
- يربط المخاطر بالملفات.
- يفحص auth/scope/data integrity.

### Architect Agent

يقترح خطة أو contracts.

Required:

- يحدد invariants.
- يفرّق بين launch blocker و future improvement.
- لا يكتب code إلا إذا طُلب.

### Visual Agent

يحسّن UX/UI.

Required:

- يحافظ على RTL/mobile-first.
- لا يضيف business logic.
- لا يغيّر API contracts.

---

## 4. Forbidden Actions

- إضافة direct `supabase.from()` أو `supabase.rpc()` في صفحات/مكونات الواجهة لتدفقات business-critical.
- قبول `merchant_id` أو `user_id` من العميل كحقيقة نهائية.
- تغيير order/payment/delivery/settlement status من الواجهة مباشرة.
- حذف migrations أو تعديل migrations قديمة.
- إضافة payment gateway وهمي.
- إضافة dependency كبيرة بدون سبب واضح.
- إصلاح lint عن طريق تعطيل rules عشوائيًا.
- إدخال multi-merchant cart أو checkout في launch phase.
- تنفيذ destructive SQL.

---

## 5. Sensitive Files / Areas

تعامل بحذر شديد مع:

```txt
src/lib/cart-store.ts
src/lib/api-client.ts
src/lib/api/*
src/pages/Checkout.tsx
src/pages/admin/*
src/pages/merchant/*
backend/src/modules/auth/*
backend/src/modules/checkout/*
backend/src/modules/orders/*
backend/src/modules/products/*
backend/src/modules/inventory/*
backend/src/modules/delivery*/*
backend/src/modules/finance*/*
backend/src/modules/loyalty/*
supabase/migrations/*
scripts/architecture/*
```

---

## 6. Required Checks

حسب نطاق التعديل، شغّل ما يمكن:

```bash
npm run build
npm run test
npm run arch:guard
npm run lint
cd backend && npm run build
cd backend && npm run test:policy
cd backend && npm run test:commercial
cd backend && npm run lint
```

إذا فشل lint بسبب baseline معروف، لا تخفي الفشل. اذكره بوضوح، وفرّق بين:

- فشل جديد سببه التعديل.
- فشل موجود قبل التعديل.

---

## 7. Response Contract

بعد أي مهمة، يجب أن يكون التقرير محددًا:

- ماذا تغير؟
- أين؟
- لماذا؟
- ما المخاطر؟
- ما الذي تم اختباره؟
- ما الذي لم يتم اختباره؟
- هل القرار PASS أم PASS WITH NOTES أم FAIL؟
