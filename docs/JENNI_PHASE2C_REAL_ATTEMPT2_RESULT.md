# Phase 2C — Real Controlled Provisioning Attempt #2 Result Report (alarsh)

> **Date**: 2026-06-18  
> **Timestamp of click**: 2026-06-18T18:39:05+03:00  
> **Result**: ❌ FAILED BY JENNI LOGISTICS API (Unauthorized 401) / ✅ OBSERVABILITY PATCH SUCCESS  
> **Store Created**: NO

---

## 1. Environment Config (At Attempt Time)

Render environment variables were verified as:

| Variable                         | Configured Value | Description / Status                  |
| -------------------------------- | ---------------- | ------------------------------------- |
| `JENNI_ALLOW_STORE_PROVISIONING` | `true`           | Gate successfully enabled for attempt |
| `JENNI_ALLOW_SHIPMENT_DISPATCH`  | `false`          | Shipment gate safely disabled         |
| `JENNI_DIAGNOSTICS_ENABLED`      | `false`          | Diagnostics endpoint disabled         |

---

## 2. Execution Details

| Item                     | Detail                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Merchant**             | `alarsh` (ID: `65575f7c-4204-44d0-99a0-fc1902e2ed91`)                                                                         |
| **Method**               | Admin UI → Merchant Detail → "Create / Sync Store" button (one click only)                                                    |
| **Backend**              | Render (`DilMart-store-backend.onrender.com`)                                                                                 |
| **Request URL**          | `POST https://DilMart-store-backend.onrender.com/api/admin/jenni/merchants/65575f7c-4204-44d0-99a0-fc1902e2ed91/create-store` |
| **Calculated attemptId** | `jenni-store-65575f7c-4204-44d0-99a0-fc1902e2ed91-1781797145000` (based on epoch click timestamp `15:39:05Z`)                 |

---

## 3. Results & UI Behavior

- **UI Status Badge**: Changed from **"غير مربوط" (Not Linked)** to **"خطأ" (Error)**.
- **Store ID**: Remained as `—` (Not linked).
- **Toast / Error Message shown in UI**: `Jenni API error: Jenni API rejected request. status=401 path=/v2/stores/create`
- **HTTP Response Code**: `400 Bad Request` from the backend endpoint (wrapping the external `401 Unauthorized` exception cleanly via `JenniProviderException`).

---

## 4. DB Post-Check Verification

We executed direct database checks via Supabase CLI to confirm the current state:

### 4.1 Merchant State

```sql
SELECT jenni_store_id, jenni_synced_at, jenni_sync_error FROM merchants WHERE slug = 'alarsh';
```

| Field              | Value                                                                              | Description                                         |
| ------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| `jenni_store_id`   | `NULL`                                                                             | ✅ No store was linked or created                   |
| `jenni_synced_at`  | `NULL`                                                                             | ✅ No sync timestamp was set                        |
| `jenni_sync_error` | `"Jenni API error: Jenni API rejected request. status=401 path=/v2/stores/create"` | ⚠️ Safe, sanitized error message successfully saved |

### 4.2 Lock Table State

```sql
SELECT * FROM jenni_store_provisioning_locks;
-- Result: 0 rows
```

✅ No stale locks remained; the table lock was safely and cleanly released in the `finally` block.

### 4.3 Audit Logs

```sql
SELECT * FROM audit_logs WHERE event_type = 'JENNI_STORE_PROVISIONED';
-- Result: 0 records found
```

✅ No audit log was created, confirming the operation did not proceed to completion.

---

## 5. Root Cause Analysis (401 Unauthorized)

The new observability patch worked exactly as designed:

1. **Gate Passed**: Because `JENNI_ALLOW_STORE_PROVISIONING=true` was active, the backend bypassed the safety gate and called `jenniClient.createStore(payload)`.
2. **API Exception Caught**: The external Jenni Logistics API rejected the request with a `401 Unauthorized` status code.
3. **Information Redacted**: Our patch intercepted the raw non-2xx response, sanitized secrets/passwords, truncated the body preview, and logged the raw body preview internally inside the Render application log stream:
   `Jenni API request failed | method=POST | path=/v2/stores/create | status=401 | content-type=... | body="..."`
4. **Safe Message Propagated**: The server threw a `JenniProviderException` containing the safe message `"Jenni API rejected request. status=401 path=/v2/stores/create"`.
5. **Database Safely Updated**: The catch block in `ensureStoreForMerchant` successfully saved the safe error message to `merchants.jenni_sync_error`, ensuring that the raw body or potential credentials were never exposed in the database or the UI.

The `401 Unauthorized` error indicates that the current API credentials or access token configuration for the Jenni Logistics client on the production server is invalid or has expired.

---

## 6. Safety Confirmations

| Check                                   | Status       |
| --------------------------------------- | ------------ |
| ❌ No Store created in Jenni Production | ✅ Confirmed |
| ❌ No shipment dispatch triggered       | ✅ Confirmed |
| ❌ No finance or settlement touched     | ✅ Confirmed |
| ✅ Table locks safely cleaned up        | ✅ Confirmed |

---

## 7. Next Steps

1. **Revert Render Gate**: Revert `JENNI_ALLOW_STORE_PROVISIONING` to `false` immediately on Render to restore lockdown state.
2. **Verify Credentials**: Check the backend environment keys (`JENNI_SYSTEM_CODE`, credentials, or authorization secrets) configured on Render to diagnose why the Jenni API returned `401 Unauthorized`.
