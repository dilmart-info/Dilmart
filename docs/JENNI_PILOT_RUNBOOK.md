# Jenni Pilot Runbook

# دليل التشغيل التجريبي لربط Jenni

> **Last updated:** 2026-06-27  
> **Phase:** Pilot Hardening  
> **Status:** Active — Webhook connectivity verified ✅ | Dispatch gate closed 🔒

---

## 1. Purpose / الهدف

This runbook governs the **controlled pilot** of the Jenni (Al Zaeem Express) delivery integration inside DilMart Store.

This is **not a full production rollout**. Every step requires explicit approval from the project owner before execution.

**ما هذا الدليل:**

- إجراءات التشغيل المعتمدة للمرحلة التجريبية
- قوائم التحقق قبل وبعد كل عملية
- توثيق أخطاء معروفة وحلولها
- خطة تحقق من الـ webhook

**ما ليس هذا الدليل:**

- تعليمات إدارة بيئة Render أو Netlify أو Supabase (مقصورة على مالك المشروع)
- دليل تطوير (راجع ملفات الكود)

---

## 2. Current Verified Capabilities / الحالة الإنتاجية المؤكدة

| الإمكانية                   | الحالة | التفاصيل                                           |
| --------------------------- | ------ | -------------------------------------------------- |
| ✅ Merchant Linked          | مؤكد   | `jenni_merchant_id = 17168`                        |
| ✅ Store Linked             | مؤكد   | `jenni_store_id = 17900` (شركة العرش)              |
| ✅ Shipment Dispatch        | مؤكد   | Jenni Shipment `9311578` — Order `DUK-260430-2387` |
| ✅ Manual Status Sync       | مؤكد   | Query sync يعمل (`/v2/shipments/query`)            |
| ✅ Webhook Connectivity     | مؤكد   | `200 OK`, `ok=true`, `processed=1`                 |
| ✅ Duplicate Protection     | مؤكد   | نفس الـ payload يعود `duplicate=true`              |
| ✅ Admin Integration Center | مؤكد   | `/admin/jenni` في لوحة التحكم                      |
| ✅ Sticker Proxy            | مبني   | `GET /api/orders/:id/jenni-sticker` — PDF          |

---

## 3. Safety Gates / بوابات الأمان

> [!WARNING]
> **هذه المتغيرات يجب أن تبقى `false` افتراضياً في Production دائماً.**
> لا يحق لأي مطور تغييرها بدون موافقة صريحة من مالك المشروع.

| المتغير                             | القيمة الآمنة | الوظيفة                            |
| ----------------------------------- | ------------- | ---------------------------------- |
| `JENNI_ALLOW_SHIPMENT_DISPATCH`     | `false`       | يمنع إرسال أي شحنة حقيقية لـ Jenni |
| `JENNI_ALLOW_MERCHANT_PROVISIONING` | `false`       | يمنع إنشاء تجار فرعيين             |
| `JENNI_ALLOW_STORE_PROVISIONING`    | `false`       | يمنع إنشاء فروع/متاجر              |
| `JENNI_DIAGNOSTICS_ENABLED`         | `false`       | يمنع endpoint التشخيص العام        |

**التحقق من الحالة:**

```bash
# تحقق محلياً (لا تغيير):
grep "JENNI_ALLOW" backend/.env
```

---

## 4. Infrastructure Ownership / صلاحيات البنية التحتية

> [!IMPORTANT]
> **مالك المشروع فقط** يملك صلاحية تغيير:

| المورد                              | من يملك الصلاحية |
| ----------------------------------- | ---------------- |
| Render env vars                     | مالك المشروع فقط |
| Netlify config                      | مالك المشروع فقط |
| Supabase (schema / RLS / data)      | مالك المشروع فقط |
| `JENNI_WEBHOOK_TOKEN`               | مالك المشروع فقط |
| `JENNI_PASSWORD` / `JENNI_USERNAME` | مالك المشروع فقط |
| Manual deploys to production        | مالك المشروع فقط |

المطور يقتصر على: PR على branches غير `main`، قراءة logs، تحديث كود/docs.

---

## 5. Webhook URL Reference / عنوان الـ Webhook الصحيح

> [!CAUTION]
> **خطأ شائع ونقطة فشل معروفة: استخدام نطاق الـ Frontend بدلاً من Backend.**

### ✅ العنوان الصحيح (Backend):

```
POST https://DilMart-store-backend.onrender.com/v2/push/update-status
```

### ❌ العنوان الخاطئ (Frontend — يعيد 404):

```
POST https://store.DilMart.org/v2/push/update-status
```

