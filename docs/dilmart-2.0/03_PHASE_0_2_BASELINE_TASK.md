# DILMART-V2-P0.2 — Baseline & Environment Verification

Status: task prepared; execute only after reviewed PR #51 merge or explicit owner authorization of its branch. G0 OPEN. No implementation.

## Objective
Establish reproducible local baseline, exact schema and contracts inventory, and isolated staging proposal. Work in clean local worktree at approved SHA. Do not reset existing user work. Read root AGENTS, CLAUDE, governance, environment source of truth, V2 master spec, static audit, relevant skills and runbooks first.

## Gate A: identity and safety
Record git status, branch, HEAD, remotes (redact credentials), Node/npm, Docker and Supabase CLI versions. Inspect scripts before running; ensure all database endpoints are disposable loopback/local only, use synthetic fixtures, no live secrets, no remote linked project. If local stack unavailable or ambiguous, stop DB tests and report blocker. Do not provision remote staging, link project, deploy, mutate live data, run live tests, or change flags. No runtime fixes in this task. Local disposable DB initialization/reset only after verifying isolation and ownership; never reset user work or shared DB.

## Gate B: baseline validation
Inspect package scripts and CI. Run applicable npm ci, frontend build, test, arch:guard, auth:guard, lint, mobile build and mobile:boundary; backend npm ci, build, test:policy, test:commercial, test:launch-critical. Inspect tests for remote side effects before execution. Run local-only migration replay and DB integration suite if safe; report exact commands and failures, do not label skipped tests PASS. Review latest relevant CI evidence separately from local runs. No automatic dependency upgrades or fixes.

## Gate C: schema and code inventory
Enumerate tables/columns/constraints/indexes/RLS/grants/RPCs and migration order, including checkout and stock locking, idempotency, financial snapshot, coupon/loyalty, merchant scope, order status, delivery transitions, Jenni hooks, cancellation/returns, payout and notification outbox. Map actual API routes/callers, B2B/federated identity, mobile boundary and data authority. Identify existing geo fields and pickup locations, possible reusable structures and migration conflicts. Mark each claim verified source / locally tested / unverified. Do not export real records or credentials.

## Gate D: target contracts proposal
Propose exact additive schema and transaction boundaries for master/child checkout, inventory, allocations, ready events, provider exclusivity, parcels/tasks/offers, hub custody and consolidation, outbound delivery and COD/payout. Include concurrency locks, idempotency keys, RLS actor matrix, rollback and failure scenarios. No DDL execution outside disposable local environment, no production migration authoring as part of this task. Compare Expo and Capacitor for driver app with scoped local evidence; preserve customer mobile boundary. Produce isolated staging design with estimated resources and explicit approval request, not actual provisioning.

## Deliverable
Write docs/dilmart-2.0/04_PHASE_0_2_BASELINE_REPORT.md with baseline SHA, environment classification, command/results table, schema and RPC inventory, reuse matrix, gaps P0/P1/P2, risk and decision register, proposed contract freeze agenda, test evidence and limitations. Use public-safe report; sensitive details in private approved channels. Return PASS / PASS WITH NOTES / FAIL for each gate, G0 still OPEN pending owner-approved Phase 0.3. No runtime changes or deployments. Submit scoped documentation PR. Stop after report, do not start V2-01.
