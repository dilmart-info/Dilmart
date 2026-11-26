# DilMart 2.0 — G0 Implementation Approval Gate (Phase 0.3J)

Date: 2026-11-26
Baseline: b27a4b64cf0da5a281ad2a7fb706d13c534e50bc
Verdict: **OPEN / BLOCKED — NO V2 IMPLEMENTATION AUTHORIZATION**
Scope: design and approval planning only. This document does not authorize evidence execution, live metadata queries, provisioning, device changes, DDL, deployment or activation.

## 1. Authority

Read root AGENTS.md, CLAUDE.md, ai/ENVIRONMENT_SOURCE_OF_TRUTH.md, ai/QA_CLOSURE_GATE.md, governance/CURRENT_PHASE.md, [Master Spec](00_MASTER_SPEC.md), [baseline report](04_PHASE_0_2_BASELINE_REPORT.md), [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md), architecture packages 06–14, [roadmap](15_IMPLEMENTATION_ROADMAP.md), [decision register](16_ARCHITECTURE_DECISION_REGISTER.md). All prior safety restrictions remain. Owner approval of this roadmap and reviewed merge establishes completion of the planned architecture documentation packages only; not a physical contract freeze, clean test baseline or permission to code.

## 2. Current evidence assessment

| Requirement | Status | Evidence / gap |
|---|---|---|
| Repository audit and governance | ACCEPTED WITH NOTES | PRs #51–54, reports 01–05; scope restrictions remain |
| Design packages 0.3A–I | MERGED | PRs #55–63; 179 design IDs extracted from source |
| Final roadmap/register/gate | PROPOSED | Phase 0.3J PR, pending review/merge |
| Local migration replay | PASS in prior scope | 175 migrations, final schema gate; 62 local tables all RLS |
| Production metadata comparison | PARTIAL | matching 62 table count/RLS, not full structural equivalence |
| Clean full DB integration suite | FAIL / NOT REPROVEN | original full run exit 1; partial reruns do not substitute; one TODO outstanding |
| Physical schema/reuse/lock proof | BLOCKED | ED-01, exact writer inventory, route and DTO supplement pending |
| Finance integrity | UNPROVEN | ED-02 legacy failure windows not fault-tested; no new V2 runtime |
| Security and dependencies | OPEN | ED-03/04 findings require targeted evidence and risk disposition |
| Lint | BASELINE FAIL | 449 errors,33 warnings historically; no-new diagnostics enforcement not proven |
| Store staging | NOT PROVISIONED | independent Store staging absent in authoritative map |
| Mobile stack and device acceptance | OPEN | D09 comparative spike not run |
| Commercial/operational decisions | OPEN | D01–D13; HUB/DRV design direction source headers proposed |
| Operational acceptance | PARTIAL | ED-06, retired host/auth/CORS/hooks/Jenni/Android pending |
| G0 independent approval | NOT GRANTED | no feature implementation, migration or production operations |

No fresh runtime tests in Phase 0.3J. Successful documentation PR CI is not proof of these missing gates.

## 3. Pre-G0 evidence packets

All packets are proposed, not self-executing authorization. Owner approves each scope/target before agent acts; exact task brief includes allowed paths, worktree, environment, test commands, evidence and stop rules. Related evidence tasks may run in parallel with nonoverlapping resources after approval.

| Task | Owner role / dependencies | Allowed scope after explicit approval | Required evidence and stop condition |
|---|---|---|---|
| PRE-G0-01 ED-01 catalog diff | Architecture/DB; fresh main baseline | local disposable catalog and separately authorized read-only production metadata only; no business rows | canonical metadata inventory/diff: types/defaults/nullability, keys/checks/indexes, policies/grants, RPC signatures/definitions/owners/config, triggers/views/extensions/migration IDs; normalize environment-only differences, explain every drift; STOP on target mismatch or need for live write |
| PRE-G0-02 clean baseline | QA; fresh main, isolated local stack | build backend, full DB integration suite, replay/upgrade using synthetic fixtures | exact commands and exit codes, one clean full run, TODO disposition, cleanup proof; no cumulative partial-run pass; STOP on shared stack or production binding |
| PRE-G0-03 writer and lock audit | Architecture/DB; 01 | static source and local catalog, no DDL | table-by-table reuse matrix, every reachable writer/trigger/RPC/worker/import/provider, legacy/V2 collision analysis, lock graph and revised protocol; STOP unresolved conflicting authority |
| PRE-G0-04 ED-02 finance proof | Finance+QA; 02/03 where required | isolated synthetic failpoints and legacy effect inspection; test-only harness after approval | reproduction or explicit nonreproduction of sentinel/early-exit, checkout idempotency, postcommit finance and event loss; actual receipt/accrual/payout/reversal reconciliation; remediation proposal if defect; STOP critical uncontained risk |
| PRE-G0-05 ED-03 privileges | DB+Security; 01 | catalog and isolated negative security tests; separately authorized read-only hosted advisor | all relevant grants/RLS/view/definer checks including six known functions; scope exploitability and fix plan; no live privilege edits |
| PRE-G0-06 ED-04 dependency review | Security+Mobile; baseline lockfiles | read-only fresh audit and reachability analysis | version/advisory/source, runtime/build reachability, compatible update plan and major upgrade risks; no forced updates |
| PRE-G0-07 ED-05 lint baseline | QA; baseline | reproduce lint diagnostics with same rules and lockfile; design fingerprint comparison | exact baseline and no-new diagnostic method, test enforcement before first feature PR; no mass rewrite or rules disabled |
| PRE-G0-08 D09 device spike | Mobile; separately approved devices/test scope | isolated disposable prototypes Expo and Capacitor, synthetic tasks, no production credentials | same test matrix, GPS background/lock, battery, offline/restart/queue, scans/push/storage, distribution/security, chosen stack and rationale; no reset/uninstall with pending evidence |
| PRE-G0-09 isolated staging | Release/DB; owner topology, budget, access approval | separate Store Supabase/Render/Netlify and test build target only after explicit provisioning authority | exact private target identifiers, cross-environment denial, synthetic fixtures, target guard, replay/restore readiness, updated source of truth through reviewed PR; STOP before any unapproved cost or live binding |
| PRE-G0-10 contract supplement | Architecture+domain leads; 01/03/04/05/08/11 | design-only physical schema/DTO/event/state/lock specification and route audit | reviewed exact types, FK/unique/check/index/RLS/grants, atomic TX01–16, endpoint registry incl 13 open gaps, payload schemas, transitions, worker ownership, legacy isolation and test IDs; no executable DDL |
| PRE-G0-11 policy decisions | owner+ops/finance/legal; parallel | approved policy workshops and evidence, no fabricated values | D02/D06/D07/D10/D12/D13 and G0 constraints for D03/D05/D08/D11; ratify HUB/DRV; D09 from spike, D01 from diff; dated policy/ADR versions |
| PRE-G0-12 independent adjudication | independent QA + owner; all prerequisites | review evidence only | signed gate checklist, explicit scope of implementation authority or blocked verdict; no self-approval |