**لماذا؟**

- `store.DilMart.org` هو نطاق الـ Frontend (React SPA — Netlify)، لا يوجد فيه API.
- `DilMart-store-backend.onrender.com` هو الـ Backend (NestJS — Render) الذي يستقبل الـ webhook.
- Jenni يجب أن يسجّل عنوان الـ Backend فقط في إعداداتها.

**Alias Route:**  
الـ backend يقبل من مسارين (كلاهما يؤدي نفس الوظيفة):

- `/api/v2/push/update-status` (NestJS controller route)
- `/v2/push/update-status` (Express alias route — هذا هو المُختبر والمؤكد)

---

## 6. Pilot Scope / نطاق الـ Pilot

| البند            | القيمة                     |
| ---------------- | -------------------------- |
| عدد التجار       | 1 فقط                      |
| عدد المتاجر      | 1 فقط                      |
| عدد الطلبات      | 1–3 طلبات كحد أقصى         |
| نوع الإرسال      | يدوي فقط (Manual dispatch) |
| الإرسال التلقائي | ❌ ممنوع في هذه المرحلة    |

---

## 7. Pre-Dispatch Checklist / قائمة التحقق قبل إرسال أي طلب

قبل إرسال أي طلب لـ Jenni، يجب التحقق من جميع البنود التالية:

- [ ] التاجر لديه `jenni_merchant_id` مخزن في DB
- [ ] المتجر لديه `jenni_store_id` مخزن في DB وهو مربوط بالتاجر
- [ ] الطلب يحتوي على رقم هاتف عراقي صالح (11 رقم، يبدأ بـ 07)
- [ ] المحافظة مربوطة بـ `jenni_governorate_code` في جدول `governorates`
- [ ] المدينة/المنطقة مطابقة للأسماء العربية الرسمية في Jenni (مثلاً: `المنصور` وليس `Mansour`)
- [ ] مبلغ COD صحيح ومتوافق مع إجمالي الطلب
- [ ] الطلب لا يملك `provider_shipment_id` مسبقاً (لم يُرسل من قبل)
- [ ] `JENNI_ALLOW_SHIPMENT_DISPATCH=true` مُفعّل من قبل مالك المشروع للنافذة الزمنية فقط

---

## 8. Dispatch Procedure / إجراء إرسال الشحنة

> [!CAUTION]
> لا تُنفذ هذا الإجراء بدون موافقة خطية من مالك المشروع.

1. **مالك المشروع** يفتح بوابة الإرسال في Render: `JENNI_ALLOW_SHIPMENT_DISPATCH=true`
2. **المطور** أو الأدمن يُرسل طلباً واحداً فقط عبر الأداة المعتمدة
3. **مالك المشروع** يُغلق البوابة فوراً: `JENNI_ALLOW_SHIPMENT_DISPATCH=false`
4. **التحقق بعد الإرسال:**
   - `provider_shipment_id` ظهر في `order_delivery_integrations`
   - `dispatch_status = 'dispatched'`
   - لا errors في Render logs

**تحقق سريع (قراءة فقط):**

```sql
SELECT provider_shipment_id, dispatch_status, dispatched_at
FROM order_delivery_integrations
WHERE order_id = '<ORDER_UUID>'
  AND provider_code = 'jenni';
```

---

## 9. Sync Procedure / إجراء مزامنة الحالة

**المزامنة اليدوية الآمنة (Query Sync):**

- يستدعي `POST /v2/shipments/query` — **قراءة فقط**
- لا يستدعي `/v2/shipments/update-status` — **محظور للمزامنة**
- الأداة: زر "مزامنة من Jenni" في `/admin/jenni`

**ما يجب التحقق منه بعد المزامنة:**

- [ ] `provider_current_step` تحدّث
- [ ] `provider_current_step_ar` تحدّث
- [ ] `last_synced_at` تحدّث للوقت الحالي
- [ ] سجل جديد في `delivery_events` بالمصدر `query_sync`
- [ ] `delivery_status` في جدول `orders` تغيّر إن لزم

---

## 10. Webhook Procedure / إجراء التحقق من الـ Webhook

### 10.1 عنوان الـ Webhook

```
POST https://DilMart-store-backend.onrender.com/v2/push/update-status
```

> ❌ لا تستخدم `store.DilMart.org` — يعيد 404.

### 10.2 بنية الـ Payload الصحيحة

```json
{
  "system_code": "STYL_AI",
  "updates": [
    {
      "shipment_number": "DUK-260430-2387",
      "shipment_id": 9311578,
      "action_code": "DELIVERED",
      "current_step": "DELIVERED",
      "current_step_ar": "تم التوصيل",
      "amount_iqd": 25000
    }
  ]
}
```

