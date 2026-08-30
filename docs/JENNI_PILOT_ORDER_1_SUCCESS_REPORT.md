# Jenni Pilot Order #1 — Success Report

**Date:** 2026-06-27  
**Status:** ✅ PILOT SUCCESSFUL — Full integration cycle verified  
**Classification:** Internal — Do not share externally

---

## Executive Summary

Jenni Pilot Order #1 completed the full end-to-end delivery integration cycle
successfully. From checkout creation through automatic webhook delivery, every
stage of the DilMart ↔ Jenni integration was verified in production with real
data. The system correctly dispatched a shipment, received automatic status
updates via webhook, and reflected the new state in the database without any
manual intervention beyond the initial sync.

---

## Identifiers

| Field             | Value                                  |
| ----------------- | -------------------------------------- |
| Order Number      | `DUK-260627-9163`                      |
| Order ID          | `f41c55bc-681a-4178-ab09-0d36f689eb48` |
| Jenni Shipment ID | `9347052`                              |
| Jenni Merchant ID | `17168`                                |
| Jenni Store ID    | `17900`                                |
| Merchant Name     | شركة العرش                             |
| Area              | المنصور                                |
| Governorate       | بغداد (`BGD`)                          |
| COD Amount        | 10,000 IQD                             |
| Payment Method    | COD (`cod`)                            |
| Channel           | `web_checkout`                         |

---

## Timeline of Events

| Time (UTC) | Event                                                                    | Source    |
| ---------- | ------------------------------------------------------------------------ | --------- |
| `16:34:07` | Checkout submitted — `POST /api/checkout/submit`                         | Frontend  |
| `16:34:07` | Order created — HTTP `201 Created`                                       | Backend   |
| `16:34:21` | DB verified — `channel=web_checkout`, `status=new`                       | Supabase  |
| `16:44:50` | Render redeployed with `JENNI_ALLOW_SHIPMENT_DISPATCH=true`              | Render    |
| `16:49:17` | Dispatch called — `POST /api/admin/orders/.../delivery/dispatch-jenni`   | Admin     |
| `16:49:50` | Jenni accepted — HTTP `201`, `shipment_id=9347052`                       | Jenni API |
| `16:49:51` | `delivery_events`: `assigned_to_company`                                 | Backend   |
| `16:49:52` | `delivery_events`: `provider_dispatched`                                 | Backend   |
| `16:49:52` | `JENNI_ALLOW_SHIPMENT_DISPATCH` set back to `false`                      | Owner     |
| `17:07:19` | Manual sync triggered                                                    | Admin     |
| `17:07:20` | DB updated — `provider_current_step=NEW_WITH_PA`                         | Backend   |
| `17:07:20` | `delivery_provider_sync_events` — `source=manual_sync`                   | Backend   |
| `17:49:43` | **Automatic webhook received** — `POST /v2/push/update-status`           | Jenni     |
| `17:49:44` | DB updated — `provider_current_step=IN_SC`, `delivery_status=in_transit` | Backend   |
| `17:49:44` | `delivery_events`: `in_transit`                                          | Backend   |
| `17:49:45` | `delivery_events`: `provider_synced`                                     | Backend   |

---

## Verified Capabilities

| Capability                                            | Result  |
| ----------------------------------------------------- | ------- |
| Production checkout creates order                     | ✅ Pass |
| `orders.channel = web_checkout`                       | ✅ Pass |
| Jenni shipment dispatch via admin API                 | ✅ Pass |
| Jenni acceptance with `shipment_id`                   | ✅ Pass |
| `order_delivery_integrations` row created             | ✅ Pass |
| `dispatch_status = dispatched`                        | ✅ Pass |
| Manual sync via admin API                             | ✅ Pass |
| `provider_current_step` updated from sync             | ✅ Pass |
| `delivery_provider_sync_events` `source=manual_sync`  | ✅ Pass |
| Automatic webhook received from Jenni                 | ✅ Pass |
| `delivery_provider_sync_events` `source=webhook`      | ✅ Pass |
| `provider_current_step` updated from webhook          | ✅ Pass |
| `provider_current_stage` populated (`SORTING_CENTER`) | ✅ Pass |
| `orders.delivery_status` transitioned to `in_transit` | ✅ Pass |
| `delivery_events` chain complete (5 events)           | ✅ Pass |
| No duplicate dispatch                                 | ✅ Pass |
| No Jenni gate violation                               | ✅ Pass |
| `JENNI_ALLOW_SHIPMENT_DISPATCH` closed after dispatch | ✅ Pass |

---

## Webhook Proof

The automatic webhook from Jenni was received at `17:49:43 UTC` —
approximately 42 minutes after dispatch. It correctly triggered a full DB
update without any manual intervention.

### `delivery_provider_sync_events` — Webhook Row

| Field          | Value                     |
| -------------- | ------------------------- |
| `source`       | `webhook`                 |
| `action_code`  | `MOVE_TO_STORE`           |
| `current_step` | `IN_SC`                   |
| `created_at`   | `2026-06-27 17:49:43 UTC` |

### `delivery_events` — Webhook-Triggered

| Event             | Actor               | From → To                          | Notes                                     |
| ----------------- | ------------------- | ---------------------------------- | ----------------------------------------- |
| `in_transit`      | `admin`             | `assigned_to_company → in_transit` | `Jenni webhook: MOVE_TO_STORE → IN_SC`    |
| `provider_synced` | `external_provider` | `in_transit → in_transit`          | `MOVE_TO_STORE / IN_SC / داخل مركز الفرز` |

---

## Final DB State

### `orders`

| Field             | Value          |
| ----------------- | -------------- |
| `status`          | `new`          |
| `channel`         | `web_checkout` |
| `delivery_status` | `in_transit`   |

