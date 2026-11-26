# DilMart 2.0 — Security, Staging & QA (Phase 0.3I)

Date: 2026-11-26
Baseline: 39d1042243671b33ff457952cac7dc52b46d3a81
Status: owner-approved SEC01–SEC28 direction; detailed safety/evidence plan proposed for review. G0 OPEN.
Scope: design only. No environment provisioning, live checks, secret changes, database writes, DDL, dependency updates, deployment, device reset or feature activation.

## 1. Authority and verified baseline

Read [Master Spec](00_MASTER_SPEC.md) sections 18–23, [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md), [architecture](06_SYSTEM_ARCHITECTURE.md), [unified contracts](13_DATABASE_API_CONTRACTS.md), root AGENTS/CLAUDE, ai/ENVIRONMENT_SOURCE_OF_TRUTH.md, ai/QA_CLOSURE_GATE.md and governance/CURRENT_PHASE.md. Prior domain contracts 07–12 remain binding. PRs #55–62 merged; PR #62 critical CI and Native CI succeeded, Android after retry of bundletool HTTP 504. This is PR evidence, not V2 runtime acceptance.

Phase 0.2a local replay: 175 migrations; 62 public tables all with RLS; 80 policies; 56 SECURITY DEFINER functions, six without configured search_path. Production table count and RLS coverage matched; structural equivalence unproven. Full DB suite exited 1; partial reruns do not substitute for clean full run; one TODO outstanding. Previous lint 449 errors/33 warnings; critical CI does not actually execute lint despite job label. Previous dependency audit frontend 35 (6 critical,13 high,16 moderate), backend 15 (1 critical,8 high,6 moderate); these counts are historical, not fresh scans or proof of exploitability. ED-01–06 OPEN.

Authoritative environment map confirms Store has no separate staging branch, Render service or Supabase project. Existing DilMart MAIN staging is NOT Store staging; do not reuse it. No provider account, current deployment, secret or billing state verified in this phase.

## 2. Decision register

| ID | Direction |
|---|---|
| SEC01 | Separate development, staging and production |
| SEC02 | Synthetic test data |
| SEC03 | Environment-specific credentials and secrets |
| SEC04 | Least privilege |
| SEC05 | RBAC |
| SEC06 | Object-level authorization |
| SEC07 | Default-deny RLS |
| SEC08 | RPC grants and SECURITY DEFINER review |
| SEC09 | API validation and rate limits |
| SEC10 | Device and session security |
| SEC11 | Encrypted minimized local evidence |
| SEC12 | Privacy and retention controls |
| SEC13 | Dependency vulnerability review |
| SEC14 | No new lint diagnostics |
| SEC15 | Automated test pipeline |
| SEC16 | Concurrency tests |
| SEC17 | Fault injection |
| SEC18 | Performance and load tests |
| SEC19 | API/event contract tests |
| SEC20 | Legacy regression tests |
| SEC21 | Operational observability |
| SEC22 | Financial and custody alerts |
| SEC23 | Backup and verified restore |
| SEC24 | Server-side default-off flags |
| SEC25 | Progressive release and safe rollback |
| SEC26 | Incident response runbook |
| SEC27 | Real-device and field pilot |
| SEC28 | Evidence-based gate decisions |

No numerical SLA, retention period, provider plan, budget, test load, RPO/RTO or launch date approved by this document.

## 3. Environment isolation and authorization

| Layer | Development | Proposed Store staging | Store production |
|---|---|---|---|
| Repository | scoped branch/worktree | reviewed integration/release candidate branch, name pending | current main |
| Database | disposable local Supabase/Postgres | new independent project | existing Store project per authoritative map |
| Backend | local NestJS | independent Render service | current Store Render service |
| Frontend | local | independent restricted Netlify site | existing Store site |
| Mobile | debug/test package and credentials | signed internal/test build with distinct app identity | separately approved release |
| Data | synthetic only | synthetic only | real, protected |
| External services | mocks/sandbox | sandbox or explicitly approved bounded test | approved production bindings |