### 10.3 Headers المطلوبة

```
Authorization: Bearer <JENNI_WEBHOOK_TOKEN>
Content-Type: application/json
```

### 10.4 الاستجابة المتوقعة

```json
{
  "ok": true,
  "processed": 1,
  "results": [{ "ok": true, "order_id": "<UUID>" }]
}
```

**في حال payload مكرر:**

```json
{
  "ok": true,
  "processed": 1,
  "results": [{ "ok": true, "duplicate": true }]
}
```

### 10.5 قائمة التحقق بعد الـ Webhook

- [ ] Render logs تُظهر `POST /v2/push/update-status 200`
- [ ] سجل جديد في `delivery_provider_sync_events` بـ `source = 'webhook'`
- [ ] سجل جديد في `delivery_events` بـ `actor_type = 'external_provider'`
- [ ] `provider_current_step` تحدّث في `order_delivery_integrations`
- [ ] `last_synced_at` تحدّث
- [ ] `delivery_status` في `orders` تغيّر للحالة المناسبة

---

## 11. Non-Duplicate Webhook Test Plan / خطة اختبار الـ Webhook بدون تكرار

> الحالة الحالية: تم إثبات اتصال الـ webhook مع payload مكرر (`duplicate=true`).
> الخطوة التالية: اختبار بـ payload جديد (غير مكرر).

**خيارات الاختبار (لا تُنفذ بدون موافقة):**

### الخيار A — Jenni تُرسل تحديثاً جديداً من جانبها

- **المتطلب:** تنسيق مع فريق Jenni لإرسال حالة جديدة على الشحنة `9311578`
- **الخطوة:** انتظار تغيير حالة حقيقي في نظامهم
- **التحقق:** مراقبة Render logs + DB لحظياً
- **الأمان:** ✅ لا نستدعي نحن أي API تعديلي

### الخيار B — Jenni ترسل Payload اختباري معلّم

- **المتطلب:** طلب من Jenni إرسال payload `current_step: "TEST_STEP"` أو حالة جديدة معلّمة بـ test
- **التحقق:** نتأكد أن النظام يقبل، يسجل في DB، ويعاملها كـ `provider_synced` (لا تغيير في delivery_status)
- **الأمان:** ✅ لا نستدعي نحن أي شيء

### الخيار C — شحنة اختبارية منفصلة

- **المتطلب:** طلب جديد كامل بموافقة مالك المشروع
- **التحقق الكامل:**
  - إرسال شحنة جديدة → `provider_shipment_id` جديد
  - انتظار webhook → `source = 'webhook'` في `delivery_provider_sync_events`
  - مقارنة `action_code` الوارد مع mapping
  - التحقق من `delivery_status` الناتج

**الاختيار الموصى به:** الخيار A (الأبسط والأأمن — لا كود، لا API من جانبنا).

### التحقق المشترك لجميع الخيارات:

```sql
-- تحقق من السجل الجديد في sync events
SELECT source, action_code, current_step, payload_hash, created_at
FROM delivery_provider_sync_events
WHERE provider_code = 'jenni'
ORDER BY created_at DESC LIMIT 5;

-- تحقق من delivery events
SELECT event_type, actor_type, from_status, to_status, created_at
FROM delivery_events
WHERE order_id = '<ORDER_UUID>'
ORDER BY created_at DESC LIMIT 5;
```

---

## 12. Status Mapping Reference / خريطة الحالات

### الحالات المؤكدة بالاستعلام الحقيقي (Real Query Confirmed):

الشحنة `9311578` مرّت بهذا التسلسل الموثق:

```
NEW_WITH_PA → IN_SC → PRINT_MANIFEST_DA → OFD → RTO_WITH_DA
```

| Jenni Step          | العربي                             | Internal Status       | المصدر                  |
| ------------------- | ---------------------------------- | --------------------- | ----------------------- |
| `NEW_WITH_PA`       | شحنات جديدة مع مندوب الاستلام      | `assigned_to_company` | ✅ Real Query Confirmed |
| `IN_SC`             | في مركز الفرز                      | `in_transit`          | ✅ Real Query Confirmed |
| `PRINT_MANIFEST_DA` | طباعة البيان مع مندوب التوصيل      | `in_transit`          | ✅ Real Query Confirmed |
| `OFD`               | خارج للتوصيل (Out for Delivery)    | `in_transit`          | ✅ Real Query Confirmed |
| `RTO_WITH_DA`       | راجع عند المندوب (مرتجع قيد النقل) | `returned`            | ✅ Real Query Confirmed |

