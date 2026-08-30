# Phase 2C — Controlled Real Store Provisioning Test Plan

> **Security Note**: Sensitive credential values were redacted. Use environment variables from secure deployment dashboards instead.

> **Date**: 2026-06-16
> **Status**: خطة فقط — لم يُضغط Create/Sync
> **Prerequisite**: Phase 2B ✅ APPROVED/CLOSED

> [!CAUTION]
>
> ## قواعد التنفيذ الصارمة
>
> 1. **لا تنفيذ تلقائي**: لا يوجد أي سكربت أو cron أو trigger يُنشئ Store تلقائيًا.
> 2. **لا سكربتات تُنشئ Store**: السكربت `jenni-preflight-check.mjs` تم **حذفه من Git** — كان أداة قراءة محلية فقط.
> 3. **Create/Sync يكون فقط من Admin UI**: عبر زر `Create / Sync Store` في صفحة Merchant Detail.
> 4. **نقرة يدوية واحدة فقط**: الأدمن يضغط الزر بيده بعد مراجعة البيانات.
> 5. **لا ضغط بدون موافقة المشرف**: يجب صدور أمر صريح "نفّذ Phase 2C" قبل الضغط.
> 6. **لا سكربتات preflight في Git**: أي فحص يتم عبر `supabase db query --linked` يدوياً أو عبر Admin UI.
> 7. **ممنوع اختبار أي POST على Jenni Production من terminal/script**: لا `node -e`, لا `curl`, لا أي أداة خارج مسار التطبيق الرسمي. (أُضيف بعد حادثة Store 17725)
> 8. **Env gate مطلوب**: `JENNI_ALLOW_STORE_PROVISIONING=true` يجب أن يكون مفعّلاً في Render قبل أي محاولة Create/Sync. بدونه الزر يرجع 403.
> 9. **أي اختبار POST مستقبلي**: يجب أن يتم فقط من مسار التطبيق الرسمي (Admin UI) وبموافقة المشرف الصريحة.

---

## 1. اختيار التاجر للاختبار

### بيانات Production الفعلية (تم التحديث 2026-06-17)

| Field            | alarsh                                 | DilMart-primary                        |
| ---------------- | -------------------------------------- | -------------------------------------- |
| id               | `65575f7c-4204-44d0-99a0-fc1902e2ed91` | `a3e3b17d-450f-4ccf-81dd-72cc4d4172d4` |
| display_name     | شركة العرش                             | DilMart Store                          |
| status           | active                                 | active                                 |
| jenni_store_id   | **NULL**                               | **NULL**                               |
| jenni_synced_at  | NULL                                   | NULL                                   |
| jenni_sync_error | NULL                                   | NULL                                   |
| contact_phone    | **07725332211** (Corrected)            | +964 787 185 7930                      |
| whatsapp_phone   | **07725332211** (Corrected)            | 9647871857930                          |
| address          | المنصور شارع 14 رمضان                  | **NULL** ❌                            |
| city             | بغداد                                  | Baghdad                                |

### Provisioning Lock Table

```
jenni_store_provisioning_locks → فارغ (0 rows) ✅
```

### Existing Jenni Stores

```json
{
  "total": 1,
  "data": [
    {
      "id": 17025,
      "name": "Stylia store",
      "phone": "<REDACTED_JENNI_USERNAME>"
    }
  ]
}
```

> [!NOTE]
> Store 17725 is marked as operationally closed and Jenni was notified for deletion. It does not affect this test.

### القرار

| التاجر              | مؤهل؟      | السبب                                                                              |
| ------------------- | ---------- | ---------------------------------------------------------------------------------- |
| **alarsh**          | ✅ **نعم** | phone ✅ (`07725332211`), address ✅, city ✅ (بغداد → BGD), jenni_store_id = NULL |
| **DilMart-primary** | ❌ **لا**  | `address = NULL` → سيفشل strict validation                                         |

> [!IMPORTANT]
> **التاجر المختار: `alarsh` (شركة العرش)**
>
> `DilMart-primary` غير جاهز بسبب عنوان ناقص.
> لا نضيف عنوان وهمي — يجب أن يُملأ من التاجر أو الإدارة.

---

## 2. Preflight — قبل الضغط

### 2.1 فحص merchant_settings (يدوي أو عبر الأدمن)

```sql
SELECT ms.contact_phone, ms.whatsapp_phone, ms.address, ms.city
FROM merchant_settings ms
WHERE ms.merchant_id = '65575f7c-4204-44d0-99a0-fc1902e2ed91';
```

**المتوقع**:

| Field          | Value                 | Check    |
| -------------- | --------------------- | -------- |
| contact_phone  | 07725332211           | ✅       |
| whatsapp_phone | 07725332211           | ✅       |
| address        | المنصور شارع 14 رمضان | ✅       |
| city           | بغداد                 | ✅ → BGD |

