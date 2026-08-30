# 📐 JENNI PHASE 1 — Data Model & Migration Plan

> **Date**: 2026-06-16  
> **Updated**: 2026-06-16 10:07 (قرارات المشرف النهائية)  
> **المسار المعتمد**: Path A — Stores-only (PROVISIONALLY_CONFIRMED)  
> **الحالة**: 📋 **PLAN ONLY — SUPERVISOR APPROVED SCHEMA** — لا تنفيذ بدون أمر صريح

> [!CAUTION]
> هذا المستند **خطة فقط**. ممنوع تنفيذ أي migration أو تعديل كود أو provisioning قبل موافقة صريحة.

---

## 0. فحص قاعدة البيانات الفعلية (Live DB Verification)

> تم الفحص في `2026-06-16 09:45` عبر `supabase db query --linked`

### التجار الموجودون في Production

| id             | slug              | display_name  | status |
| -------------- | ----------------- | ------------- | ------ |
| `a3e3b17d-...` | `DilMart-primary` | DilMart Store | active |
| `65575f7c-...` | `alarsh`          | شركة العرش    | active |

> [!WARNING]
> **اكتشاف مهم**: يوجد **تاجران** في Production وليس واحد فقط.
> التاجر الثاني `alarsh` ("شركة العرش") لا يملك `jenni_store_id` بعد.
> قرار المشرف مطلوب: هل نربط `store_id=17025` بـ `DilMart-primary` فقط أم نحتاج store_id ثاني لـ `alarsh`؟

### حالة الأعمدة المفقودة (مؤكد من Production)

| العمود                     | الجدول                      | الحالة في DB                       |
| -------------------------- | --------------------------- | ---------------------------------- |
| `jenni_store_id`           | merchants                   | ❌ **غير موجود**                   |
| `jenni_synced_at`          | merchants                   | ❌ **غير موجود**                   |
| `jenni_sync_error`         | merchants                   | ❌ **غير موجود**                   |
| `jenni_store_id`           | order_delivery_integrations | ❌ **غير موجود**                   |
| `jenni_settlement_id`      | order_delivery_integrations | ❌ **غير موجود**                   |
| `delivery_cost_actual`     | order_delivery_integrations | ❌ **غير موجود**                   |
| `cod_collected`            | order_delivery_integrations | ❌ **غير موجود**                   |
| `provider_current_step`    | order_delivery_integrations | ✅ **موجود**                       |
| `provider_current_step_ar` | order_delivery_integrations | ✅ **موجود**                       |
| `jenni_governorate_code`   | governorates                | ✅ **موجود** (19/19 محافظة مربوطة) |

### حالة البيانات

| البند                                               | القيمة                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| عدد الشحنات الحالية (`order_delivery_integrations`) | **0** — لا شحنات سابقة                                                |
| عدد المحافظات مع `jenni_governorate_code`           | **19/19** — كاملة                                                     |
| `order_delivery_integrations` constraints           | 5 (PK, 2 FK, dispatch_status CHECK, provider_code+shipment_id UNIQUE) |

## 1. مراجعة الجداول الحالية

### 1.1 `merchants` (جدول التجار)