No shared production keys, database URLs, webhook destinations, notification recipients, storage buckets or device credentials. Staging must not point to MAIN, StylAI or Store production. Explicit environment guard asserts repository/commit, backend URL, Supabase ref, DB role, site and mobile build target; fail closed on missing/mismatched identity. Local test endpoints loopback-only; verify host bindings and Docker isolation, preserve other worktrees and containers. Do not reset shared stacks or reuse stale credentials. CI uses isolated ephemeral database and synthetic fixtures. No production data dump containing PII, no real SMS, COD, courier dispatch or payment in test environments.

Provisioning requires separately approved topology, resource names, region, cost ceiling, ownership, access and deletion policy. Verify live binding immediately before authorized operations. After provisioning, prove staging backend/DB/frontend target agreement, deny cross-environment credentials, enable safe test-only integration modes, record exact commit/config fingerprint without secrets, and demonstrate clean restore/replay. Update environment source of truth only after verified owner-approved topology. Do not claim staging exists merely because this plan is merged.

Netlify workflow inspection: publish gate requires NETLIFY_PRODUCTION_DEPLOY_ENABLED exactly true and production environment; current variable unknown. Owner should confirm false during docs/design work, independently verify gate/publish outcome and authorize any later publish. Render production auto-deploy previously disabled per migration evidence, not reverified. No production variables changed. No automatic deploy by agents.

## 4. Threat model and security controls

| Threat / boundary | Required mitigation / proof |
|---|---|
| credential theft or cross-environment secret | secure storage, least privilege, rotation/revocation, secret scanning, target guard |
| cross-customer/merchant/driver/hub IDOR | actor-derived scope, typed FK/scope, deny API and direct DB negative tests |
| service-role bypass | backend checks on every object/command, restricted RPC, no client service keys |
| price/stock/COD tampering | server-authoritative snapshot/version, exact arithmetic, guarded atomic commands |
| duplicate requests, replayed events/OTP/webhook | scoped idempotency, business effect uniqueness, expiry and authenticated provider evidence |
| fake location/scan/custody | telemetry quality and manifest/version/counterparty checks; GPS not sole proof |
| cashier/finance fraud | distinct maker/checker, exact receipt allocation, immutable journal, independent reconciliation |
| offline device loss | encrypted minimized queue, device revocation, safe unresolved-evidence recovery |
| malicious upload or log leak | file type/size checks, restricted storage/access, no executable content, redact PII/OTP/secrets |
| dependency/build chain compromise | locked dependency install, audit reachability, pinned verified artifacts, review provenance |
| resource exhaustion | bounded request/body/batch, rate limits, worker concurrency, timeouts/circuit breakers |

Authentication uses existing approved identity infrastructure after verification; authorization never relies on UI or arbitrary client merchant/driver ID. Validate token issuer/audience/expiry and revoked device/role according to approved design. RBAC is not sufficient without object scope. Explicit DTO allowlists, safe localized errors, TLS, CORS exact allowlist where browser applies, CSRF controls for cookie-based auth if used, restricted upload and public tracking. Rate-limit auth/OTP/scans/telemetry and costly routing; actual thresholds require policy/load evidence. No raw location/contact or tokens in general logs; use correlation IDs and redacted identifiers. Public repo audit and secrets scanning required; no sensitive business records, security exploits, actual roster or payment details committed.

## 5. Access and database security

Customer own master/order/payment projection; merchant owner/manager own merchant/location child and eligible statement; merchant staff explicit grants only, no default accept/reject expansion; driver assigned route, manifest and own earnings/cash, pickup-only no COD; hub operator scoped physical location and authorized operation; dispatcher assignment and minimal cash exposure projection, not ledger; cashier own drawer/session and remittance; finance maker/checker/executor distinct authorities; auditor scoped read-only; admin no arbitrary financial/custody rewrite. Support access and exceptions explicit, reasoned, audited. No role grants by client. Role/permission changes must invalidate stale cached projections as appropriate.