PRE-G0 tasks not a new blanket exception to current governance. Any necessary executable defect fix, dependency change, migration or provisioning is a separate bounded authorization and reviewed task. If existing critical defect is demonstrated, pause affected scope and obtain approval for remediation; do not quietly defer an integrity blocker. No unauthorized production read, write or smoke.

## 4. G0 mandatory checklist

All items require evidence and independent review before PASS:
- [ ] Phase 0.3J reviewed merge, decision register current; HUB/DRV direction explicitly ratified.
- [ ] ED-01 full structural diff explained and physical schema/reuse/writer/lock specification approved.
- [ ] Clean full baseline DB suite with TODO disposition; legacy critical and native CI proven.
- [ ] ED-02 legacy fault-risk proof and no unaddressed critical integrity risk; runtime V2 financial proof remains G4.
- [ ] ED-03/04 risk triage and approved containment/remediation before affected work; no unsafe exposure.
- [ ] ED-05 reproducible lint baseline and no-new diagnostic gate ready before feature work.
- [ ] Independent Store staging provisioned and verified after separate authorization; cost/target/credential boundaries documented.
- [ ] Exact API/DTO/state/event contracts, role matrix, transactional boundaries and legacy compatibility reviewed.
- [ ] D01,D02,D06,D07,D09,D10,D12,D13 resolved for implementation; D03/D05/D08/D11 design constraints resolved and any later operational details explicitly deferred.
- [ ] Accountable owners, independent reviewers, task dependencies and capacity plan assigned.
- [ ] Explicit dated owner authorization identifies allowed V2 package/ticket, environment, scope and restrictions.

D04 operational cohort remains G6; D03/D05/D08 actual field readiness G3; D11 legal/insurance G6 with earlier design constraints. ED-06 operational acceptance remains G6/G7 unless a specific dependency blocks earlier work. Safe deferral requires owner, due gate, rationale, containment tests and disabled dependent feature. Never defer a critical stock/money/custody/security invariant. PASS WITH NOTES cannot substitute for mandatory G0 evidence.

## 5. Evidence and authorization record

For each task/gate: ID, base and tested SHA, exact branch, private target identity, owner authorization, allowed scope, command/version, timestamp, exit code, result counts (passed/failed/skipped/TODO), artifact references, observed defects, residual risk, independent reviewer, owner decision. Public report redacts secrets/PII and sensitive operational details. A missing test is NOT RUN; a missing prerequisite is BLOCKED; an unproven required invariant cannot be PASS.

Owner approval record (blank until actual decision): decision/date; reviewed SHA and evidence references; approved package/ticket IDs and environment; explicit allowed changes; exclusions; accepted nonblocking deferrals; reviewer. No fabricated signoff. G0 implementation authorization does not authorize live deployments, payments, production migrations or launch. G6 and G7 require distinct owner approvals and actual evidence.

## 6. Immediate handoff

After this PR merges, next proposed action is owner authorization of PRE-G0-01 and/or PRE-G0-02 bounded evidence task. Begin with actual current main and read governance. Do not send generic build-all prompt, create V2-01 branch, modify runtime or provision staging until respective approval. Keep production safe and Netlify publish gate false during docs work; actual variable state unknown. If read-only hosted access unavailable, report blocker rather than substitute table counts. No deadline overrides gate.

**Current G0 verdict: OPEN / BLOCKED. V2-01–08 NOT AUTHORIZED.**
