# DilMart 2.0 — Consolidated Business Decision Register
Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Reconciled: 2026-11-28 against main `37f12c52425d93fafbd7171ca804316d6a38f768`.
Scope: PRE-G0-11 evidence index and remaining decision work.
Status: 169 policy IDs approved in principle by owner in project conversation; all policy PRs #70–79 merged; documents 25–34 verified on the reconciled main. This register is a consolidation, not a new owner approval or G0 closure.

## 1. Source inventory
Counts rechecked against decision table rows in merged documents 25–34 at the reconciled main. Head SHA identifies the reviewed source PR, not the squash merge commit.
| Decision | IDs | Count | PR | Head SHA | Document |
|---|---|---:|---|---|---|
| D06 | COM-01–12 | 12 | [#70](https://github.com/dilmart-info/Dilmart/pull/70) | `ac43c1882e9a895c2904cfa422df370e19c0b5eb` | 25_COMMERCIAL_MODEL_AND_PRICING_POLICY.md |
| D05 | PAY-01–12 | 12 | [#71](https://github.com/dilmart-info/Dilmart/pull/71) | `44654ee1049b5e954b553414f5f7a924f62a487d` | 26_DRIVER_COMPENSATION_AND_FLEET_POLICY.md |
| D07 | CASH-01–16 | 16 | [#72](https://github.com/dilmart-info/Dilmart/pull/72) | `83ecd82d3c82d541c3ab12ba6f216a8537e82427` | 27_CASH_CUSTODY_AND_SETTLEMENT_POLICY.md |
| D02 | PROM-01–16 | 16 | [#73](https://github.com/dilmart-info/Dilmart/pull/73) | `d6e1406adc23aaecc15e6d06d1879a727bf339c4` | 28_INVENTORY_PROMOTION_AND_LOYALTY_POLICY.md |
| D10 | SLA-01–18 | 18 | [#74](https://github.com/dilmart-info/Dilmart/pull/74) | `c89f55daa23f2f15e539ba0553680cf2d44a1236` | 29_DELIVERY_SLA_CANCELLATION_AND_RETURNS_POLICY.md |
| D13 | EXT-01–18 | 18 | [#75](https://github.com/dilmart-info/Dilmart/pull/75) | `237a1d9d1fb35204885bb9a27629bd55e58f36e2` | 30_EXTERNAL_LOGISTICS_PROVIDER_POLICY.md |
| D03 | HOP-01–17 | 17 | [#76](https://github.com/dilmart-info/Dilmart/pull/76) | `a2e18b1d03366ee1e3db7f6d84e245b350564176` | 31_LOGISTICS_HUB_CAPACITY_AND_OPERATIONS_POLICY.md |
| D12 | OPS-01–20 | 20 | [#77](https://github.com/dilmart-info/Dilmart/pull/77) | `de7ade760819e47ce796ed9aada7398a05f22099` | 32_OPERATIONAL_TARGETS_AND_LAUNCH_CRITERIA.md |
| D11 | PRIV-01–22 | 22 | [#78](https://github.com/dilmart-info/Dilmart/pull/78) | `4c5f8988729c473088c00b0ad3aa6a07e6994d53` | 33_SECURITY_PRIVACY_AND_LEGAL_POLICY.md |
| D08 | MAP-01–18 | 18 | [#79](https://github.com/dilmart-info/Dilmart/pull/79) | `05061bea7c8d23fa89ebee74a11484e67ca0de57` | 34_MAPPING_ROUTING_AND_NAVIGATION_POLICY.md |
Total 169. These overlap earlier architecture requirements; do not sum with 179 architecture IDs as distinct features. HOP-17 / OPS-11 / PRIV-01–06 / MAP-14 are mutually reinforcing mandatory privacy constraints.

## 2. Master decision disposition
| ID | Current status | Remaining evidence / decision | Gate / accountable role |
|---|---|---|---|
| D01 | BLOCKED | complete canonical schema diff, writer/reuse/lock audit and exact physical contract | G0 / Architecture DB |
| D02 | Principles approved | exact stacking, funding, budget consumption/reversal, points conversion/expiry/restoration, partial cancellation, rounding | G0 / Commerce Finance |
| D03 | Principles approved | approve design capacity interfaces; actual site, hours, staffing, equipment and measured throughput | G0 constraints; G3 field / Operations |
| D04 | OPEN | verified contracted and trained activation cohort; prospective 250 not activated | G6 / Operations |
| D05 | Principles approved | earnings eligibility/version, vehicle/shift/capacity constraints; actual tariffs, contracts and roster | G0 interface; G3 field / Operations Finance |
| D06 | Principles approved | commission base, fee precedence, subsidy, partial/refund and tax/recognition rules | G0 / Product Finance accountant |
| D07 | Principles approved | exposure, remittance, hold/settlement and approval rules, ledger accounting; numeric configuration and safe defaults | G0 / Finance accountant |
| D08 | Principles approved | adapter contract and safe fallback; provider capabilities, benchmark, quotas and cost | G0 constraints; G3 field / Engineering |
| D09 | OPEN | reports 36–46 merged via #81; Capacitor/native SQLCipher preferred, not approved; SP-06 BLOCKED, SP-02/SP-05 and F1 unresolved; explicit D09 disposition required | G0 / Mobile |
| D10 | Principles approved | exact timeout/default/terminal resolution, cancellation and retry rules; offline recovery, cutoff, return/refund eligibility | G0 / Operations Product |
| D11 | Principles approved | mandatory merchant PII isolation, exact allowlists/grants and retention design; legal/insurance/contracts | G0 constraints; G5 security; G6 legal / Security Legal |
| D12 | Principles and pilot target approved | exact workload mix, burst/soak, thresholds, sample and RPO/RTO; field capacity proof | G0 / QA Operations |
| D13 | Principles approved | provider exclusivity, exact fallback transitions and fee/split rules; carrier activation only with proof | G0 / Logistics Finance |

HUB01–20 and DRV01–24 remain explicitly proposed in source headers; require separate owner ratification of architecture direction. HOP/PAY approval does not automatically ratify every HUB/DRV clause. No numerical tariffs or legal conclusions inferred.

## 3. Required implementation policy freeze
Before G0, produce a compact explicit executable-semantics decision supplement for D02/D06/D07/D10/D12/D13 and interface constraints for D03/D05/D08/D11. Distinguish configurable values from required invariant semantics. Where actual field values are unavailable, propose explicit conservative test-only configuration, disabled dependent capability and deferral record (owner, deadline, rationale, containment proof); never assume approval or defer critical stock, money, custody or authorization semantics. Merchant isolation is nondeferrable for every exposed flow. No auto split, auto carrier switch on unknown outcome, silent customer consent, arbitrary balance edit, or off-shift tracking.

## 4. Technical readiness and order of work
| Task | Status at reconciliation | Next action |
|---|---|---|
| PRE-G0-01 / ED-01 | BLOCKED; schema workflow PR #68 merged; CI stabilization #84 merged | fresh manual run on merged main; compare exact canonical metadata against separately authorized read-only hosted catalog; explain every drift |
| PRE-G0-02 | PASS WITH NOTES via accepted Linux CI evidence in doc 21 | preserve canonical evidence and TODO disposition; revalidate if baseline changes materially |
| PRE-G0-03 | OPEN | writer inventory and lock graph after catalog proof |
| PRE-G0-04 / ED-02 | OPEN | isolated finance fault injection, sentinel/early-exit and effect-level recovery; no real money |
| PRE-G0-05 / ED-03 | OPEN | grants/RLS/views/definers and merchant negative access proof |
| PRE-G0-06 / ED-04 | PASS WITH NOTES evidence PR #69 merged; ED-04 OPEN | separate compatible remediation plan and tests; audit evidence is historical, not remediation |
| PRE-G0-07 / ED-05 | PASS WITH NOTES evidence PR #69 merged; ED-05 OPEN | independently verify fingerprints, enforce no-new diagnostics before features |
| PRE-G0-08 / D09 | PARTIAL / D09 OPEN | preserve merged evidence; no new spike round authorized; decide remaining qualification and containment |
| PRE-G0-09 | OPEN | separately approve isolated staging topology, budget and credentials; no live binding |
| PRE-G0-10 | OPEN | exact physical schema/DTO/state/event/route/lock contracts after prerequisite evidence |
| PRE-G0-11 | IN PROGRESS | policies merged; ratify HUB/DRV, freeze semantics and explicit safe deferrals |
| PRE-G0-12 | BLOCKED | independent gate review after prerequisites, explicit owner implementation authorization |

PRs #68–79 and #81/#84 merged. #69 and #75 failed jobs reran successfully before merge. PR head CI evidence is not independent proof of final main push CI; verify separately. Do not bypass checks or assume billing is cause. ED-06 operational acceptance remains partial and required G6/G7 unless earlier dependency. Verify Netlify production publish gate is false during docs merges; actual value not accessible here. No production mutations, paid provisioning or runtime work authorized.

## 5. Change control
Register indexes exact source decisions, not replacements. Resolve conflicts by dated owner decision with affected contracts, tests and reviewers. Source policy documents are now on main; this reconciliation updates historical source references and dispositions without changing approved principles. Next: fresh schema evidence, explicit D09 disposition without a new spike round, staging topology proposal, and freeze remaining business semantics. G0 remains OPEN / BLOCKED.