RLS on exposed tables, default deny; verify table grants, policy expressions for all operations/roles, view invoker behavior or restricted grants, function owner and search_path, execute grants including PUBLIC, anon/authenticated/service roles. RLS enabled is not proof of isolation, service role bypasses normal RLS so backend object checks mandatory. Definer functions schema-qualify referenced objects and use trusted search_path with pg_temp last where appropriate; restrict execute to intended roles, test legitimate calls and negative direct RPC. No blanket revocation/alterations without dependency audit. Six known local definers from ED-03: claim_pending_points, get_available_points, get_order_status, handle_order_status_points, handle_profile_points_claim, increment_coupon_usage. Re-fetch authorized hosted metadata/advisor findings only in separate approved read-only task; validate actual risk before remediation. No production SQL here.

## 6. Test architecture and traceability

Prior design IDs: CB01–16 (16), MF01–20 (20), DS01–26 (26), HB01–30 (30), DA01–34 (34), FA01–38 (38), UA01–10 (10): total 174 design requirements, with overlapping scenarios. Master T01–23 are end-to-end anchors, not 23 additional unique executed tests. Preserve every ID in a traceability register mapping requirement -> test path/command -> environment -> commit -> result -> evidence -> reviewer. No fabricated coverage or green results.

| Layer | Required coverage |
|---|---|
| unit | pure exact allocation, scoring, eligibility, transitions, DTO validation, error mapping |
| contract | API request/response/error schemas, actor scope, event version and consumer compatibility |
| database | migration replay/upgrade, constraints, RLS/grants, atomic RPC, concurrent locks |
| integration | NestJS against isolated DB, durable worker, mocked external provider, session scope |
| E2E | synthetic customer->merchant->pickup->hub->delivery->COD->payout/return |
| mobile | real device background GPS, offline queue, reboot/process death, scan/push/auth |
| performance | realistic workload, peak mix, queues, resource saturation, cost and recovery |
| field pilot | authorized real operations after release/pilot approval, actual scan/custody/cash reconciliation |
| legacy | existing checkout, catalog, auth, merchant portal, agent/Jenni, finance, mobile boundaries |

Use existing test scripts and CI as verified, not guessed commands. Review package scripts, ensure backend build before full DB suite, start isolated disposable stack with explicit loopback bindings, verify project/port and test DB role, run clean full integration suite in one invocation, retain exit code and full summary, document TODO resolution and cleanup. Retry a transient failure for diagnosis, not as replacement for clean required run. No production writes, real provider calls or destructive setup. Test fixtures include two customers, two merchants, multiple drivers/hubs, multiple parcels, overlapping scope, last-stock race, rejected/returned child, multiple COD versions and cash/settlement discrepancies.

CI plan: PR guards/build/unit/contract/DB integration, negative authorization, migration replay, native foundation and no-new-lint; dedicated isolated stress/fault jobs with evidence. No required check disabled or branch protection weakened. Pin build tools and verify checksums where authoritative checksums available; bounded retry for transient dependency downloads without bypassing binary verification. PR #62 bundletool retry succeeded; no workflow change authorized by this document.

## 7. Concurrency, fault and recovery matrix

| Injection / race | Required invariant |
|---|---|
| last stock, quote/submit retry | one valid purchase; no oversell/partial master |
| accept vs reject, ready vs cancel | one consistent version, compensation once |
| offer acceptance vs expiry/withdrawal | one assignment, capacity reservation conserved |
| two drivers scan same parcel | one custody transfer; truthful discrepancy |
| simultaneous receipt/bin/packing/release | exact physical set; no duplicate shipment or occupied-bin conflict |
| network loss after physical transfer | evidence retained, original result recovered, no duplicate physical action |
| delivery/COD commit crash | receipt and cash custody atomic; missing secondary effects durable/visible |
| merchant accrual before courier effect | reconcile expected full effect set; no early-exit masking |
| event appended before projection | repair projection without duplicate posting |
| worker lease expiry/crash | replay safe, no lost effect, bounded recovery |
| payout reservation vs reversal | exact remaining obligation, no overpayment |
| external payment timeout after execution | unknown state hold, verify before retry |
| stale/replayed webhook or OTP | authenticated, deduped, no wrong shipment effect |
| maps unavailable or GPS stale | manual queue, no invented ETA or unsafe assignment |
| disable V2 during active work | stop new intake, preserve custody, returns, cash and settlement |

