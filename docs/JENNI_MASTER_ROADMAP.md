# 🗺️ JENNI MASTER ROADMAP — خارطة طريق شاملة لربط التوصيل

> **Version**: 1.0  
> **Date**: 2026-06-15  
> **Status**: 📋 PLANNED — لا تنفيذ قبل إتمام Phase 0  
> **Supervisor Approved**: ✅ الهيكل معتمد

---

## نظرة عامة

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
Identity     Data        Store       Dispatch     Sticker
Validation   Model       Provision   Flow
   │
   ├── Decision Gate: A or B?
   │
Phase 5 ──→ Phase 6 ──→ Phase 7 ──→ Phase 8 ──→ Phase 9
Webhook      Cancel/     Finance     Admin        Production
Status       Modify      Settlement  Ops          Rollout
```

> [!IMPORTANT]
> **بوابة قرار إلزامية**: لا يبدأ Phase 1 أو أي مرحلة لاحقة قبل إتمام Phase 0 وموافقة المشرف على النموذج المعتمد.

---

## الوثائق المرجعية

| الوثيقة                                                                        | الغرض                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| [`JENNI_INTEGRATION_FINAL_CONTRACT.md`](./JENNI_INTEGRATION_FINAL_CONTRACT.md) | العقد المعماري — نموذج الأعمال والقواعد الثابتة |
| [`JENNI_REFACTOR_PLAN.md`](./JENNI_REFACTOR_PLAN.md)                           | خطة إعادة الهيكلة التقنية                       |
| [`JENNI_PHASE0_RUNBOOK.md`](./JENNI_PHASE0_RUNBOOK.md)                         | دليل تشغيل Phase 0                              |
| [`JENNI_PHASE0_RESULTS_TEMPLATE.md`](./JENNI_PHASE0_RESULTS_TEMPLATE.md)       | قالب تسجيل نتائج Phase 0                        |
| [`JENNI_FINANCE_RULES.md`](./JENNI_FINANCE_RULES.md)                           | قواعد التحاسب المالي                            |
| [`JENNI_GROUNDWORK_REPORT.md`](./JENNI_GROUNDWORK_REPORT.md)                   | تقرير الأرضية الآمنة (Pre-Phase 0)              |
| [`SECURITY_LEAK_CLOSURE_2026-06-15.md`](./SECURITY_LEAK_CLOSURE_2026-06-15.md) | إغلاق حادثة التسريب الأمني                      |

---

## القواعد الثابتة (في كل المراحل)

| #   | القاعدة                                                                        |
| --- | ------------------------------------------------------------------------------ |
| 1   | **DilMart = جهة التحاسب الوحيدة مع Jenni** — لا علاقة مالية بين Jenni وأي تاجر |
| 2   | **كل طلب = تاجر واحد فقط**                                                     |
| 3   | **لا shipment قبل موافقة التاجر**                                              |
| 4   | **DELIVERED ≠ وصول المال** — accrual فقط                                       |
| 5   | **Cancel/Modify = قبل pickup فقط**                                             |
| 6   | **لا credentials في Git** — `.env` المحلي فقط                                  |

---

## المساران المحتملان بعد Phase 0

### المسار A: Stores فقط (المفضّل)

```
DilMart = Main Merchant في Jenni
  └── Store per trader (نقطة استلام)
       → jenni_store_id في merchants table
       → لا merchant_id إضافي
```

- **Migration أبسط**: حقل واحد `jenni_store_id`
- **Provisioning أبسط**: `POST /v2/stores/create` فقط
- **Dispatch**: يرسل `store_id` في payload الشحنة

### المسار B: Merchant تشغيلي + Store (إذا فرضته API)

```
DilMart = Aggregator
  └── Merchant تشغيلي لكل تاجر (لا مالي)
       └── Store per branch/trader
            → jenni_merchant_id + jenni_store_id
