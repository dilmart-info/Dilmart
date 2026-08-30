# 🔍 DilMart-Store — تقرير التدقيق الشامل

> تم فحص المشروع بالكامل: Backend (NestJS 33 module) + Frontend (React/Vite 18 page) + Database (Supabase/PostgreSQL ~60 migration)

---

## 🔴 ثغرات أمنية (Security Vulnerabilities)

### 1. لا يوجد Rate Limiting على API

> [!CAUTION]
> لا يوجد أي حماية من هجمات brute-force أو DDoS على أي endpoint.

- لا يوجد `@nestjs/throttler` أو أي middleware مشابه
- Checkout endpoint يمكن استدعاؤه آلاف المرات بدون حد
- Login/Auth endpoints مفتوحة لمحاولات تسجيل دخول غير محدودة
- **الخطر**: يمكن استنزاف المخزون أو إغراق السيرفر

**الإصلاح**: تثبيت `@nestjs/throttler` مع حدود مناسبة (مثلاً 10 req/min على checkout)

---

### 2. لا يوجد Helmet/CSRF/XSS Protection

> [!WARNING]
> لا يوجد أي HTTP security headers (Helmet) أو حماية من XSS/CSRF.

- لم يتم تثبيت `helmet` middleware
- لا يوجد `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`
- لا يوجد input sanitization ضد HTML/script injection
- حقل `notes` في Checkout يقبل أي نص بدون تنظيف

**الإصلاح**: `npm install helmet` + `app.use(helmet())` في `main.ts`

---

### 3. عدم التحقق من صيغة رقم الهاتف في Checkout

> [!WARNING]
> DTO يقبل أي string كـ `customer_phone` بدون validation.

