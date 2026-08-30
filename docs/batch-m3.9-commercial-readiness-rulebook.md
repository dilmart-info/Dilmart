# Batch M3.9 — Commercial Readiness Rulebook

## Status

**Completed** (M3) · Addenda through **M7.5** appended below

This document closes the M3 track with an operational rulebook that defines commercial readiness standards, ownership boundaries, and daily governance routines. Section 9 extends the same governance narrative with M4 automation, telemetry, and executive oversight policies.

---

## 1) Purpose

Establish one authoritative reference for:

- what “ready for commercial operation” means
- what must be blocked vs allowed
- who owns each control (platform vs merchant)
- how teams run daily governance in production

---

## 2) Readiness Levels

## A) Store Readiness (Merchant-level)

A merchant is considered commercially ready when all required checks pass:

- store profile completed
- contact channels present
- address (city + address) present
- at least one product exists
- at least one active product exists
- products are categorized
- merchant status is active

Enforcement:

- activation to `active` is blocked if required checks are incomplete.

## B) Product Readiness (Catalog-level)

A product is considered publish-ready when core checks pass:

- name present
- slug present
- valid price (`> 0`)
- category linked
- at least one image
- valid stock (`>= 0`)
- valid discount relation when discount exists
- description present
- active state alignment

Enforcement:

- product activation is blocked when readiness is incomplete.
- create/update with `is_active=true` follows same readiness gate.

## C) Coupon Commercial Readiness

A coupon is considered commercially valid when:

- code is present
- value is positive
- percentage discount does not exceed 100
- min order amount is non-negative
- max uses (if set) is greater than zero
- expiry (if set) is valid and future-dated
- code is unique in the same scope (merchant or platform global)

Enforcement:

- invalid payloads are rejected at backend validation layer.

---

## 3) Hard Rules (Blockers)

The system must block operations in these cases:

- merchant activation with incomplete store readiness
- product activation/publish with incomplete product readiness
- invalid offer timing (`offer_ends_at` in past or without valid discount)
- merchandising flags on inactive/unavailable products
- coupon setup violating value/expiry/usage constraints
- duplicate scoped coupon code
- duplicate merchant-scoped product slug

---

## 4) Ownership Matrix (Platform vs Merchant)

## Platform-owned (Admin)

- global delivery settings
- global loyalty policy
- multi-merchant governance and readiness oversight
- platform-level commercial guardrails

## Merchant-owned

- merchant store settings
- merchant catalog quality and product readiness
- merchant order operations
- merchant coupon operations within merchant scope
- merchant customer operations (scoped)

Boundary note:

- Merchant portal is explicitly merchant-scoped and does not expose platform-global controls.

---

## 5) Daily Governance Routine (Recommended)

## Admin Daily Loop

1. Open dashboard governance layer (`M3.8` card).
2. Review:
   - non-ready merchants
   - non-ready products
   - delayed pending orders (>24h)
3. Prioritize top merchants with lowest readiness score.
4. Follow up merchant teams using readiness checklists.
5. Re-check before end of day for closure delta.

## Merchant Daily Loop

1. Open merchant cockpit overview.
2. Resolve “required now” action queue first.
3. Improve:
   - store readiness score
   - non-ready product count
   - low-stock items
4. Monitor order status buckets and delayed orders.

---

## 6) Release/Go-Live Gate

A merchant can be considered commercially live when:

- store readiness is complete
- at least one product is active and ready
- no critical coupon misconfiguration
- no unresolved critical operational blockers

Optional quality gate:

- low delayed order ratio for a sustained observation window.

---

## 7) Exceptions Policy

Temporary exception can be allowed only by platform admin when:

- business-critical launch requires controlled override
- documented reason and expiry are recorded
- follow-up remediation owner and deadline are assigned

Default policy:

- no silent exceptions; all overrides must be explicit and time-bound.

---

## 8) M3 Closure Summary

By M3 completion, the system now includes:

- readiness contracts (store + product)
- backend enforcement for activation and commercial integrity
- scoped ownership clarity between platform and merchant
- cockpit visibility for both merchant and admin
- lightweight governance indicators for daily operations

This rulebook finalizes M3 as an operationally governed, multi-merchant commercial baseline.

---

## 9) M4 Addendum — Automation, Telemetry, and Executive Oversight