```

- **Migration**: حقلان `jenni_merchant_id` + `jenni_store_id`
- **Provisioning**: `POST /v2/merchant-management/create` ثم `POST /v2/stores/create`
- **Dispatch**: نفس — يرسل `store_id`
- **⚠️ التحاسب المالي يبقى مع DilMart فقط**

---

# المراحل

---

## Phase 0 — Contract / Identity Validation

> ⏳ **الحالة**: بانتظار credentials من Jenni

### الهدف

حسم نموذج الهوية: هل كل تاجر = Store فقط (A) أو Merchant + Store (B)؟

### ما يدخل ضمنها

- تشغيل `jenni-identity-spike.mjs` بعد وضع credentials في `.env`
- اختبار T1-T4 (إنشاء store بدون/مع merchant_id، إنشاء merchant جديد)
- توثيق النتائج في `JENNI_PHASE0_RESULTS.md`
- مراجعة النتائج مع المشرف

### ما لا يدخل ضمنها

- ❌ أي migration
- ❌ أي dispatch حقيقي
- ❌ إنشاء شحنة حقيقية
- ❌ أي تغيير في الكود الحالي

### المخرجات

- `docs/JENNI_PHASE0_RESULTS.md` مع نتائج T1-T4
- قرار نهائي: المسار A أو B
- موافقة المشرف المكتوبة

### شروط الانتقال لـ Phase 1

- ✅ credentials صحيحة تعمل
- ✅ T1-T4 اكتملت
- ✅ قرار A أو B محسوم
- ✅ موافقة المشرف

---

## Phase 1 — Data Model & Migrations

> 🔒 **محظور قبل**: إتمام Phase 0 + موافقة المشرف

### الهدف

إضافة الحقول اللازمة لربط التاجر بنظام Jenni.

### ما يدخل ضمنها (حسب النموذج)

**إذا المسار A:**

- إضافة `jenni_store_id` في `merchants` table
- التأكد من وجود `provider_current_step` في `orders`
- التأكد من وجود حقول settlement الخام في `order_delivery_integrations`

**إذا المسار B:**

- إضافة `jenni_merchant_id` + `jenni_store_id` في `merchants` table
- نفس الحقول الأخرى

### ما لا يدخل ضمنها

- ❌ أي provisioning فعلي (لا إنشاء stores في Jenni)
- ❌ أي تغيير في state machine
- ❌ أي dispatch جديد

### المخرجات

- ملف migration في `supabase/migrations/`
- تحديث Types إذا لزم
- اختبار أن Migration يعمل بدون أخطاء

### شروط الانتقال لـ Phase 2

- ✅ Migration ناجح (محلياً + staging)
- ✅ لا regression في الوظائف الحالية
- ✅ Build يمر بدون أخطاء

---

## Phase 2 — Store Provisioning

> 🔒 **محظور قبل**: إتمام Phase 1

### الهدف

ربط كل تاجر DilMart كنقطة استلام (Store/Pickup Point) في Jenni.

### ما يدخل ضمنها

**إذا المسار A:**

- `JenniStoreProvisioningService` — يُنشئ Store في Jenni عند أول dispatch
- Lazy provisioning: التاجر يُسجّل في Jenni عند أول طلب يحتاج توصيل
- حفظ `jenni_store_id` في `merchants` table
- Admin sync: شاشة أدمن لعرض حالة الربط

**إذا المسار B:**

- نفس الخطوات + إنشاء Merchant تشغيلي أولاً
- حفظ `jenni_merchant_id` ثم `jenni_store_id`

### ما لا يدخل ضمنها

- ❌ إنشاء شحنات
- ❌ تغيير أي شيء في flow الطلب الحالي
- ❌ bulk provisioning (نستخدم lazy فقط)

### المخرجات

- `jenni-store-provisioning.service.ts`
- واجهة أدمن: قائمة التجار المربوطين/غير المربوطين
- اختبارات provisioning

### شروط الانتقال لـ Phase 3

- ✅ provisioning يعمل مع تاجر اختباري واحد
- ✅ `jenni_store_id` يُحفظ بنجاح
- ✅ لا أخطاء في الوظائف الحالية

---

## Phase 3 — Merchant Approval → Dispatch

> 🔒 **محظور قبل**: إتمام Phase 2

### الهدف

عند موافقة التاجر على الطلب، إنشاء شحنة في Jenni مع `store_id` الصحيح.

### ما يدخل ضمنها

- **Pre-dispatch validation:**
  - التاجر موافق على الطلب
  - `jenni_store_id` موجود (أو lazy provision)
  - بيانات العميل كاملة (اسم، هاتف، محافظة، عنوان)
  - Governorate mapping صحيح
  - المبلغ COD صحيح
- **Create shipment:**
  - `POST /v2/shipments/create`
  - إرسال `store_id` لتوجيه المندوب
  - حفظ `provider_shipment_id` + `external_shipment_number`
  - تحديث `dispatch_status = dispatched`
- **Error handling:**
  - Jenni API timeout/error → `dispatch_status = failed`
  - Jenni accepts but local DB fails → `dispatch_status = local_update_failed`

### ما لا يدخل ضمنها

- ❌ Dispatch تلقائي بدون موافقة التاجر
- ❌ Dispatch لطلبات متعددة التجار
- ❌ Batch dispatch

### المخرجات

- تعديل `jenni-dispatch.service.ts` ليرسل `store_id`
- تحديث order lifecycle: `approved_by_merchant → dispatched`
- اختبارات dispatch

### شروط الانتقال لـ Phase 4

- ✅ dispatch ينجح مع شحنة اختبارية واحدة
- ✅ `provider_shipment_id` يُحفظ
- ✅ `external_shipment_number` يُحفظ

---

## Phase 4 — Sticker / Barcode

> 🔒 **محظور قبل**: إتمام Phase 3

### الهدف

التاجر يطبع ستكر الشحنة ويلصقه على الطلب قبل استلام المندوب.

### ما يدخل ضمنها

- ✅ **موجود**: `JenniStickerService` — proxy PDF من Jenni (مبني في Groundwork)
- ✅ **موجود**: زر طباعة في واجهة التاجر (مبني في Groundwork)
- ✅ **موجود**: ownership check عبر `merchant_users` (مُصلَح)
- **جديد**: اختبار حقيقي مع شحنة اختبارية
- **جديد**: معالجة حالات الخطأ في الـ UI (شحنة بدون ستكر، Jenni غير متاحة)

### ما لا يدخل ضمنها

- ❌ تخزين PDF في Supabase Storage (Phase لاحقة إذا لزم)
- ❌ عرض بيانات العميل في واجهة التاجر — فقط PDF الرسمي من Jenni

### المخرجات

- اختبار حقيقي لطباعة ستكر
- تأكيد أن PDF يعمل في المتصفح والطابعة

### شروط الانتقال لـ Phase 5

- ✅ ستكر يُطبع بنجاح لشحنة اختبارية
- ✅ Ownership check يمنع تاجر من طباعة ستكر تاجر آخر

---

## Phase 5 — Webhook & Status Sync

> 🔒 **محظور قبل**: إتمام Phase 3

### الهدف

استقبال تحديثات حالة الشحنة من Jenni وتحديث حالة الطلب تلقائياً.

### ما يدخل ضمنها

- ✅ **موجود**: `JenniStatusMapper` — خريطة الحالات (مبنية ومُصلحة في Groundwork)
- ✅ **موجود**: Webhook endpoint (مبني سابقاً)
- **تعزيز**: ربط مع flow حقيقي

**خريطة الحالات المعتمدة:**

| حالة Jenni                      | حالة DilMart                | ملاحظة                   |
| ------------------------------- | --------------------------- | ------------------------ |
| `NEW_ORDER_TO_PRINT/PICKUP`     | `assigned_to_company`       | تم إسناد الشحنة          |
| `NEW_WITH_PA`                   | `picked_up`                 | أول scan — المندوب استلم |
| `IN_SC`                         | `in_transit`                | مركز الفرز               |
| `OFD / PRINT_MANIFEST_DA`       | `in_transit`                | في الطريق                |
| `DELIVERED`                     | `delivered`                 | تم التسليم → accrual     |
| `DELIVERED_PRICE_CHANGED`       | `delivered` + admin review  | تغيير مبلغ               |
| `POSTPONED/POSTPONED_CONFIRMED` | `in_transit` + metadata     | مؤجّل                    |
| `RTO_*/RETURN_*`                | `returned`                  | مرجع                     |
| `PARTIALLY_DELIVERED`           | `in_transit` + admin review | تسليم جزئي               |

- **Event metadata**: حفظ `postponed_reason`, `return_reason` في `delivery_events`
- **`provider_current_step`**: يُحفظ كما هو من Jenni (بدون توسيع state machine)

### ما لا يدخل ضمنها

- ❌ توسيع state machine (9 حالات كافية)
- ❌ أي finance logic عند DELIVERED (فقط accrual)
- ❌ Automatic retry لـ webhooks فاشلة

### المخرجات

- webhook يعمل مع شحنة اختبارية
- حالات الطلب تتحدث تلقائياً
- اختبارات حقيقية

### شروط الانتقال لـ Phase 6

- ✅ webhook يستقبل ويعالج كل الحالات المتوقعة
- ✅ لا حالة غير معروفة تمر بدون logging

---

## Phase 6 — Cancel / Modify Before Pickup

> يمكن العمل عليها بالتوازي مع Phase 5

### الهدف

السماح بإلغاء الشحنة أو تعديل مبلغ COD **فقط قبل الاستلام الفعلي**.

### ما يدخل ضمنها

- ✅ **موجود**: `assertShipmentModifiable()` — يمنع بعد `assigned_to_company` (مبني في Groundwork)
- ✅ **موجود**: Cancel endpoint — Admin only (مبني)
- ✅ **موجود**: Modify COD endpoint — Admin only (مبني)
- ✅ **موجود**: Audit events في `delivery_events` (مبني)
- **جديد**: اختبار حقيقي مع Jenni API
- **تقييم**: هل نحتاج واجهة للتاجر لطلب إلغاء؟ (قرار مؤجل)

### ما لا يدخل ضمنها

- ❌ Cancel بعد pickup — يحتاج return/dispute flow
- ❌ تعديل finance مباشر من modify COD — يُسجّل audit فقط
- ❌ واجهة تاجر لإدارة الإلغاء (Phase لاحقة)

### المخرجات

- اختبار cancel + modify حقيقي
- تأكيد أن Jenni API تقبل الإلغاء

### شروط الانتقال لـ Phase 7

- ✅ Cancel يعمل قبل pickup
- ✅ Cancel مرفوض بعد pickup
- ✅ Modify COD يعمل قبل pickup

---

## Phase 7 — Finance & Settlement

> 🔒 **محظور قبل**: إتمام Phase 5 (webhooks working)

### الهدف

ربط دورة التسوية المالية: من DELIVERED حتى دفع التاجر.

### ما يدخل ضمنها

**المراحل الفرعية:**

```
7a. DELIVERED → accrual
    - webhook DELIVERED → إنشاء سجل accrual
    - لا دفع للتاجر في هذه المرحلة

