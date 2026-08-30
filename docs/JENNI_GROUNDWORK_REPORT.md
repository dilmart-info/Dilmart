# 📋 JENNI INTEGRATION — تقرير شامل للأرضية الآمنة

> **Version**: 3.0  
> **Date**: 2026-06-15  
> **Sprint**: Jenni Safe Groundwork (Pre-Phase 0)  
> **Status**: ✅ مكتمل ومختبر — بانتظار بيانات اعتماد Jenni لاستكمال Phase 0

---

## 🚨 إصلاحات أمنية (commit `1ea1ee4`)

> [!CAUTION]
> تم اكتشاف تسريب credentials في commit `6743b00` — تم الإصلاح فوراً.
> **الحادثة مغلقة** — تم تدوير كلمات المرور. تقرير الإغلاق: [`SECURITY_LEAK_CLOSURE_2026-06-15.md`](./SECURITY_LEAK_CLOSURE_2026-06-15.md)

### ما حدث:

سكربت اختبار (`smoke_test_api.mjs`) تم رفعه يحتوي:

- Supabase anon key
- Production backend URL
- بريد إلكتروني وكلمات مرور لحسابات admin و merchant

### ما تم فعله:

1. ✅ **حذف الملف** من Git تماماً
2. ✅ **تحديث `.gitignore`** لمنع أي `smoke_test*` أو `*credentials*` أو `*secret*` من الرفع مستقبلاً
3. ✅ **تم تدوير بيانات الأدمن** — الأدمن الجديد: `DilMart77@gmail.com`
4. ✅ **تنظيف الإيميل القديم** من `admin/Login.tsx` placeholder و `test-render-auth.mjs`
5. ✅ **تقرير إغلاق أمني** مكتمل: `SECURITY_LEAK_CLOSURE_2026-06-15.md`

### إصلاحان إضافيان بناءً على مراجعة المشرف:

#### إصلاح 1: Sticker ownership bug

- **المشكلة**: `actorId` (وهو `user_id`) كان يُمرر كأنه `merchant_id`
- **الإصلاح**: `JenniStickerService` الآن يستعلم من `merchant_users` table لتحويل `user_id → merchant_id` ثم يقارن مع `order.merchant_id`
- **الأثر**: التاجر لن يستطيع طباعة ستكر لطلب تاجر آخر

#### إصلاح 2: Cancel/Modify COD guards

- **المشكلة**: لا يوجد تحقق من `delivery_status` — كان يسمح بالإلغاء حتى بعد pickup
- **الإصلاح**: `assertShipmentModifiable()` يمنع العملية إذا `delivery_status` تجاوز `assigned_to_company`
- **القاعدة**: Cancel/Modify مسموحة فقط في `pending_assignment` أو `assigned_to_company`
- **إضافة**: تسجيل audit event في `delivery_events` لكل cancel أو modify COD
- **ملاحظة**: تعديل COD لا يغيّر المالية — يُسجّل فقط

---

## 📌 ملخص تنفيذي

تم تجهيز الأرضية الكاملة لربط DilMart مع شركة التوصيل Jenni (الزعيم) بدون الاعتماد على بيانات الدخول أو نتيجة Phase 0. كل التعديلات آمنة، لا تغيّر السلوك الحالي، وجاهزة للتفعيل فور توفر الـ credentials.

### ما تم إنجازه

