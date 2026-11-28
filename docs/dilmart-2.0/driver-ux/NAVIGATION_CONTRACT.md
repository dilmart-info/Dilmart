# Navigation contract — intended flows vs prototype
12 named starts: 07 auth; 19 pickup; 26 outbound; 29 delivery; 06 cash; 05 offline; 11 permission; 21 scan error; 32 cash difference; 39 return; 43 profile; 54 dark. Prototype has 80 authored links, 2 same-frame links rejected. Click transitions are illustrative; never map a click to authoritative success.
| Flow | Intended sequence (UI IDs) |
|---|---|
| Identity | 07→08 (if auth requires)→09 (if new device)→10→12→13→01 only after server shift confirmation; 11 on missing location |
| Dispatch | 01→02→15→19/28 only on confirmed assignment; 16 on expiry; decline returns to own work |
| Pickup | 19→51 (context=pickup)→17→03→20→03/18 after correct scan count; 21/22/47 exceptions; 18→pending→confirmed custody→next authorized stop or 23 |
| Hub inbound | 23→24→25→pending→confirmed receipt; no automatic delivery assignment |
| Hub outbound | 26→scan context outbound→27→pending→confirmed release handover→28 |
| Delivery | 28→51 (context=delivery)→29→04/30→31→pending→33 only after authoritative proof and finance result; 32/38/41 on exception |
| Cash | 06→34→35→36 only after authorized dual ACK and server receipt→50; earnings 37 separate |
| Returns | 38→authorized reverse assignment 39→51 (context=return)→40→pending→confirmed receipt |
| Sync | 05→41→original authoritative outcome or 42; same key retry only after recovery rule |
| Shift end | 01→14→resolved or authorized exception→12; no silent closure |
| Profile | 43→44/45/46/49/53; navigation may not expose other actor |
Prototype gaps: 51 always points to pickup arrival, 20 returns to pickup list, handovers route to generic offline screen, 35 and 31 jump to success on click as illustrative only, 09 jumps without actual approval, 37 points to cash ledger, 49 points to a delivery example; 45 and 54 lack primary action wiring. Some frames unreachable from the main flow, five-tab navigation is partial, and all presentation paths require visual QA. Correct these before handoff acceptance; do not implement prototype misroutes. Back navigation never repeats a command. Route/offer/device revocation replaces stale screen data. Deep links validate session and scope before showing content; no task data on locked notifications.