**الملف**: [`20260421100000_marketplace_foundation.sql`](file:///e:/Project/DilMart-Store/supabase/migrations/20260421100000_marketplace_foundation.sql)

| العمود                          | النوع            | ملاحظة                                                  |
| ------------------------------- | ---------------- | ------------------------------------------------------- |
| id                              | UUID PK          | ✅ موجود                                                |
| slug                            | TEXT UNIQUE      | ✅ موجود                                                |
| name_ar, name_en, display_name  | TEXT             | ✅ موجود                                                |
| status                          | TEXT CHECK       | draft/pending_review/active/suspended/archived/rejected |
| merchant_id (onboarding fields) | —                | submitted_at, approved_at, etc.                         |
| **jenni_store_id**              | ❌ **غير موجود** | مطلوب إضافته                                            |
| **jenni_synced_at**             | ❌ **غير موجود** | مطلوب إضافته                                            |
| **jenni_sync_error**            | ❌ **غير موجود** | مطلوب إضافته                                            |

### 1.2 `order_delivery_integrations` (ربط الطلب بالشحنة)

**الملف**: [`20260513100000_jenni_delivery_integration.sql`](file:///e:/Project/DilMart-Store/supabase/migrations/20260513100000_jenni_delivery_integration.sql)

| العمود                   | النوع                | ملاحظة                                                                    |
| ------------------------ | -------------------- | ------------------------------------------------------------------------- |
| id                       | UUID PK              | ✅ موجود                                                                  |
| order_id                 | UUID FK → orders     | ✅ موجود                                                                  |
| provider_code            | TEXT DEFAULT 'jenni' | ✅ موجود                                                                  |
| external_shipment_id     | TEXT NOT NULL        | ✅ موجود                                                                  |
| external_shipment_number | TEXT NOT NULL        | ✅ موجود                                                                  |
| provider_current_step    | TEXT                 | ✅ موجود                                                                  |
| provider_current_step_ar | TEXT                 | ✅ موجود                                                                  |
| provider_current_stage   | TEXT                 | ✅ موجود                                                                  |
| dispatch_status          | TEXT CHECK           | ✅ موجود (pending/dispatched/failed/synced/cancelled/local_update_failed) |
| amount_change_flag       | BOOLEAN              | ✅ موجود                                                                  |
| **jenni_store_id**       | ❌ **غير موجود**     | مطلوب إضافته                                                              |
| **jenni_settlement_id**  | ❌ **غير موجود**     | مطلوب إضافته                                                              |
| **delivery_cost_actual** | ❌ **غير موجود**     | مطلوب إضافته                                                              |
| **cod_collected**        | ❌ **غير موجود**     | مطلوب إضافته                                                              |

> [!NOTE]
> هذه الحقول الأربعة موجودة بالفعل في TypeScript types ([`jenni.types.ts:157-163`](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni.types.ts#L156-L163)) كـ optional fields، لكن لم تُضف إلى DB schema بعد.

### 1.3 `delivery_events` (سجل أحداث التوصيل)

**الملف**: [`20260426001000_m19_delivery_operations_lifecycle.sql`](file:///e:/Project/DilMart-Store/supabase/migrations/20260426001000_m19_delivery_operations_lifecycle.sql)  
**+ Patch**: [`20260517100000_jenni_production_patch.sql`](file:///e:/Project/DilMart-Store/supabase/migrations/20260517100000_jenni_production_patch.sql)

| العمود     | النوع            | ملاحظة                                                                         |
| ---------- | ---------------- | ------------------------------------------------------------------------------ |
| order_id   | UUID FK → orders | ✅ موجود                                                                       |
| event_type | TEXT CHECK       | ✅ موجود — يشمل provider_dispatched, provider_synced, provider_postponed, etc. |
| actor_type | TEXT CHECK       | ✅ موجود — يشمل external_provider                                              |
| metadata   | JSONB            | ✅ موجود                                                                       |

**لا يحتاج تعديل في Phase 1** — الأحداث كافية.

### 1.4 `delivery_provider_sync_events` (سجل webhooks)

**الملف**: نفس migration الـ Jenni integration

| العمود        | النوع                | ملاحظة                 |
| ------------- | -------------------- | ---------------------- |
| provider_code | TEXT DEFAULT 'jenni' | ✅ موجود               |
| payload_hash  | TEXT UNIQUE          | ✅ موجود (idempotency) |

**لا يحتاج تعديل في Phase 1.**

### 1.5 `governorates` (المحافظات)

**الملف**: [`20260214214500_baseline_public_schema.sql`](file:///e:/Project/DilMart-Store/supabase/migrations/20260214214500_baseline_public_schema.sql)  
**+ Jenni patch**: [`20260513100000_jenni_delivery_integration.sql`](file:///e:/Project/DilMart-Store/supabase/migrations/20260513100000_jenni_delivery_integration.sql#L22-L23)

| العمود                 | النوع       | ملاحظة                                          |
| ---------------------- | ----------- | ----------------------------------------------- |
| name                   | TEXT UNIQUE | ✅ موجود                                        |
| delivery_price         | NUMERIC     | ✅ موجود                                        |
| jenni_governorate_code | TEXT        | ✅ موجود (added in Jenni integration migration) |

**لا يحتاج تعديل في Phase 1** — Governorate codes مربوطة بالفعل.

### 1.6 `orders` (الطلبات)

| العمود المتعلق بالتوصيل                              | ملاحظة                      |
| ---------------------------------------------------- | --------------------------- |
| delivery_status                                      | ✅ موجود (CHECK constraint) |
| delivery_company_id                                  | ✅ موجود                    |
| delivery_assigned_at                                 | ✅ موجود                    |
| delivered_at, returned_at                            | ✅ موجود                    |
| payment_status, collection_status, settlement_status | ✅ موجود                    |
| cash_collected_by_type, cash_received_amount         | ✅ موجود                    |

**لا يحتاج تعديل في Phase 1** — حقول الطلب كافية.

---

## 2. ملخص الحقول: موجود vs مطلوب

| الحقل المطلوب                                          | الجدول                      | الحالة   |
| ------------------------------------------------------ | --------------------------- | -------- |
| `merchants.jenni_store_id`                             | merchants                   | ❌ مطلوب |
| `merchants.jenni_synced_at`                            | merchants                   | ❌ مطلوب |
| `merchants.jenni_sync_error`                           | merchants                   | ❌ مطلوب |
| `order_delivery_integrations.jenni_store_id`           | order_delivery_integrations | ❌ مطلوب |
| `order_delivery_integrations.jenni_settlement_id`      | order_delivery_integrations | ❌ مطلوب |
| `order_delivery_integrations.delivery_cost_actual`     | order_delivery_integrations | ❌ مطلوب |
| `order_delivery_integrations.cod_collected`            | order_delivery_integrations | ❌ مطلوب |
| `order_delivery_integrations.provider_current_step`    | order_delivery_integrations | ✅ موجود |
| `order_delivery_integrations.provider_current_step_ar` | order_delivery_integrations | ✅ موجود |

---

## 3. اقتراح Migration واحد — المسار A

### اسم الملف المقترح

```
supabase/migrations/2026MMDD100000_p3_jenni_stores_only_path_a.sql
```

### محتوى Migration المقترح

```sql
-- Phase 1: Jenni Stores-only (Path A) — Data Model Extension
-- المسار A: كل تاجر DilMart = Jenni Store / Pickup Point
-- لا jenni_merchant_id — الحساب واحد (DilMart Merchant Account)

-- ═══════════════════════════════════════════════════════════════════════
-- 1) merchants: ربط التاجر بـ Jenni Store
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS jenni_store_id INTEGER,
  ADD COLUMN IF NOT EXISTS jenni_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS jenni_sync_error TEXT;

COMMENT ON COLUMN public.merchants.jenni_store_id
  IS 'Jenni delivery store ID. Each DilMart merchant maps to one Jenni store/pickup point.';
COMMENT ON COLUMN public.merchants.jenni_synced_at
  IS 'Last successful sync with Jenni API for this merchant store.';
COMMENT ON COLUMN public.merchants.jenni_sync_error
  IS 'Last sync error message, cleared on success.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2) order_delivery_integrations: حقول التسوية والتكلفة الفعلية
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.order_delivery_integrations
  ADD COLUMN IF NOT EXISTS jenni_store_id INTEGER,
  ADD COLUMN IF NOT EXISTS jenni_settlement_id INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost_actual NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cod_collected NUMERIC(12,2);

COMMENT ON COLUMN public.order_delivery_integrations.jenni_store_id
  IS 'Jenni store_id used when this shipment was dispatched. Denormalized from merchant for audit.';
COMMENT ON COLUMN public.order_delivery_integrations.jenni_settlement_id
  IS 'Jenni settlement batch ID. 0 = not yet settled.';
COMMENT ON COLUMN public.order_delivery_integrations.delivery_cost_actual
  IS 'Actual delivery cost reported by Jenni (may differ from quoted price).';
COMMENT ON COLUMN public.order_delivery_integrations.cod_collected
  IS 'Cash-on-delivery amount actually collected by Jenni courier.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3) Indexes
-- ═══════════════════════════════════════════════════════════════════════

-- Partial unique: each merchant maps to at most one Jenni store
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_jenni_store_id
  ON public.merchants (jenni_store_id)
  WHERE jenni_store_id IS NOT NULL;

-- Lookup by Jenni store_id on integrations
CREATE INDEX IF NOT EXISTS idx_odi_jenni_store_id
  ON public.order_delivery_integrations (jenni_store_id)
  WHERE jenni_store_id IS NOT NULL;

-- Settlement reconciliation
CREATE INDEX IF NOT EXISTS idx_odi_jenni_settlement_id
  ON public.order_delivery_integrations (jenni_settlement_id)
  WHERE jenni_settlement_id > 0;
```

### ما لا يدخل في هذا Migration

| بند                                        | السبب                                        |
| ------------------------------------------ | -------------------------------------------- |
| ❌ `jenni_merchant_id`                     | المسار A: حساب DilMart واحد، لا حاجة         |
| ❌ توسيع `delivery_status` CHECK           | الحالات الحالية كافية                        |
| ❌ تغيير state machine                     | لا تعديل على flow الطلب                      |
| ❌ جداول تسوية جديدة                       | التسوية الحالية في `orders` كافية لـ Phase 1 |
| ❌ NOT NULL constraints على الحقول الجديدة | تُضاف لاحقاً بعد backfill                    |
| ❌ تعديل `place_order()` function          | لا حاجة — dispatch يمر عبر backend service   |
| ❌ **أي backfill أو UPDATE**               | المشرف قرر: schema-only migration، لا بيانات |
| ❌ `provider_current_step`                 | موجود أصلاً — لا يُضاف مجدداً                |

---

## 4. استراتيجية Backfill

> [!IMPORTANT]
> **قرار المشرف النهائي**: Migration يكون **schema-only فقط**.
> لا backfill داخل Migration. لا UPDATE statements. لا ربط تلقائي لأي merchant.

### السبب

- يوجد **تاجران** في Production (`DilMart-primary` + `alarsh`)
- لا يوجد merchant_id محلي مؤكد 100% لربطه مع `store_id=17025`
- وجود **0 شحنات** يقلل مخاطر Migration لكنه **لا يبرر backfill تلقائي**
- أي ربط يتم **يدوياً وبموافقة صريحة** بعد Migration

### حالة كل تاجر بعد Migration

| التاجر                            | `jenni_store_id` | السبب                                                                    |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------ |
| `DilMart-primary` (DilMart Store) | `NULL`           | يُربط يدوياً لاحقاً بموافقة المشرف                                       |
| `alarsh` (شركة العرش)             | `NULL`           | يحتاج Jenni Store مستقل — يُنشأ في Phase 2 أو يبقى NULL حتى أول dispatch |

---

## 4.1 Optional Manual Mapping (Post-Migration)

> هذا القسم **لا يُنفَّذ ضمن Migration**. يُنفَّذ يدوياً بعد Migration بموافقة المشرف.

### ربط `DilMart-primary` بـ `store_id=17025`

بعد تطبيق Migration بنجاح، يمكن ربط التاجر الافتراضي يدوياً:

```sql
-- ⚠️ MANUAL POST-MIGRATION STEP — يُنفَّذ فقط بموافقة صريحة من المشرف
-- يتطلب معرفة merchant_id المحلي الصحيح
UPDATE public.merchants
SET jenni_store_id = 17025,
    jenni_synced_at = now()
WHERE slug = 'DilMart-primary'
  AND jenni_store_id IS NULL;
```

### ربط `alarsh` بـ Jenni Store

- يحتاج **إنشاء Store جديد** في Jenni أولاً (Phase 2)
- أو يبقى `NULL` حتى أول dispatch يتطلب منه `store_id`
- **لا يُربط الآن** — يُقرَّر لاحقاً

> [!NOTE]
> وجود **0 شحنات** حالياً في `order_delivery_integrations` يعني:
>
> - Migration آمن تماماً — لا بيانات ستتأثر
> - لكن هذا **لا يبرر** backfill تلقائي لأن القرار تجاري وليس تقني

---

## 5. Constraints & Indexes

| الفهرس/القيد                             | النوع          | التفصيل                                                         |
| ---------------------------------------- | -------------- | --------------------------------------------------------------- |
| `idx_merchants_jenni_store_id`           | UNIQUE PARTIAL | `WHERE jenni_store_id IS NOT NULL` — كل store_id لتاجر واحد فقط |
| `idx_odi_jenni_store_id`                 | INDEX PARTIAL  | `WHERE jenni_store_id IS NOT NULL` — بحث سريع حسب Store         |
| `idx_odi_jenni_settlement_id`            | INDEX PARTIAL  | `WHERE jenni_settlement_id > 0` — مطابقة التسوية                |
| **لا NOT NULL** على jenni_store_id       | عمداً          | التجار بدون ربط Jenni يبقون NULL                                |
| **لا NOT NULL** على delivery_cost_actual | عمداً          | تُملأ فقط عند وصول بيانات التوصيل الفعلية                       |
| **لا NOT NULL** على cod_collected        | عمداً          | تُملأ فقط عند التحصيل الفعلي                                    |
| `jenni_settlement_id DEFAULT 0`          | NOT NULL       | صفر = لم يُسوَّ بعد                                             |

---

## 6. Rollback Plan

### خطة التراجع في حال فشل Migration

```sql
-- ROLLBACK: Phase 1 Jenni Stores-only Path A
-- تنفَّذ فقط إذا فشل Migration أو ظهرت مشاكل بعد التطبيق

-- 1) حذف indexes أولاً
DROP INDEX IF EXISTS public.idx_odi_jenni_settlement_id;
DROP INDEX IF EXISTS public.idx_odi_jenni_store_id;
DROP INDEX IF EXISTS public.idx_merchants_jenni_store_id;

-- 2) حذف الأعمدة من order_delivery_integrations
ALTER TABLE public.order_delivery_integrations
  DROP COLUMN IF EXISTS cod_collected,
  DROP COLUMN IF EXISTS delivery_cost_actual,
  DROP COLUMN IF EXISTS jenni_settlement_id,
  DROP COLUMN IF EXISTS jenni_store_id;

-- 3) حذف الأعمدة من merchants
ALTER TABLE public.merchants
  DROP COLUMN IF EXISTS jenni_sync_error,
  DROP COLUMN IF EXISTS jenni_synced_at,
  DROP COLUMN IF EXISTS jenni_store_id;
```

### ملاحظات الأمان

- Rollback **لا يفقد بيانات** حالية — الأعمدة الجديدة فارغة أصلاً
- Rollback **لا يؤثر** على الشحنات الحالية أو الطلبات الحالية
- يمكن تنفيذه بأمان في أي وقت قبل بدء Phase 2

---

## 7. الاختبارات المطلوبة بعد Migration

### 7.1 اختبارات السلامة (Smoke Tests)

| الاختبار                 | الوصف                                                               |
| ------------------------ | ------------------------------------------------------------------- |
| **Schema check**         | التأكد من وجود الأعمدة السبعة الجديدة                               |
| **Default values**       | التأكد من أن `jenni_settlement_id` = 0 افتراضياً                    |
| **NULL allowed**         | التأكد من أن كل `jenni_store_id` = NULL بعد Migration (لا backfill) |
| **Unique partial index** | محاولة إدراج store_id مكرر → يجب أن يفشل                            |
| **No data mutation**     | التأكد من أن جدول `merchants` لم يتغير فيه أي صف (عدا schema)       |

### 7.2 اختبارات عدم التراجع (Regression)

| الاختبار                       | الوصف                                  |
| ------------------------------ | -------------------------------------- |
| **الاختبارات الحالية (43/43)** | يجب أن تمر بدون تغيير                  |
| **place_order()**              | يجب أن يعمل كالسابق (لا تعديل عليه)    |
| **Webhook handler**            | يجب أن يستمر بمعالجة webhooks بدون خطأ |
| **delivery_events**            | لا constraints جديدة تمنع إنشاء events |

### 7.3 اختبارات جديدة (مقترحة)

| الاختبار                               | الوصف                                                         |
| -------------------------------------- | ------------------------------------------------------------- |
| **test_merchants_jenni_columns_exist** | التحقق من وجود الأعمدة الثلاثة في merchants                   |
| **test_odi_jenni_columns_exist**       | التحقق من وجود الأعمدة الأربعة في order_delivery_integrations |
| **test_jenni_store_id_unique_partial** | التحقق من أن UNIQUE PARTIAL يعمل                              |
| **test_no_backfill_happened**          | التأكد من أن كل `jenni_store_id` = NULL بعد Migration         |

---

## 8. قرارات المشرف النهائية ✅

| #   | القرار                                                     | الحكم                                    |
| --- | ---------------------------------------------------------- | ---------------------------------------- |
| 1   | Migration يكون schema-only فقط                             | ✅ **مؤكد**                              |
| 2   | لا backfill داخل migration                                 | ✅ **مؤكد** — لا UPDATE statements       |
| 3   | لا تربط store_id=17025 بأي merchant تلقائياً               | ✅ **مؤكد** — يُربط يدوياً لاحقاً        |
| 4   | `alarsh` يبقى `jenni_store_id = NULL`                      | ✅ **مؤكد** — يحتاج Store مستقل لاحقاً   |
| 5   | `DilMart-primary` يمكن ربطه يدوياً بعد Migration           | ✅ **مؤكد** — Manual Post-Migration Step |
| 6   | لا `jenni_merchant_id` (Path A / Stores-only)              | ✅ **مؤكد**                              |
| 7   | لا state machine changes                                   | ✅ **مؤكد**                              |
| 8   | لا settlement tables جديدة                                 | ✅ **مؤكد**                              |
| 9   | كل الأعمدة nullable ما عدا `jenni_settlement_id DEFAULT 0` | ✅ **مؤكد**                              |
| 10  | `provider_current_step` موجود — لا يُضاف مجدداً            | ✅ **مؤكد**                              |

---

## 9. ملخص التأثير

```text
الجداول المتأثرة: 2 (merchants, order_delivery_integrations)
الأعمدة الجديدة: 7
الفهارس الجديدة: 3
الجداول الجديدة: 0
الدوال المعدّلة: 0
RLS policies: لا تغيير
State machine: لا تغيير
Backfill داخل Migration: لا — صفر
Backfill يدوي لاحق: ممكن بموافقة المشرف
التجار في Production: 2 (DilMart-primary + alarsh)
الشحنات الحالية: 0 (يقلل مخاطر لكن لا يبرر backfill تلقائي)
المحافظات المربوطة بـ Jenni: 19/19
```

> [!IMPORTANT]
> هذا Migration **آمن ومتوافق مع الوراء** — لا يكسر أي وظيفة حالية لأن:
>
> - كل الأعمدة الجديدة nullable أو لها default
> - لا يُعدّل أي صف موجود
> - لا يُغيّر أي constraint أو function حالية
> - لا يُضيف `provider_current_step` لأنه موجود أصلاً
