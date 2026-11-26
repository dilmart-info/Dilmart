# DilMart 2.0 — Implementation Roadmap (Phase 0.3J)

Date: 2026-11-26
Baseline: b27a4b64cf0da5a281ad2a7fb706d13c534e50bc
Status: owner-approved roadmap direction; implementation NOT authorized; G0 OPEN.
Scope: planning only. No runtime changes, DDL, provisioning, deployments, device actions or live operations.

## 1. Authority and delivery constraints

Read root AGENTS/CLAUDE, ai/ENVIRONMENT_SOURCE_OF_TRUTH.md, ai/QA_CLOSURE_GATE.md, governance/CURRENT_PHASE.md and [Master Spec](00_MASTER_SPEC.md). Merged 06–14 define design direction and logical contracts. [Decision register](16_ARCHITECTURE_DECISION_REGISTER.md) records open decisions. [G0 gate](17_G0_APPROVAL_GATE.md) controls permission to start. Merge of these documents is not G0 approval. Legacy checkout, Jenni, custody and financial history remain protected. Do not use MAIN staging for STORE. No retired B2B resurrection. No production secrets or PII in public Git.

## 2. Workstream ownership

| Workstream | Proposed primary | Independent review |
|---|---|---|
| Architecture, task specifications, cross-domain contracts | ChatGPT + owner | Claude Code/Cursor evidence review |
| DB schema/migrations, transactional core, shared API/event contracts | Claude Code (single migration writer) | Cursor/independent QA |
| Commerce backend and finance | Claude Code | independent review, finance owner |
| Customer/merchant/hub/admin frontend | Cursor | Claude Code/QA |
| Driver app | Claude Code after D09 | Cursor/device QA |
| Integration/security/release evidence | independent QA role with agent assistance | owner and relevant domain reviewer |
| Business policy, operational readiness, release authorization | owner and designated ops/finance/legal leads | independent evidence review |

Roles proposed; named humans, availability and actual capacity pending owner assignment. Agent names do not imply simultaneous sessions or staffed teams. No agent approves own work. One writer per migration/shared contract file; branch ownership before parallel work. ChatGPT reviews evidence, not a substitute for human finance/legal or independent execution.

## 3. Pre-G0 critical path

Execute only individually authorized evidence packets from 17. PRE-G0-01 metadata diff and PRE-G0-02 clean DB baseline start after explicit scope approval; PRE-G0-03 writer/lock audit and PRE-G0-05 grant review consume catalog. PRE-G0-04 finance fault proof consumes isolated baseline; PRE-G0-06 dependency audit and PRE-G0-07 lint fingerprint may run independently with separate worktrees. PRE-G0-08 device spike and PRE-G0-09 staging provisioning require distinct approval, cost and target guards. PRE-G0-11 commercial/operational decisions can proceed in parallel. PRE-G0-10 physical schema/DTO/event/transition supplements consume 01/03/04/05/08/11 outputs. PRE-G0-12 independent review after all blockers resolved. No V2 feature implementation during PRE-G0. If a defect needs remediation, create separate approved bounded remediation task; no hidden implementation in evidence PR.

## 4. Post-G0 execution packages

| Package | Dependencies | Deliverables and ownership | Gate/evidence |
|---|---|---|---|
| V2-01 Shared Foundation | explicit G0 approval | Claude: additive schema, migration ownership, scoped auth, idempotency, durable outbox, command envelope, flags default off, environment guards; Cursor: typed client contracts only | isolated replay/upgrade, RLS negative tests, UA/SQ foundation; no V2 admission yet |
| V2-02 Commerce | V2-01 stable contract; FIN allocation rules | Claude: quote, atomic master/children, stock and allocation, resolution, legacy isolation; Cursor: multi-merchant cart and checkout behind flags | G1, CB01–16/T01–04, TX01/02, V1 regression |
| V2-03 Merchant & Logistics Core | V2-01; V2-02 child/order interface reviewed | Claude: activation/location/fulfillment, parcels, custody, manifests, readiness, return foundations; Cursor: merchant portal | G2, MF01–20 and relevant HB/DS, TX03/05/06, T05–12 |
| V2-04 Dispatch & Driver | V2-01, stable V2-03 task/custody contracts, finance exposure interface, D09 | Claude: routing adapter, eligibility, score, offers, capacity, route, independent driver app; Cursor: ops control tower and review | G3 shared with V2-05; DS01–26/DA01–34, TX04, actual device evidence |
| V2-05 Hub Operations | V2-03 parcel and manifest contracts, V2-04 assignment interface, V2-06 COD release contract | Claude: hub commands and consolidation/release; Cursor: receiving, inspection, bin, packing, outbound and exceptions UI | G3 joint, HB01–30, TX06–10, incomplete release denied |
| V2-06 Finance Engine | V2-01 and approved monetary contracts, V2-02 snapshot, V2-03 custody; coordinated V2-04/05 integration | Claude: journal, COD, cash exposure, remittance, reconciliation, payout, returns/reversal; Cursor: finance projections and UI | G4, FA01–38, TX11–16, exact reconciliation and fault proof |
| V2-07 Integrated System & QA | G1–G4 evidence | independent QA: full E2E, negative scopes, load, recovery, native builds, migration/restore, ED closure, legacy; resolve defects in reviewed tasks | G5, T01–22, UA01–10, SQ01–23 applicable |
| V2-08 Controlled Pilot & Launch | G5 plus separate pilot authorization | ops/finance/mobile/release: actual authorized cohort, routes, scans, cash, training, support; separate go/no-go | G6 T23 and G7 owner launch authorization |

