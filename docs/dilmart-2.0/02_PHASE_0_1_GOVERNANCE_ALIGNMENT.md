# DilMart 2.0 — Phase 0.1 Governance Alignment

Date: 2026-11-25
Scope: documentation-only transition on PR #51. Effective after reviewed merge. No runtime implementation or production authorization.

## Decisions
- V2 product scope follows 00_MASTER_SPEC.md; existing legacy master spec remains applicable where not explicitly superseded.
- Legacy cart stays single merchant. V2 master checkout may span merchants under an approved implementation phase and default-off flags. Each merchant child remains single merchant.
- CURRENT_PHASE authorizes only the next local verification task, conditional on merge or explicit owner authorization of branch. G0 is OPEN.
- Environment source of truth and safety rules remain unchanged and authoritative; no remote staging provisioning or live mutation authorized.
- Preserve all legacy regression tests. Add V2 gates for atomic checkout, custody, dispatch, consolidation, provider exclusivity, COD and settlement.
- All further implementation requires approved contract freeze and phase assignment.

## Files aligned
Root AGENTS.md and CLAUDE.md; governance/MASTER_SPEC.md and CURRENT_PHASE.md; ai/PROJECT_CONTEXT.md, AGENTS.md, README_FOR_AI.md, QA_CLOSURE_GATE.md, CURSOR_EXECUTION_RULES.md, LAUNCH_CLOSURE_PLAN.md; checkout/finance and delivery QA skills. Historical launch constraints are scoped to legacy rather than deleted wholesale.

## Next task
[Phase 0.2 baseline task](03_PHASE_0_2_BASELINE_TASK.md). Local tests and schema replay are not executed in Phase 0.1. Review PR diff and CI before merge. No claim of readiness or test PASS. No changes to runtime, migration, environment or deployment configuration. Remaining G0 decisions and field readiness are open.
