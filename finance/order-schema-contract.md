# Order Schema Contract (M11.0 Baseline)

This contract freezes the minimal `orders` shape required before M11 financial layers.

## Required Core Fields

- `id`
- `order_number`
- `merchant_id`
- `status`
- `channel`
- `subtotal`
- `discount`
- `delivery_cost`
- `total`
- `payment_method`
- `merchant_notes`
- `created_at`
- `updated_at`

## Financial Compatibility Field

- `financial_snapshot_version`
  - `0` = legacy order (pre-finance snapshot model)
  - `1` = finance-enabled order snapshot

## Notes

- This contract does not imply full M11 snapshot fields are live yet.
- M11.1+ must extend this contract without breaking backward compatibility.
