# 📊 JENNI PHASE 1 — Migration Report

> **Date**: 2026-06-16 10:15 (Baghdad time)  
> **Migration**: `20260616100000_p3_jenni_stores_only_path_a.sql`  
> **Target**: Production (linked via `supabase db push --linked`)  
> **Result**: ✅ **SUCCESS**

---

## 1. Migration SQL المطبق

```sql
-- Phase 1: Jenni Stores-only (Path A) — Schema-only Data Model Extension
--
-- RULES (supervisor-approved):
--   ✅ Schema changes only (ADD COLUMN, CREATE INDEX, COMMENT)
--   ❌ NO backfill — NO UPDATE — NO DELETE — NO INSERT

-- 1) merchants: Jenni Store identity columns
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS jenni_store_id INTEGER,
  ADD COLUMN IF NOT EXISTS jenni_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS jenni_sync_error TEXT;

COMMENT ON COLUMN public.merchants.jenni_store_id
  IS 'Jenni delivery store ID. Each DilMart merchant maps to one Jenni store/pickup point. NULL = not yet linked.';
COMMENT ON COLUMN public.merchants.jenni_synced_at
  IS 'Timestamp of last successful sync with Jenni API for this merchant store.';
COMMENT ON COLUMN public.merchants.jenni_sync_error
  IS 'Last sync error message from Jenni API. Cleared on successful sync.';

-- 2) order_delivery_integrations: settlement & actual cost columns
ALTER TABLE public.order_delivery_integrations
  ADD COLUMN IF NOT EXISTS jenni_store_id INTEGER,
  ADD COLUMN IF NOT EXISTS jenni_settlement_id INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost_actual NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cod_collected NUMERIC(12,2);

COMMENT ON COLUMN public.order_delivery_integrations.jenni_store_id
  IS 'Jenni store_id used when this shipment was dispatched. Denormalized from merchant for audit trail.';
COMMENT ON COLUMN public.order_delivery_integrations.jenni_settlement_id
  IS 'Jenni settlement batch ID. 0 = not yet settled by Jenni.';
COMMENT ON COLUMN public.order_delivery_integrations.delivery_cost_actual
  IS 'Actual delivery cost reported by Jenni (may differ from quoted price at dispatch time).';
COMMENT ON COLUMN public.order_delivery_integrations.cod_collected
  IS 'Cash-on-delivery amount actually collected by Jenni courier from recipient.';

-- 3) Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_jenni_store_id
  ON public.merchants (jenni_store_id)
  WHERE jenni_store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_odi_jenni_store_id
  ON public.order_delivery_integrations (jenni_store_id)
  WHERE jenni_store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_odi_jenni_settlement_id
  ON public.order_delivery_integrations (jenni_settlement_id)
  WHERE jenni_settlement_id > 0;
```

---

## 2. Preflight Snapshot (قبل Migration)

### عدد الصفوف

| الجدول                        | العدد  |
| ----------------------------- | ------ |
| `merchants`                   | **2**  |
| `order_delivery_integrations` | **0**  |
| `orders`                      | **11** |

### التجار

| id                                     | slug              | display_name  | status |
| -------------------------------------- | ----------------- | ------------- | ------ |
| `a3e3b17d-450f-4ccf-81dd-72cc4d4172d4` | `DilMart-primary` | DilMart Store | active |
| `65575f7c-4204-44d0-99a0-fc1902e2ed91` | `alarsh`          | شركة العرش    | active |

### الأعمدة المستهدفة — غير موجودة قبل Migration

| العمود                 | الجدول                      | قبل Migration |
| ---------------------- | --------------------------- | ------------- |
| `jenni_store_id`       | merchants                   | ❌ غير موجود  |
| `jenni_synced_at`      | merchants                   | ❌ غير موجود  |
| `jenni_sync_error`     | merchants                   | ❌ غير موجود  |
| `jenni_store_id`       | order_delivery_integrations | ❌ غير موجود  |
| `jenni_settlement_id`  | order_delivery_integrations | ❌ غير موجود  |
| `delivery_cost_actual` | order_delivery_integrations | ❌ غير موجود  |
| `cod_collected`        | order_delivery_integrations | ❌ غير موجود  |

