# Phase 2F — Aggregator Merchant Management Plan

> **Security Note**: Sensitive credential values were redacted. Use environment variables from secure deployment dashboards instead.

> **Date**: 2026-06-20  
> **Status**: 📋 APPROVED STRATEGY — PLAN ONLY  
> **Topic**: Jenni Logistics Aggregator Sub-Merchant Onboarding

---

## 1. الخلفية والتحول الكامل للمنصة (Architectural Switch Decision)

بناءً على التنسيق الأخير مع دعم Jenni الفني وتوفير صلاحيات حساب المنصة/المجمع الجديد:

- **قرار التحول الكامل (Full Switch)**: سيتم استبدال حساب التاجر القديم (`JENNI_USERNAME`) بشكل كامل بحساب المنصة/المجمع الجديد (`DilMart`).
- **إلغاء الحساب القديم (Deprecation)**: يعتبر الحساب القديم ملغى ومحجوباً في الإنتاج ولا يجوز استخدامه تشغيلياً لعدم امتلاكه صلاحيات إنشاء فروع أو تجار فرعيين.
- **استراتيجية البيئة (Env Strategy)**: لتجنب تعقيد التكوينات، سيتم استبدال القيم داخل المتغيرات الحالية `JENNI_USERNAME` و `JENNI_PASSWORD` ببيانات حساب المنصة الجديد مباشرة في لوحة تحكم Render، دون إضافة متغيرات بيئة جديدة مخصصة للمنصة.
  - `JENNI_USERNAME` = `DilMart`
  - `JENNI_PASSWORD` = `<كلمة مرور المنصة الجديدة>`
  - `JENNI_SYSTEM_CODE` = `STYL_AI`
  - `JENNI_API_BASE_URL` = `https://jenni.alzaeemexp.com/api`

---

## 2. الهيكل المعماري والبيانات (Database Schema Updates)

لتسجيل وإدارة الصالونات كـ التجار فرعيين مستقلين، نقوم بتوسيع قاعدة البيانات بإضافة حقول التاجر الفرعي لـ Jenni.

### 2.1 حقول قاعدة البيانات الجديدة في جدول `public.merchants`

- `jenni_merchant_id TEXT NULL`: معرف التاجر الفرعي في نظام Jenni. يتم تعريفه كـ `TEXT` وليس رقمياً لتلافي أي تغييرات مستقبلية في شكل المعرفات لدى Jenni.
- `jenni_merchant_synced_at TIMESTAMPTZ NULL`: وقت مزامنة التاجر التشغيلي بنجاح.
- `jenni_merchant_sync_error TEXT NULL`: نص آخر خطأ واجه عملية مزامنة التاجر.

### 2.2 جدول القفل المستقل للمزامنة (`jenni_merchant_provisioning_locks`)

لمنع حدوث عمليات مزامنة متزامنة (race conditions) للتاجر الفرعي، سيتم إنشاء جدول قفل مستقل خاص بعملية مزامنة التجار:

