# Phase 2A Implementation Report — Backend Store Provisioning Service

> **Date**: 2026-06-16  
> **Phase**: 2A — Backend Store Provisioning Service  
> **Status**: ✅ COMPLETED (v2 — supervisor fixes applied)  
> **Build**: ✅ TypeScript compiles successfully  
> **Tests**: ✅ 19/19 pass

---

## 1. Migration الجديد

### اسم الملف

[20260616120000_p5_jenni_table_lock_replace_advisory.sql](file:///e:/Project/DilMart-Store/supabase/migrations/20260616120000_p5_jenni_table_lock_replace_advisory.sql)

### SQL الكامل

```sql
-- 1. Create table-based lock for store provisioning
CREATE TABLE IF NOT EXISTS public.jenni_store_provisioning_locks (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL DEFAULT now()
);

-- Allow service_role full access
GRANT ALL ON public.jenni_store_provisioning_locks TO service_role;

-- 2. Drop the old advisory lock function (no longer used)
DROP FUNCTION IF EXISTS public.jenni_provisioning_advisory_lock(bigint);
```

### تأكيد حذف الدالة القديمة

- ✅ `DROP FUNCTION IF EXISTS public.jenni_provisioning_advisory_lock(bigint)` — **محذوفة** في السطر 17
- ✅ لا يوجد أي استدعاء لها في الكود (`rpc("jenni_provisioning_advisory_lock"...)` أُزيل بالكامل)

---

## 2. تفصيل Flow في JenniStoreProvisioningService

> ملف: [jenni-store-provisioning.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts)

### Flow الكامل في `ensureStoreForMerchant` (سطر 156-206)

```text
L157-161: Quick check → if jenni_store_id exists → return early (no lock needed)
L163-164: acquire table lock → INSERT INTO jenni_store_provisioning_locks
L166:     try {
L167-171:   re-check → SELECT merchant after lock → if jenni_store_id exists → return
L173-175:   validate → buildStorePayload (phone, address, city, display_name)
L177-179:   call Jenni API → createStore(payload)
L188-190:   save result → UPDATE merchants SET jenni_store_id, jenni_synced_at, jenni_sync_error=null
L193-201: } catch { save jenni_sync_error if not already saved }
L202-205: } finally { release lock → DELETE FROM jenni_store_provisioning_locks }
```

### أين يتم acquire lock?

[سطر 383-407](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts#L383-L407) — `acquireTableLock(merchantId)`:

```typescript
// Try INSERT
const { error } = await this.supabaseAdmin.client
  .from("jenni_store_provisioning_locks")
  .insert({ merchant_id: merchantId })
  .single();

if (!error) return; // Lock acquired

// Conflict → clean stale → retry once → throw if still locked
await this.cleanStaleLocks();
// retry INSERT...
if (retryError)
  throw new BadRequestException("Store provisioning already in progress...");
```

### أين يتم stale lock cleanup?

[سطر 427-437](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts#L427-L437) — `cleanStaleLocks()`:

```typescript
const cutoff = new Date(
  Date.now() - STALE_LOCK_TTL_MINUTES * 60_000,
).toISOString();
await this.supabaseAdmin.client
  .from("jenni_store_provisioning_locks")
  .delete()
  .lt("locked_at", cutoff);
```

`STALE_LOCK_TTL_MINUTES = 10` (سطر 10)

### أين يتم release lock في finally?

[سطر 202-205](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts#L202-L205):

```typescript
} finally {
  // Always release the table lock
  await this.releaseTableLock(merchantId);
}
```

[releaseTableLock — سطر 412-421](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts#L412-L421):

```typescript
async releaseTableLock(merchantId: string): Promise<void> {
  const { error } = await this.supabaseAdmin.client
    .from("jenni_store_provisioning_locks")
    .delete()
    .eq("merchant_id", merchantId);
  // warn on failure, don't throw
}
```

### أين يتم re-check بعد lock?

[سطر 167-171](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts#L167-L171):

```typescript
// 3. Re-check after lock (double-check pattern)
const refreshed = await this.getMerchantWithJenniFields(merchantId);
if (refreshed.jenni_store_id) {
  return { jenni_store_id: refreshed.jenni_store_id, was_created: false };
}
```

### أين يتم منع duplicate في linkExistingStore?

[سطر 218-230](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts#L218-L230):

```typescript
// Check if this store_id is already linked to another merchant
const { data: existing } = await this.supabaseAdmin.client
  .from("merchants")
  .select("id, slug")
  .eq("jenni_store_id", jenniStoreId)
  .neq("id", merchantId)
  .maybeSingle();

if (existing) {
  throw new BadRequestException(
    `jenni_store_id=${jenniStoreId} is already linked to merchant ${existing.slug ?? existing.id}`,
  );
}
```

---

## 3. نتائج الاختبارات

```
✅ Build:  nest build → SUCCESS
✅ Tests:  19/19 pass (572ms)
```

| #   | Test                                                           | Category       | Result |
| --- | -------------------------------------------------------------- | -------------- | ------ |
| 1   | load compiled module                                           | Setup          | ✅     |
| 2   | merchant_with_existing_jenni_store_id_returns_without_api_call | Idempotency    | ✅     |
| 3   | merchant_without_store_builds_payload_and_calls_createStore    | Happy path     | ✅     |
| 4   | missing_address_saves_sync_error_and_throws                    | Validation     | ✅     |
| 5   | missing_phone_saves_sync_error_and_throws                      | Validation     | ✅     |
| 6   | missing_governorate_mapping_saves_sync_error_and_throws        | Validation     | ✅     |
| 7   | jenni_api_failure_saves_sync_error                             | Error handling | ✅     |
| 8   | success_saves_jenni_store_id_synced_at_and_clears_error        | Persistence    | ✅     |
| 9   | no_auto_use_of_17025                                           | Safety         | ✅     |
| 10  | no_default_BGD                                                 | Safety         | ✅     |
| 11  | no_address_city_fallback                                       | Safety         | ✅     |
| 12  | resolveGovernorateCode exact matching with alef unification    | Normalization  | ✅     |
| 13  | fallback_to_whatsapp_phone                                     | Phone fallback | ✅     |
| 14  | lock_is_released_on_jenni_api_failure                          | Lock           | ✅     |
| 15  | concurrent_provisioning_lock_conflict                          | Lock           | ✅     |
| 16  | stale_lock_older_than_ttl_gets_cleaned                         | Lock           | ✅     |
| 17  | linkExistingStore_rejects_duplicate_store_id                   | Duplicate      | ✅     |
| 18  | linkExistingStore_succeeds_when_no_duplicate                   | Duplicate      | ✅     |
| 19  | lock_released_on_success                                       | Lock           | ✅     |

---

## 4. تأكيدات السلامة

| التأكيد                     | الحالة | الدليل                                                            |
| --------------------------- | ------ | ----------------------------------------------------------------- |
| لا Store فعلي تم إنشاؤه     | ✅     | لا يوجد استدعاء `ensureStoreForMerchant` من أي controller أو cron |
| لا استخدام `store_id=17025` | ✅     | `grep -r "17025" src/` → لا نتائج في الكود                        |
| لا ربط `DilMart-primary`    | ✅     | لا استدعاء `linkExistingStore` من أي مكان                         |
| لا ربط `alarsh`             | ✅     | لا استدعاء `linkExistingStore` من أي مكان                         |
| لا dispatch                 | ✅     | لا تعديل على dispatch service                                     |
| لا shipment                 | ✅     | لا تعديل على shipment logic                                       |
| لا finance                  | ✅     | لا تعديل على finance module                                       |
| لا webhook                  | ✅     | لا تعديل على webhook controller                                   |
| لا secrets                  | ✅     | لا token/password في logs أو git                                  |
| لا UNIQUE index             | ✅     | لا index جديد                                                     |
| الدالة القديمة محذوفة       | ✅     | `DROP FUNCTION IF EXISTS` في migration p5                         |

---

## 5. مطابقة للسلوك المطلوب

```text
المطلوب:                              الموجود:
─────────────────────────             ─────────────────────────
try acquire lock                      L383-390: INSERT → if no error → return
if lock exists and >10 min:           L392-394: cleanStaleLocks() → DELETE WHERE locked_at < cutoff
  delete stale lock                   L427-432: DELETE .lt("locked_at", cutoff)
  retry acquire                       L396-400: retry INSERT
if lock still exists:                 L402-405: throw "already in progress"
  throw "already in progress"

try:                                  L166: try {
  re-check jenni_store_id             L167-171: getMerchantWithJenniFields → if exists → return
  validate                            L173-175: buildStorePayload (strict)
  call Jenni API                      L177-179: jenniClient.createStore(payload)
  save result                         L188-190: saveMerchantStoreId
finally:                              L202: finally {
  delete lock row                     L203-204: releaseTableLock → DELETE
```

**✅ مطابق تماماً.**
