# Component registry (proposed implementation)
Existing Figma primary action 12:376 (54 instances), detail component 7:82, Material instances replaced for main actions. Other primitives below are proposed, not existing reusable Figma assets. Use shared semantic tokens and screen-reader labels, state text in addition to color.
| Component | Variants / contract |
|---|---|
| PrimaryAction | 56dp, idle/loading/disabled; one action identity; no success on click |
| SecondaryAction / DangerAction | >=48dp target; explicit consequence; no destructive evidence clear |
| AppHeader / BottomNav | five destinations Home, Route, Scan, Cash, Profile; current active no-op; role-gated; RTL |
| StatusBanner | offline, pending, uncertain, confirmed, conflict, blocked, permission; icon+text |
| ShiftSummary | inactive, active, paused, closing, blocked; GPS state independent |
| OfferCard | server expiry, stale, pending, accepted, expired; online only |
| TaskCard / StopRow | typed pickup/hub/delivery/return, revision, actual progress |
| ManifestRow / ScannerViewport | opaque IDs; scoped expected/actual; duplicate/invalid/permission/cancel; no custody by scan |
| HandoverSummary | exact parcel set, counterpart and server status; partial exception |
| MoneyAmount / CashSummary | exact integer IQD decimal-string; confirmed vs pending vs expected; no netting |
| OTPChallenge | server-owned, configurable length/TTL; no caching/logging secret |
| EvidenceForm / ExceptionForm | actual facts, bounded reason, required fields, privacy-controlled attachment |
| QueueRow / RecoveryPanel | operation identity, status, retry/lookup, restricted actor scope |
| ReceiptCard / EarningsRow | authoritative reference, actual state, no guessed totals |
| PermissionGate | F1 prevention, camera denial, settings/recheck; typed error |
| Empty / Skeleton / Error | no fabricated zero or stale freshness; safe retry |
| SafeNavigation | map adapter and unknown ETA; no interaction while driving |
| ProfileRow / SettingsRow | own data, restricted update, safe logout |
Design QA: bind remaining tokens, typography and status components, add focus/disabled/pressed/loading states, contrast, font scaling, RTL, safe-area and small-screen review. No claim that library is complete.