Use deterministic failpoints in isolated tests, process termination and connection failure simulations; capture expected/actual invariants before and after retry. No failure injection in production. ED-02 proof must include existing legacy sentinel/early-exit path and distinct merchant/courier subeffects, COD/payout/reversal, not just future code. Independent reviewer verifies no duplicate or missing economic effect.

## 8. Engineering debt closure plan

| Debt | Work package and owner | Required evidence / blocking boundary |
|---|---|---|
| ED-01 Schema / Architecture-DB | authorized read-only local/production metadata diff, all 62 object groups and writers, normalize environment-only differences, reuse and lock audit | full structural comparison and reviewed physical schema before V2 DDL; D01/G0 |
| ED-02 Finance / Finance+QA | legacy fault-injection baseline, exact effect set, atomic or durable remediation design and tests; checkout idempotency and event-bus risks | no unaddressed critical integrity risk at G0, runtime finance proof before G4; no production money experiments |
| ED-03 Security / DB+Security | definer/grant/RLS/view review, negative privilege tests, targeted fixes after authorization | affected interfaces not exposed until secure; G5 all critical/high security blockers closed |
| ED-04 Dependencies / Security+Mobile | fresh audit, direct/transitive and runtime/build reachability, compatible fixes, review major upgrades separately | unresolved critical/high security findings cannot pass launch; explain non-applicability with evidence, no audit fix --force |
| ED-05 Lint / QA+Engineering | reproduce baseline with same tools/rules; fingerprint diagnostic by file/rule/location/message with stable normalization, compare changed files and full counts | no new diagnostics from implementation start, no rule disabling/global mass rewrite; baseline is not clean lint pass |
| ED-06 Operations / Release+Ops | retired hostname sweep scoped to active UI/scripts/tests, Android new binding, auth/OTP/CORS/Auth Hooks/Jenni acceptance | separate reviewed tasks, test safe sandbox first; live checks separately authorized; before operational acceptance G6/G7 |

All debts OPEN. Owner assigns named reviewers in private tracker. Dependency counts and six definers are prior evidence, not findings from this task. ED-04 refresh audit before choosing package upgrades; distinguish severity from exploitability without ignoring critical/high risks. ED-06 preserve historical references where intentional; do not global replace or affect other services. No blanket closure by document merge.

## 9. Performance, capacity and device evidence

D12 must approve workload envelope: master orders/day and peak submissions/sec, parcels/master, ready-time burst, geographic spread, active drivers, GPS interval, routing requests, hub inbound/packing rates, failed/return fraction, COD mix and concurrent payouts. Distinguish order, parcel, shipment, stop, request and event. Example master spec 200 orders/day and 2.2 parcels/order yields 440 parcels/day, illustrative only. No measured capacity claimed.

Run isolated load ramp, steady peak, burst, soak, worker restart/recovery and provider timeout. Measure p50/p95/p99 API latency, errors, throughput, database connections/locks, queue lag/age, CPU/memory, storage, routing quota/cost, assignment and hub throughput, exact financial/custody invariants. Compare against approved targets and headroom; cannot pass until targets and sample sizes approved. Abort on integrity violation, unsafe saturation or budget cap. Never load-test production without separate explicit approval.

D09 comparative Expo/Capacitor spike as in 11_DRIVER_APPLICATION: same synthetic tasks, representative Android models/OS, background GPS with screen locked, battery per hour, network loss, restart, scan accuracy, push recovery, encrypted queue, authorization revocation. Hard gates no lost critical evidence, off-shift tracking, unauthorized access or duplicate physical/financial effect. Approve test devices and distribution; never uninstall/reset with pending evidence without explicit approval. Field trial (G6) distinct from synthetic device test and requires G5 pass plus owner-authorized scope.

