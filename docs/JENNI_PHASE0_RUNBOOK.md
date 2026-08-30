# 🚀 JENNI PHASE 0 — دليل التشغيل (Runbook)

> **Status**: ⏳ بانتظار بيانات اعتماد Jenni الصحيحة  
> **Script**: [`backend/scripts/jenni-identity-spike.mjs`](../backend/scripts/jenni-identity-spike.mjs)  
> **Output**: `docs/JENNI_PHASE0_RESULTS.md` (يُنشأ تلقائياً)

---

## 📋 الهدف

حسم نموذج الهوية: كيف سيُمثَّل كل تاجر DilMart داخل نظام Jenni؟

| النموذج                        | الوصف                                   | متى يُعتمد        |
| ------------------------------ | --------------------------------------- | ----------------- |
| **الخيار A: Stores فقط**       | كل تاجر = Store تحت حساب DilMart الموحد | إذا نجح T1 أو T2  |
| **الخيار B: Merchant + Store** | كل تاجر = Merchant تشغيلي + Store(s)    | إذا فشل A ونجح T3 |

> [!IMPORTANT]
> في كلا الخيارين: **DilMart هي جهة التحاسب المالي الوحيدة مع Jenni.**
> التاجر لا يتعامل مع Jenni مباشرة.

---

## 🔑 متغيرات البيئة المطلوبة

أضف هذه القيم في `backend/.env`:

```env
# ── Jenni API Credentials (من فريق Jenni) ──
JENNI_API_BASE_URL=https://jenni.alzaeemexp.com/api
JENNI_USERNAME=<username من Jenni>
JENNI_PASSWORD=<password من Jenni>
JENNI_SYSTEM_CODE=<system_code من Jenni>
```

| المتغير              | مطلوب           | الوصف                                                   |
| -------------------- | --------------- | ------------------------------------------------------- |
| `JENNI_API_BASE_URL` | لا (له default) | عنوان API — Default: `https://jenni.alzaeemexp.com/api` |
| `JENNI_USERNAME`     | **نعم**         | اسم المستخدم للدخول                                     |
| `JENNI_PASSWORD`     | **نعم**         | كلمة المرور                                             |
| `JENNI_SYSTEM_CODE`  | نعم             | رمز النظام الخاص بـ DilMart                             |

> [!CAUTION]
> **لا تكتب Credentials داخل أي ملف كود أو سكربت.**
> السكربت يقرأ فقط من `backend/.env` الذي هو في `.gitignore`.

---

## 🏃 خطوات التشغيل

### 1. تأكد من وجود بيانات الاعتماد

```bash
# تحقق أن القيم موجودة (بدون طباعة القيم نفسها)
grep -c "JENNI_USERNAME" backend/.env
grep -c "JENNI_PASSWORD" backend/.env
grep -c "JENNI_SYSTEM_CODE" backend/.env
```

### 2. شغّل Phase 0

```bash
node backend/scripts/jenni-identity-spike.mjs
```

### 3. راجع النتائج

```bash
cat docs/JENNI_PHASE0_RESULTS.md
```

### 4. شارك النتائج مع المشرف

النتائج تُكتب تلقائياً في `docs/JENNI_PHASE0_RESULTS.md` — راجعها مع المشرف قبل أي خطوة تالية.

---

## 🧪 السيناريوهات

### T4: List Existing Stores (اكتشاف الحالة الحالية)

| البند                | القيمة                                       |
| -------------------- | -------------------------------------------- |
| **الهدف**            | معرفة ما هو موجود حالياً في حساب Jenni       |
| **الطلب**            | `GET /v2/merchants/my-stores?page=1&size=50` |
| **النتيجة المتوقعة** | قائمة stores (قد تكون فارغة)                 |
| **أثر القرار**       | معرفة إذا كان هناك stores أو merchants سابقة |

---

### T1: Create Store WITHOUT merchant_id (الخيار A — المفضّل)

