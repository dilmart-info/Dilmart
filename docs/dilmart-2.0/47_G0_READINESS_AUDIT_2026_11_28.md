# DilMart 2.0 — G0 Readiness Audit
Date: 2026-11-28. Inspected main: a661927fbfcb0e24e08feabc6c784c6a23ce6e23.
Verdict: OPEN / BLOCKED. Read-only evidence review and documentation only; no new runtime tests, live access, provisioning, merge or deployment authorized.

## 1. Repository and CI
Main contains numbered documents 00–22. PR #68 merged; manual schema workflow and final-schema-gate.sql exist. Fourteen open PRs #69–82 at inspection.
| PR | Critical CI run/result | Native CI run/result | Disposition |
|---|---|---|---|
| 69 | 45947134880 FAIL | 45947134836 PASS | evidence review; retry after CLI correction |
| 70 | 45973540489 PASS | 45973540695 PASS | policy; refreshed source SHA ac43c188 |
| 71 | 45958431279 PASS | 45958431241 PASS | policy |
| 72 | 45958771911 PASS | 45958771759 PASS | policy |
| 73 | 45960035318 PASS | 45960035358 PASS | policy |
| 74 | 45960545157 PASS | 45960545136 PASS | policy |
| 75 | 45960821600 PASS | 45960821606 FAIL | Maven 429; rerun |
| 76 | 45962080714 PASS | 45962080672 PASS | policy; mandatory customer isolation |
| 77 | 45967317271 PASS | 45967317307 PASS | policy |
| 78 | PASS (run ID not recorded) | 45969749722 PASS | policy |
| 79 | 45971331723 PASS | 45971331720 PASS | policy |
| 80 | 45971491707 PASS | 45971491720 PASS | refresh register after 70–79 |
| 81 | 46114661119 PASS | 46114661113 PASS | preserve reports 36–46; no D09 closure |
| 82 | 46118852027 PASS | 46118852040 PASS | draft UX handoff; polish incomplete |

Run links: https://github.com/dilmart-info/Dilmart/actions/runs/{run_id}. Results are historical head checks, not guarantee of new merge checks. Some mergeability values unknown; refresh each before merge.

## 2. Failure diagnosis
PR69 job 140334313992 and main run 45973473324 job 140419331628: Setup Supabase CLI latest release resolution rate limited. PR75 Android job 140377949187: Maven Central HTTP 429 resolving Gradle classpath (Kotlin 2.1.0, httpmime 4.5.6, commons-io 2.16.1). No billing evidence in inspected logs. Netlify run 46119336450 job 140900143023 rejected pull_request trigger at trust boundary; publish skipped. Do not weaken protection. Proposed separately authorized CI-only change: pin verified CLI version, retain checks, cache/retry responsibly, skip ineligible PR-triggered deploy workflows while preserving fail-closed gates. Actual publish variable unknown; owner verify false before merges.

## 3. PRE-G0 reconciliation
| Task | Status | Next evidence |
|---|---|---|
| 01 | BLOCKED | fresh schema workflow on merged main; no successful fresh dispatch found; prior runs 45939430698,45939913216,45940223488 failed on 920e2c8. Object-level diff, not counts only |
| 02 | PASS WITH NOTES accepted per doc22 | doc21 run45897529060: 115 pass, 0 fail, 1 TODO; historical Windows failures retained; latest main CI red |
| 03 | OPEN | complete reuse/writer/lock graph after catalog proof |
| 04 | OPEN | isolated finance fault injection and effect reconciliation |
| 05 | OPEN | privileges, definer search_path, negative scope and PII checks |
| 06 | evidence PASS WITH NOTES, review pending | PR69 report23: root 35 total/8 prod, backend15/7; prioritize reachable HTTP and native paths; verify advisory fixes before remediation |
| 07 | evidence PASS WITH NOTES, review pending | PR69 report24: root449 errors/33 warnings; backend555/1; fingerprint prototype not enforced |
| 08 | PARTIAL | PR81 reports45–46: phone102/102 emulator98/98 automated; Capacitor/native SQLCipher preferred; SP06 blocked, no decoded code; true lock/battery open, F1 permission crash; explicit D09 disposition required |
| 09 | OPEN | authoritative environment map has no independent Store staging; separate topology/budget approval |
| 10 | OPEN | physical schema/DTO/event/state/route/lock supplement after dependencies |
| 11 | PARTIAL | 169 policy IDs approved in principle per unmerged register35; exact semantics and HUB/DRV ratification pending |
| 12 | BLOCKED | independent review and dated owner authorization |

ED01–06 remain open; ED06 later operational gate unless earlier dependency. No automatic deferrals. D01 blocked; D02/D06/D07/D10/D12/D13 exact semantics pending; D03/D05/D08/D11 interface constraints pending, field/legal proof later under approved deferrals; D04 G6 cohort; D09 open. No invented readiness percentage.

## 4. Merge plan (proposed, not executed)
First confirm production publish disabled and stabilize CI; verify actual head/required checks for each PR. Review evidence69 and policy70–79; rerun failed checks, update branches where required without bypass. Merge policy documents in numerical order after review, then refresh register80 with current source heads/statuses (70 changed). Archive evidence81 without implying technology acceptance. Update draft82 with UX09 structural audit: 54 frames, 390×844, Tajawal, three variables and only Light mode, six nav bars; 17 proposed variants and context/confirmation links not created due Figma Starter MCP limit. Correct visual/prototype gaps before signoff. This audit may be merged separately only after review; preserve historical reports.

## 5. Critical path and accountability
Wave A: CI stability and ED01 local/hosted catalog evidence (separate authorized read-only metadata, no business rows); parallel policy semantics and staging topology planning. Wave B: writer/lock audit, finance fault proof, privileges; dependency remediation and no-new lint gate with separate authorization; staging provision only after approved cost/targets. Wave C: PRE-G0-10 exact contracts, D09 decision/containment and explicit policy ratification; independent review PRE-G0-12. UI polish parallel, no runtime work. Proposed roles: Architecture/DB, Finance/QA, Security, Release, Mobile, Product/Operations, independent reviewer and owner. Actual names and dates not assigned.
All eleven doc17 checklist items require evidence; phase0.3J merged and prior baseline accepted but no full checklist closure certified. No launch deadline overrides integrity. Current main/PR state is a snapshot. No verification of live provider state, secret variables, branch protection configuration, raw local audit artifacts or physical devices in this review.

## 6. Repository consolidation addendum — 2026-11-28
This addendum supplements the historical inspection above; historical failure evidence remains unchanged. Owner authorized sequential documentation merges after successful checks. Main reached `37f12c52425d93fafbd7171ca804316d6a38f768` after merging #84, #69–79 and #81. The failed Critical job for #69 (45947134880) and Android job for #75 (45960821606) reran successfully before merge. Documents 25–34 were read from that main revision and the 169 policy IDs independently recounted (12/12/16/16/18/18/17/20/22/18). PR #80 was reconciled against this baseline; #82 was updated to preserve the UX-09 PARTIAL / BLOCKED disposition and merged evidence references. Both require fresh CI at their changed heads. This addendum does not assert that #80/#82/#83 are merged or that post-merge main push CI has been independently verified. The owner reported green CI and disabled production deploy; no deployment or production mutation was initiated by this consolidation. Fresh schema evidence, ED01–06, D09, UX acceptance, staging and exact contracts remain outstanding as applicable. G0 remains OPEN / BLOCKED; V2 implementation NOT AUTHORIZED.