| #   | المهمة                          | الملف الرئيسي                                       | الحالة                     |
| --- | ------------------------------- | --------------------------------------------------- | -------------------------- |
| 1   | Refactor JenniClientService     | `jenni-client.service.ts`                           | ✅                         |
| 2   | توسيع Types                     | `jenni.types.ts`                                    | ✅                         |
| 3   | تصحيح Status Mapper             | `jenni-status-mapper.ts`                            | ✅                         |
| 4   | Sticker Proxy Endpoint          | `jenni-sticker.service.ts` + `orders.controller.ts` | ✅ (مُصلَح)                |
| 5   | Merchant UI — ستكر              | `merchant/OrderDetail.tsx`                          | ✅                         |
| 6   | توثيق قواعد المالية             | `JENNI_FINANCE_RULES.md`                            | ✅                         |
| 7   | Phase 0 Spike Script            | `jenni-identity-spike.mjs`                          | ✅ جاهز، ينتظر credentials |
| 8   | إصلاح أمني + ownership + guards | `.gitignore` + `orders.service.ts`                  | ✅                         |
| 9   | تقرير الإغلاق الأمني            | `SECURITY_LEAK_CLOSURE_2026-06-15.md`               | ✅                         |
| 10  | اختبارات unit (28 test)         | `jenni-groundwork-guards.test.mjs`                  | ✅ 28/28 PASS              |

### ما لم يُنفَّذ (ينتظر Phase 0)

| البند                      | السبب                             |
| -------------------------- | --------------------------------- |
| DB Migrations              | تحتاج نتيجة Phase 0 لتحديد الحقول |
| Store Provisioning Service | يعتمد على نموذج الهوية            |
| Real Dispatch مع store_id  | يحتاج store provisioning          |
| Settlement Service         | ينتظر اختبار API 35               |
| توسيع State Machine        | قرار معماري: لا توسيع             |

---

## 🔧 التفاصيل التقنية

---

### 1. Refactor JenniClientService

**الملف**: [`jenni-client.service.ts`](../backend/src/modules/jenni/jenni-client.service.ts)

#### ما كان:

- فقط `POST` عبر `request()` الخاص
- `GET` عبر `getJson()` منفصل
- بدون timeout
- بدون دعم binary response

#### ما صار:

- `request<T>(opts: JenniRequestOptions)` — generic يدعم `GET / POST / PUT / DELETE`
- **Timeout**: 10 ثوانٍ عبر `AbortController` مع رسالة خطأ واضحة
- **Binary Response**: دعم `rawResponse: true` لاستقبال PDF (ستكر)
- **Query Params**: دعم `query` parameter للـ GET requests
- **Convenience Wrappers**: `post()`, `get()`, `put()`, `del()`, `postBinary()`

#### Methods جديدة:

```typescript
async fetchStickerPdf(shipmentNumbers: string[], widthMm?, heightMm?): Promise<Buffer>
async cancelShipment(shipmentId: number | string): Promise<unknown>
async modifyShipmentCod(shipmentId: number | string, amountIqd: number): Promise<unknown>
```

#### Backward Compatibility:

```typescript
// هذه لم تتغير:
createShipments(shipments)   // ← نفس الـ signature
queryShipments(input)        // ← نفس الـ signature
listGovernorates()           // ← نفس الـ signature
listCitiesPage(...)          // ← نفس الـ signature
```

---

### 2. توسيع Types

**الملف**: [`jenni.types.ts`](../backend/src/modules/jenni/jenni.types.ts)

#### الأنواع الجديدة:

| النوع                           | الغرض                                    |
| ------------------------------- | ---------------------------------------- |
| `JenniStoreCreatePayload`       | إنشاء Store في Jenni (بعد Phase 0)       |
| `JenniStoreCreateResponse`      | رد إنشاء Store                           |
| `JenniMerchantCreatePayload`    | إنشاء Merchant (فقط إذا الخيار B)        |
| `JenniMerchantCreateResponse`   | رد إنشاء Merchant                        |
| `JenniStickerRequest`           | طلب PDF الستكر                           |
| `JenniQueryShipmentResponse`    | رد استعلام الشحنة (مع settlement)        |
| `JenniPaymentStatementResponse` | `Record<string, unknown>` مؤقت لـ API 35 |
| `OrderDeliveryIntegrationRow`   | نوع كامل لصف الربط                       |
| `JenniHttpMethod`               | `GET \| POST \| PUT \| DELETE`           |
| `JenniRequestOptions`           | خيارات الطلب العام                       |
| `JenniApiError`                 | خطأ مهيكل                                |

