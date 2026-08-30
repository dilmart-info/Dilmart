# Phase 2C — Attempt #1 Validation Failure Report

> **Security Note**: Sensitive credential values were redacted. Use environment variables from secure deployment dashboards instead.

> **Date**: 2026-06-16
> **Result**: ❌ VALIDATION FAILED / ✅ SYSTEM BEHAVIOR CORRECT
> **Store Created**: NO

---

## 1. Preflight Checks (Before Click)

| Check                           | Expected    | Actual                  | Status                   |
| ------------------------------- | ----------- | ----------------------- | ------------------------ |
| `alarsh.jenni_store_id`         | NULL        | NULL                    | ✅                       |
| `contact_phone`                 | ≠ NULL      | `0780123134`            | ✅ (present but invalid) |
| `whatsapp_phone`                | ≠ NULL      | `0780123134`            | ✅ (present but invalid) |
| `address`                       | ≠ NULL      | `المنصور شارع 14 رمضان` | ✅                       |
| `city`                          | maps to BGD | `بغداد` → `BGD`         | ✅                       |
| Lock table                      | 0 rows      | 0 rows                  | ✅                       |
| Merchants with `jenni_store_id` | 0 rows      | 0 rows                  | ✅                       |

---

## 2. Execution

| Item            | Detail                                                   |
| --------------- | -------------------------------------------------------- |
| **Time**        | ~2026-06-16 12:06 UTC (15:06 Baghdad)                    |
| **Method**      | Admin UI → Merchant Detail → Create / Sync Store button  |
| **URL**         | `https://store.DilMart.org/admin/merchants/65575f7c-...` |
| **Backend**     | Render (`DilMart-store-backend.onrender.com`)            |
| **Click count** | 1 (one time only)                                        |

---

## 3. Error

### Toast / UI Message

```
Cannot provision Jenni Store: missing phone (contact_phone or whatsapp_phone)
```

### Root Cause

```
contact_phone  = "0780123134" → 10 digits
whatsapp_phone = "0780123134" → 10 digits

normalizeIraqMobilePhone() expects:
  - 11 digits starting with "07"  → ✅ returns normalized
  - 13 digits starting with "9647" → ✅ returns normalized
  - 10 digits starting with "7"   → ✅ returns normalized

"0780123134" = 10 digits starting with "0" → ❌ returns null
```

The phone number is missing 1 digit. Iraqi mobile numbers are always 11 digits (07XX XXXX XXX).

---

## 4. DB Post-Check

### 4.1 Merchant State

```sql
SELECT jenni_store_id, jenni_sync_error, jenni_synced_at
FROM merchants WHERE slug = 'alarsh';
```

| Field              | Value                                                                             | Status               |
| ------------------ | --------------------------------------------------------------------------------- | -------------------- |
| `jenni_store_id`   | `NULL`                                                                            | ✅ No store created  |
| `jenni_sync_error` | `"Cannot provision Jenni Store: missing phone (contact_phone or whatsapp_phone)"` | ✅ Error saved       |
| `jenni_synced_at`  | `NULL`                                                                            | ✅ No sync timestamp |

### 4.2 Lock Table

```sql
SELECT * FROM jenni_store_provisioning_locks;
-- Result: 0 rows ✅
```

Lock was acquired, then released in `finally` block.

### 4.3 Audit Events

No `JENNI_STORE_PROVISIONED` audit event was created (correct — provisioning did not succeed).

---

## 5. Safety Confirmations

| Item                            | Confirmed |
| ------------------------------- | --------- |
| ❌ No Store created in Jenni    | ✅        |
| ❌ No dispatch                  | ✅        |
| ❌ No shipment                  | ✅        |
| ❌ No finance                   | ✅        |
| ❌ No webhook changes           | ✅        |
| ❌ No `store_id=17025` linked   | ✅        |
| ❌ No `DilMart-primary` touched | ✅        |
| ❌ No duplicate stores          | ✅        |
| ✅ Lock released                | ✅        |
| ✅ Error saved in DB            | ✅        |

---

## 6. Resolution

### Phone Number Correction

The correct phone number for شركة العرش was provided by the project owner:

```
Old: 0780123134  (10 digits — invalid)
New: 07725332211 (11 digits — valid ✅)
```

DB updated:

```sql
UPDATE merchant_settings
SET contact_phone = '07725332211', whatsapp_phone = '07725332211'
WHERE merchant_id = '65575f7c-4204-44d0-99a0-fc1902e2ed91';

UPDATE merchants
SET jenni_sync_error = NULL
WHERE id = '65575f7c-4204-44d0-99a0-fc1902e2ed91';
```

### Additional Fix: OrdersModule DI

During Phase 2C preparation, a missing `JenniModule` import in `OrdersModule` was discovered and fixed:

```
Commit: 68462d8 fix: add JenniModule import to OrdersModule (missing DI dependency)
```

### Render Environment Variables Updated

Three Jenni env vars on Render were outdated (pre-development values) and were corrected:

| Variable            | Old (pre-dev)        | New (correct)               |
| ------------------- | -------------------- | --------------------------- |
| `JENNI_USERNAME`    | `<REDACTED>`         | `<REDACTED_JENNI_USERNAME>` |
| `JENNI_PASSWORD`    | `<REDACTED>`         | `<REDACTED_JENNI_PASSWORD>` |
| `JENNI_SYSTEM_CODE` | `DilMart_STORE_PROD` | `DilMart_STORE`             |

---

## 7. Next Step

Ready for **Attempt #2** with corrected phone number.

```
Phase 2C Attempt #1 = VALIDATION FAILED / SYSTEM CORRECT
Phone corrected = 07725332211
jenni_sync_error = cleared
Status = Ready for Attempt #2
```