Packages are planning IDs, not preauthorized coding tickets. Cross-domain contracts are stable before consumers implement. Finance core design and interface precede checkout implementation; V2-06 implementation begins after V2-01 contract foundation, can develop pure/isolated finance components in parallel with commerce and logistics, and must provide verified exposure/COD interfaces before actual assignment/release/delivery integration. V2-04/05 may use agreed synthetic contract fixtures only; no real custody or COD until applicable gates. Avoid circular dependency by distinguishing interface freeze, component implementation and integrated acceptance. No placeholder financial approval in real workflows.

## 5. Task decomposition and parallel integration

| Package | Proposed ticket sequence (each requires explicit authorization) |
|---|---|
| V2-01 | F01 schema and migration map; F02 auth/scope and RLS; F03 command idempotency; F04 outbox/leases; F05 flags and guards; F06 baseline acceptance |
| V2-02 | C01 quote/snapshot; C02 atomic checkout; C03 cancellation/compensation; C04 customer projection; C05 UI and legacy tests |
| V2-03 | L01 merchant activation/location; L02 fulfillment/readiness; L03 parcel/item manifest; L04 dual ACK custody; L05 return foundations; L06 merchant UI |
| V2-04 | D01 telemetry/shift; D02 eligible candidate/route adapter; D03 scoring/offer/assignment; D04 mobile session/route; D05 offline scan/sync; D06 ops UI and real-device QA |
| V2-05 | H01 hub/bin/receipt; H02 inspection/movement; H03 expected-set/packing; H04 release/manifest/loading; H05 hub UI |
| V2-06 | N01 accounting accounts/effect keys; N02 snapshot allocations; N03 COD/exposure; N04 cash sessions/remittance; N05 obligations/payout; N06 returns/reversals; N07 reconciliation/finance UI |
| V2-07 | Q01 E2E; Q02 concurrency/fault; Q03 security; Q04 load; Q05 migration/restore; Q06 native/legacy; Q07 independent gate |
| V2-08 | P01 operational readiness; P02 authorized pilot scope; P03 monitored execution/reconciliation; P04 independent go/no-go; P05 progressive release only if approved |

Ticket suffixes are local to package (e.g. V2-02/C01), not new ADR IDs or Master decisions. Exact files, endpoints, tests and dependencies supplied per task after preflight; do not interpret this table as blanket file permission. Merge foundational contracts first; short-lived branches/worktrees and frequent reviewed integration; no parallel edits to same migration, core checkout/finance or shared generated types. Maintain consumer compatibility fixtures; generated types refreshed only by assigned owner after schema approval. Rebase/merge latest approved main or designated integration baseline, never force push or discard user changes.

## 6. Task packet template and execution protocol

Each packet must contain: task ID; explicit owner authorization and allowed environment; immutable base SHA; read-first docs; objective/invariants; exact allowed files or scoped directories; prohibited operations; upstream contracts and decision IDs; test/acceptance IDs; commands derived from actual package scripts; stop conditions; required evidence and review owner. Preflight confirms repo/branch/HEAD, clean isolated worktree, tool versions, environment target, dependency state. Stop on mismatches, conflicting decisions, unexpected dirty files, unauthorized target, critical security/financial/custody defect or unmet prerequisite. Never silently expand scope.

Execution: audit -> bounded implementation -> local/isolated tests -> diff review -> independent review -> scoped PR -> required CI -> owner review/merge -> verify merged SHA and relevant CI. Report exact commands, exit codes, failures/skips/TODOs, changed files, actual evidence and unresolved risks. PASS WITH NOTES only where nonblocking and accepted; no fake full-suite pass. No weakening CI, branch protection or tests to get green. No force-push, destructive reset or arbitrary data edits. Deployment separate; confirm Netlify publish gate false during docs work (actual current value unknown). No production access by default.

## 7. Schedule and critical path

Original target Nov 26–Dec 25, 2026 is conditional, not a promise. Master plan day 1–4 readiness/G0; day 3–12 commerce; day 3–14 logistics; day 5–19 dispatch/driver/hub; day 5–21 finance; day 15–25 integrated QA; day 22–28 field pilot; day 28–30 release review. Overlaps are indicative only: implementation cannot start before explicit G0 even if calendar window says day 3. No evidence yet of actual team availability, staging capacity or G0 closure duration. Rebaseline dates after G0, estimate from real throughput, record critical dependencies and daily blockers. Do not compress safety or reconciliation gates to meet date.

Minimum safe launch scope if schedule slips: narrow approved merchant/zone cohort, one hub, one consolidated shipment, exact COD, safe manual dispatch with same guards, no unapproved split/external fallback, no speculative advanced optimizer. Do not drop security/cash/custody/stock invariants, offline recovery, or required proof. Defer expansion rather than accept critical risk. Merchant recruitment, verified locations, hub/equipment, fleet and training may proceed by authorized ops separately; no real roster in public Git.

## 8. Acceptance, gate and handoff

197 design acceptance IDs across CB/MF/DS/HB/DA/FA/UA/SQ, 23 master scenario anchors (overlapping). Trace all to actual tests, command, commit, environment, artifacts, reviewer and result. Gates G0–G7 in 14/17. G0 authorizes specified implementation only, not staging provisioning retroactively or production deployment. G6 pilot and G7 release require separate owner authorization. No implementation authorized by this document. Next step: after reviewed merge, owner authorizes PRE-G0 evidence packets, beginning with isolated baseline and read-only catalog/writer tasks as appropriate. Update governance after evidence and independent decision, never on assumed completion.