M4 does **not** replace M3 readiness rules; it adds **signals, prioritization, and review loops** on top. The following policies apply to how automation and intelligence features must be used and interpreted.

### A) KPI and metric naming

- **Single source of truth** for KPI names, scopes, and windows: `docs/m4-kpi-contract.md`.
- Derivative metrics must reference that contract or `docs/m4-metric-formula-catalog.md`—no ad-hoc duplicate definitions in product copy.

### B) Operational alerts (M4.1)

- Computed alerts (delayed orders, catalog quality, merchant readiness, low stock) are **advisory** unless paired with explicit workflow; they supplement but do not replace M3 blockers.
- Persisted notifications and computed alerts may coexist; computed alerts must not be marked “read” via API if they are not stored rows.

### C) Merchant performance scorecard (M4.2)

- Scorecard is an **internal prioritization** aid for admins; it is **not** an automatic penalty or suspension mechanism.
- Trend field may remain a baseline until historical series are stored server-side.

### D) Funnel and growth hooks (M4.3)

- Funnel stages map to documented event names; default interpretation uses **rolling windows** per `m4-kpi-contract.md`.
- Client-local event logs are **not** a platform census; merchant views are scoped where implemented.

### E) Merchant nudges (M4.4)

- Nudges are **in-app recommendations** only; no commitment to push/email in this phase.
- Resolution state may be tracked locally for UX; operational truth remains server readiness and orders.

### F) Governance workflow actions (M4.5)

- Owner/deadline/status for readiness follow-ups are **browser-local** unless migrated; treat as a **personal/task aid** for admins, not an audit trail of record.

### G) Commercial policy profiles (M4.6)

- Profiles (`balanced` / `strict`) define **caps and floors** for discounts and coupons in line with platform standards.
- Assignment may be stored locally in the baseline; production policy of record should eventually align with server configuration when multi-device consistency is required.

### H) Experimentation (M4.7)

- Registered experiments must use stable **experiment id** and **variant id** in `experiment.exposed` / `experiment.outcome` events.
- One primary outcome per surface (e.g. hero CTA) is sufficient for baseline; advanced statistics are out of scope.

### I) Executive governance view (M4.8)

- **Merchant health distribution** and **delayed-order map** reflect **current** server state.
- **Weekly throughput** (orders/revenue by week) is the approved **proxy** for “conversion momentum” when centralized session funnel is unavailable.
- **Readiness trend** line may rely on **local weekly snapshots** when opened by leadership; document clearly when presenting externally.

### J) Daily / weekly cadence (additions to §5)

**Admin weekly (leadership):**

1. Open **حوكمة تنفيذية** (`/admin/executive`) for distribution, delayed map, and weekly throughput.
2. Cross-check **computed alerts** and M3.8 governance tiles on the main admin dashboard.
3. Confirm highest-risk merchants via scorecard and lowest-readiness list links.

**Platform operator:**

- Keep KPI glossary and telemetry map updated when adding events or renaming metrics (`m4-telemetry-coverage-map.md`).

---

## 10) Cross-Reference — M4 Contract Documents

| Document | Purpose |
|----------|---------|
| `docs/m4-final-closure-report.md` | M4 phase closure and batch inventory |
| `docs/m4-kpi-contract.md` | Canonical KPI dictionary |
| `docs/m4-telemetry-coverage-map.md` | Event coverage vs KPIs |
| `docs/m4-metric-formula-catalog.md` | Formulas and examples |
| `docs/m4-architecture-plan.md` | Original M4 roadmap and principles |

---

## 11) M5 Addendum — Durability, Auditability, and Outbound Operations

M5 does **not** replace M3/M4 governance semantics; it upgrades persistence, reporting contracts, and operational fanout reliability.

### A) Durability policy

- Governance workflow, policy assignment, telemetry events, and experiment reporting should prefer **server source-of-record** contracts where available.
- Local/browser state remains fallback-only during migration phases and should not be treated as system-of-record.

### B) Audit policy

- Administrative state-changing actions (workflow status updates, policy assignment changes) must preserve actor/timestamp metadata and emit audit logs where implemented.
- “Best effort” operations must fail safely without breaking admin read paths.

### C) Telemetry and experiment operations

