# Walkthrough — Al Arsh Commercial Rules Setup & Verification

This document summarizes the steps taken to configure, verify, and clean up the commercial terms and financial account of the merchant **شركة العرش (Al Arsh)**.

---

## 1. Configured Database Rules
The following four specific rules have been added/updated in the `public.commercial_rules` database table for merchant ID `65575f7c-4204-44d0-99a0-fc1902e2ed91`. A priority of `1000` was used to override all channel-specific or global commission overrides.

Any previous active rules for this merchant were deactivated (`is_active = false`) to ensure there is exactly one active rule per rule type.

| Rule Name | `rule_type` | `scope_type` | `value_type` | `value` | `priority` | `conditions` | Status |
|---|---|---|---|---|---|---|---|
| **Al Arsh Commission 15%** | `commission` | `merchant` | `percentage` | `15` | `1000` | `{}` | ✅ Active |
| **Al Arsh Assisted Fee 0%** | `assisted_fee` | `merchant` | `percentage` | `0` | `1000` | `{}` | ✅ Active |
| **Al Arsh Platform Fee 0%** | `platform_fee` | `merchant` | `percentage` | `0` | `1000` | `{}` | ✅ Active |
| **Al Arsh Delivery Billing Mode customer_pays** | `delivery_billing` | `merchant` | `fixed` | `0` | `1000` | `{"delivery_billing_mode": "customer_pays"}` | ✅ Active |

---

## 2. Verification Results (Simulation)
We ran a simulator using the exact logic of the compiled `commercial-rule-resolution` and `order-finance` engine from the NestJS backend against the live database rules. A mock order of `100,000 IQD` merchandise value was simulated across all three channels.

### A) Channel: `web_checkout`
* **Resolved Rates**:
  * Commission Rate: `15%`
  * Assisted Fee: `0%`
  * Platform Fee: `0%`
  * Delivery Billing Mode: `customer_pays`
* **Financial Snapshot**:
  * Merchandise Subtotal: `100,000`
  * Discount: `0`
  * Platform Commission Amount: `15,000`
  * Platform Assisted Fee: `0`
  * Platform Extra Fee: `0`
  * Merchant Gross Amount: `100,000`
  * **Merchant Net Amount**: `85,000`
  * Platform Net Revenue: `15,000`
* **Invariants**: ✅ Passed

### B) Channel: `whatsapp_assisted`
* **Resolved Rates**:
  * Commission Rate: `15%`
  * Assisted Fee: `0%`
  * Platform Fee: `0%`
  * Delivery Billing Mode: `customer_pays`
* **Financial Snapshot**:
  * Merchandise Subtotal: `100,000`
  * Platform Commission Amount: `15,000`
  * Platform Assisted Fee: `0`
  * Platform Extra Fee: `0`
  * Merchant Gross Amount: `100,000`
  * **Merchant Net Amount**: `85,000`
  * Platform Net Revenue: `15,000`
* **Invariants**: ✅ Passed

### C) Channel: `manual_assisted`
* **Resolved Rates**:
  * Commission Rate: `15%`
  * Assisted Fee: `0%`
  * Platform Fee: `0%`
  * Delivery Billing Mode: `customer_pays`
* **Financial Snapshot**:
  * Merchandise Subtotal: `100,000`
  * Platform Commission Amount: `15,000`
  * Platform Assisted Fee: `0`
  * Platform Extra Fee: `0`
  * Merchant Gross Amount: `100,000`
  * **Merchant Net Amount**: `85,000`
  * Platform Net Revenue: `15,000`
* **Invariants**: ✅ Passed

---

## 3. Production Real Order Verification
A real order was created on the database for Al Arsh. The resulting database record verified the following persisted financial parameters:

* **Order Number**: `DUK-260706-2424`
* **Persisted Database Record**:
```json
{
  "order_number": "DUK-260706-2424",
  "platform_commission_rate": "15.0000",
  "platform_commission_amount": "15000.00",
  "platform_assisted_fee_amount": "0.00",
  "platform_extra_fee_amount": "0.00",
  "merchant_gross_amount": "100000.00",
  "merchant_net_amount": "85000.00",
  "delivery_fee_charged": "5000.00",
  "delivery_billing_rule_id": "73ca5117-551e-4510-bcdb-b26b9ae6e3a7"
}
```

* **Invariants**:
  * ✅ `platform_commission_rate` === 15
  * ✅ `platform_commission_amount` === 15000
  * ✅ `platform_assisted_fee_amount` === 0
  * ✅ `platform_extra_fee_amount` === 0
  * ✅ `merchant_gross_amount` === 100000
  * ✅ `merchant_net_amount` === 85000
  * ✅ `delivery_billing` resolved to rule `73ca5117-551e-4510-bcdb-b26b9ae6e3a7` (customer_pays)

---

## 4. Production Account Cleanup & Reset

To deliver Al Arsh with a clean **`0 IQD outstanding balance`**, a complete database cleanup was executed.

### A) Exempted Orders (Untouched)
The following three orders were preserved as historical records:
1. `DUK-260630-0591` (Status: `delivered`, Net: `11,280 IQD`, Comm: `720 IQD`)
2. `DUK-260627-9163` (Status: `contacted`, Net: `4,700 IQD`, Comm: `300 IQD`)
3. `DUK-260430-2387` (Status: `returned`, Net: `10,000 IQD`, Comm: `0 IQD`)

### B) Neutralization of Test/Stale Orders
All other **24 orders** under Al Arsh were neutralized (`status = 'cancelled'`, `delivery_status = 'cancelled'`, `settlement_status = 'reversed'`) and annotated with a cleanup note.
* Active ledger entries for neutralized delivered order `DUK-260630-8029` were marked as `reversed` (with reason code `MANUAL_REVIEW_REVERSAL`), clearing the accrued balance.
* Product stock values decremented by test orders were incremented back (restoring **33 items** to stock).
* There are no active Jenni shipments or payout batches.
* **Outstanding balance for Al Arsh is now exactly `0.00 IQD`.**

---

## Conclusion
The commercial rules for **شركة العرش (Al Arsh)** have been successfully locked at **15% total platform commission** across all checkout paths, protecting their margins from any global or channel-specific overrides.