| البند                | القيمة                                            |
| -------------------- | ------------------------------------------------- |
| **الهدف**            | هل يمكن إنشاء Store مباشرة بدون ربطه بـ Merchant؟ |
| **الطلب**            | `POST /v2/stores/create` — بدون `merchant_id`     |
| **النتيجة المتوقعة** | ✅ PASS = Store يُنشأ تحت حساب DilMart تلقائياً   |
| **أثر القرار**       | إذا نجح → **الخيار A مدعوم**                      |
| **البيانات**         | اسم Store تجريبي، رقم هاتف تجريبي، محافظة بغداد   |

---

### T2: Create Store WITH DilMart's merchant_id (الخيار A — مع ربط صريح)

| البند                | القيمة                                                                          |
| -------------------- | ------------------------------------------------------------------------------- |
| **الهدف**            | هل يمكن إنشاء Store وربطه بـ Merchant ID الخاص بـ DilMart؟                      |
| **الطلب**            | `GET /v2/merchant-management/list` ثم `POST /v2/stores/create` مع `merchant_id` |
| **النتيجة المتوقعة** | ✅ PASS = Store يُنشأ تحت DilMart's merchant_id                                 |
| **أثر القرار**       | يؤكد الخيار A                                                                   |

---

### T3: Create NEW Merchant + Store (الخيار B — Fallback)

| البند                | القيمة                                                            |
| -------------------- | ----------------------------------------------------------------- |
| **الهدف**            | هل يمكن إنشاء Merchant تشغيلي جديد ثم Store تحته؟                 |
| **الطلب**            | `POST /v2/merchant-management/create` ثم `POST /v2/stores/create` |
| **النتيجة المتوقعة** | Merchant + Store يُنشأان                                          |
| **أثر القرار**       | يُستخدم فقط إذا فشل T1 و T2                                       |
| **ملاحظة**           | حتى في الخيار B، DilMart تبقى جهة التحاسب الوحيدة                 |

---

## 🔀 شجرة القرارات

```
T1 PASS? ─── نعم ──→ ✅ الخيار A: Stores فقط
    │                     كل تاجر DilMart = Store تحت حساب DilMart
    │                     migration: إضافة jenni_store_id فقط
    لا
    ↓
T2 PASS? ─── نعم ──→ ✅ الخيار A: Stores + DilMart merchant_id
    │                     نفس الخيار A لكن مع merchant_id صريح
    لا
    ↓
T3 PASS? ─── نعم ──→ ⚠️ الخيار B: Merchant تشغيلي + Store
    │                     كل تاجر = Merchant + Store
    │                     migration: إضافة jenni_merchant_id + jenni_store_id
    │                     التحاسب يبقى مع DilMart فقط
    لا
    ↓
    ❌ تواصل مع فريق Jenni — لا يمكن حسم النموذج
```

---

## ⚠️ تحذيرات مهمة

> [!WARNING]
>
> ### لا تستخدم بيانات عملاء حقيقية
>
> كل البيانات في Phase 0 هي بيانات اختبار فقط:
>
> - أسماء تبدأ بـ `SPIKE_TEST_`
> - أرقام هواتف تجريبية
> - عناوين مزيفة

> [!WARNING]
>
> ### لا تنشئ شحنة (Shipment) حقيقية
>
> Phase 0 يختبر فقط إنشاء Stores و Merchants.
> إنشاء شحنة حقيقية يحتاج موافقة المشرف أولاً.

> [!WARNING]
>
> ### نظّف بعد الانتهاء
>
> بعد الاختبار، تواصل مع Jenni لحذف Stores/Merchants التجريبية
> أو ضعها في حالة inactive.

---

## 📋 بعد Phase 0

| النتيجة     | الخطوة التالية                                        |
| ----------- | ----------------------------------------------------- |
| الخيار A ✅ | Migration بسيط: `jenni_store_id` في `merchants` table |
| الخيار B ⚠️ | Migration: `jenni_merchant_id` + `jenni_store_id`     |
| فشل ❌      | تواصل مع Jenni قبل أي عمل                             |

بعد حسم النموذج:

1. مراجعة مع المشرف
2. Migration (بعد الموافقة)
3. Store Provisioning Service (lazy — عند أول dispatch)
4. تعديل dispatch payload لإرسال `store_id`
5. اختبار شامل
