# Merchant Push Phase 1 — Closure Report

**Date:** 2026-07-25  
**Phase:** Merchant New Order Alerts — Phase 1 (Web Push & Dashboard Alert)  
**PR:** #59 (`feat/merchant-push-alerts-phase1`)  
**Status:** CODE COMPLETE — DEVICE VALIDATION PENDING  
**Latest micro-patch pending CI:** PWA `start_url=/merchant/`, real 192/512 icons, Settings device-id state refresh, anon schema-gate assertions.

---

## Summary

Phase 1 code for merchant Web Push, delivery ledger, atomic acknowledgement, merchant-scoped PWA, and integration tests is complete on the PR branch. This is **not** a full production pass.

## Explicit blockers before merge / remote migration

- Migration is **not** applied remotely (staging/production).
- VAPID is **not** configured in production.
- Real-device smoke testing remains **mandatory**.
- Phase 2 (WhatsApp / Meta escalation) is **blocked** until device validation passes.

## Hardening included in final patch

1. Atomic acknowledgement via `acknowledge_merchant_notification_atomic` (service_role only).
2. `UNIQUE (merchant_id, endpoint)` so one browser can register for multiple merchants.
3. Direct client SELECT/INSERT/UPDATE/DELETE revoked on `merchant_push_subscriptions` (and deliveries).
4. Merchant PWA manifest + SW scoped to `/merchant/` only (legacy root SW cleaned up).
5. UI separates merchant push policy vs this-device registration vs active device count.
6. Test action labeled as send-to-all registered devices.
7. Sound loop uses `sound_repeat_interval_seconds` / `sound_max_duration_seconds` from settings.
8. Schema gate + Nest service/database integration tests + CI step `test:merchant-push`.

## Explicit non-goals confirmed

- No WhatsApp / Meta integration or WhatsApp fallback columns.
- No admin diagnostics feature.
- No native / Capacitor Push.
- No checkout, pricing, inventory, or order-state-machine changes.
- No Accept button inside system Push.
- No caching of authenticated API responses in the service worker.
- No remote `supabase db push` / production VAPID configuration as part of this phase.

## Device smoke checklist (required before Phase 2)

1. On a real merchant phone under `/merchant`, enable notifications and register the device.
2. With dashboard closed, create a test order → system Push arrives.
3. Notification click opens the correct order and records acknowledge.
4. Open dashboard plays sound using merchant timing settings; ack stops it.
5. Ack on device A stops banner/sound on device B.
6. Partial multi-device failure retry does not re-push to already-accepted devices.
7. Customer/admin pages do **not** show merchant PWA name “لوحة التاجر”.

## Verdict

**CODE COMPLETE — DEVICE VALIDATION PENDING**