---

### 3. تصحيح Status Mapper

**الملف**: [`jenni-status-mapper.ts`](../backend/src/modules/jenni/jenni-status-mapper.ts)

#### خريطة الحالات النهائية (بعد موافقة المشرف):

```
┌──────────────────────────┬──────────────────────────┐
│ حالة Jenni               │ حالة DilMart              │
├──────────────────────────┼──────────────────────────┤
│ NEW_ORDER_TO_PRINT       │ assigned_to_company      │
│ NEW_ORDER_TO_PICKUP      │ assigned_to_company      │
│ NEW_WITH_PA              │ picked_up ✅ (كان assigned)│
│ IN_SC                    │ in_transit ✅ (كان picked) │
│ PRINT_MANIFEST_DA        │ in_transit ✨ (جديد)      │
│ OFD                      │ in_transit               │
│ DELIVERED                │ delivered                │
│ DELIVERED_PRICE_CHANGED  │ delivered + admin review  │
│ POSTPONED                │ in_transit + metadata     │
│ POSTPONED_CONFIRMED      │ in_transit ✨ (جديد)      │
│ DELIVERY_REATTEMPT       │ in_transit               │
│ FORCE_DELIVERY           │ in_transit ✨ (جديد)      │
│ RTO_WITH_DA              │ returned                 │
│ RTO_WH                   │ returned                 │
│ RTO_CONFIRMED            │ returned                 │
│ RTO_ARCHIVED             │ returned ✨ (جديد)        │
│ RETURN_APPROVED          │ returned                 │
│ RETURNED_WITH_AGENT      │ returned                 │
│ PARTIALLY_DELIVERED      │ in_transit + admin review │
└──────────────────────────┴──────────────────────────┘
```

#### Event Metadata الجديد:

عند التأجيل أو الإرجاع، يُحفظ السبب في `delivery_events.metadata`:

```json
// حالة POSTPONED:
{ "postponed_reason": "العميل غير متواجد", "postponed_date_id": 1 }

// حالة RETURN:
{ "return_reason": "رفض الاستلام" }
```

#### التصحيحان الرئيسيان (بناءً على قرار المشرف):

| قبل                                 | بعد                       | السبب                        |
| ----------------------------------- | ------------------------- | ---------------------------- |
| `NEW_WITH_PA → assigned_to_company` | `NEW_WITH_PA → picked_up` | أول scan = تم الاستلام فعلاً |
| `IN_SC → picked_up`                 | `IN_SC → in_transit`      | مركز الفرز = بعد الاستلام    |

---

### 4. Sticker Proxy Endpoint (مُصلَح v2)

**الملف**: [`jenni-sticker.service.ts`](../backend/src/modules/jenni/jenni-sticker.service.ts)

#### Flow:

```
التاجر يضغط "طباعة ستكر الشحنة"
    ↓
GET /orders/:id/jenni-sticker
    ↓
1. ✅ التحقق من أن Jenni credentials مُعدَّة
2. ✅ تحميل الطلب (order.merchant_id)
3. ✅ إذا تاجر: user_id → merchant_users → merchant_id → مقارنة مع order.merchant_id
4. ✅ التحقق من وجود integration + dispatch_status = dispatched/synced
5. ✅ التحقق من وجود shipment_number
6. → POST /v2/shipments/stickers → PDF binary
7. ← يُمرر PDF مباشرة للمتصفح (Content-Type: application/pdf)
```

#### الحماية (بعد الإصلاح):

- **بدون credentials**: `503 Service Unavailable`
- **بدون shipment**: `400 Bad Request`
- **تاجر غير مالك**: `403 Forbidden` ← مُصلَح: يستعلم `merchant_users` الآن
- **Merchant ID resolution**: `resolveMerchantIdForUser(userId)` يمر بـ `merchant_users` table

