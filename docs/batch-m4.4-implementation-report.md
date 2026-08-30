# Batch M4.4 — Automated Merchant Nudges Implementation Report

## Status

**Completed**

Scope implemented: automated in-app merchant recommendation queue (Next Best Action) with priority and simple progress-state tracking.

---

## 1) What Was Implemented

## A) Nudge Evaluation Engine

File:

- `src/lib/growth-hooks.ts`

Added:

- `evaluateMerchantNudges(...)`

Inputs:

- merchant id
- store readiness state
- non-ready products count
- inactive products count
- low stock count
- delayed orders count

Outputs:

- `active` nudges with:
  - key
  - label
  - detail
  - route
  - priority (`high/medium/low`)
  - status (`new/active`)
- `resolved` nudges inferred when previously active keys disappear

Persistence:

- lightweight local state in localStorage to compare prior vs current nudge keys.

## B) Merchant Cockpit Integration

File:

- `src/pages/merchant/Overview.tsx`

Updates:

- Replaced static “required actions” block with:
  - `Nudges تلقائية (Next Best Action)` section (`M4.4` badge)
  - priority badges (high/medium/low)
  - state badges (`new` vs `active`)
  - direct execution links
- Added “recently resolved” section for closed nudges.

---

## 2) Operational Behavior

- Nudges are automatically generated from current merchant health signals.
- New recommendations are clearly marked as `جديد`.
- Existing unresolved recommendations remain `نشط`.
- Resolved recommendations appear in a lightweight completion list.

---

## 3) Validation

- Lint checks executed for modified files.
- No new lint errors introduced.

---

## 4) Completion Verdict

**M4.4 is implemented and usable.**

Merchant dashboard now provides an automated, prioritized recommendation workflow that converts KPIs into concrete next actions.