### 2.2 فحص jenni_store_id IS NULL

```sql
SELECT jenni_store_id FROM merchants
WHERE id = '65575f7c-4204-44d0-99a0-fc1902e2ed91';
```

**المتوقع**: `NULL`

> [!CAUTION]
> إذا لم يكن NULL → **التاجر مربوط فعلاً**. لا تضغط Create/Sync.

### 2.3 فحص عدم وجود Store مكرر في Jenni

سيتحقق `ensureStoreForMerchant` تلقائيًا من:

1. `jenni_store_id IS NULL` (quick check)
2. Lock acquisition (لا عملية أخرى جارية)
3. Double-check بعد الـ lock

بالإضافة، يمكن التحقق يدويًا:

```sql
-- لا أحد آخر مربوط بنفس الاسم/الهاتف
SELECT id, slug, jenni_store_id FROM merchants
WHERE jenni_store_id IS NOT NULL;
```

**المتوقع**: 0 rows (لا أحد مربوط حالياً)

### 2.4 فحص Jenni listStores الحالي

الـ Store الوحيد في Jenni:

```
id=17025, name="Stylia store", phone="<REDACTED_JENNI_USERNAME>"
```

بعد الضغط، يجب أن يظهر Store جديد بـ:

```
name="شركة العرش", phone="07725332211" (normalized from 07725332211)
```

> [!WARNING]
> **تأكيد**: الضغط على Create/Sync سيُنشئ Store **حقيقي** في Jenni Production.
> هذا ليس sandbox أو dry-run.

### 2.5 فحص Lock Table فارغ

```sql
SELECT * FROM jenni_store_provisioning_locks;
```

**المتوقع**: 0 rows

---

## 3. خطوات التنفيذ

> [!CAUTION]
> لا يُنفَّذ إلا بموافقة صريحة من المشرف.

### 3.1 الدخول إلى Admin Panel

1. فتح الأدمن بحساب `super_admin` أو `admin`
2. الانتقال إلى صفحة التجار
3. فتح Merchant Detail لـ `alarsh` (id: `65575f7c-...`)

### 3.2 مراجعة Jenni Section

عند فتح الصفحة، سيُعرض قسم "ربط Jenni Store":

- **Status Badge**: يجب أن يكون `غير مربوط` (أصفر)
- **Jenni Store ID**: يجب أن يكون `—`
- **آخر مزامنة**: يجب أن يكون `—`
- **خطأ**: لا يجب أن يظهر صندوق أحمر

### 3.3 الضغط على Create/Sync Store

1. **اضغط** زر `Create / Sync Store` **مرة واحدة فقط**
2. انتظر Toast notification
3. **لا تضغط مرة ثانية** — الزر يتحول إلى `جاري الإنشاء...` أثناء التنفيذ

### 3.4 النتيجة المتوقعة

| النتيجة        | التفصيل                                           |
| -------------- | ------------------------------------------------- |
| Toast          | `تم إنشاء Store في Jenni: XXXXX` (رقم Store جديد) |
| Status Badge   | يتحول إلى `مربوط` (أخضر)                          |
| Jenni Store ID | يظهر رقم Store الجديد                             |
| آخر مزامنة     | يظهر تاريخ/وقت الإنشاء                            |
| خطأ            | لا يظهر                                           |

---

## 4. Post-check — بعد الضغط

### 4.1 DB Verification

```sql
-- 1. jenni_store_id يجب أن يكون != NULL
SELECT id, slug, jenni_store_id, jenni_synced_at, jenni_sync_error
FROM merchants
WHERE id = '65575f7c-4204-44d0-99a0-fc1902e2ed91';

-- المتوقع:
-- jenni_store_id = XXXXX (رقم جديد)
-- jenni_synced_at = timestamp حديث
-- jenni_sync_error = NULL
```

### 4.2 Lock Table Empty

```sql
SELECT * FROM jenni_store_provisioning_locks;
-- المتوقع: 0 rows (lock تم تحريره في finally)
```

### 4.3 Audit Event

```sql
SELECT * FROM audit_logs
WHERE resource_type = 'merchant'
  AND resource_id = '65575f7c-4204-44d0-99a0-fc1902e2ed91'
  AND event_type = 'JENNI_STORE_PROVISIONED'
ORDER BY created_at DESC
LIMIT 1;

-- المتوقع: row واحد مع:
-- payload.jenni_store_id = XXXXX
-- payload.was_created = true
```

### 4.4 Jenni listStores Verification

```
GET /store?page=1&size=50
```

يجب أن يظهر **2 stores** الآن:

| #   | id      | name         | phone                     |
| --- | ------- | ------------ | ------------------------- |
| 1   | 17025   | Stylia store | <REDACTED_JENNI_USERNAME> |
| 2   | **NEW** | شركة العرش   | 07801231340               |