### ملاحظة على `RTO_WITH_DA`:

- **المعنى التشغيلي:** الإرجاع بدأ والشحنة مع مندوب التوصيل — لم تصل للمستودع بعد.
- **الحالة الداخلية الحالية:** `returned` (يُغلق دورة الحياة).
- **ملاحظة مستقبلية:** قد يكون من الأدق تعريف `RTO_WITH_DA` كـ "إرجاع قيد التنفيذ" بدلاً من `returned` النهائي، إذا أضاف النظام مستقبلاً حالة `return_in_progress`. **لا تغيير في الكود الآن.**

### الحالات الموثقة (Docs — تنتظر تأكيداً فعلياً):

| Jenni Step                          | العربي             | Internal Status             |
| ----------------------------------- | ------------------ | --------------------------- |
| `DELIVERED` / `SUCCESSFUL_DELIVERY` | تم التوصيل         | `delivered`                 |
| `DELIVERED_PRICE_CHANGED`           | تسليم مع تعديل سعر | `delivered` + admin review  |
| `POSTPONED` / `POSTPONED_CONFIRMED` | مؤجل               | `in_transit`                |
| `DELIVERY_REATTEMPT`                | إعادة محاولة       | `in_transit`                |
| `RTO_WH`                            | مرتجع في المستودع  | `returned`                  |
| `RTO_CONFIRMED` / `RTO_ARCHIVED`    | مرتجع مؤكد/مؤرشف   | `returned`                  |
| `PARTIALLY_DELIVERED`               | مستلم جزئياً       | `in_transit` + admin review |

---

## 13. Known Errors / الأخطاء المعروفة

| الخطأ                                               | السبب                                     | الحل                                                             |
| --------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `404` على `store.DilMart.org/v2/push/update-status` | استخدام نطاق الـ Frontend للـ webhook     | استخدم `DilMart-store-backend.onrender.com`                      |
| `Bearer Bearer token`                               | Jenni ترجع التوكن مع بادئة `Bearer` مكررة | الكود يزيل البادئة تلقائياً                                      |
| `merchant_id is required for AGGREGATOR users`      | إرسال شحنة بدون `jenni_merchant_id`       | تأكد من وجود `jenni_merchant_id` في الـ payload                  |
| `store_id required`                                 | عدم تحديد المتجر في الشحنة                | يجب تمرير `store_id` في كل شحنة                                  |
| `name is reduplicate`                               | المتجر موجود مسبقاً في Jenni              | ربط يدوي بـ `jenni_store_id` الموجود بدلاً من إعادة الإنشاء      |
| `city/area rejected`                                | اسم المدينة لا يطابق قاعدة Jenni          | استخدم الأسماء العربية الرسمية المزامنة (`المنصور` لا `Mansour`) |
| `Missing provider_shipment_id`                      | مزامنة طلب لم يُرسل بعد                   | لا مزامنة قبل dispatch ناجح                                      |
| `duplicate=true` في webhook                         | نفس الـ payload وصل مرتين                 | سلوك مقصود — النظام آمن، يتجاهل التكرار                          |

---

## 14. Post-Pilot Closeout / إجراءات ما بعد الـ Pilot

بعد اكتمال الاختبار التجريبي الناجح:

1. **تصدير النتائج:** screenshots من `delivery_provider_sync_events` + `delivery_events` + Render logs
2. **تدوير `JENNI_WEBHOOK_TOKEN`:** (مُؤجل حتى اكتمال كل الاختبارات — ينفذه مالك المشروع فقط)
3. **تأكيد مع Jenni:** اعتماد الـ webhook URL رسمياً في إعداداتهم
4. **قرار توسيع الـ Pilot:** مالك المشروع يقرر ما إذا كان سيُفعّل طلبات إضافية

---

## 15. Pilot Execution Plan / خطة تنفيذ الـ Pilot

> [!IMPORTANT]
> **هذه خطة موثقة فقط — لا تنفيذ حتى الموافقة الصريحة.**

### 15.1 التاجر والمتجر المستهدف

| البند               | القيمة المعتمدة |
| ------------------- | --------------- |
| التاجر              | `شركة العرش`    |
| `jenni_merchant_id` | `17168`         |
| `jenni_store_id`    | `17900`         |

### 15.2 متطلبات الطلب المرشّح

الطلب يجب أن يستوفي جميع الشروط:

- [ ] ينتمي للتاجر `شركة العرش`
- [ ] رقم هاتف عراقي صالح (07xxxxxxxxx)
- [ ] محافظة مدعومة في جدول `jenni_governorate_code`
- [ ] المدينة موجودة في مرجع Jenni بالعربي
- [ ] `dispatch_status = 'pending'` (لم يُرسل من قبل)
- [ ] لا `provider_shipment_id` موجود

### 15.3 من يوافق على الإرسال

- **موافقة الإرسال:** مالك المشروع فقط (خطابياً أو عبر WhatsApp/Telegram)
- **تنفيذ الإرسال:** أدمن النظام أو المطور بعد موافقة مكتوبة

### 15.4 النافذة الزمنية

- إرسال في ساعات العمل الرسمية (9 صباحاً — 6 مساءً توقيت بغداد)
- مالك المشروع متاح للتواصل خلال النافذة كاملة
- لا إرسال في عطل نهاية الأسبوع أو المناسبات الرسمية

### 15.5 إجراء التراجع (Rollback / Safe Stop)

إذا حدث أي خطأ غير متوقع:

1. **لا panic** — النظام مصمم للأمان افتراضياً
2. الطلب يبقى في DB بـ `dispatch_status = 'failed'` أو `'pending'` — لا تأثير مالي
3. التواصل الفوري مع Jenni لإلغاء الشحنة إذا قُبلت
4. إغلاق بوابة الإرسال فوراً: `JENNI_ALLOW_SHIPMENT_DISPATCH=false`
5. توثيق الخطأ في `docs/` لمراجعة لاحقة

### 15.6 ما يجب جمعه (Screenshots / Logs)

| العنصر                               | المصدر           |
| ------------------------------------ | ---------------- |
| Render logs لحظة الإرسال             | Render dashboard |
| `order_delivery_integrations` row    | Supabase / SQL   |
| `delivery_provider_sync_events` rows | Supabase / SQL   |
| `delivery_events` rows               | Supabase / SQL   |
| Webhook POST في Render logs (إن وصل) | Render dashboard |
| Response JSON من Jenni (dispatch)    | Backend logs     |

### 15.7 معايير النجاح

| المعيار             | الشرط                                                           |
| ------------------- | --------------------------------------------------------------- |
| ✅ نجاح الإرسال     | `dispatch_status = 'dispatched'` + `provider_shipment_id` موجود |
| ✅ نجاح المزامنة    | `last_synced_at` متحدّث + `provider_current_step` صحيح          |
| ✅ نجاح الـ Webhook | `source = 'webhook'` في `delivery_provider_sync_events`         |
| ✅ تحديث الحالة     | `delivery_status` في `orders` تغيّر صحيحاً                      |
| ✅ لا أخطاء         | لا `dispatch_error` + لا exceptions في Render logs              |

### 15.8 معايير الفشل والإيقاف

| الموقف                       | الإجراء                                     |
| ---------------------------- | ------------------------------------------- |
| Jenni ترفض الشحنة (`4xx`)    | توثيق الخطأ + تراجع فوري + لا محاولة إضافية |
| Jenni تقبل لكن DB لا تتحدث   | فحص Render logs + إيقاف البوابة             |
| Webhook لا يصل خلال 24 ساعة  | تنسيق مع Jenni للتحقق من تسجيل URL          |
| أي خطأ في Finance/Settlement | إيقاف كامل + مراجعة يدوية                   |

---

## Appendix / ملحق

### أوامر قراءة آمنة للتحقق

```sql
-- حالة الشحنة الحالية
SELECT
  order_id,
  provider_shipment_id,
  provider_current_step,
  provider_current_step_ar,
  dispatch_status,
  last_synced_at,
  amount_change_flag
FROM order_delivery_integrations
WHERE provider_code = 'jenni'
ORDER BY created_at DESC LIMIT 10;

-- آخر أحداث المزامنة
SELECT source, action_code, current_step, created_at
FROM delivery_provider_sync_events
WHERE provider_code = 'jenni'
ORDER BY created_at DESC LIMIT 10;

-- التحقق من ربط التاجر والمتجر
SELECT
  slug,
  display_name,
  jenni_merchant_id,
  jenni_store_id,
  jenni_synced_at,
  jenni_sync_error
FROM merchants
WHERE jenni_store_id IS NOT NULL;
```

### روابط سريعة

- Admin Integration Center: `/admin/jenni`
- Backend Webhook URL: `https://DilMart-store-backend.onrender.com/v2/push/update-status`
- Jenni API Base: `https://jenni.alzaeemexp.com/api`
- الشحنة الاختبارية: Order `ddba4bc7-e9b8-4810-9426-f6362cb2b038` | Jenni `9311578`