- Event ingestion endpoints define canonical server write paths for growth/experiment signals.
- Experiment reporting should consume server rollups first; local rollups are continuity fallback.
- Registry contracts should keep explicit `experiment_id`, variants, primary outcome key, and status.

### D) Outbound notification channels

- In-app feed remains baseline channel.
- Outbound channels (webhook/email adapters) are additive and non-blocking.
- Dispatch controls (cooldown/dedup) are required to prevent fanout flooding.

### E) Weekly operations addendum

**Platform operations weekly:**

1. Verify server ingestion health and summary endpoints.
2. Review governance task persistence coverage (server vs fallback usage).
3. Review outbound alert delivery warnings and adjust routing/cooldown if needed.

---

## 12) Cross-Reference — M5 Contract Documents

| Document | Purpose |
|----------|---------|
| `docs/m5-final-closure-report.md` | M5 phase closure and outcomes |
| `docs/m5-architecture-plan.md` | M5 roadmap and exit criteria |
| `docs/batch-m5.0-pre-implementation-plan.md` | Durability contract and migration mapping |
| `docs/batch-m5.1-implementation-report.md` | Telemetry ingestion baseline |
| `docs/batch-m5.2-implementation-report.md` | Governance workflow persistence baseline |
| `docs/batch-m5.3-implementation-report.md` | Commercial policy persistence baseline |
| `docs/batch-m5.4-implementation-report.md` | Experiment registry/reporting baseline |
| `docs/batch-m5.5-implementation-report.md` | Outbound notification foundation |

---

## 13) M6 Addendum — Reliability Hardening and Reconciliation Operations

M6 extends M5 durability work with explicit reliability operations and controlled recovery workflows.

### A) Cutover and fallback policy

- Server-only mode is the default for governance workflow and policy assignment where implemented.
- Local fallback is considered **emergency-only** and must be explicitly gated by runtime flag.
- Silent fallback should be avoided for operational records of truth.

### B) Telemetry operations policy

- Ingestion health and retention cleanup endpoints form the baseline ops contract.
- Retention actions should default to dry-run or equivalent safe mode before destructive execution.
- Cleanup windows must preserve minimum auditability expectations.

### C) Outbound delivery policy

- Outbound channels remain additive to in-app notifications.
- Dispatch attempts should be logged with attempt number, status, and error summary.
- Retry should target transient failures (network/timeouts/429/5xx) and avoid noisy retries on terminal failures.

### D) Reconciliation policy

- Admin operators should be able to inspect failed dispatch attempts and trigger replay without direct DB access.
- Replay actions must be role-protected and auditable.
- Reconciliation interfaces should prioritize safe, bounded actions over bulk destructive controls.

### E) Weekly operations addendum

**Platform operations weekly:**

1. Review ingestion health trends and lagging-event indicators.
2. Review retention dry-run outputs before scheduled cleanup.
3. Review outbound failure attempts and replay outcomes.
4. Verify emergency fallback flags remain disabled unless incident response requires them.

---

## 14) Cross-Reference — M6 Contract Documents

| Document | Purpose |
|----------|---------|
| `docs/m6-final-closure-report.md` | M6 phase closure and outcomes |
| `docs/m6-architecture-plan.md` | M6 roadmap and exit criteria |
| `docs/batch-m6.0-pre-implementation-plan.md` | Cutover matrix and reliability contract draft |
| `docs/batch-m6.1-implementation-report.md` | Telemetry reliability & retention ops baseline |
| `docs/batch-m6.2-implementation-report.md` | Server-only cutover defaults |
| `docs/batch-m6.3-implementation-report.md` | Outbound attempt tracking and retry baseline |
| `docs/batch-m6.4-implementation-report.md` | Reconciliation console baseline |

---

## 15) M7 Addendum — Automation, Multi-Channel Delivery, and Replay Governance

M7 extends M6 reliability hardening into repeatable operations automation and policy-governed recovery loops.

### A) Scheduled reliability jobs policy

- Retention cleanup, failed-dispatch scanning, and bounded replay jobs are valid operational controls when:
  - execution is bounded
  - run summaries are persisted
  - rollback/disable controls remain available via configuration flags
- Automated jobs are operators’ force multipliers, not replacements for incident ownership.

### B) Multi-channel delivery policy