### 4.5 جدول الملخص

| Check                            | Expected | Status |
| -------------------------------- | -------- | ------ |
| jenni_store_id ≠ NULL            | ✅       | ⏳     |
| jenni_synced_at حديث             | ✅       | ⏳     |
| jenni_sync_error = NULL          | ✅       | ⏳     |
| Lock table فارغ                  | ✅       | ⏳     |
| Audit event موجود                | ✅       | ⏳     |
| Jenni listStores يظهر Store جديد | ✅       | ⏳     |
| Store الجديد اسمه شركة العرش     | ✅       | ⏳     |
| Store القديم 17025 لم يتأثر      | ✅       | ⏳     |
| DilMart-primary لم يتأثر         | ✅       | ⏳     |

---

## 5. Rollback — في حالة الخطأ

### 5.1 خطأ في Validation (قبل API call)

| الحالة                        | الإجراء                              |
| ----------------------------- | ------------------------------------ |
| `jenni_sync_error` يظهر في DB | طبيعي — يُظهر سبب الفشل              |
| `jenni_store_id` يبقى NULL    | طبيعي — لم يتم الإنشاء               |
| Lock تم تحريره تلقائياً       | طبيعي — `finally` block              |
| **لا إجراء مطلوب**            | صحح البيانات الناقصة ثم أعد المحاولة |

### 5.2 خطأ في Jenni API (بعد validation، قبل save)

| الحالة                                                   | الإجراء                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `jenni_sync_error` يحتوي رسالة Jenni API                 | طبيعي                                                        |
| `jenni_store_id` يبقى NULL                               | طبيعي                                                        |
| Lock تم تحريره                                           | طبيعي                                                        |
| **احتمال**: Store تم إنشاؤه في Jenni لكن لم يُحفظ محلياً | نادر — يحدث فقط إذا كان Jenni API أرجع النتيجة ثم فشل حفظ DB |
| **إجراء**: تحقق من `listStores` في Jenni                 | إذا ظهر Store جديد → استخدم `Link Store` يدوياً              |

### 5.3 ما لا نفعله أبداً

> [!CAUTION]
>
> - ❌ لا نحذف Store من Jenni تلقائياً
> - ❌ لا نستخدم Jenni DELETE API بدون إذن صريح
> - ❌ لا UPDATE يدوي على DB بدون مراجعة
> - ❌ لا نربط `DilMart-primary` بـ `17025` في هذه المرحلة
> - ❌ لا نضغط Create/Sync مرة ثانية قبل التحقق

---

## 6. الممنوعات

| البند                                     | الحكم                      |
| ----------------------------------------- | -------------------------- |
| ❌ لا dispatch                            | **ممنوع**                  |
| ❌ لا shipment                            | **ممنوع**                  |
| ❌ لا ربط 17025 بأي تاجر                  | **ممنوع في هذه المرحلة**   |
| ❌ لا DilMart-primary Create/Sync         | **ممنوع** (address = NULL) |
| ❌ لا finance                             | **ممنوع**                  |
| ❌ لا webhook changes                     | **ممنوع**                  |
| ❌ لا ضغط Create/Sync مرتين               | **ممنوع**                  |
| ❌ لا إنشاء عنوان وهمي لـ DilMart-primary | **ممنوع**                  |

---

## 7. الـ Payload المتوقع لـ alarsh

بناءً على كود [buildStorePayload](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-store-provisioning.service.ts#L308-L350):

```json
{
  "store_name": "شركة العرش",
  "store_phone": "07725332211",
  "governorate_code": "BGD",
  "address": "المنصور شارع 14 رمضان"
}
```

**تفاصيل الـ Validation**:

| Field            | Source                                    | Value                     | Validation     |
| ---------------- | ----------------------------------------- | ------------------------- | -------------- |
| store_name       | `merchant.display_name`                   | `"شركة العرش"`            | ✅ not empty   |
| store_phone      | `normalizeIraqMobilePhone("07725332211")` | `"07725332211"`           | ✅ normalized  |
| governorate_code | `resolveGovernorateCode("بغداد")`         | `"BGD"`                   | ✅ exact match |
| address          | `settings.address`                        | `"المنصور شارع 14 رمضان"` | ✅ not empty   |

---

## 8. ملخص

```
Phase 2C = خطة جاهزة (Hardened with Safety Gates)
التاجر المختار = alarsh (شركة العرش)
رقم الهاتف المعدل = 07725332211 ✅
DilMart-primary = غير مؤهل (address = NULL)
store_id=17025 = لا يُربط ولا يُستخدم
Store 17725 = مغلق تشغيليًا
الحالة = ⏳ بانتظار موافقة المشرف للضغط (نقرة يدوية واحدة فقط من الـ Admin UI)
```
