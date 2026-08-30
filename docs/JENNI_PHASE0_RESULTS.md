# 🔬 JENNI PHASE 0 — Identity Model Spike Results

> **Security Note**: Sensitive credential values were redacted. Use environment variables from secure deployment dashboards instead.

> **Date**: 2026-06-16 06:03  
> **Updated**: 2026-06-16 09:14  
> **API Base**: https://jenni.alzaeemexp.com/api  
> **Authenticated as**: `JENNI_USERNAME` (see env)  
> **System Code**: DilMart_STORE  
> **Password**: configured locally (not documented)

---

## Phase 0 Status

| Sub-Phase    | الوصف                       | الحالة                                             |
| ------------ | --------------------------- | -------------------------------------------------- |
| **Phase 0A** | Auth + Read Stores          | ✅ **COMPLETED**                                   |
| **Phase 0B** | Create Store test           | 🚫 **CANCELLED** — المشرف قرر استخدام Store الحالي |
| **Phase 0C** | Shipment with store_id test | ⏳ **DEFERRED** — يُنفَّذ لاحقًا عند بدء Phase 3   |

> [!IMPORTANT]
> Phase 0A اكتملت وتكفي لاعتماد المسار A مبدئيًا.
> لا migrations ولا implementation قبل تخطيط Phase 1.

---

## Phase 0A Results — Auth + Read Stores ✅

### Test Summary

| Test                                | Status  | Detail                                              |
| ----------------------------------- | ------- | --------------------------------------------------- |
| Login/Auth                          | ✅ PASS | تسجيل الدخول ناجح — تم الحصول على JWT token         |
| T4: List Stores                     | ✅ PASS | قراءة المتاجر الحالية ناجحة — تم العثور على 1 store |
| T1: Create Store (no merchant_id)   | ⚠️ SKIP | معلّق بسبب `ALLOW_REAL_JENNI_STORE_TEST=false`      |
| T2: Create Store (with merchant_id) | ⚠️ SKIP | معلّق بسبب `ALLOW_REAL_JENNI_STORE_TEST=false`      |
| T3: Create Merchant + Store         | ⚠️ SKIP | معلّق — المسار A (Stores-only) هو المعتمد مبدئيًا   |
| T5: Create Shipment                 | ⚠️ SKIP | معلّق بسبب `ALLOW_REAL_JENNI_SHIPMENT_TEST=false`   |

### ما تم إثباته

| نقطة                       | النتيجة                                  |
| -------------------------- | ---------------------------------------- |
| بيانات الدخول تعمل         | ✅ نعم                                   |
| الحساب Production          | ✅ نعم (حسب جواب Jenni)                  |
| الصلاحية: تاجر             | ✅ نعم (حسب جواب Jenni)                  |
| الحساب يستطيع قراءة Stores | ✅ نعم                                   |
| يوجد Store حالي تحت الحساب | ✅ نعم: `id=17025`, اسم `"Stylia store"` |
| الحساب ليس Aggregator معقد | ✅ صحيح — حساب تاجر يملك Stores          |
| السكربت لم ينشئ Store جديد | ✅ صحيح                                  |
| السكربت لم ينشئ Shipment   | ✅ صحيح                                  |
| لا credentials في التقرير  | ✅ صحيح                                  |

### Existing Store Details

```json
{
  "id": 17025,
  "name": "Stylia store",
  "phone": "<REDACTED_JENNI_USERNAME>"
}
```

> [!WARNING]
> **ملاحظة على الاسم**: Store مسجّل باسم `"Stylia store"` وليس `"DilMart Store"`.
> يحتاج مراجعة/تصحيح لاحقًا عبر Jenni API أو التواصل مع فريقهم.
> هذا لا يؤثر على الوظيفة — `store_id=17025` هو المرجع الفعلي.

### Raw API Response — List Stores

```json
{
  "code": 1,
  "message": "Operation Succeeded",
  "total": 1,
  "data": [
    {
      "id": 17025,
      "name": "Stylia store",
      "phone": "<REDACTED_JENNI_USERNAME>"
    }
  ],
  "pageNumber": 1,
  "pageSize": 50,
  "totalPages": 1
}
```

---

## Supervisor Recommendation — Store Reference

> [!TIP]
> **القرار**: استخدام `store_id=17025` ("Stylia store") كـ existing default store reference مؤقتًا.
>
> **الأسباب**:
>
> - Store موجود فعلاً تحت الحساب ولا يحتاج إنشاء بيانات جديدة في Production
> - الحساب حساب تاجر وليس Aggregator، مما يعني أن هذا Store هو Store الافتراضي
> - إنشاء Stores إضافية يُؤجَّل إلى Phase 2 (Store Provisioning) عند ربط تجار DilMart
>
> **القيود**:
>
> - لا يُستخدم لإنشاء شحنات حقيقية قبل موافقة صريحة
> - الاسم `"Stylia store"` يحتاج تصحيح لاحق إلى `"DilMart Store"` إن أمكن
> - لا يُنشأ Store production إضافي حتى Phase 2

---

## Phase 0B — Create Store Test 🚫

> **الحالة**: **CANCELLED** — لا حاجة لإنشاء Store تجريبي جديد

قرر المشرف عدم إنشاء Store جديد لأن:

1. يوجد Store حالي (`id=17025`) يكفي كمرجع
2. إنشاء Store في Production يزيد بيانات غير ضرورية عند Jenni
3. إنشاء Stores الفعلي يتم في Phase 2 عند ربط تجار DilMart

---

## Phase 0C — Shipment with store_id Test ⏳

> **الحالة**: **DEFERRED** — يُنفَّذ لاحقًا

لا يتم تنفيذه الآن. يُنفَّذ عند:

1. إتمام Phase 1 (Migration) و Phase 2 (Store Provisioning)
2. بدء Phase 3 (Dispatch) مع موافقة صريحة من المشرف
3. تفعيل `ALLOW_REAL_JENNI_SHIPMENT_TEST=true`

---

## Decision — المسار المعماري

> [!NOTE]
> **المسار A: Stores-only — PROVISIONALLY CONFIRMED** 🔶
>
> **الأدلة الداعمة**:
>
> 1. جواب فريق Jenni: الحساب تاجر، يمكنه إنشاء متاجر واستخدام `store_id`
> 2. Login/Auth يعمل بنجاح (Phase 0A)
> 3. يوجد Store فعلي تحت الحساب (`id=17025`)
> 4. الحساب ليس Aggregator — هو حساب تاجر يملك Stores
>
> **النموذج المعتمد مبدئيًا**:

```text
Adopt Path A:
  DilMart = Jenni Merchant Account
  Each DilMart merchant = Jenni Store / Pickup Point
  Shipment must include store_id
  Financial settlement with DilMart account only
```

> **التأكيد الكامل** يتم عند أول شحنة ناجحة مع `store_id` في Phase 3.

---

## Next Steps

1. ✅ ~~Phase 0A: تسجيل الدخول واختبار القراءة~~
2. ✅ ~~قرار المشرف: استخدام `store_id=17025` كمرجع مؤقت~~
3. 🚫 ~~Phase 0B: إنشاء Store تجريبي~~ — **ملغى** (لا حاجة)
4. ⏳ Phase 0C: اختبار Shipment — **مؤجَّل** إلى Phase 3
5. ⏳ **تخطيط Phase 1** (Migration) — التالي الآن
6. ⏳ تنفيذ Phase 1 بعد موافقة المشرف على الخطة
7. ⏳ تصحيح اسم Store من `"Stylia store"` إلى `"DilMart Store"` (Phase 2)