### `order_delivery_integrations`

| Field                      | Value                     |
| -------------------------- | ------------------------- |
| `provider_code`            | `jenni`                   |
| `provider_shipment_id`     | `9347052`                 |
| `dispatch_status`          | `dispatched`              |
| `provider_current_step`    | `IN_SC`                   |
| `provider_current_step_ar` | `داخل مركز الفرز`         |
| `provider_current_stage`   | `SORTING_CENTER`          |
| `dispatched_at`            | `2026-06-27 16:49:50 UTC` |
| `last_synced_at`           | `2026-06-27 17:49:44 UTC` |

### `delivery_events` Chronological Summary

| #   | Event                 | Actor               | From → To                                  |
| --- | --------------------- | ------------------- | ------------------------------------------ |
| 1   | `assigned_to_company` | `admin`             | `pending_assignment → assigned_to_company` |
| 2   | `provider_dispatched` | `admin`             | `— → assigned_to_company`                  |
| 3   | `provider_synced`     | `external_provider` | `assigned_to_company` (manual sync)        |
| 4   | `in_transit`          | `admin`             | `assigned_to_company → in_transit`         |
| 5   | `provider_synced`     | `external_provider` | `in_transit` (webhook)                     |

---

## Safety State at Phase Close

| Gate                                | Value   |
| ----------------------------------- | ------- |
| `JENNI_ALLOW_SHIPMENT_DISPATCH`     | `false` |
| `JENNI_ALLOW_MERCHANT_PROVISIONING` | `false` |
| `JENNI_ALLOW_STORE_PROVISIONING`    | `false` |
| `JENNI_DIAGNOSTICS_ENABLED`         | `false` |
| Second dispatch created             | No      |
| Backend/frontend code changed       | No      |
| Env vars changed (after gate close) | No      |
| Temp scripts left in repo           | No      |

---

## Remaining Items

### Immediate Monitoring

| Item                                        | Priority   | Notes                                                           |
| ------------------------------------------- | ---------- | --------------------------------------------------------------- |
| Monitor Jenni webhooks for step progression | High       | Shipment live in Jenni system                                   |
| ~~Verify sticker/AWB~~                      | ~~Medium~~ | ✅ Sticker tested and passed — see Sticker Verification section |
| Pilot Order #2 after owner approval         | High       | After phase review                                              |

### Post-Pilot Security Cleanup — Required Before Scale

> [!CAUTION]
> **Secret rotation is mandatory before Pilot Order #2 or any production scale.**
> Credentials were used in controlled test scripts during this session.
> No harm occurred, but rotation removes exposure risk permanently.

| Item                                                      | Priority     |
| --------------------------------------------------------- | ------------ |
| Rotate `JENNI_WEBHOOK_TOKEN` in Render                    | **Critical** |
| Rotate `SUPABASE_SERVICE_ROLE_KEY` in Render              | **Critical** |
| Reset `admin@cylendra.com` to a secure permanent password | **Critical** |
| Purge active sessions for the temp admin password         | High         |
| Audit `backend/.env` — confirm not committed to git       | High         |

### UI/UX Improvements

| Item                                                  | Priority |
| ----------------------------------------------------- | -------- |
| Show `provider_current_step_ar` in admin order detail | Medium   |
| Show `delivery_events` timeline in admin UI           | Medium   |
| Add delivery status badge to merchant order list      | Medium   |
| Add sticker download button in admin order detail     | Low      |

---

## Sticker / PDF Verification

**Date:** 2026-06-27  
**Result:** ✅ PASSED

### Endpoint Tested

```
GET /api/orders/f41c55bc-681a-4178-ab09-0d36f689eb48/jenni-sticker
```

### Response

| Field               | Value                                                                               |
| ------------------- | ----------------------------------------------------------------------------------- |
| HTTP Status         | `200 OK` ✅                                                                         |
| Content-Type        | `application/pdf` ✅                                                                |
| Content-Disposition | `inline; filename="sticker-f41c55bc-....pdf"` ✅                                    |
| PDF Size            | `39,647 bytes` (~38.7 KB) ✅                                                        |
| PDF Magic Bytes     | `%PDF` ✅ — valid PDF file                                                          |
| PDF Opens           | ✅ Opens correctly                                                                  |
| PDF Content Format  | Image-based/compressed (FlateDecode, DeviceRGB) — normal for barcode/label stickers |

### Notes

- The sticker PDF is image-based, which is the standard format for shipping
  labels (barcode, QR code, and shipment data are rendered as images).
  Text is not directly extractable from the binary, but the PDF opens and
  renders correctly.
- The endpoint correctly guards against generating a sticker before dispatch
  (`dispatch_status` must be `dispatched` or `synced`).
- No state mutation occurred: no new dispatch, no Jenni API status call,
  no env/secrets/code changes.
- `JENNI_ALLOW_SHIPMENT_DISPATCH=false` was confirmed throughout the test.

---

## Technical Notes

- `airway_bill_number` is `null` at dispatch creation. Jenni assigns it after
  physical processing. It will populate on a future webhook.
- The manual sync endpoint (`sync-jenni`) works correctly as a fallback when
  webhooks are delayed or missed.
- The duplicate-detection system worked: only one `order_delivery_integrations`
  row exists despite multiple test invocations.
- The `payload_hash` column in `delivery_provider_sync_events` correctly
  de-duplicated identical Jenni payloads.
- PR #19 fixed two production blockers before this pilot:
  - `orders.channel` NOT NULL constraint (missing `p_channel` in RPC call)
  - `regions.is_active` 42703 error (stale column filter in `ShippingService`)