## 10. Observability and alerting

Use structured redacted logs and correlation across API, DB commands and outbox. Record deployment SHA, environment and policy versions without secrets. Proposed signals: API latency/error/availability; DB connections/lock waits/deadlocks; queue age, expired leases, retries/dead letters; task assignment latency, stale GPS and routing failures; hub occupancy, dwell, missing parcels and custody conflicts; receipt/cash/journal reconciliation variance, pending finance effects, duplicate payment attempts; mobile sync conflicts and unresolved critical evidence; auth denial/anomaly and webhook verification failures.

Alerts have owner, severity, affected scope, correlation, threshold/window, acknowledgment and escalation. Critical money/custody/security invariant violation triggers immediate incident response and pause affected new activity; never hide as metric aggregate. Avoid logging raw customer addresses, phone, GPS history, OTP, banking data or tokens. Access and retention approved under D11. Numeric thresholds and external monitoring provider pending; no new paid service selected.

## 11. Backup, restore and incident response

Before authorized production changes verify provider backup capability, encryption/access, retention, recovery point objective (RPO), recovery time objective (RTO), responsible operator and last tested restoration. Do not assume free-plan backup/PITR availability; verify actual provider plan in separate approved task. Restore into isolated approved environment, not production; synthetic restore drill first, any real-data recovery requires explicit privacy-controlled authorization. Validate schema/version, counts, constraints, custody/manifest state, exact journal balance, obligation and cash roll-forward, outbox replay/dedupe and application compatibility. Record measured recovery time/data gap, evidence and reviewer. Backup existence alone is not recovery proof. RPO/RTO pending owner approval.

Incident workflow: detect -> classify/scope -> pause affected new intake/dispatch/financial execution -> preserve existing parcel/cash custody and evidence -> notify ops/finance/security/support -> reconcile actual vs expected -> authorized recovery command or compatible rollback/forward fix -> verify and independently approve resumption -> root-cause record. Routing outage: verified manual dispatch. Hub outage: capacity backpressure, preserve manifests and safe possession. Cash discrepancy: hold affected payout and reconcile. Offline driver: contact and resolve custody, no silent reassignment. Security compromise: restrict access, revoke affected credentials and investigate; no secret dumps. No ad hoc SQL balance edits or destruction of evidence. Critical incidents block go-live/resumption until authorized resolution.

## 12. Flags and release/rollback

Logical flag families (not existing env names): V2 intake/cohort; internal pickup; automatic dispatch; hub new-work intake; last-mile new-work intake; V2 financial new-effect routing; driver app new-work admission; approved external fallback. Default off on server. Dependency graph requires compatible commerce/logistics/hub/finance/device readiness; cannot enable checkout into missing critical services. Flags are not independent kill switches for core consistency: existing V2 orders remain bound to their original version/provider/accounting authority. Never switch off finance posting, custody recovery, returns, reconciliation or settlement of active obligations. Pause new work, permit scoped recovery. Audit actor/reason/cohort/version/time; no client-only enforcement. Provider exclusivity and no silent V1 fallback.

Release gates: approved target/commit, clean required evidence, verified backup/restore, migration dry run and compatible rollback plan, secrets and environment identity, separate owner authorization. Additive schema where safe, compatible backend/workers then frontend/mobile, verify flags off, authorized canary with defined cohort and monitoring. No production migration/deploy/activation in this phase. Stop if version/binding mismatch or critical incident. Rollback code only if compatible with existing V2 data and queued operations; otherwise pause intake and forward-fix with approved evidence. Never drop active parcels/journals or restore old DB over live cash without reconciled recovery plan. No arbitrary mobile reset. G6 pilot scope and G7 launch authorization distinct.

## 13. Gate evidence and approval

