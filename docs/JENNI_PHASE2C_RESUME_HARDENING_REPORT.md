# Phase 2C Resume Hardening Report

This report outlines the implementation and validation of safety hardening gates for Jenni logistics integration before controlled provisioning.

## 1. Files Changed

The following files have been modified or created:

1. **Backend Provisioning Service**:
   - `backend/src/modules/jenni/jenni-store-provisioning.service.ts` — Added service-level provisioning gate immediately before calling Jenni API.
2. **Backend Dispatch Service**:
   - `backend/src/modules/jenni/jenni-dispatch.service.ts` — Added service-level dispatch gate at the start of order dispatch.
3. **Environment Configurations**:
   - `backend/.env.example` — Added `JENNI_ALLOW_SHIPMENT_DISPATCH=false` and documented both safety gates.
   - `backend/.env` — Added `JENNI_ALLOW_SHIPMENT_DISPATCH=false` locally to prevent accidental dispatching.
4. **Unit Tests**:
   - `backend/tests/jenni-store-provisioning.test.mjs` — Added tests to verify that provisioning gate returns idempotent no-op results when disabled for already-linked merchants, but throws a `ForbiddenException` for unlinked merchants.
   - `backend/tests/jenni-dispatch-gate.test.mjs` [NEW] — Added dispatch gate tests to verify that dispatching throws `ForbiddenException` when disabled.
5. **Documentation**:
   - `docs/JENNI_PHASE2C_PROTOCOL_VIOLATION_REPORT.md` — Marked Store 17725 and alarsh phone number issues as operationally closed, and documented safety gate requirements.
   - `docs/JENNI_PHASE2C_REAL_STORE_TEST_PLAN.md` — Updated with alarsh's corrected phone number `07725332211`, safety gate details, and single manual Admin UI attempt rule.

---

## 2. Exact Gates Added

### 2.1 Store Provisioning Gate (Service-Level)
Inside `JenniStoreProvisioningService`, `assertStoreProvisioningEnabled()` is asserted immediately before `jenniClient.createStore(payload)` to ensure idempotent returns for merchants already having a `jenni_store_id` remain operational without requiring the gate to be enabled:

```typescript
private assertStoreProvisioningEnabled(): void {
  const allowed = this.config
    ? String(this.config.get("JENNI_ALLOW_STORE_PROVISIONING") ?? "").trim().toLowerCase()
    : "false";
  if (allowed !== "true") {
    throw new ForbiddenException(
      "Store provisioning is disabled. Set JENNI_ALLOW_STORE_PROVISIONING=true to enable.",
    );
  }
}
```

### 2.2 Shipment Dispatch Gate (Kill-Switch)
Inside `JenniDispatchService`, `assertShipmentDispatchEnabled()` is called at the start of `dispatchOrderToJenni()` to block all shipment creation and retry repairs until Phase 3 approval:

```typescript
private assertShipmentDispatchEnabled(): void {
  const allowed = this.config
    ? String(this.config.get("JENNI_ALLOW_SHIPMENT_DISPATCH") ?? "").trim().toLowerCase()
    : "false";
  if (allowed !== "true") {
    throw new ForbiddenException(
      "Shipment dispatch is disabled. Set JENNI_ALLOW_SHIPMENT_DISPATCH=true to enable.",
    );
  }
}
```

---

## 3. Tests Run & Results

The NestJS backend was built successfully using `npm run build`, and both unit test files were executed.

### 3.1 Store Provisioning Tests
Run command: `node --test tests/jenni-store-provisioning.test.mjs`

- **Results**: 21/21 tests passed successfully (including new Test 20 and Test 21).
  - ✅ **Test 20 (provisioning_gate_disabled_throws_forbidden_exception_for_unlinked_merchant)**: Verified that when gate is false, trying to provision an unlinked merchant throws `ForbiddenException` and `jenniClient.createStore` is never called.
  - ✅ **Test 21 (provisioning_gate_disabled_succeeds_for_already_linked_merchant)**: Verified that when gate is false, a merchant with an existing `jenni_store_id` returns successfully (idempotent no-op).

### 3.2 Shipment Dispatch Gate Tests
Run command: `node --test tests/jenni-dispatch-gate.test.mjs`

- **Results**: 3/3 tests passed successfully.
  - ✅ **Test 2 (dispatchOrderToJenni throws ForbiddenException when JENNI_ALLOW_SHIPMENT_DISPATCH is false)**: Verified that when dispatch gate is false, calling `dispatchOrderToJenni` throws `ForbiddenException` (403) and `jenniClient.createShipments` is never called.
  - ✅ **Test 3 (dispatchOrderToJenni proceeds past gate when JENNI_ALLOW_SHIPMENT_DISPATCH is true)**: Verified that when dispatch gate is true, execution proceeds past the gate to subsequent steps.

---

## 4. Operational Safety Confirmations

- ⚠️ **Zero External Jenni API Calls**: No real Jenni API calls or requests were made during these changes. All testing utilized mock clients.
- ⚠️ **Zero Env Flags Changed**: No environment flags in Render or local `.env` have been changed to `true`. Both `JENNI_ALLOW_STORE_PROVISIONING` and `JENNI_ALLOW_SHIPMENT_DISPATCH` remain set to `false`.

---

## 5. Next Steps

1. **Supervisor Review**: Awaiting supervisor review of code changes and hardening gates.
2. **Controlled Test Execution**: Once approved, temporarily enable `JENNI_ALLOW_STORE_PROVISIONING=true` in Render to perform **exactly one** manual Create/Sync attempt for `alarsh` via the Admin UI, then immediately set it back to `false` and verify DB and audit tables.
