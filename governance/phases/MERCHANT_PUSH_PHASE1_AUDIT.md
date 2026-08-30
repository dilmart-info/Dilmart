# Audit Notes — Merchant Push Phase 1 (Amended)

Supervisor verdict: APPROVED WITH MANDATORY AMENDMENTS (applied).

Amendments locked in:
1. `merchant_push_deliveries` per-subscription ledger
2. No WhatsApp columns in Phase 1
3. Revoke authenticated UPDATE on `merchant_notifications`
4. Realtime UPDATE for cross-device acknowledgement
5. `is_read` ≠ `acknowledged_at`
6. Push-only SW (no API cache); ack via authenticated page query param
7. Status vocabulary uses `accepted` (not delivered)
8. Minimal push payload + `notification_id`
9. Skip reasons for no subscriptions / push disabled
10. Settings: merchant_settings + per-device localStorage gesture unlock
