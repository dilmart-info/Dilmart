# DilMart Driver — Developer Handoff v1.0 (review draft)
Date: 2026-11-28. Baseline main: a661927fbfcb0e24e08feabc6c784c6a23ce6e23.
Status: design-only, NOT implementation-ready; G0 OPEN / BLOCKED; D09 OPEN.
Figma: https://www.figma.com/design/VP7ObUnxVriELZficZXUyf
Prototype: https://www.figma.com/proto/VP7ObUnxVriELZficZXUyf?node-id=5-30

## Authority
Read root AGENTS.md, CLAUDE.md, ai/ENVIRONMENT_SOURCE_OF_TRUTH.md, ai/QA_CLOSURE_GATE.md, governance/CURRENT_PHASE.md and docs 09–14, 17 before work. This package supplements, never overrides, those contracts. DRV01–24 remain proposed in source; explicit ratification required. PR #81 (head b63126f8701293073b12d0e94fa80141b11656e7 at inspection) reports 45–46 are unmerged evidence, not main. Owner approved visual direction in conversation and requested to stop further spike rounds; this is not a D09 closure or blanket deferral. Capacitor + native SQLCipher is preferred based on 102/102 phone and 98/98 emulator automated checks reported in 45. SP-02, SP-06, SP-05, F1 and remaining acceptance items retain their actual status. No device test, runtime code, DDL, provisioning, deployment or merge authorized here.

## Product
Independent Android-first app; Arabic RTL, server-authorized pickup/delivery/hybrid. Pickup shows assigned merchant/hub data, never customer destination/contact or COD. Delivery shows only assigned necessary destination/contact/current due, not other customers. Hybrid does not automatically mix first/last-mile routes. App is scoped command client; Identity, Dispatch, Logistics, Hub, Finance and Commerce own decisions. Merchant isolation applies across all channels. No direct privileged database writes, service-role keys, local price edits or self-granted roles.

## Design baseline
54 editable frames at 390×844; 54 replacement primary button instances at 56 px, component 12:376; 12 named flow starts and 80 verified navigation links in prior authoring pass. Visual identity approved: navy/teal, Tajawal, RTL, light/dark direction. Only dark home specimen exists; complete dark theme, semantic tokens, navigation, visual QA and prototype paths are incomplete. Figures, amounts, maps, locations and identifiers are synthetic examples. Screen count is not route count. Never ship spike HTML or mock controls. No Figma link is an API/authorization contract.

## Required behavior
Show actual state, pending evidence and authoritative confirmed state separately; unknown is not zero. Cash custody, pending cash evidence, expected exposure, earnings and payouts separate. Capture physical facts truthfully without implying confirmation. No offline offer acceptance, no normal offline finalization of custody/cash/OTP; approved supervised recovery only. No driving interaction requirement; allow safe stop. GPS only authorized shift, F1 permission denial must be handled before service start. Offline scanner candidate with explicit camera permissions; no first-use module download as sole path. No PII in diagnostics, push, labels or support exports.

## Files and sign-off
Read all nine companion files. Exact physical route/DTO/state/lock contracts pending PRE-G0-10; use placeholders only in design. Design review, independent security/QA, D09 disposition and G0 written owner approval precede implementation. Separate production and field gates; no implicit approval of numeric targets or policies. Owner/reviewer/sign-off date: OPEN.
