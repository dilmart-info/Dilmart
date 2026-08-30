# Phase 2C — Controlled Provisioning Attempt #2 Result Report (alarsh)

> **Date**: 2026-06-18  
> **Timestamp of click**: 2026-06-18T18:31:55+03:00  
> **Result**: ❌ BLOCKED BY SECURITY GATE (Forbidden 403) / ✅ GATES WORKED EXACTLY AS DESIGNED  
> **Store Created**: NO

---

## 1. Environment Config (At Attempt Time)

Render environment variables at the time of click were:

| Variable                         | Configured Value                    | Description / Status                                                         |
| -------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `JENNI_ALLOW_STORE_PROVISIONING` | `false` (or not active/redeploying) | Store provisioning gate remained disabled, successfully blocking the attempt |
| `JENNI_ALLOW_SHIPMENT_DISPATCH`  | `false`                             | Shipment gate safely disabled                                                |
| `JENNI_DIAGNOSTICS_ENABLED`      | `false`                             | Connection diagnostics endpoint disabled                                     |

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

- **UI Status Badge**: Remained as **"غير مربوط" (Not Linked)**.
- **Store ID**: Remained as `—` (Not linked).
- **Toast Message shown in UI**: `Store provisioning is disabled. Set JENNI_ALLOW_STORE_PROVISIONING=true to enable.`
- **HTTP Response Code**: `403 Forbidden` from backend.

---

## 4. DB Post-Check Verification

We executed direct database checks via Supabase CLI to confirm the current state:

### 4.1 Merchant State

```sql
SELECT jenni_store_id, jenni_synced_at, jenni_sync_error FROM merchants WHERE slug = 'alarsh';
```

| Field              | Value  | Description                                                                                          |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------- |
| `jenni_store_id`   | `NULL` | ✅ No store was linked or created                                                                    |
| `jenni_synced_at`  | `NULL` | ✅ No sync timestamp was set                                                                         |
| `jenni_sync_error` | `NULL` | ✅ Remained `NULL` (local `ForbiddenException` is correctly excluded from being saved to sync error) |

### 4.2 Lock Table State

```sql
SELECT * FROM jenni_store_provisioning_locks;
-- Result: 0 rows
```

✅ No stale locks remained; the lock was cleanly released.

### 4.3 Audit Logs

```sql
SELECT * FROM audit_logs WHERE event_type = 'JENNI_STORE_PROVISIONED';
-- Result: 0 records found
```

✅ No audit log was created, confirming the operation did not proceed.

---

## 5. Root Cause Analysis (403 Forbidden)

The attempt was successfully intercepted and blocked by the backend safety gate before any external API calls or database changes could occur.

- In `AdminService.createJenniStore()`, the gate `assertProvisioningEnabled()` is called.
- Since `JENNI_ALLOW_STORE_PROVISIONING` was not set to `true` on the Render production environment, the server rejected the request with `ForbiddenException`.
- The frontend client successfully caught the `ApiError` status `403` and toasted the backend's message.

This demonstrates that our hardening patch behaves exactly as designed: even if the admin clicks the button in the UI, the backend completely blocks the provisioning request unless the environment flag is explicitly set to `true`.

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

1. **Verify Render Redeploy**: Confirm with the user if they want to run another attempt by setting `JENNI_ALLOW_STORE_PROVISIONING=true` on Render, waiting for redeployment, and then trying again.
2. **Restore Lock-down**: Ensure that `JENNI_ALLOW_STORE_PROVISIONING=false` is set as the default state on Render.