---

## 3. Post-Migration Verification (بعد Migration)

### عدد الصفوف — لم يتغير ✅

| الجدول                        | قبل | بعد    | تغيير       |
| ----------------------------- | --- | ------ | ----------- |
| `merchants`                   | 2   | **2**  | ✅ لا تغيير |
| `order_delivery_integrations` | 0   | **0**  | ✅ لا تغيير |
| `orders`                      | 11  | **11** | ✅ لا تغيير |

### الأعمدة الجديدة — موجودة ✅

| العمود                 | الجدول                      | النوع                    | nullable | default |
| ---------------------- | --------------------------- | ------------------------ | -------- | ------- |
| `jenni_store_id`       | merchants                   | integer                  | ✅ YES   | null    |
| `jenni_synced_at`      | merchants                   | timestamp with time zone | ✅ YES   | null    |
| `jenni_sync_error`     | merchants                   | text                     | ✅ YES   | null    |
| `jenni_store_id`       | order_delivery_integrations | integer                  | ✅ YES   | null    |
| `jenni_settlement_id`  | order_delivery_integrations | integer                  | ❌ NO    | **0**   |
| `delivery_cost_actual` | order_delivery_integrations | numeric                  | ✅ YES   | null    |
| `cod_collected`        | order_delivery_integrations | numeric                  | ✅ YES   | null    |

### الفهارس — أُنشئت ✅

| الفهرس                         | النوع  | التعريف                                                                              |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------ |
| `idx_merchants_jenni_store_id` | UNIQUE | `ON merchants (jenni_store_id) WHERE jenni_store_id IS NOT NULL`                     |
| `idx_odi_jenni_store_id`       | INDEX  | `ON order_delivery_integrations (jenni_store_id) WHERE jenni_store_id IS NOT NULL`   |
| `idx_odi_jenni_settlement_id`  | INDEX  | `ON order_delivery_integrations (jenni_settlement_id) WHERE jenni_settlement_id > 0` |

### تأكيد عدم وجود Backfill ✅

| التاجر            | `jenni_store_id` | `jenni_synced_at` | `jenni_sync_error` |
| ----------------- | ---------------- | ----------------- | ------------------ |
| `DilMart-primary` | **NULL** ✅      | NULL              | NULL               |
| `alarsh`          | **NULL** ✅      | NULL              | NULL               |

> **لم يُعدَّل أي صف. لم يُنفَّذ أي UPDATE أو INSERT أو DELETE.**

---

## 4. Rollback SQL

```sql
-- ROLLBACK: Phase 1 Jenni Stores-only Path A
-- تنفَّذ فقط إذا ظهرت مشاكل بعد التطبيق

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

---

## 5. نتائج الاختبارات

### Jenni Integration Tests + Groundwork Guards

```text
TAP version 13
1..43
# tests 43
# pass 43
# fail 0
# cancelled 0
# skipped 0
# duration_ms 615.4975
```

**43/43 ✅ — جميع الاختبارات ناجحة بدون أي تغيير.**

### TypeScript Type Check

```text
npx tsc --noEmit → SUCCESS (no errors)
```

---

## 6. ملخص

```text
Migration: 20260616100000_p3_jenni_stores_only_path_a.sql
Target:    Production (ztplxqlthuqkuktbznbo)
Type:      Schema-only (ADD COLUMN + CREATE INDEX + COMMENT)
Result:    ✅ SUCCESS

أعمدة جديدة:    7/7 ✅
فهارس جديدة:    3/3 ✅
صفوف معدّلة:    0   ✅
Backfill:        لا  ✅
UPDATE/DELETE:   لا  ✅
Tests:           43/43 ✅
TypeScript:      clean ✅

DilMart-primary.jenni_store_id = NULL ✅
alarsh.jenni_store_id         = NULL ✅
```

> [!IMPORTANT]
> الربط اليدوي لـ `DilMart-primary` بـ `store_id=17025` يتطلب **موافقة منفصلة** من المشرف.
> التاجر `alarsh` يحتاج **Jenni Store مستقل** يُنشأ في Phase 2.