#### Endpoints في `orders.controller.ts`:

| Method   | Path                 | الدور            | الوصف                    | Guards                       |
| -------- | -------------------- | ---------------- | ------------------------ | ---------------------------- |
| `GET`    | `:id/jenni-sticker`  | Merchant + Admin | يجلب PDF الستكر كـ proxy | ownership via merchant_users |
| `DELETE` | `:id/jenni-shipment` | Admin فقط        | إلغاء شحنة في Jenni      | **قبل pickup فقط** + audit   |
| `PATCH`  | `:id/jenni-cod`      | Admin فقط        | تعديل مبلغ COD           | **قبل pickup فقط** + audit   |

---

### 5. Cancel/Modify Guards (جديد — إصلاح)

**الملف**: [`orders.service.ts`](../backend/src/modules/orders/orders.service.ts)

#### قاعدة الحماية:

```typescript
private static readonly MODIFIABLE_DELIVERY_STATUSES = new Set([
  "pending_assignment",    // ✅ مسموح
  "assigned_to_company",   // ✅ مسموح
  // picked_up             ← ❌ ممنوع
  // in_transit            ← ❌ ممنوع
  // delivered             ← ❌ ممنوع
  // returned              ← ❌ ممنوع
  // cancelled             ← ❌ ممنوع
]);
```

#### assertShipmentModifiable(orderId):

1. يجلب `orders.delivery_status`
2. إذا الحالة ليست في `MODIFIABLE_DELIVERY_STATUSES` → يرمي `400 Bad Request`
3. الرسالة: `Cannot modify shipment: delivery status is "picked_up". Cancel/modify is only allowed before pickup.`

#### تسجيل Audit Events:

| العملية    | event_type                 | metadata                                    |
| ---------- | -------------------------- | ------------------------------------------- |
| Cancel     | `jenni_shipment_cancelled` | `{ provider, shipment_id }`                 |
| Modify COD | `jenni_cod_modified`       | `{ provider, shipment_id, new_amount_iqd }` |

> ⚠️ تعديل COD **لا يغيّر المالية** — يُسجّل فقط.

---

### 6. Merchant UI — زر الستكر

**الملف**: [`merchant/OrderDetail.tsx`](../src/pages/merchant/OrderDetail.tsx)

#### ما أُضيف:

1. **زر "طباعة ستكر الشحنة"** 🏷️
   - يظهر فقط إذا `delivery_company_id` موجود و `delivery_status ≠ pending_assignment`
   - يفتح PDF في تبويب جديد عبر الـ proxy endpoint
   - أيقونة `Tag` من Lucide

2. **بطاقة "حالة التوصيل"** 🚚
   - تعرض حالة التوصيل بالعربي مع ألوان مميزة
   - تظهر فقط عند وجود حالة توصيل

3. **خريطة حالات التوصيل بالعربي**:

| الحالة                | العرض                    | اللون     |
| --------------------- | ------------------------ | --------- |
| `pending_assignment`  | بانتظار الإسناد          | رمادي     |
| `assigned_to_company` | تم الإسناد لشركة التوصيل | أزرق      |
| `picked_up`           | تم الاستلام من التاجر    | نيلي      |
| `in_transit`          | في الطريق                | برتقالي   |
| `delivered`           | تم التوصيل               | أخضر      |
| `returned`            | مرجع                     | أحمر      |
| `failed`              | فشل التوصيل              | أحمر غامق |

---

### 7. قواعد المالية

**الملف**: [`JENNI_FINANCE_RULES.md`](./JENNI_FINANCE_RULES.md)

#### القاعدة الأساسية:

> **DELIVERED ≠ وصول المال.** الفصل واجب.

#### سلسلة الأحداث:

