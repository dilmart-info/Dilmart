# Frame traceability

All 54 reference frames are states of `prototypes/driver-app`. Shared components are the app shell, header, buttons, banners, cards, lists, and the five-item bottom navigation. Identity frames omit the navigation. Fixtures are in-memory synthetic scenarios. Status is interactive in the development build, not production acceptance.

| Frame | Figma node | Area | View | Title | Fixture | Status |
|---|---|---|---|---|---|---|
| UI-01 | 1:321 | shift | home | صباح الخير، مندوب DilMart | synthetic scenario state | interactive |
| UI-02 | 1:350 | dispatch | offer | عرض مهمة جديدة | synthetic scenario state | interactive |
| UI-03 | 1:373 | pickup | manifest | استلام الطرود | synthetic scenario state | interactive |
| UI-04 | 1:400 | delivery | delivery | تسليم الشحنة | synthetic scenario state | interactive |
| UI-05 | 1:432 | offline | sync | مركز المزامنة | synthetic scenario state | interactive |
| UI-06 | 1:456 | finance | cash | العهدة والأرباح | synthetic scenario state | interactive |
| UI-07 | 5:30 | identity | signin | أهلاً بك | synthetic scenario state | interactive |
| UI-08 | 5:51 | identity | verify | التحقق من الدخول | synthetic scenario state | interactive |
| UI-09 | 5:68 | identity | device | تسجيل الجهاز | synthetic scenario state | interactive |
| UI-10 | 5:88 | identity | permissions | تهيئة صلاحيات العمل | synthetic scenario state | interactive |
| UI-11 | 5:108 | identity | location | الموقع غير متاح | synthetic scenario state | interactive |
| UI-12 | 5:124 | shift | off | أنت خارج الدوام | synthetic scenario state | interactive |
| UI-13 | 5:142 | shift | ready | بدء الوردية | synthetic scenario state | interactive |
| UI-14 | 5:165 | shift | end | إنهاء الوردية | synthetic scenario state | interactive |
| UI-15 | 5:188 | dispatch | pending | جاري تأكيد التكليف | synthetic scenario state | interactive |
| UI-16 | 5:205 | dispatch | expired | انتهى عرض المهمة | synthetic scenario state | interactive |
| UI-17 | 5:219 | pickup | arrival | وصلت إلى التاجر | synthetic scenario state | interactive |
| UI-18 | 5:241 | pickup | handover | تأكيد استلام الطرود | synthetic scenario state | interactive |
| UI-19 | 7:85 | pickup | route | مسار جمع الطرود | synthetic scenario state | interactive |
| UI-20 | 7:116 | pickup | scanner | مسح رمز الطرد | synthetic scenario state | interactive |
| UI-21 | 7:138 | pickup | scan-error | تعذر اعتماد الرمز | synthetic scenario state | interactive |
| UI-22 | 7:158 | pickup | partial | استلام جزئي | synthetic scenario state | interactive |
| UI-23 | 7:177 | hub | hub-arrival | الوصول إلى المركز | synthetic scenario state | interactive |
| UI-24 | 7:196 | hub | hub-scan | تسليم الطرود للمركز | synthetic scenario state | interactive |
| UI-25 | 7:219 | hub | hub-confirm | تأكيد التسليم للمركز | synthetic scenario state | interactive |
| UI-26 | 7:236 | hub | outbound | استلام الشحنات للتوزيع | synthetic scenario state | interactive |
| UI-27 | 7:255 | hub | outbound-review | مراجعة استلام الشحنات | synthetic scenario state | interactive |
| UI-28 | 7:274 | delivery | delivery-route | مسار التوزيع | synthetic scenario state | interactive |
| UI-29 | 7:302 | delivery | customer | الوصول إلى وجهة التسليم | synthetic scenario state | interactive |
| UI-30 | 7:322 | delivery | otp | التحقق من التسليم | synthetic scenario state | interactive |
| UI-31 | 9:176 | finance | cod | تسجيل المبلغ المستلم | synthetic scenario state | interactive |
| UI-32 | 9:198 | finance | cod-diff | فرق في مبلغ التحصيل | synthetic scenario state | interactive |
| UI-33 | 9:217 | delivery | delivered | تم التسليم | synthetic scenario state | interactive |
| UI-34 | 9:237 | finance | remit | تسليم العهدة | synthetic scenario state | interactive |
| UI-35 | 9:257 | finance | remit-pending | بانتظار تأكيد الصندوق | synthetic scenario state | interactive |
| UI-36 | 9:276 | finance | receipt | إيصال تسليم العهدة | synthetic scenario state | interactive |
| UI-37 | 9:296 | finance | earnings | أرباحي | synthetic scenario state | interactive |
| UI-38 | 9:316 | delivery | failed | تعذر التسليم | synthetic scenario state | interactive |
| UI-39 | 9:335 | return | return | مهمة إرجاع | synthetic scenario state | interactive |
| UI-40 | 9:355 | return | return-hand | تسليم المرتجع | synthetic scenario state | interactive |
| UI-41 | 9:374 | offline | uncertain | التحقق من عملية معلقة | synthetic scenario state | interactive |
| UI-42 | 9:393 | offline | blocked | تحتاج العملية إلى معالجة | synthetic scenario state | interactive |
| UI-43 | 10:270 | account | profile | حسابي | synthetic scenario state | interactive |
| UI-44 | 10:294 | account | vehicle | المركبة والمستندات | synthetic scenario state | interactive |
| UI-45 | 10:316 | account | notes | الإشعارات | synthetic scenario state | interactive |
| UI-46 | 10:333 | account | support | مركز المساعدة | synthetic scenario state | interactive |
| UI-47 | 10:353 | pickup | damage | الإبلاغ عن طرد تالف | synthetic scenario state | interactive |
| UI-48 | 10:372 | account | safety | الإبلاغ عن طارئ | synthetic scenario state | interactive |
| UI-49 | 10:391 | account | history | سجل المهام | synthetic scenario state | interactive |
| UI-50 | 10:413 | finance | ledger | سجل العهدة النقدية | synthetic scenario state | interactive |
| UI-51 | 10:433 | route | nav | الملاحة إلى المحطة | synthetic scenario state | interactive |
| UI-52 | 10:457 | route | gps | تعذر تحديث الموقع | synthetic scenario state | interactive |
| UI-53 | 10:477 | account | settings | الإعدادات | synthetic scenario state | interactive |
| UI-54 | 10:500 | shift | dark | DilMart Driver | synthetic scenario state | interactive |
