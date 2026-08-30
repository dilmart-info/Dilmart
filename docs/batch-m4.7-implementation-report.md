# Batch M4.7 — Experimentation Baseline Implementation Report

## Status

**Completed (Lightweight Baseline)**

Scope implemented: one production-safe A/B-ready path for home hero copy, with persisted assignment, exposure logging, primary CTA outcome metrics, and an admin snapshot card (local event log).

---

## 1) Implementation Summary

### A) Event contract (telemetry)

File:

- `src/lib/growth-hooks.ts`

Added:

- Event names: `experiment.exposed`, `experiment.outcome`
- Payload fields: `experimentId`, `variantId`, `outcomeKey`
- `getExperimentRollup({ experimentId, windowDays })` — aggregates exposures and outcomes per variant from the local growth hook log

### B) Experiment registry & hero surface

File:

- `src/lib/experiments.ts`

Added:

- Canonical experiment id: `home_hero_messaging_v1`
- Variants: `control` (existing default copy) vs `variant_b` (alternate headline/subline/CTA)
- `getPersistedVariant` — 50/50 assignment stored in `DilMart-experiment-assignments-v1`
- Stable anonymous bucket via `DilMart-anon-bucket-v1`
- `recordHomeHeroExperimentExposure` — once per tab session (`sessionStorage`) to avoid duplicate exposure on re-render
- `trackHomeHeroPrimaryCtaOutcome` — logs `hero_primary_cta_click` on hero CTA

### C) Storefront integration

File:

- `src/pages/Index.tsx`

Hero block now renders copy from the assigned variant and tracks CTA click outcome.

### D) Admin visibility (local verification)

File:

- `src/pages/admin/Dashboard.tsx`

Card **تجربة نسخ الصفحة الرئيسية (M4.7)** shows per-variant exposure and CTA clicks for the current browser session’s event log, with explicit disclaimer that figures are browser-local.

### E) Build fix (unrelated)

File:

- `src/pages/merchant/Overview.tsx`

Replaced funnel labels that used ASCII `->` (invalid in JSX text) with Arabic labels using the Unicode arrow `→`.

---

## 2) Operational Impact

- Operators can run a simple copy test on the home hero without a stats engine.
- Assignment is stable per browser; exposure is session-scoped to limit noise.
- Outcomes are minimal (primary CTA) and map cleanly to future server-side aggregation.

---

## 3) Limitations (by design)

- Metrics are stored in **localStorage** on the client; the admin card reflects **this browser’s** log only — not platform-wide totals until a backend pipeline exists.
- No frequentist testing or confidence intervals (non-goal for M4.7).

---

## 4) Completion Verdict

**Done.** One end-to-end experiment path is wired: assign → expose → outcome → rollup helper + admin snapshot.
