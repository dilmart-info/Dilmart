# Batch M6.2 — Workflow & Policy Cutover (Server-Only Mode) Implementation Report

## Status

**Completed (Server-Only Default)**

Scope delivered: switched governance workflow/policy flows to server-only default behavior, with local fallback available only through an explicit emergency flag.

---

## 1) Implementation Summary

Files:

- `src/lib/runtime-flags.ts` (new)
- `src/pages/admin/Dashboard.tsx`
- `src/lib/commercial-policy-profiles.ts`
- `src/pages/admin/MerchantDetail.tsx`

Changes:

- Introduced emergency runtime flag:
  - `VITE_ENABLE_LOCAL_FALLBACKS=true` enables local fallback paths
  - default (`false`/missing) => server-only mode
- Governance workflow in admin dashboard:
  - server writes remain primary
  - local write fallback is disabled unless emergency flag is on
  - local read fallback for task state is disabled unless flag is on
- Commercial policy assignment/resolution:
  - server assignment/resolution remains primary
  - local fallback only when emergency flag is enabled
  - in server-only mode, assignment errors surface as server failure (no silent local persistence)

---

## 2) Operational Impact

- Default behavior now aligns with M6 cutover policy: server source-of-record first, no implicit local shadow writes.
- Emergency fallback remains available for incident handling without code rollback.

---

## 3) Completion Verdict

**Done.** M6.2 cutover baseline is active with explicit emergency fallback gating.