- في [checkout.dto.ts](file:///e:/Project/DilMart-Store/backend/src/modules/checkout/checkout.dto.ts#L49) لا يوجد `@Matches()` regex
- يمكن إرسال نص عشوائي كرقم هاتف
- Jenni dispatch يتطلب `07XXXXXXXXX` لكن الـ validation في الـ DTO غير موجود

**الإصلاح**: إضافة `@Matches(/^07\d{9}$/)` على `customer_phone`

---

### 4. SQL Injection محتمل في Admin Search

> [!CAUTION]
> في [admin.service.ts:L386](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts#L386):

```typescript
req = req.or(
  `full_name.ilike.%${params.search}%,email.ilike.%${params.search}%`,
);
```

- قيمة `params.search` يتم إدخالها مباشرة في filter string بدون escaping
- يمكن لمستخدم خبيث حقن Supabase filter syntax

**الإصلاح**: استخدام `textSearch` أو escape الأحرف الخاصة مثل `%`, `_`, `.`

---

### 5. WebhooksModule فارغ — لا يوجد Webhook Signature Verification

- ملف [webhooks.module.ts](file:///e:/Project/DilMart-Store/backend/src/modules/webhooks/webhooks.module.ts) فارغ (91 bytes فقط)
- Jenni webhook يستخدم bearer token فقط — لا HMAC signature
- لا يوجد replay attack protection (no timestamp validation)

---

## 🟡 وظائف غير مكتملة (Incomplete Features)

### 6. Regions Endpoint غير مهاجر

في [Checkout.tsx:L93](file:///e:/Project/DilMart-Store/src/pages/Checkout.tsx#L93):

```typescript
// regions endpoint is not yet migrated; fallback to plain area input for now
return [];
```

- اختيار المنطقة/الحي يعمل كحقل نص حر فقط
- لا يوجد dropdown مناطق مرتبط بالمحافظة

### 7. صفحة Finance Reconciliation فارغة

- [FinanceReconciliation.tsx](file:///e:/Project/DilMart-Store/src/pages/admin/FinanceReconciliation.tsx) = 222 bytes فقط (placeholder)
- صفحة التسوية المالية غير مبنية

### 8. صفحات Admin placeholder

| الصفحة                                                                          | الحجم     | الحالة      |
| ------------------------------------------------------------------------------- | --------- | ----------- |
| [Coupons.tsx](file:///e:/Project/DilMart-Store/src/pages/admin/Coupons.tsx)     | 247 bytes | Placeholder |
| [Inventory.tsx](file:///e:/Project/DilMart-Store/src/pages/admin/Inventory.tsx) | 251 bytes | Placeholder |
| [Orders.tsx](file:///e:/Project/DilMart-Store/src/pages/admin/Orders.tsx)       | 270 bytes | Placeholder |
| [Products.tsx](file:///e:/Project/DilMart-Store/src/pages/admin/Products.tsx)   | 313 bytes | Placeholder |
| [Users.tsx](file:///e:/Project/DilMart-Store/src/pages/admin/Users.tsx)         | 236 bytes | Placeholder |

### 9. Store Integration Secret فارغ

في [backend/.env:L35](file:///e:/Project/DilMart-Store/backend/.env#L35):

```
DilMart_INTEGRATION_SECRET=
```

- B2B integration مع DilMart-main معطّل لأن المفتاح فارغ
- لا يمكن للصالونات الشراء عبر التطبيق الرئيسي

### 10. لا يوجد Email Notification System

- `OUTBOUND_ALERT_EMAIL_WEBHOOK_URL=` فارغ
- `OUTBOUND_ALERT_WEBHOOK_URL=` فارغ
- نظام الإشعارات بالكامل غير مفعّل — لا تنبيهات للطلبات المتأخرة

---

## 🟠 مشاكل الأداء (Performance Issues)

### 11. Analytics يحمّل كل الطلبات من قاعدة البيانات

> [!IMPORTANT]
> في [admin.service.ts:L157-165](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts#L157-L165):

```typescript
const { data: ordersData } = await this.supabaseAdmin.client
  .from("orders")
  .select("*, governorates(name)");

const { data: orderItemsData } = await this.supabaseAdmin.client
  .from("order_items")
  .select("*, products(purchase_price)");
```

- يتم تحميل **جميع** الطلبات والعناصر في الذاكرة
- مع نمو البيانات سيصبح هذا كارثياً (timeout + OOM)
- لا يوجد date filter أو pagination

### 12. لا يوجد Pagination في Orders List

- [orders.service.ts:L75-82](file:///e:/Project/DilMart-Store/backend/src/modules/orders/orders.service.ts#L75-L82) — يحمّل جميع الطلبات
- Filtering يتم في JavaScript بعد تحميل كل البيانات
- لا `LIMIT`, لا `OFFSET`, لا cursor-based pagination

### 13. Client-Side Search بدل Database Search

- في [orders.service.ts:L86-91](file:///e:/Project/DilMart-Store/backend/src/modules/orders/orders.service.ts#L86-L91):

```typescript
return rows.filter(
  (o: any) =>
    o.customer_name?.toLowerCase().includes(term) ||
    o.customer_phone?.includes(params.search!) ||
    o.order_number?.toLowerCase().includes(term),
);
```

- البحث يتم بعد تحميل جميع الصفوف — يجب نقله إلى SQL

---

## 🔵 جودة الكود (Code Quality)

### 14. لا يوجد أي Unit/Integration Tests

> [!CAUTION]
> **صفر اختبارات** في Backend بالكامل!

- لا ملفات `.spec.ts` أو `.test.ts` في المشروع
- Frontend يملك ملف `example.test.ts` وحيد (فارغ تقريباً)
- لا يوجد CI/CD pipeline للاختبارات
- أي تغيير قد يكسر الإنتاج بدون علم

### 15. Empty Catch Blocks (أخطاء مبلوعة)

16 موقع في الكود يبتلع الأخطاء صامتاً:

```typescript
} catch {
  // ← Error swallowed silently
}
```

ملفات متأثرة: `uploads.service.ts`, `products.service.ts`, `merchants.service.ts`, `loyalty.service.ts`, `jenni-*.ts`

### 16. استخدام مفرط لـ `any` Types

- أكثر من 50 موقع يستخدم `as any` في الـ Backend
- يعطّل فعالية TypeScript ويخفي أخطاء محتملة

### 17. Admin Service عملاق (2131 سطر)

- ملف [admin.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts) = **2,131 سطر** و **85 KB**
- يجب تقسيمه إلى services أصغر (AdminAnalyticsService, AdminOrdersService, etc.)

### 18. خطأ في Audit Event Type

- في [admin.service.ts:L595](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts#L595):

```typescript
eventType: "ORDER_UPDATED",  // ← خطأ! يجب أن يكون "LOYALTY_SETTINGS_UPDATED"
```

- نفس `ORDER_UPDATED` يُستخدم لـ notification read, loyalty settings, وعمليات أخرى

---

## 🟢 تحسينات مقترحة (Recommendations)

### أولوية عالية (Critical)

| #   | التحسين                                     | الجهد    |
| --- | ------------------------------------------- | -------- |
| 1   | إضافة Rate Limiting (`@nestjs/throttler`)   | ساعة     |
| 2   | إضافة Helmet security headers               | 15 دقيقة |
| 3   | Phone validation regex في Checkout DTO      | 15 دقيقة |
| 4   | Escape SQL filter injection في Admin search | 30 دقيقة |
| 5   | Pagination للطلبات والمنتجات                | 3 ساعات  |

### أولوية متوسطة (Important)

| #   | التحسين                                               | الجهد    |
| --- | ----------------------------------------------------- | -------- |
| 6   | إنشاء اختبارات أساسية للـ Checkout/Orders             | يوم      |
| 7   | نقل Analytics إلى DB aggregation (SQL views)          | 4 ساعات  |
| 8   | تفعيل إشعارات Webhook/Email                           | ساعة     |
| 9   | بناء صفحات Admin المتبقية (Coupons, Inventory, Users) | 2-3 أيام |
| 10  | توليد `DilMart_INTEGRATION_SECRET`                    | 5 دقائق  |

### أولوية منخفضة (Nice to Have)

| #   | التحسين                              | الجهد   |
| --- | ------------------------------------ | ------- |
| 11  | تقسيم AdminService إلى services أصغر | 3 ساعات |
| 12  | إصلاح Audit event types              | ساعة    |
| 13  | استبدال `any` بـ proper types        | يوم     |
| 14  | بناء نظام Regions/Areas للمحافظات    | يوم     |
| 15  | إضافة Error monitoring (Sentry)      | ساعة    |

---

## ملخص إحصائي

| المقياس                  | القيمة                                |
| ------------------------ | ------------------------------------- |
| Backend Modules          | 33                                    |
| Frontend Pages           | 18 + 3 dirs                           |
| SQL Migrations           | ~60                                   |
| Test Files               | 0 (backend), 1 placeholder (frontend) |
| Placeholder Pages        | 5                                     |
| Empty Catch Blocks       | 16                                    |
| RLS-Protected Tables     | ~30+                                  |
| Security Vulnerabilities | 5 critical                            |
| Incomplete Features      | 5                                     |
| Performance Issues       | 3                                     |