```
1. DELIVERED webhook → إنشاء accrual فقط (لا دفع للتاجر)
2. Payment API 35 → تأكيد وصول المال لـ DilMart (remitted_to_platform)
3. بعد التأكيد → التاجر يصبح payable
4. دفع فعلي → paid
```

#### ما لا يُبنى الآن:

- ❌ Settlement service كامل (ينتظر API 35)
- ❌ Automatic reconciliation
- ❌ Merchant payout automation
- ❌ Finance dashboard للتاجر

---

### 8. Phase 0 Spike Script

**الملف**: [`jenni-identity-spike.mjs`](../backend/scripts/jenni-identity-spike.mjs)

#### الحالة:

⚠️ **متوقف** — بيانات الاعتماد في `.env` ترجع `Bad credentials`. مطلوب من الفريق:

1. `JENNI_USERNAME` الصحيح
2. `JENNI_PASSWORD` الصحيح
3. `JENNI_SYSTEM_CODE`

---

## 📁 هيكل الملفات المُعدَّلة

```
DilMart-Store/
├── .gitignore                                ← [MODIFIED] blocked smoke_test*, *credentials*, *secret*
├── backend/
│   ├── scripts/
│   │   ├── jenni-identity-spike.mjs          ← [EXISTS] Phase 0 spike
│   │   └── smoke_test_api.mjs               ← [DELETED] تسريب credentials
│   └── src/modules/
│       ├── jenni/
│       │   ├── jenni-client.service.ts       ← [MODIFIED] refactored
│       │   ├── jenni-status-mapper.ts        ← [MODIFIED] fixed mappings
│       │   ├── jenni-sticker.service.ts      ← [NEW → FIXED] ownership via merchant_users
│       │   ├── jenni.module.ts               ← [MODIFIED] registered sticker
│       │   └── jenni.types.ts                ← [MODIFIED] expanded types
│       └── orders/
│           ├── orders.controller.ts          ← [MODIFIED] 3 endpoints, fixed params
│           └── orders.service.ts             ← [MODIFIED] cancel/modify + guards + audit
│   └── tests/
│       └── jenni-groundwork-guards.test.mjs  ← [NEW] 28 unit tests
├── src/pages/
│   ├── admin/Login.tsx                       ← [MODIFIED] removed old admin email
│   └── merchant/OrderDetail.tsx              ← [MODIFIED] sticker button + delivery status
└── docs/
    ├── JENNI_INTEGRATION_FINAL_CONTRACT.md
    ├── JENNI_REFACTOR_PLAN.md
    ├── JENNI_FINANCE_RULES.md                ← [NEW]
    ├── SECURITY_LEAK_CLOSURE_2026-06-15.md   ← [NEW] تقرير الإغلاق الأمني
    └── JENNI_GROUNDWORK_REPORT.md            ← [NEW → v3.0] هذا التقرير
```

---

## 📊 Git History (هذا السبرنت)

```
1ea1ee4 security: remove leaked credentials + fix ownership check + add cancel/modify guards
91a9f85 docs: add comprehensive Jenni groundwork report
6743b00 feat(jenni): safe groundwork — refactor client, expand types, fix status mapper, add sticker proxy, merchant UI, finance docs
24165a1 feat: add Phase 0 Jenni identity model spike script
1881462 docs: fix IN_SC mapping to in_transit, clarify DELIVERED as accrual-only
0f8bb6f docs: revise Jenni plan per supervisor architectural review
cb577b9 docs: add Jenni integration final contract and refactor plan
```

---

## ✅ Build & Test Verification (بعد جميع الإصلاحات)

```
Backend (npx tsc --noEmit):                    ✅ PASS — 0 errors
Frontend (npx tsc --noEmit):                   ✅ PASS — 0 errors
jenni-integration.test.mjs (existing):         ✅ 15/15 PASS
jenni-groundwork-guards.test.mjs (new):        ✅ 28/28 PASS
Total tests:                                   ✅ 43/43 PASS
```

