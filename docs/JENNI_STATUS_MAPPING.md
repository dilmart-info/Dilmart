# Jenni Status Mapping Document

This document provides a comprehensive mapping of status updates from the Jenni shipment provider (Al Zaeem Express) to the DilMart Store backend delivery statuses.

> **Last updated:** 2026-06-27  
> **Pilot shipment:** `9311578` (Order `DUK-260430-2387`) — step history confirmed via real query.

---

## 1. Overview: Step Status vs. Action Codes

- **Step Status:** Indicates where the shipment is currently in the lifecycle (e.g., `NEW_WITH_PA`, `IN_SC`, `OFD`, `DELIVERED`). This is what we sync.
- **Action Code:** Describes a specific action or event triggered during update-status calls (e.g., postponing a delivery, marking an issue). We **do not** call the mutating `/v2/shipments/update-status` API for status synchronization.
- **Safety Rule:** Never overwrite `dispatch_status` of the integration record to "synced" during read-only queries. It must remain "dispatched" (or "failed" if it failed dispatch).

---

## 2. Status Mapping Reference Table

Steps marked **Real Query Confirmed** were directly observed on the live pilot shipment `9311578` via `/v2/shipments/query`.

| Jenni Step                | Arabic Meaning                | Internal delivery_status | Delivery Event Type            | Financial Effect             | Requires Admin Review? | Source Confidence       |
| ------------------------- | ----------------------------- | ------------------------ | ------------------------------ | ---------------------------- | ---------------------- | ----------------------- |
| `NEW_WITH_PA`             | شحنات جديدة مع مندوب الاستلام | `assigned_to_company`    | `provider_synced`              | None                         | No                     | ✅ Real Query Confirmed |
| `IN_SC`                   | في مركز الفرز                 | `in_transit`             | `provider_synced`              | None                         | No                     | ✅ Real Query Confirmed |
| `PRINT_MANIFEST_DA`       | طباعة البيان مع مندوب التوصيل | `in_transit`             | `provider_synced`              | None                         | No                     | ✅ Real Query Confirmed |
| `OFD`                     | خارج للتوصيل                  | `in_transit`             | `provider_synced`              | None                         | No                     | ✅ Real Query Confirmed |
| `RTO_WITH_DA`             | راجع عند المندوب              | `returned`               | `provider_return`              | Triggers return flow         | No                     | ✅ Real Query Confirmed |
| `DELIVERED`               | تم التوصيل                    | `delivered`              | `provider_synced`              | Triggers delivery settlement | No                     | Docs                    |
| `SUCCESSFUL_DELIVERY`     | توصيل ناجح                    | `delivered`              | `provider_synced`              | Triggers delivery settlement | No                     | Docs                    |
| `DELIVERED_PRICE_CHANGED` | تم التوصيل مع تغيير السعر     | `delivered`              | `amount_change_reported`       | Financial discrepancy        | Yes                    | Docs                    |
| `POSTPONED`               | مؤجل                          | `in_transit`             | `provider_postponed`           | None                         | No                     | Docs                    |
| `POSTPONED_CONFIRMED`     | مؤجل مؤكد                     | `in_transit`             | `provider_postponed`           | None                         | No                     | Docs                    |
| `DELIVERY_REATTEMPT`      | إعادة محاولة التوصيل          | `in_transit`             | `provider_synced`              | None                         | No                     | Docs                    |
| `RTO_WH`                  | مرتجع في المستودع             | `returned`               | `provider_return`              | Triggers return flow         | No                     | Docs                    |
| `RETURN_APPROVED`         | مرتجع معتمد                   | `returned`               | `provider_return`              | Triggers return flow         | No                     | Docs                    |
| `RTO_CONFIRMED`           | مرتجع مؤكد                    | `returned`               | `provider_return`              | Triggers return flow         | No                     | Docs                    |
| `RTO_ARCHIVED`            | مرتجع مؤرشف                   | `returned`               | `provider_return`              | Triggers return flow         | No                     | Docs                    |
| `RETURNED_WITH_AGENT`     | مرتجع مع الوكيل               | `returned`               | `provider_return`              | Triggers return flow         | No                     | Docs                    |
| `PARTIALLY_DELIVERED`     | مستلم جزئياً                  | `in_transit`             | `provider_partially_delivered` | Discrepancy, cash collected  | Yes                    | Docs                    |

