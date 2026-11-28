# Cursor implementation plan — NOT AUTHORIZED
No scaffold or runtime changes until G0 and explicit package authorization. Current main a661927fbfcb0e24e08feabc6c784c6a23ce6e23; read actual main and governance at execution. Do not use generic build-all task.
| Step | Deliverable | Dependencies / owner |
|---|---|---|
| H0 | design QA: tokens, components, navigation, RTL, dark, responsive, visual and state review | Product + Figma; no code |
| H1 | freeze UI contracts and screen-to-DTO traceability | PRE-G0-10; Backend + Product; D09/DRV ratification and G0 |
| H2 | independent driver shell, tokens, components, routing, synthetic fixtures | approved V2 package; Cursor; no customer app reuse by embedding |
| H3 | identity/device/permissions and shift states | approved auth API, Native and Backend; F1 |
| H4 | offers, route, pickup/hub and scanner | approved Dispatch/Hub/Logistics contracts; native offline scanner evidence |
| H5 | last-mile proof, COD, exception and return | TX11, Finance/Logistics, ED02 and G4 |
| H6 | encrypted offline repository, sync, session and recovery | Native/Claude, independent fault tests; integrate from H3 as dependency, not after unsafe UI |
| H7 | cash remittance, earnings, history/support/settings | approved financial projections, actor scope |
| H8 | QA and release preparation | device, accessibility, security, legacy, staging, field and release gates |
Cursor owns UI and component implementation; Claude Code owns backend/native and database transaction contracts. One migration writer, no unapproved dependencies, no real data, no production endpoints. Each ticket: source Figma node ID, UXA/DA references, exact API schema, allowed paths, fixtures, before/after visual evidence, commands/exit codes, PR, independent review. Tests must validate actual built bundle. No merge automatically. Current blocker: visual QA and prototype corrections; D09, G0, staging and exact contracts remain open. Netlify publish gate must be verified false before docs merges; actual setting not accessible here.
