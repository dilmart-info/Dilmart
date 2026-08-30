# DilMart Store — Full Context Handoff (M1 → M8)

## 1) Purpose

This document is a complete handoff context so a new chat can continue work without re-discovery.
Current phase progression is closed through M8.

---

## 2) Current Global Status

- M1: Closed
- M2: Closed
- M3: Closed
- M4: Closed
- M5: Closed
- M6: Closed
- M7: Closed
- M8: Closed

Primary closure references:

- `docs/m6-final-closure-report.md`
- `docs/m7-final-closure-report.md`
- `docs/m8-final-closure-report.md`
- `docs/batch-m3.9-commercial-readiness-rulebook.md` (addenda through M8)

---

## 3) Architecture Snapshot

### Frontend

- React + Vite + TypeScript
- React Query for server state
- Zustand for local app stores (cart/wishlist and related flows)
- Admin surfaces include governance, executive, and reconciliation consoles

### Backend

- NestJS modular architecture
- Supabase-backed persistence (admin/service-role access in backend)
- Role-aware route protections and actor context patterns
- Operational modules evolved for analytics, notifications, governance, and reconciliation

---

## 4) Major Capability Evolution

### M4 (Automation/Intelligence baseline)

- KPI contract and telemetry mapping
- Operational alerts and scorecards
- Funnel visibility and experiments baseline
- Governance and policy UX baselines (initially with local-browser fallback patterns)

### M5 (Durability/Auditability)

- Server-side ingestion/persistence contracts for governance and experiments
- Server-first reads with fallback continuity where needed
- Outbound notification foundation (in-app + external dispatch path baseline)

### M6 (Reliability/Operations hardening)

- Server-only cutover controls (fallback behind explicit runtime flag)
- Ingestion health and retention operations endpoints
- Outbound attempt tracking + retry policy for transient failures
- Admin reconciliation console and manual replay controls

### M7 (Automation + Multi-channel + Recovery governance)

- Scheduled reliability jobs
- Multi-channel routing/failover (webhook/email)
- Reconciliation diagnostics (taxonomy + effectiveness)
- Replay governance (window caps, cooldown policy, auditable policy blocks)

### M8 (Deterministic recovery maturity)

- Dead-letter lifecycle baseline (`new`, `retrying`, `dead_lettered`, `resolved`)
- Provider acknowledgment telemetry in outbound attempts
- Replay lifecycle console actions and triage filters
- Policy trend intelligence (policy-block rate, failure clusters, recovery lead time)

---

## 5) Key Runtime/Operational Controls

Commonly used environment toggles and controls are centered around:

- Local fallback controls (server-first/server-only behavior)
- Outbound channel routing/failover order
- Outbound retry and replay policy windows/cooldowns
- Scheduled job enablement and bounded replay caps

Reference implementation points:

- `backend/src/modules/notifications/notifications.service.ts`
- `backend/src/modules/jobs/jobs.service.ts`
- `src/lib/runtime-flags.ts`
- `backend/.env.example`

---

## 6) Key Admin Operations Surfaces

- Reconciliation console:
  - `src/pages/admin/Reconciliation.tsx`
  - includes failed attempts, provider ack metadata, lifecycle queue, and trend cards
- Admin API client bindings:
  - `src/lib/api-client.ts`
- Admin backend endpoints:
  - `backend/src/modules/admin/admin.controller.ts`
  - `backend/src/modules/admin/admin.service.ts`

---

## 7) Rulebook / Governance Source of Truth

Canonical governance policy base and addenda:

- `docs/batch-m3.9-commercial-readiness-rulebook.md`
  - M4 addendum
  - M5 addendum
  - M6 addendum
  - M7 addendum
  - M8 addendum

Use this as policy source before changing operational semantics.

---

## 8) Known Accepted Limitations (Post-M8)

- Some integrations remain webhook-style; provider-native deep semantics are still limited.
- Dead-letter lifecycle is operationally complete for baseline governance but not a full incident platform.
- Trend intelligence is baseline windowed analytics (non-predictive).
- Graceful schema compatibility patterns are present in some paths to avoid runtime breakage during schema parity lag.

---

## 9) Recommended Next Step

Start M9 with doc-first flow:

1. `docs/m9-architecture-plan.md`
2. `docs/batch-m9.0-pre-implementation-plan.md`
3. `docs/batch-m9.0-implementation-report.md`

Suggested M9 direction:

- deeper resilience orchestration
- stronger provider normalization
- advanced governance analytics and long-horizon operational scorecards

---

## 10) New-Chat Bootstrap Prompt (Copy/Paste)

Use the following in a new chat to resume instantly:

```text
Please continue DilMart Store from the latest closed phase.

Read these files first and treat them as source of truth:
- docs/context-handoff-m1-to-m8.md
- docs/m8-final-closure-report.md
- docs/m8-architecture-plan.md
- docs/batch-m3.9-commercial-readiness-rulebook.md

Current expectation:
- M1..M8 are closed.
- Start M9 in doc-first mode (architecture plan + M9.0 pre-implementation + M9.0 implementation report), then proceed to implementation batches.

Constraints:
- Preserve server-first/reliability governance patterns.
- Keep auditability and operations safety as primary design goals.
- Continue the same batch reporting discipline.
```

---

## 11) Verification Note

If any implementation behavior appears inconsistent with this handoff, verify against:

- the latest `m*-final-closure-report.md` for that phase
- corresponding `batch-m*.implementation-report.md` files
- current backend/frontend module code before applying new changes
