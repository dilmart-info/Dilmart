# Batch M7.4 — Implementation Report

## Batch

M7.4 — Policy-Driven Replay Governance

## Date

2026-04-22

## Status

**Completed**

---

## 1) What Was Implemented

- Added replay-governance policy checks in backend notifications replay flow.
- Enforced policy on both:
  - manual replay path (admin reconciliation action)
  - scheduled replay path (M7.1 bounded replay job)
- Extended audit payload for manual replay to include policy-block context.

---

## 2) Replay Governance Rules

Implemented the following policy controls:

- **Window cap per dispatch key**
  - limit replay attempts for a dispatch key within a rolling window
  - defaults:
    - `OUTBOUND_REPLAY_WINDOW_MINUTES=60`
    - `OUTBOUND_REPLAY_MAX_ATTEMPTS_PER_WINDOW=5`

- **Cooldown by alert signature (alert_type)**
  - scheduled replay is blocked when a recent attempt exists for same alert type in cooldown window
  - default:
    - `OUTBOUND_REPLAY_SIGNATURE_COOLDOWN_MINUTES=15`

---

## 3) Behavior Outcomes

- Replay request now returns policy metadata:
  - `blocked_by_policy`
  - `reason`
  - `mode` (`manual` or `scheduled`)
- Manual replay requests are still accepted at API boundary but can be policy-blocked deterministically.
- Scheduled replay job now executes replays with `mode: "scheduled"` to activate stricter cooldown behavior.

---

## 4) Config Surface

Updated `backend/.env.example` with:

- `OUTBOUND_REPLAY_WINDOW_MINUTES`
- `OUTBOUND_REPLAY_MAX_ATTEMPTS_PER_WINDOW`
- `OUTBOUND_REPLAY_SIGNATURE_COOLDOWN_MINUTES`

---

## 5) Definition of Done Check

- [x] Replay policy limits applied to manual and scheduled replay paths
- [x] Cooldown behavior enforced for scheduled replay mode
- [x] Policy-block outcomes observable in replay response and audit payload
- [x] Configuration-driven governance controls exposed in env contract

---

## 6) Next Step

Proceed with **M7.5 — M7 Closure & Operations Playbook Update**.