| Gate (Master Spec) | Required decision/evidence |
|---|---|
| G0 | approved implementation contracts, ED-01 physical proof, clean baseline, isolated environment readiness, decisions closed or safely deferred, explicit implementation authorization |
| G1 | atomic multi-merchant checkout, stock/money conservation, legacy compatibility |
| G2 | parcel/task/custody integrity, event replay and authorization |
| G3 | dispatch/hub/device E2E, approved operational/routing/device constraints |
| G4 | exact ledger/COD/remittance/payout/return reconciliation and fault proof |
| G5 | integrated E2E, security, load, migration/restore rehearsal, no P0 or unresolved critical/high security or money/custody integrity defect |
| G6 | authorized field pilot and ops/finance/legal readiness, actual reconciliation and sign-off |
| G7 | independent go/no-go and owner-authorized progressive release |

Gate evidence includes scope, exact SHA/branch, environment identity (private report), commands, timestamps, actual exit/results, artifact references, traceability IDs, defects/severity, residual risk, reviewer and owner decision. PASS only for proven scope; PASS WITH NOTES for nonblocking documented exceptions; FAIL for safety/critical failures; NOT RUN/BLOCKED explicit. No agent self-approval. Existing QA_CLOSURE_GATE remains binding; docs CI success is not runtime pass. Do not use deadline to waive critical gates. The 30-day target is conditional, not a guaranteed release.

## 14. Acceptance requirements

| ID | Scenario | Required result |
|---|---|---|
| SQ01 | local/staging target accidentally production | fail closed before mutation |
| SQ02 | cross-environment credentials or webhook | rejected, no external side effect |
| SQ03 | direct DB/RPC unauthorized role | denied; intended role succeeds |
| SQ04 | cross-merchant/driver/hub/beneficiary access | API and DB deny |
| SQ05 | revoked device/role or stale cache | no unauthorized new effects |
| SQ06 | rate-limited auth/OTP/telemetry | bounded requests, safe errors |
| SQ07 | secrets/PII in logs/build | detect and block exposure |
| SQ08 | full local replay and upgrade | verified schema and clean full suite |
| SQ09 | concurrency across stock/custody/cash | exact conserved effects |
| SQ10 | failpoint between merchant/courier posting | detect/recover full expected effect set |
| SQ11 | external execution uncertain | no duplicate payment |
| SQ12 | outbox lease expiry/replay | durable recovery, no duplicate effect |
| SQ13 | new lint diagnostics | rejected without weakening baseline rules |
| SQ14 | critical/high dependency finding | evaluated, fixed or evidenced non-applicable before launch |
| SQ15 | peak/burst/soak workload | approved thresholds, integrity preserved |
| SQ16 | device screen-lock/offline/reboot | measured safe behavior, no lost evidence |
| SQ17 | restore isolated backup | measured RPO/RTO and reconciled records |
| SQ18 | V2 intake disabled with open work | recovery and financial authority preserved |
| SQ19 | provider fallback or maps outage | no double dispatch/charge; safe manual recovery |
| SQ20 | critical cash/custody incident | alert, affected hold, audited recovery |
| SQ21 | legacy and native foundation | no regression; required checks intact |
| SQ22 | release binding or SHA mismatch | stop before publish/activation |
| SQ23 | field pilot and gate review | actual evidence and independent sign-off |

Requirements only; not executed. Map to all 174 domain/unified IDs and T01–T23 in implementation test register. G0 remains OPEN.

## 15. Open decisions and handoff

D01–D13 remain unresolved unless explicitly evidenced/approved. D09 spike, D12 load/device/pilot criteria, D11 retention/legal, RPO/RTO and approved staging cost/topology need owner decisions. No provider provisioning or fresh production inspection. Next 0.3J: 15_IMPLEMENTATION_ROADMAP.md, 16_ARCHITECTURE_DECISION_REGISTER.md, 17_G0_APPROVAL_GATE.md; identify authorized pre-implementation evidence tasks, dependencies, named owners and separate approval boundaries. Physical schema/DTO/route/lock supplements outstanding from 0.3H. No V2-01–08 implementation, remote provisioning, DDL or production operations until explicitly authorized. G0 OPEN.