7b. Payment Statement (API 35) → remitted_to_platform
    - استعلام دوري أو يدوي من Jenni
    - تأكيد أن المال وصل لحساب DilMart
    - حفظ بيانات Settlement الخام

7c. Merchant payable
    - حساب مبلغ التاجر:
      cod_collected - delivery_cost - DilMart_commission
    - وضع التاجر في حالة payable

7d. Merchant payout
    - المرحلة الأولى: يدوي (الأدمن يؤكد التحويل)
    - المرحلة الثانية (لاحقاً): أتمتة عبر payment gateway
```

**الحالات الخاصة:**

- `DELIVERED_PRICE_CHANGED` → admin review قبل accrual
- `PARTIALLY_DELIVERED` → لا accrual حتى حسم
- `RETURNED بعد DELIVERED` → إلغاء accrual

### ما لا يدخل ضمنها

- ❌ أتمتة كاملة للدفعات (المرحلة الأولى يدوية)
- ❌ Dashboard مالي للتاجر (Phase 8)
- ❌ Automatic reconciliation (المرحلة الأولى يدوية)

### المخرجات

- `jenni-settlement.service.ts`
- شاشة أدمن للتسويات
- تقرير مالي أساسي

### شروط الانتقال لـ Phase 8

- ✅ accrual يُنشأ عند DELIVERED
- ✅ API 35 يُرجع بيانات صحيحة
- ✅ حساب مبلغ التاجر صحيح
- ✅ Payout يدوي يعمل

---

## Phase 8 — Admin Ops & Reconciliation

> 🔒 **محظور قبل**: إتمام Phase 7a على الأقل

### الهدف

أدوات الأدمن لمراقبة وإدارة عمليات التوصيل والتسويات.

### ما يدخل ضمنها

- **شاشة تتبع الشحنات**: حالة كل شحنة، آخر تحديث، provider_current_step
- **أخطاء dispatch**: قائمة الطلبات التي فشل dispatch لها
- **أخطاء webhook**: webhooks غير معالجة أو فاشلة
- **فروقات COD**: طلبات مع `DELIVERED_PRICE_CHANGED`
- **تسويات Jenni**: مطابقة بين accrual وما وصل فعلاً
- **دفعات التجار**: قائمة payable/paid لكل تاجر
- **Dashboard مالي للتاجر** (Phase فرعية): عرض حالة المستحقات

### ما لا يدخل ضمنها

- ❌ أتمتة reconciliation كاملة (تبقى semi-manual)
- ❌ تقارير متقدمة (BI/Analytics)
- ❌ Merchant self-service للنزاعات

### المخرجات

- واجهات أدمن متكاملة
- تقارير أساسية
- تنبيهات للمشاكل

### شروط الانتقال لـ Phase 9

- ✅ الأدمن يستطيع تتبع أي شحنة
- ✅ الأدمن يستطيع معالجة أخطاء dispatch/webhook
- ✅ الأدمن يستطيع مراجعة التسويات

---

## Phase 9 — QA / Staging / Production Rollout

> 🔒 **محظور قبل**: إتمام Phases 3-7 على الأقل

### الهدف

اختبار شامل ونشر تدريجي.

### ما يدخل ضمنها

**9a. اختبارات Unit/Integration:**

- ✅ **موجود**: 43 اختبار (15 قديمة + 28 جديدة)
- جديد: اختبارات dispatch, provisioning, settlement
- جديد: اختبارات end-to-end

**9b. اختبار حقيقي بشحنة test:**

- إنشاء شحنة اختبارية حقيقية في Jenni
- تتبع المسار الكامل: dispatch → sticker → pickup → delivery
- تأكيد webhook يعمل
- تأكيد sticker يُطبع

**9c. Pilot مع 1-3 تجار:**

- اختيار تجار محدودين
- تفعيل الربط لهم فقط (feature flag)
- مراقبة يومية لمدة أسبوع

**9d. Production rollout تدريجي:**

- 10% → 30% → 50% → 100%
- مراقبة metrics: dispatch success rate, webhook processing, settlement accuracy
- rollback plan واضح

### ما لا يدخل ضمنها

- ❌ تفعيل لكل التجار دفعة واحدة
- ❌ إزالة flow التوصيل القديم فوراً

### المخرجات

- تقارير اختبار
- Pilot results
- Production deployment

### شروط النجاح النهائية

- ✅ dispatch success rate > 95%
- ✅ webhook processing rate > 99%
- ✅ لا تسريب بيانات عملاء
- ✅ settlement accuracy 100%
- ✅ لا شكاوى من التجار في Pilot

---

## الجدول الزمني التقديري

> [!WARNING]
> هذا تقدير أولي — يتغير بناءً على نتائج Phase 0 وتعقيد API Jenni.

| المرحلة     | المدة التقديرية | يعتمد على               |
| ----------- | --------------- | ----------------------- |
| Phase 0     | 1 يوم           | وصول credentials        |
| Phase 1     | 1-2 يوم         | نتائج Phase 0           |
| Phase 2     | 2-3 أيام        | Phase 1                 |
| Phase 3     | 3-4 أيام        | Phase 2                 |
| Phase 4     | 1 يوم           | Phase 3                 |
| Phase 5     | 2-3 أيام        | Phase 3                 |
| Phase 6     | 1 يوم           | Phase 3 (بالتوازي مع 5) |
| Phase 7     | 3-5 أيام        | Phase 5                 |
| Phase 8     | 3-5 أيام        | Phase 7a                |
| Phase 9     | 5-10 أيام       | Phases 3-7              |
| **المجموع** | **~22-34 يوم**  |                         |

---

## ⚠️ مخاطر معروفة

| #   | المخاطر                                     | الاحتمال | الأثر              | التخفيف                                     |
| --- | ------------------------------------------- | -------- | ------------------ | ------------------------------------------- |
| 1   | Jenni API لا تدعم Stores-only               | متوسط    | يضاعف Provisioning | Phase 0 يحسم مبكراً                         |
| 2   | API 35 (Payment Statement) مختلف عن المتوقع | متوسط    | يؤخر Settlement    | نبني settlement service بعد اختبار API فعلي |
| 3   | Webhook unreliable                          | منخفض    | فقدان تحديثات      | fallback: query sync كل ساعة                |
| 4   | Governorate mapping خاطئ                    | منخفض    | dispatch يفشل      | جدول mapping يدوي + validation              |
| 5   | COD مبالغ كبيرة                             | منخفض    | مخاطر مالية        | حدود + admin review                         |

---

## 📋 حالة Groundwork الحالية (Pre-Phase 0)

ما تم بناؤه بشكل آمن (لا يعتمد على credentials):

| البند                             | الحالة | يُفعَّل في |
| --------------------------------- | ------ | ---------- |
| `JenniClientService` refactored   | ✅     | كل المراحل |
| `jenni.types.ts` expanded         | ✅     | كل المراحل |
| `JenniStatusMapper` corrected     | ✅     | Phase 5    |
| `JenniStickerService` + ownership | ✅     | Phase 4    |
| Cancel/Modify guards              | ✅     | Phase 6    |
| Audit events                      | ✅     | Phase 6-7  |
| Merchant UI — sticker button      | ✅     | Phase 4    |
| Finance rules documented          | ✅     | Phase 7    |
| Phase 0 spike script              | ✅     | Phase 0    |
| 43 unit tests passing             | ✅     | Phase 9    |