### Operational Note — `RTO_WITH_DA`:

- **Arabic confirmed:** `راجع عند المندوب`
- **Meaning:** The return flow has started. The shipment is physically with the delivery agent — it has **not yet reached the warehouse**.
- **Current internal mapping:** `returned` (closes the delivery lifecycle).
- **Future review:** Consider whether `RTO_WITH_DA` should map to a separate `return_in_progress` status (if such a state is added to the system). For now, mapping remains `returned`. Do not change backend mapping without explicit approval.

### Confirmed Step History — Pilot Shipment `9311578`:

```
NEW_WITH_PA → IN_SC → PRINT_MANIFEST_DA → OFD → RTO_WITH_DA
```

All five steps above were observed via live query and are marked **Real Query Confirmed**.

### Unknown or Unmapped Steps

- **Internal delivery_status:** Remains unchanged.
- **Delivery Event Type:** `provider_synced`.
- **Action:** Store the unknown step and the raw response payload in `provider_last_payload` and flag it for review in the Admin dashboard.

---

## 3. Webhook Configuration

### Correct Backend Webhook URL:

```
POST https://DilMart-store-backend.onrender.com/v2/push/update-status
```

### Incorrect Frontend URL (returns 404):

```
POST https://store.DilMart.org/v2/push/update-status
```

> **Note:** `store.DilMart.org` is the React SPA (Netlify frontend). It has no API endpoint.  
> `DilMart-store-backend.onrender.com` is the NestJS backend (Render). It handles all webhook processing.  
> Jenni must register **only the backend URL**.

---

## 4. Webhook Validation Rules

To ensure webhook updates are validated:

1. **Bearer Token Validation:** Incoming POST requests must have an `Authorization` header with the correct secret `JENNI_WEBHOOK_TOKEN`.
2. **System Code Validation:** The payload must match `system_code = STYL_AI`.
3. **Idempotency & Deduplication:** Check `payload_hash` in `delivery_provider_sync_events`. Skip if already recorded (returns `duplicate: true`).
4. **Non-destructive mapping:** Safe transitions only. Do not override final statuses (`delivered`, `returned`, `failed`, `cancelled`).

### Verified Webhook Connectivity (2026-06-27):

- URL: `https://DilMart-store-backend.onrender.com/v2/push/update-status`
- Response: `200 OK`, `{"ok":true,"processed":1,"results":[{"ok":true,"duplicate":true}]}`
- Bearer token: ✅ accepted
- System code: ✅ validated
- Duplicate handling: ✅ working

---

## 5. Launch Hardening Notes (PR-1)

### Merchant Portal Constraints

- When an order has been successfully dispatched to Jenni (`isJenniDispatched === true`), the merchant cannot manually set delivery-controlled statuses: `shipped` (تم الشحن), `delivered` (تم التوصيل), `returned` (مرجع), `failed` (فشل التوصيل), or `cancelled` (ملغي) via the status dropdown.
- The dropdown options are restricted strictly to: `new` (جديد), `contacted` (تم التواصل), and `preparing` (قيد التجهيز).
- If the order is already in a status outside of these three, it will be displayed as a read-only badge above the select element, and the select element will render with a disabled placeholder.
- A warning notice is displayed:  
  `بعد إرسال الطلب إلى شركة التوصيل، يمكن للتاجر تحديث حالة التجهيز فقط. الإلغاء أو تعديل حالة التوصيل يحتاج تدخل الأدمن.`

### Database & Webhook Hardening

- **Schema Update:** The check constraint `delivery_events_event_type_check` has been dropped and recreated to support return and partial delivery event types: `provider_return` and `provider_partially_delivered`.
- **Event Metadata:** When syncing or receiving webhooks from Jenni, the mapper's `eventMetadata` (which includes postponement reasons or return reasons) is merged and stored directly in `delivery_events.metadata`.