- In-app delivery remains baseline visibility channel.
- External delivery channels (webhook/email adapters) should be routed through explicit channel order policy and failover.
- Failover actions must preserve dispatch attempt logging for reconciliation review.

### C) Reconciliation diagnostics policy

- Failure handling should use normalized taxonomy categories for triage consistency.
- Channel-level diagnostics (volume, failures, failure rate) are required for routing quality review.
- Replay effectiveness indicators should be reviewed regularly to identify noisy/ineffective retry behavior.

### D) Replay governance policy

- Replay execution must honor policy constraints (window caps and cooldown controls).
- Scheduled replay path should enforce stricter cooldown behavior than ad-hoc manual replay where configured.
- Policy-blocked replay outcomes must be observable to operators and captured in audit context.

### E) Weekly operations addendum

**Platform operations weekly:**

1. Review `operations_job_runs` summaries for failures/partials and repeated anomalies.
2. Review channel-level diagnostics and adjust delivery order/failover policy when needed.
3. Review replay policy blocks to tune caps/cooldowns without causing recovery starvation.
4. Confirm emergency toggles remain at intended defaults outside active incident windows.

---

## 16) Cross-Reference — M7 Contract Documents

| Document | Purpose |
|----------|---------|
| `docs/m7-final-closure-report.md` | M7 phase closure and outcomes |
| `docs/m7-architecture-plan.md` | M7 roadmap and exit criteria |
| `docs/batch-m7.0-pre-implementation-plan.md` | Discovery contract for automation/channel/diagnostics |
| `docs/batch-m7.1-implementation-report.md` | Scheduled reliability jobs baseline |
| `docs/batch-m7.2-implementation-report.md` | Multi-channel delivery orchestration baseline |
| `docs/batch-m7.3-implementation-report.md` | Reconciliation diagnostics baseline |
| `docs/batch-m7.4-implementation-report.md` | Replay governance policy baseline |

---

## 17) M8 Addendum — Deterministic Recovery Lifecycle and Trend Governance

M8 extends M7 by making recovery execution more deterministic, more observable, and easier to govern through lifecycle-aware operations.

### A) Dead-letter lifecycle policy

- Failed dispatches should be represented in lifecycle states (`new`, `retrying`, `dead_lettered`, `resolved`) where available.
- Lifecycle transitions must be operator-auditable and role-protected.
- Policy-blocked replays should not remain silent; they must appear in lifecycle/error context for review.

### B) Provider acknowledgment policy

- Outbound attempts should capture provider-level acknowledgment fields where available:
  - provider name
  - provider message/reference ID
  - acknowledgment status/time
  - normalized provider/transport error code
- Missing acknowledgment must be explicitly represented (`no_ack`) rather than implied.

### C) Replay lifecycle console policy

- Reconciliation console should support state-based triage and safe state transitions.
- Operator actions (retry, resolve, escalate/dead-letter, mark retrying) must stay within admin-safe boundaries.
- UI actions are operational controls and should not bypass replay policy constraints.

### D) Trend intelligence policy

- Weekly resilience review should include:
  - policy-blocked replay rate
  - repeated-failure clusters
  - average recovery lead time
- Trend interpretation should use documented windows and avoid ad-hoc metric drift.

### E) Weekly operations addendum

**Platform operations weekly:**

1. Review lifecycle queue distribution (`retrying`/`dead_lettered`/`resolved`) and aging.
2. Review provider acknowledgment quality (`acknowledged` vs `no_ack`/`rejected`) per channel.
3. Review policy-block trend and adjust governance thresholds only with documented rationale.
4. Review recovery lead-time trends and prioritize persistent failure clusters.

---

## 18) Cross-Reference — M8 Contract Documents

| Document | Purpose |
|----------|---------|
| `docs/m8-final-closure-report.md` | M8 phase closure and outcomes |
| `docs/m8-architecture-plan.md` | M8 roadmap and exit criteria |
| `docs/batch-m8.0-pre-implementation-plan.md` | Discovery contract for deterministic recovery |
| `docs/batch-m8.1-implementation-report.md` | Dead-letter lifecycle baseline |
| `docs/batch-m8.2-implementation-report.md` | Provider acknowledgment telemetry baseline |
| `docs/batch-m8.3-implementation-report.md` | Replay lifecycle console baseline |
| `docs/batch-m8.4-implementation-report.md` | Policy trend intelligence baseline |