### اختبارات جديدة (28 test):

| المجموعة             | عدد | ما يُغطي                                              |
| -------------------- | --- | ----------------------------------------------------- |
| Status Mapper        | 8   | NEW_WITH_PA→picked_up, IN_SC→in_transit, all mappings |
| Return Statuses      | 3   | RTO_WITH_DA, RTO_ARCHIVED, RETURN_APPROVED            |
| Event Metadata       | 3   | postponed reason, date_id, return reason              |
| Partial Delivery     | 1   | PARTIALLY_DELIVERED + admin review                    |
| New Statuses         | 2   | FORCE_DELIVERY, POSTPONED_CONFIRMED                   |
| Unknown Status       | 1   | graceful null handling                                |
| Cancel/Modify Guards | 9   | allowed/blocked per delivery_status                   |
| Credentials Check    | 1   | ServiceUnavailableException (503)                     |

---

## 📋 الخطوات التالية (بعد توفر Credentials)

```
1. ✅ تدوير كلمات مرور الحسابات المسربة — تم
2. 🔲 الحصول على JENNI_USERNAME + JENNI_PASSWORD + JENNI_SYSTEM_CODE الصحيحة
3. 🔲 تحديث backend/.env
4. 🔲 تشغيل: node backend/scripts/jenni-identity-spike.mjs
5. 🔲 مراجعة: docs/JENNI_PHASE0_RESULTS.md مع المشرف
6. 🔲 إذا الخيار A: migration بسيط (jenni_store_id في stores فقط)
7. 🔲 إذا الخيار B: migration مع merchant_id أيضاً
8. 🔲 بناء: jenni-store-provisioning.service.ts (lazy provisioning)
9. 🔲 ربط: dispatch payload مع store_id
10. 🔲 اختبار: API 35 (Payment Statement) → بناء settlement
11. 🔲 اختبار شامل: webhook → sticker → delivery → finance
```

---

## 🚫 ما تم منعه عمداً

| البند                          | السبب                                              |
| ------------------------------ | -------------------------------------------------- |
| DB Migrations                  | تحتاج نتيجة Phase 0                                |
| Store Provisioning حقيقي       | يعتمد على نموذج الهوية                             |
| Shipment Dispatch جديد         | يحتاج store provisioning                           |
| Settlement Service كامل        | ينتظر اختبار API 35                                |
| توسيع State Machine            | قرار معماري: لا توسيع                              |
| تغيير Lifecycle جذري           | ممنوع بدون مراجعة                                  |
| Cancel/Modify بعد pickup       | حماية مُفعّلة                                      |
| تسريب بيانات العميل في sticker | select يجلب فقط id,order_number,merchant_id,status |
| Finance change من modify COD   | يُسجّل audit فقط                                   |

---

## ⚠️ قرارات معمارية مثبتة (من المشرف)

| #   | القرار                   | النتيجة                                      |
| --- | ------------------------ | -------------------------------------------- |
| 1   | هل كل تاجر = Merchant?   | ❌ لا — نفضّل Stores فقط (Phase 0 يحسم)      |
| 2   | توسيع State Machine?     | ❌ لا — 9 حالات + `provider_current_step`    |
| 3   | DELIVERED = دفع؟         | ❌ لا — DELIVERED = accrual فقط              |
| 4   | تخزين الستكر PDF؟        | ❌ لا — Proxy أولاً                          |
| 5   | Settlement service كامل؟ | ❌ لا — حفظ بيانات خام فقط                   |
| 6   | التحاسب المالي مع من؟    | DilMart فقط — لا تحاسب مباشر بين Jenni وتاجر |
| 7   | Cancel/Modify COD متى؟   | **قبل pickup فقط** — بعد pickup ممنوع        |
| 8   | تعديل COD يغيّر المالية؟ | ❌ لا — يُسجّل audit فقط حالياً              |
