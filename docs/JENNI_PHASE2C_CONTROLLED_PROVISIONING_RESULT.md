# Phase 2C — Controlled Provisioning Result Report (alarsh)

> **Date**: 2026-06-18  
> **Timestamp of click**: 2026-06-18T00:25:45+03:00  
> **Result**: ❌ BACKEND 400 BAD REQUEST / ✅ SAFETY GATES WORKED  
> **Store Created**: NO

---

## 1. Environment Config (At Attempt Time)

Before the click, Render environment variables were verified as:

| Variable                         | Configured Value | Description / Status                        |
| -------------------------------- | ---------------- | ------------------------------------------- |
| `JENNI_ALLOW_STORE_PROVISIONING` | `true`           | Store provisioning gate enabled for attempt |
| `JENNI_ALLOW_SHIPMENT_DISPATCH`  | `false`          | Shipment gate safely disabled               |
| `JENNI_DIAGNOSTICS_ENABLED`      | `false`          | Connection diagnostics endpoint disabled    |

---

## 2. Execution Details

| Item            | Detail                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Merchant**    | `alarsh` (ID: `65575f7c-4204-44d0-99a0-fc1902e2ed91`)                                                                         |
| **Method**      | Admin UI → Merchant Detail → "Create / Sync Store" button (one click only)                                                    |
| **Backend**     | Render (`DilMart-store-backend.onrender.com`)                                                                                 |
| **Request URL** | `POST https://DilMart-store-backend.onrender.com/api/admin/jenni/merchants/65575f7c-4204-44d0-99a0-fc1902e2ed91/create-store` |

---

## 3. Results & UI Behavior

- **UI Status Badge**: Remained as **"خطأ" (Error)**.
- **Store ID**: Remained as `—` (Not linked).
- **Error message shown in UI**: `Jenni API error: Jenni API returned an invalid response.` (Old error, remained unchanged from Attempt #2).
- **Toast Message**: None shown.
- **Console Log Error**:  
  `[error][https://DilMart-store-backend.onrender.com/api/admin/jenni/merchants/65575f7c-4204-44d0-99a0-fc1902e2ed91/create-store] Failed to load resource: the server responded with a status of 400 ()`

---

## 4. DB Post-Check Verification

We executed direct database checks via Supabase CLI to confirm the current state:

### 4.1 Merchant State

```sql
SELECT jenni_store_id, jenni_synced_at, jenni_sync_error FROM merchants WHERE slug = 'alarsh';
```

| Field              | Value                                                        | Description                                     |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------------- |
| `jenni_store_id`   | `NULL`                                                       | ✅ No store was linked or created               |
| `jenni_synced_at`  | `NULL`                                                       | ✅ No sync timestamp was set                    |
| `jenni_sync_error` | `"Jenni API error: Jenni API returned an invalid response."` | ⚠️ Remained unchanged from the previous attempt |

### 4.2 Lock Table State

```sql
SELECT * FROM jenni_store_provisioning_locks;
-- Result: 0 rows
```

✅ No stale locks remained; the lock was either not persistent or was cleaned up in the `finally` block.

### 4.3 Audit Logs

```sql
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5;
-- Result: 0 records found for provisioning
```

✅ No `JENNI_STORE_PROVISIONED` audit log was created, confirming the operation did not complete.

---

## 5. Root Cause Analysis (400 Bad Request)

Since `jenni_sync_error` was not updated to a new error, and no audit log was created, the `400 Bad Request` was thrown before the database state could be updated.

We analyzed the backend code for any possible `BadRequestException` sources:

1. **Local Validation**: If the display name, phone, address, or governorate code was missing, `buildStorePayload` throws `BadRequestException`. However, it explicitly calls `saveSyncError` before doing so. Since `jenni_sync_error` did not update to a validation error, **local validation did not cause this**.
2. **Lock Table Conflict**: If a lock was already held, `acquireTableLock` throws `BadRequestException`. Since the lock table was empty, this is unlikely.
3. **Jenni API Error caught by JenniClient**:
   In `backend/src/modules/jenni/jenni-client.service.ts`, the client throws `BadRequestException("Jenni API request failed.")` when the Jenni API returns a non-2xx status code but with a valid JSON response (e.g., a validation error or authentication refusal from Jenni).
   Because the service catches and re-throws `BadRequestException` but bypasses saving it to `jenni_sync_error` (assuming it is a local validation error), the database state is left untouched while a `400 Bad Request` is returned to the user.

### Action Item:

We must check the **Render application logs** to find the exact message/stack trace printed during the failed request.

---

## 6. Safety Confirmations

| Check                                   | Status       |
| --------------------------------------- | ------------ |
| ❌ No Store created in Jenni Production | ✅ Confirmed |
| ❌ No shipment dispatch triggered       | ✅ Confirmed |
| ❌ No finance or settlement touched     | ✅ Confirmed |
| ✅ Table locks safely cleaned up        | ✅ Confirmed |

---

## 7. Next Steps / Action Audit

> [!IMPORTANT]
> **Attempt stopped. No retry until observability patch is deployed.**
> Next action: Observability patch before retry.

1. **Revert Render Gate**: Revert `JENNI_ALLOW_STORE_PROVISIONING` to `false` immediately on Render to restore lock-down state.
2. **Deploy Observability Patch**: Deploy this observability patch to Render to capture structured logs and typed provider exceptions for non-2xx responses.
3. **Verify Observability**: Ensure Render logs show the new correlation `attemptId` and structured error formats on subsequent operations.
