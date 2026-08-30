# Phase 2E — Platform Registration and Aggregator Path

> **Security Note**: Sensitive credential values were redacted. Use environment variables from secure deployment dashboards instead.

> **Date**: 2026-06-18  
> **Status**: 📋 PLAN / DOCUMENTATION ONLY  
> **Reference Issues**: Jenni V2 Provisioning 401 Blocker

---

## 1. ملخص رد الدعم الفني لشركة Jenni (Support Response Summary)

أكد الدعم الفني لـ Jenni (الزعيم إكسبرس) التفاصيل التالية بخصوص مشكلة الـ `401 Unauthorized` عند استدعاء endpoint إنشاء الفروع:

- **نوع الحساب الحالي**: الحساب الحالي المسجل برقم `JENNI_USERNAME` هو حساب **تاجر عادي (Merchant Account)** وليس حساب **منصة/مجمع (Platform/Aggregator Account)**.
- **رمز النظام (system_code)**: القيمة المرسلة `system_code=STYL_AI` (أو `DilMart_SYSTEM_CODE`) صحيحة وليست سبب المشكلة.
- **سبب الرفض (Root Cause)**: صلاحيات الحساب الحالي لا تسمح باستدعاء الـ platform endpoints (مثل إنشاء المتاجر أو الفروع). يتطلب استدعاء هذه الـ APIs حسابًا بصلاحيات **منصة (Platform)** أو **مجمع (Aggregator)**.
- **الحل**: يجب استكمال إجراءات تسجيل وتفعيل حسابنا كـ Platform/Aggregator لدى Jenni قبل التمكن من استخدام الـ API لإنشاء الفروع.

---

## 2. المسار الحالي وتأثير الحساب (Current Path vs Account Restriction)

- **الوضع الحالي**: الكود البرمجي في [`JenniStoreProvisioningService`](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts) يستدعي المسار:
  ```http
  POST /v2/stores/create
  ```
- **تأثير المشكلة**: بما أن التوكن الحالي هو لـ Merchant عادي، فإن الطلب يُرفض فوراً بـ `401 Unauthorized` مع رسالة `"JWT token or invalid"`.

---

## 3. الخيارات المستقبلية للربط بعد ترقية الحساب (Future Integration Paths)

بعد تفعيل حساب الـ Platform/Aggregator من قبل Jenni، هناك مساران محتملان للربط بناءً على القواعد التقنية التي ستفرضها المنصة:

### المسار الأول (Path A): إنشاء فروع مباشرة تحت حساب المنصة الرئيسي

- **الآلية**: استدعاء `POST /v2/stores/create` مباشرة لإنشاء نقطة استلام (Pickup Point) لكل صالون بدون تحديد معرف تاجر تشغيلي (`merchant_id`).
- **الأثر على الكود**: لا تغيير. يبقى نموذج البيانات الحالي المعتمد على `jenni_store_id` فقط كافياً وصحيحاً.
- **طريقة التحاسب**: تسوية مالية موحدة ومجمعة مع حساب المنصة الرئيسي.

### المسار الثاني (Path B): إنشاء تاجر تشغيلي ثم إنشاء فرع له (Aggregator Path)

- **الآلية**:
  1. استدعاء `POST /v2/merchant-management/create` لإنشاء تاجر تشغيلي لكل صالون والحصول على `jenni_merchant_id`.
  2. استدعاء `POST /v2/stores/create` وتمرير الـ `jenni_merchant_id` لربط الفرع بالتاجر التشغيلي الجديد.
- **الأثر على الكود**:
  - يتطلب تعديل الـ DB Schema لإضافة حقل `jenni_merchant_id` في جدول `merchants`.
  - تحديث `JenniStoreProvisioningService` لتنفيذ العملية على خطوتين (إنشاء التاجر ثم إنشاء الفرع).
  - تفعيل حماية إضافية للبيانات الحساسة ككلمة المرور التلقائية (`generated_password`) التي قد تعود عند إنشاء التاجر.

---

## 4. أسئلة يجب طرحها على دعم Jenni بعد التسجيل (Required Questions to Jenni Support)

1. **دعم الـ Stores المباشرة**: هل يدعم حساب المنصة (Platform Account) الخاص بنا إنشاء المتاجر مباشرة عبر `POST /v2/stores/create` دون ربطها بـ `merchant_id` مستقل؟
2. **استعلام الفروع**: هل يستطيع حساب المنصة الاستعلام عن جميع الفروع المنشأة عبر `GET /v2/merchants/my-stores`？
3. **متطلبات الـ Aggregator**: إذا فرض النظام استخدام `POST /v2/merchant-management/create` أولاً، هل يحتوي الـ Response على `generated_password` للتاجر الفرعي؟ وهل يمكننا حجب هذه البيانات الحساسة أو التحكم بها؟
4. **التسوية المالية**: هل ستكون الفواتير والتسويات المالية مجمعة في كشف حساب واحد يرسل لـ DilMart مباشرة، أم ستكون مفصلة لكل تاجر فرعي؟

---

## 5. خيارات التنفيذ المقترحة (Proposed Options)

- **الخيار الأول (الموصى به)**: الانتظار حتى اكتمال تسجيل وتفعيل حساب الـ Platform/Aggregator من قبل Jenni، ثم اختبار endpoint إنشاء المتاجر باستخدام التوكن الجديد. إذا نجح الربط المباشر (Path A)، نعتمد الكود الحالي دون أي تعديل.
- **الخيار الثاني**: إذا أكدت Jenni وجوب استخدام مسار الـ Aggregator (Path B)، نقوم بتخطيط وتنفيذ مرحلة تعديل قاعدة البيانات لإضافة `jenni_merchant_id` وتعديل الخدمة لتشمل خطوتي التسجيل.

---

## 6. المخاطر التقنية والأمنية (Technical and Security Risks)

1. **تعديل نموذج البيانات (Data Model Evolution)**: قد نضطر لإضافة حقل `jenni_merchant_id` في جداول `merchants` و `order_delivery_integrations` إذا فرض مسار الـ Aggregator.
2. **تسريب كلمات المرور التلقائية (Leakage of `generated_password`)**: في حال إنشاء حساب تاجر تشغيلي، قد يعود البودي ببيانات اعتماد حساسة مثل كلمات المرور. يجب التأكد من تصفيتها بشكل صارم في الـ Logging لمنع كتابتها في سجلات الخادم (Render logs) تماشياً مع الـ Observability Patch الأخير.
3. **اختلاف تدفق التفعيل (Onboarding Variations)**: قد تتطلب عملية إنشاء التاجر الفرعي التحقق من رقم الهاتف أو إرسال توثيق، مما قد يعقد عملية الربط التلقائي من لوحة التحكم.

---

## 7. التوصية النهائية (Final Recommendation)

> [!IMPORTANT]
> **التوصية**: تجميد أي تعديلات على الكود أو محاولات الربط في بيئة Staging/Production حالياً، والانتظار حتى انتهاء تفعيل حساب الـ Platform/Aggregator بشكل رسمي من قبل فريق تطوير Jenni.
