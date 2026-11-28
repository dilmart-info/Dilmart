# UI acceptance plan — requirements only
No tests executed by this handoff. Map DA01–34 in doc 11, TX and security contracts in docs 13–14; keep original SP IDs. Gate ownership proposed: UI QA/Cursor for visual; native/Claude for Android; Backend/Finance for authoritative effects; independent QA + owner for approval.
| ID | Test | Expected evidence |
|---|---|---|
| UXA01 | 54 screen inventory | matching Figma IDs; screen/variant coverage; no missing state |
| UXA02 | 390×844 and small/large screens | responsive layout, safe areas, no clipped nested text |
| UXA03 | Arabic RTL + mixed IDs/IQD | correct bidi, reading order, mirrored navigation |
| UXA04 | accessibility | labels, focus, 48dp targets, contrast, font scaling |
| UXA05 | light/dark | all semantic states readable, no color-only meaning |
| UXA06 | permission F1 | denial/revocation typed blocker, no crash or unauthorized tracking (DA04/06) |
| UXA07 | device/actor/mode | no self-grant, no prior-user/merchant/customer leakage (DA01/02/03/29) |
| UXA08 | shift/availability | server confirmation, pending custody/cash close blocked (DA28) |
| UXA09 | offer expiry/offline/concurrent | no invalid assignment, same effect on retry (DA09/10) |
| UXA10 | route stale/reassignment | version conflict, completed prefix retained (DA11) |
| UXA11 | scanner | QR, Code128, offline first-use, invalid/duplicate/cancel/permission (DA12, SP06) |
| UXA12 | pickup/hub/return | exact partial set, dual ACK, no auto restock (DA13–15/19) |
| UXA13 | OTP/COD | invalid/expired/reused rejected, exact due, truthful discrepancy (DA16–18) |
| UXA14 | authoritative success | no success on tap/202/offline; receipt/version verified |
| UXA15 | uncertain recovery | lost response, duplicate action/business ID, 100 distinct effects exactly (DA20–25) |
| UXA16 | storage | crash, full/corrupt/wrong-key, actor switch, upgrade, reboot when authorized (DA21/25/32) |
| UXA17 | financial | pending remittance unchanged, earnings separate (DA26/27) |
| UXA18 | GPS | true lock/background/stop, stale location, battery/device matrix (DA05–07/31, SP02/05) |
| UXA19 | push/API | missed/repeated hints refresh, no PII (DA08) |
| UXA20 | safe navigation/support | safe stop, no unapproved external sharing (DA30) |
| UXA21 | legacy isolation/flags | preserve customer, merchant, agent, Jenni; pause new intake not recovery (DA33/34) |
| UXA22 | prototype visual QA | walk all primary and exception paths; fix known misroutes before design signoff |
Each result: exact revision, screen/device/OS, fixture, expected/actual, screenshot or sanitized log, PASS/FAIL/BLOCKED/NOT RUN, reviewer. G0 is implementation authorization; G3/G4/G5/G6/G7 remain separate. No test skipped without explicit accepted disposition. Proposed deferrals only: SP05 extended battery, reboot, push, OEM, attestation, power loss, signing and device coverage require gate/owner/containment; SP02/SP06 remain open unless explicit safe deferral approved. F1 mandatory before product build exposure.