```sql
CREATE TABLE IF NOT EXISTS public.jenni_merchant_provisioning_locks (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

_ملاحظة: لا يجوز دمج أو استخدام جدول قفل المتاجر `jenni_store_provisioning_locks` لهذه العملية لتجنب حدوث تداخل أو تعطل بين العمليتين._

---

## 3. واجهة التخاطب والمدخلات (API Payload Mapping)

### 3.1 إنشاء تاجر فرعي

- **المسار**: `POST /v2/merchant-management/create`
- **البودي (Payload)**:

```json
{
  "merchant_name": "merchants.display_name",
  "phone": "normalizeIraqMobilePhone(merchant_settings.contact_phone || settings.whatsapp_phone)",
  "system_code": "STYL_AI"
}
```

### 3.2 أسئلة مفتوحة لـ Jenni بخصوص إنشاء الفروع (Required Questions to Jenni Support)

بعد إنشاء التاجر بنجاح وتخزين `jenni_merchant_id`، لا تزال آلية إنشاء الـ Store/Pickup Point غير مؤكدة وتحتاج توضيحاً من Jenni:

1. بعد إنشاء التاجر عبر `/v2/merchant-management/create` والحصول على الـ `merchant_id` الفرعي، كيف نقوم بإنشاء فرع الاستلام (Pickup Store) الخاص به؟
2. هل نستخدم المسار `POST /v2/stores/create`؟ وإذا كان كذلك، هل يجب تمرير `merchant_id` الفرعي في البودي؟
3. هل التوكن الرئيسي للمنصة (Aggregator Token) يملك الصلاحية تلقائياً لربط الفرع بالتاجر الفرعي؟
4. أم أن نظام Jenni يقوم بإنشاء فرع افتراضي تلقائياً للتاجر عند إنشائه أول مرة؟

---

## 4. الإجراءات الأمنية وحظر تسريب كلمة المرور (Security Gate & Sanitization)

- **عدم حفظ كلمة المرور الفرعية**: لن يتم تخزين الـ `generated_password` المرتجع من الـ API في قاعدة البيانات، لعدم وجود حاجة تشغيلية له حيث تدار كافة العمليات عبر التوكن الرئيسي للمنصة.
- **تنظيف السجلات (Sanitization Regex)**: تحديث الفلتر الأمني في `JenniClientService` لحظر الكلمات الحساسة التالية من السجلات والبودي المرتجع للـ Frontend:
  - `password`, `generated_password`, `token`, `secret`, `key`, `authorization`, `access_token`, `refresh_token`.

---

## 5. بوابات الأمان وبيئة العمل (Safety Gates)

سيتم حظر المزامنة التلقائية واليدوية في الإنتاج افتراضياً باستخدام البوابات الأمنية التالية:

- بوابة المزامنة للتجار: `JENNI_ALLOW_MERCHANT_PROVISIONING=false`
- بوابة المزامنة للفروع: `JENNI_ALLOW_STORE_PROVISIONING=false`
- بوابة شحن الطلبات: `JENNI_ALLOW_SHIPMENT_DISPATCH=false`

---

## 6. خطة الاختبارات والتحقق الذاتي (Testing & Verification Plan)

تتطلب الخدمة الجديدة تغطية اختبارية شاملة تشمل الحالات التالية:

- **بوابة الأمان**: رمي `ForbiddenException` عند إغلاق بوابة المزامنة.
- **مزامنة متكررة**: التأكد من أن التاجر المربوط مسبقاً يعود مباشرة (Idempotent) دون طلب الـ API.
- **المدخلات الناقصة**: التحقق من رمي `BadRequestException` عند غياب الاسم المعروض أو الهاتف.
- **أمان كلمات المرور**: التحقق من حظر وتشفير `generated_password` من الـ Logs.
- **إطلاق القفل**: التأكد من حذف قيود جدول `jenni_merchant_provisioning_locks` في حالتي النجاح والفشل.

---

## 7. خطة الإطلاق والتشغيل بعد الموافقة (Production Deployment Plan)

عند الحصول على موافقة المشرف على الـ PR:

1. دمج فرع التطوير `feat/jenni-phase2f-aggregator-merchant-provisioning` في `main`.
2. ترحيل كود المنصة إلى خادم Render.
3. يقوم الأدمن بإدخال بيانات حساب المنصة الجديد في Render:
   - `JENNI_USERNAME` = `DilMart`
   - `JENNI_PASSWORD` = `<new password>`
4. إبقاء بوابات الأمان مغلقة (`false`).
5. التحقق من عمل لوحة التحكم بشكل سليم وسحب حالة الربط دون أخطاء.
6. تقديم طلب رسمي للمشرف لتنفيذ **تجربة مزامنة واحدة محكومة** لتاجر فرعي واحد في الإنتاج.
