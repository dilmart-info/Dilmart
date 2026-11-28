# Screen inventory — 54 verified frames
All frames 390×844. IDs are stable references at inspection, not final app route IDs. Each requires loading/empty/error/permission/online/offline/accessibility treatment as applicable. DA references are requirements from doc 11, not test results.

| ID | Figma frame | Arabic title | Contract | DA |
|---|---|---|---|---|
| UI-01 | [Home / Active shift](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=1-321) | الرئيسية | Shift/route/cash summaries; open task | DA04,06,27 |
| UI-02 | [Dispatch offer](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=1-350) | عرض مهمة جديدة | Server expiry and eligibility; online accept/decline | DA09,10 |
| UI-03 | [Pickup](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=1-373) | استلام الطرود | Scoped merchant manifest; scan evidence | DA12,13,14 |
| UI-04 | [Delivery / COD](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=1-400) | تسليم الشحنة | Assigned destination and current due/version | DA16,17,18 |
| UI-05 | [Offline center](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=1-432) | مركز المزامنة | Pending evidence, connectivity, recovery | DA20–25 |
| UI-06 | [Cash custody](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=1-456) | العهدة والأرباح | Held cash separate from earnings | DA26,27 |
| UI-07 | [Sign in](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-30) | تسجيل الدخول | Approved identity flow; no assumed auth mechanism | DA01 |
| UI-08 | [Verify identity](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-51) | التحقق من الدخول | Illustrative auth challenge; exact auth pending | DA01,29 |
| UI-09 | [Device registration](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-68) | تسجيل الجهاز | Device approval pending/denied/approved | DA01 |
| UI-10 | [Permissions](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-88) | تهيئة صلاحيات العمل | Request location/camera/notification as needed | DA04,06 |
| UI-11 | [Location denied](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-108) | الموقع غير متاح | Typed blocker, settings, no tracking | DA04,06 |
| UI-12 | [Home / Off shift](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-124) | خارج الدوام | Tracking off; authorized mode; start readiness | DA04,06 |
| UI-13 | [Shift readiness](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-142) | بدء الوردية | Server eligibility, vehicle, capacity, cash, permission | DA04 |
| UI-14 | [End shift review](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-165) | إنهاء الوردية | Open tasks, custody, cash, pending evidence | DA28 |
| UI-15 | [Offer pending](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-188) | جاري تأكيد التكليف | Recover assignment; no start until confirmed | DA09,10 |
| UI-16 | [Offer expired](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-205) | انتهى عرض المهمة | No assignment, refresh offers | DA09 |
| UI-17 | [Pickup arrival](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-219) | وصلت إلى التاجر | Assigned stop; arrival evidence or issue | DA11,14 |
| UI-18 | [Pickup handover](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=5-241) | تأكيد استلام الطرود | Exact parcel set; counterpart ACK | DA13,14 |
| UI-19 | [Pickup route](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-85) | مسار جمع الطرود | Versioned stops; next authorized merchant/hub | DA11 |
| UI-20 | [Scanner camera](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-116) | مسح رمز الطرد | Offline decode candidate; scoped scan evidence | DA12 |
| UI-21 | [Scan exception](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-138) | تعذر اعتماد الرمز | Duplicate, invalid, unknown or stale code | DA12 |
| UI-22 | [Partial pickup](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-158) | استلام جزئي | Actual quantities and unresolved remainder | DA14 |
| UI-23 | [Hub arrival](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-177) | الوصول إلى المركز | Inbound manifest and actual custody | DA13,14 |
| UI-24 | [Hub inbound scan](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-196) | تسليم الطرود للمركز | Exact inbound parcel reconciliation | DA13,14 |
| UI-25 | [Hub custody confirmation](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-219) | تأكيد التسليم للمركز | Counterparty and server confirm exact set | DA13,14 |
| UI-26 | [Hub outbound manifest](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-236) | استلام الشحنات للتوزيع | Assigned release/COD versions; expected cash only | DA15 |
| UI-27 | [Outbound custody](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-255) | مراجعة استلام الشحنات | Dual ACK, release and capacity revalidation | DA13,15 |
| UI-28 | [Delivery route](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-274) | مسار التوزيع | Assigned last-mile stops; scoped data | DA11,29 |
| UI-29 | [Customer arrival](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-302) | الوصول إلى وجهة التسليم | Current assigned destination/contact/due | DA16–18 |
| UI-30 | [Delivery proof OTP](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=7-322) | التحقق من التسليم | Server challenge; no OTP pre-access | DA16 |
| UI-31 | [COD capture](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-176) | تسجيل المبلغ المستلم | Actual cash evidence; due/version immutable | DA17,18 |
| UI-32 | [COD discrepancy](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-198) | فرق في مبلغ التحصيل | Record truthful actual cash; hold duplicate collection | DA18 |
| UI-33 | [Delivery confirmed](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-217) | تم التسليم | Authoritative delivery and cash receipt/effect | DA17,22 |
| UI-34 | [Cash remittance](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-237) | تسليم العهدة | Transfer request, authorized cashier | DA26 |
| UI-35 | [Remittance pending](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-257) | بانتظار تأكيد الصندوق | Held balance unchanged until commit | DA26 |
| UI-36 | [Remittance receipt](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-276) | إيصال تسليم العهدة | Authoritative receipt and updated held cash | DA26 |
| UI-37 | [Earnings statement](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-296) | أرباحي | Separate confirmed earnings and payout state | DA27 |
| UI-38 | [Delivery exception](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-316) | تعذر التسليم | Actual failure reason; custody retained | DA19 |
| UI-39 | [Return authorization](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-335) | مهمة إرجاع | Approved reverse task/manifest | DA19 |
| UI-40 | [Return handover](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-355) | تسليم المرتجع | Dual ACK; no restock by driver | DA19 |
| UI-41 | [Sync uncertain](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-374) | التحقق من عملية معلقة | Status lookup before same-key retry | DA22,23 |
| UI-42 | [Recovery blocked](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=9-393) | تحتاج العملية إلى معالجة | Restricted recovery; no destructive reset | DA24,25 |
| UI-43 | [Profile](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-270) | حسابي | Own identity, device, mode; no self-grant | DA01,03,29 |
| UI-44 | [Vehicle and documents](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-294) | المركبة والمستندات | Review status; changes require approval | DA03,04 |
| UI-45 | [Notifications](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-316) | الإشعارات | Hints only; refresh authoritative data | DA08 |
| UI-46 | [Support](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-333) | مركز المساعدة | Scoped support and safe correlation reference | DA23,29 |
| UI-47 | [Damaged parcel](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-353) | الإبلاغ عن طرد تالف | Evidence and hold; no automatic custody change | DA14,19 |
| UI-48 | [Safety incident](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-372) | الإبلاغ عن طارئ | Safe stop, emergency help, custody escalation | DA19,30 |
| UI-49 | [Task history](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-391) | سجل المهام | Scoped timeline, no unnecessary PII | DA29 |
| UI-50 | [Cash ledger](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-413) | سجل العهدة النقدية | Confirmed entries vs pending, receipts | DA26,27 |
| UI-51 | [Active navigation](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-433) | الملاحة إلى المحطة | Approved navigation adapter; safe stop | DA11,30 |
| UI-52 | [GPS unavailable](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-457) | تعذر تحديث الموقع | Stale/unknown, no automated assignment | DA06,07 |
| UI-53 | [Settings](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-477) | الإعدادات | Language/theme/permissions; preserve pending evidence | DA06,29,30 |
| UI-54 | [Dark home](https://www.figma.com/design/VP7ObUnxVriELZficZXUyf?node-id=10-500) | DilMart Driver | Dark theme specimen; same authority as UI-01 | DA30 |

Missing variants include permission/camera denied, scan success, confirmed pickup/hub handover, delivery proof failure/expiry, shift ended, role-aware home, long-list/empty/loading, accessible text scale, blocked recovery, and dark equivalents. Extend state variants rather than inventing backend behaviors. UI-08 OTP is illustrative login challenge, not approved auth mechanism. UI-30 delivery OTP length/TTL not frozen. UI-51 map is illustrative and pickup-specific; delivery/return context needs parameterized rendering. UI-37/49/50 detail links require actual scoped detail screens before release.
