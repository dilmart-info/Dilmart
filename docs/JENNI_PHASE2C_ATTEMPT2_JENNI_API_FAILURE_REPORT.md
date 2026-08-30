# Phase 2C — Attempt #2 Jenni API Failure Report

> **Security Note**: Sensitive credential values were redacted. Use environment variables from secure deployment dashboards instead.

> **Date**: 2026-06-16
> **Result**: ❌ JENNI API INVALID RESPONSE / ✅ VALIDATION PASSED
> **Store Created**: NO

---

## 1. Context

Attempt #1 failed due to invalid phone (10 digits). Phone was corrected to `07725332211` (11 digits) by project owner. `jenni_sync_error` was cleared. Attempt #2 was executed.

---

## 2. Execution

| Item            | Detail                                                  |
| --------------- | ------------------------------------------------------- |
| **Time**        | ~2026-06-16 12:46 UTC (15:46 Baghdad)                   |
| **Method**      | Admin UI → Merchant Detail → Create / Sync Store button |
| **Backend**     | Render (`DilMart-store-backend.onrender.com`)           |
| **Phone used**  | `07725332211` (corrected)                               |
| **Click count** | 1                                                       |

---

## 3. Result

### Validation: ✅ PASSED

All 4 fields passed strict validation:

| Field                       | Value                                                       | Validation     |
| --------------------------- | ----------------------------------------------------------- | -------------- |
| `display_name`              | شركة العرش                                                  | ✅ not empty   |
| `phone`                     | `normalizeIraqMobilePhone("07725332211")` → `"07725332211"` | ✅ 11 digits   |
| `address`                   | المنصور شارع 14 رمضان                                       | ✅ not empty   |
| `city` → `governorate_code` | بغداد → `BGD`                                               | ✅ exact match |

### Jenni API Call: ❌ FAILED

```
Error: Jenni API returned an invalid response.
```

This error is thrown at `jenni-client.service.ts:92` when `JSON.parse()` fails on the response body — meaning Jenni returned non-JSON (likely HTML login page or error page).

---

## 4. DB Post-Check

```sql
SELECT jenni_store_id, jenni_sync_error, jenni_synced_at
FROM merchants WHERE slug = 'alarsh';
```

| Field              | Value                                                        | Status              |
| ------------------ | ------------------------------------------------------------ | ------------------- |
| `jenni_store_id`   | `NULL`                                                       | ✅ No store created |
| `jenni_sync_error` | `"Jenni API error: Jenni API returned an invalid response."` | ✅ Saved            |
| `jenni_synced_at`  | `NULL`                                                       | ✅                  |

```sql
SELECT * FROM jenni_store_provisioning_locks;
-- Result: 0 rows ✅ (lock released in finally)
```

---

## 5. Root Cause Analysis

### Most Likely: Authentication Failure

Jenni API returned non-JSON, which typically happens when:

1. Auth token is missing/expired and Jenni redirects to HTML login
2. Auth credentials are wrong and Jenni returns HTML error page
3. The endpoint doesn't exist and returns a 404 HTML page

### Current Render Credentials

```
JENNI_USERNAME   = <REDACTED_JENNI_USERNAME>
JENNI_PASSWORD   = <REDACTED_JENNI_PASSWORD>
JENNI_SYSTEM_CODE = DilMart_STORE
```

These match the credentials from Phase 0 documentation. However, we cannot confirm they work on the deployed Render environment without a read-only diagnostic.

### What We Don't Know

- HTTP status code of the failed response (not logged)
- Content-Type of the response (not logged)
- Whether auth (login) succeeded before the createStore call
- Whether the response was HTML, plain text, or empty

---

## 6. Safety Confirmations

| Item                            | Confirmed |
| ------------------------------- | --------- |
| ❌ No Store created in Jenni    | ✅        |
| ❌ No dispatch                  | ✅        |
| ❌ No shipment                  | ✅        |
| ❌ No finance                   | ✅        |
| ❌ No webhook changes           | ✅        |
| ❌ No `store_id=17025` linked   | ✅        |
| ❌ No `DilMart-primary` touched | ✅        |
| ✅ Lock released                | ✅        |
| ✅ Error saved in DB            | ✅        |

---

## 7. Next Steps

1. **Add diagnostic logging** in `JenniClientService` (safe — no credentials/tokens printed)
2. **Add read-only diagnostic endpoint** to test auth + listStores
3. **No retry** until diagnostics confirm auth works
4. **No credential changes** without diagnostic evidence

```
Phase 2C Attempt #2 = JENNI_API_INVALID_RESPONSE
Status = DIAGNOSTICS REQUIRED
No Attempt #3 until diagnostics complete
```
