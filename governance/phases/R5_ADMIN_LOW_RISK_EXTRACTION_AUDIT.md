# Design & Audit Report — Phase R5: Admin Low-Risk Services Extraction

**Date:** 2026-07-02  
**Phase:** Phase R5 — Admin Low-Risk Services Extraction  
**Status:** COMPLETE  

---

## 1. Executive Summary
This design and audit report outlines the extraction of low-risk domain scopes from the monolithic `AdminService` into three new dedicated NestJS services: `AdminAnalyticsService`, `AdminCustomersService`, and `AdminOperationalAlertsService`. 

To maintain route, authorization, and API boundary compatibility:
1. `AdminService` remains as the sole façade/delegator injected into `AdminController`.
2. All signatures, input types, and response shapes are preserved exactly.
3. No business logic, database structure, or out-of-scope services are modified.

---

## 2. Methods Extracted & Left

### Methods Extracted by Service

#### `AdminAnalyticsService`
- `getAnalyticsOverview()`
- `getExecutiveGovernance()`

#### `AdminCustomersService`
- `getScopedCustomers(params)`

#### `AdminOperationalAlertsService`
- `maybeFanoutOperationalAlerts(alerts)`
- `computeOperationalAlerts()`
- `listAdminNotifications()`
- `markAdminNotificationRead(notificationId, actor)`
- `markAllAdminNotificationsRead(actor)`
- `listGovernanceTasks(taskIds)`
- `upsertGovernanceTask(taskId, payload, actor)`
- `listDesktopQuickLinks()`
- `createDesktopQuickLink(payload)`
- `updateDesktopQuickLink(id, payload)`
- `deleteDesktopQuickLink(id)`

---

### Methods Intentionally Left in `AdminService`
All other methods remain inside `AdminService` as the main façade delegator (e.g. staff management, commercial policy, jenni, finance). The controller interacts solely with `AdminService`.

---

## 3. Dependency Movement Map

The extraction moves specific dependencies to the new services, reducing `AdminService`'s dependency footprint:

| Target Service | Dependencies Transferred | Dependencies Left in `AdminService` |
| :--- | :--- | :--- |
| `AdminAnalyticsService` | `SupabaseAdminService`, `MerchantsService` | N/A (Delegated from `AdminService`) |
| `AdminCustomersService` | `SupabaseAdminService`, `ScopeResolverService` | N/A (Delegated from `AdminService`) |
| `AdminOperationalAlertsService` | `SupabaseAdminService`, `AuditService`, `NotificationsService` | N/A (Delegated from `AdminService`) |

`AdminService` injects these three new services:
- `AdminAnalyticsService`
- `AdminCustomersService`
- `AdminOperationalAlertsService`

---

## 4. Parity & Scope Statements

- **Route/Method Parity**: 100% maintained. All endpoints in `AdminController` remain bound to the same methods on `AdminService`.
- **Response-Shape Parity**: 100% maintained. All returned types match their exact original models.
- **Authorization/Scope Parity**: 100% maintained. All decorator roles (`@Roles(...)`) and active checks (e.g. `ScopeResolverService` inside customer resolution) function identically.

---

## 5. Test Updates Required
- The privacy tests in `tests/hardening-regression.test.mjs` have been updated to instantiate and test `AdminCustomersService` directly with mocked `Supabase` client and `ScopeResolverService` instead of instantiating `AdminService`.
- No other changes to tests are required since all public signatures and facade behaviors remain exactly the same.
- We will verify using the standard regression and policy matrix integration tests.

---

## 6. Risk Assessment & Rollback Plan

### Risk Assessment
- **Analytics & Alerts (Low Risk)**: Read-only dashboards and alerts do not write to financial states or dispatch shipments.
- **Customers Scoped (Low Risk)**: The logic continues to delegate scope mapping to `ScopeResolverService` with no behavioral changes.

### Rollback Plan
- **Pre-Merge Rollback**: Discard local changes and checkout `main`.
- **Post-Merge Rollback**: Revert the PR merge commit.
- **Wiring Check**: Keep `AdminService` facade endpoints strictly intact to ensure instant fallback if any sub-service needs debug.
