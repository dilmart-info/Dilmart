# Launch Critical Packages Governance & Security Audit Report

**Repository:** `cylendralabs-blip/DilMart-Store`  
**Base Commit (main):** `3a40ee149ecde67a04e6342f3da70214990a1afe`  
**Audit Date:** 2026-07-24  
**Audit Status:** `REVISED_SECURITY_HARDENED`

---

## 1. Stack Topology & PR Structure

| PR       | Branch Name                              | Base Branch                           | Draft PR Link                                                     | Status                         |
| :------- | :--------------------------------------- | :------------------------------------ | :---------------------------------------------------------------- | :----------------------------- |
| **PR-1** | `feat/pr1-account-claim-recovery`        | `main`                                | [#53](https://github.com/cylendralabs-blip/DilMart-Store/pull/53) | `READY_FOR_STAGING_DEPLOYMENT` |
| **PR-2** | `feat/pr2-atomic-cancellation-engine`    | `feat/pr1-account-claim-recovery`     | [#54](https://github.com/cylendralabs-blip/DilMart-Store/pull/54) | `READY_FOR_STAGING_DEPLOYMENT` |
| **PR-3** | `feat/pr3-checkout-idempotency`          | `feat/pr2-atomic-cancellation-engine` | [#55](https://github.com/cylendralabs-blip/DilMart-Store/pull/55) | `READY_FOR_STAGING_DEPLOYMENT` |
| **PR-4** | `feat/pr4-customer-cancellation-returns` | `feat/pr3-checkout-idempotency`       | [#56](https://github.com/cylendralabs-blip/DilMart-Store/pull/56) | `READY_FOR_STAGING_DEPLOYMENT` |

---

## 2. Comprehensive Security Hardening Audit Summary

### PR-1: Account Claim, Phone Verification & Password Recovery

- **Security Enhancements Implemented:**
  - **Phone Binding Protection:** `AccountClaimService.requestClaimFromProvisional` verifies that OTP challenge phone number strictly matches provisional customer's recorded profile/order phone number.
  - **Action Token Integrity:** Expanded `auth_action_tokens` migration to store `phone_normalized` and `challenge_id`. `validateAndConsumeActionToken` returns verified phone number.
  - **Account Takeover Mitigation:** `completeClaim` verifies `verifiedPhone === sourceProfilePhone`, preventing OTP for phone B from merging/resetting phone A's account.

### PR-2: Atomic Cancellation Engine & Merchant Rejection

- **Security Enhancements Implemented:**
  - **Strict CAS Constraint:** `cancel_order_atomic` RPC enforces `merchant_decision_status = 'pending'` AND `status = 'new'` when `p_mark_merchant_rejected = true`. Rejects decision if already processed.
  - **Notification Idempotency:** Skips sending customer/admin notifications when `result.already_cancelled` is `true`.

### PR-3: Checkout Idempotency & Post-Checkout Reliability

- **Security Enhancements Implemented:**
  - **Processing Lock Enforcement:** `CheckoutService.submit` halts execution immediately with HTTP 202 (`CHECKOUT_IN_PROGRESS`) if attempt key is in `processing` state, preventing concurrent double-submits.
  - **Order Record Linkage:** `completeAttempt` updates `orders.checkout_attempt_id` and `orders.checkout_request_hash` directly in PostgreSQL.

### PR-4: Customer Cancellation & Return Requests Engine

- **Security Enhancements Implemented:**
  - **Route & Role Scoping:** Separated `/admin/*` (`@Roles("super_admin", "admin")`) and `/merchant/*` (`@Roles("merchant_owner", "merchant_manager", "merchant_staff")`).
  - **Merchant Scope Enforcement:** `OrderReturnsService` filters queries and updates by `orders.merchant_id = resolvedMerchantId`. RLS policies in PostgreSQL enforce `merchant_users` table checks.
  - **Correct Delivery Transition:** `markReturnItemReceived` calls `DeliveryOperationsService.markReturned`, transitioning order status to `returned` (NOT `cancelled`) and triggering full financial reversals.
  - **Return Window Validation:** Strict validation against `orders.delivered_at` timestamp with `RETURN_WINDOW_DAYS` (7 days default).
  - **Notification Schema Alignment:** Insert into `user_notifications` uses canonical columns (`user_id, title, message, link, is_read: false`).

---

## 3. Verification & CI Workflow Evidence

- **GitHub Actions CI Workflow:** Created `.github/workflows/ci.yml`.
- **Node Unit & Integration Tests:** `39/39 PASSED` (`node --test tests/*.test.mjs`, policy, hardening, commercial).
- **Frontend & Backend Build:** `npm run build` PASSED (0 errors).
- **Architecture Guard:** `npm run arch:guard` PASSED (0 violations).

---

## 4. Final Recommendation & Staging Sequence

1. Deploy migrations (`20260724140000_account_claim_system.sql` to `20260724170000_order_returns_system.sql`) to Staging database (`ztplxqlthuqkuktbznbo`).
2. Merge PR-1 into `main` after staging schema verification.
3. Rebase and merge PR-2 -> PR-3 -> PR-4 sequentially.
