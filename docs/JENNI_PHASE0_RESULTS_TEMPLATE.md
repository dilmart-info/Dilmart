# 🔬 JENNI PHASE 0 — نتائج اختبار نموذج الهوية

> **Date**: _YYYY-MM-DD HH:MM_  
> **API Base**: _URL_  
> **Authenticated as**: _username_  
> **System Code**: _system_code_

---

## ملخص النتائج

| #   | Test                                  | Request                                                          | Response Status | Response Summary                  | Decision Impact              | Pass/Fail        |
| --- | ------------------------------------- | ---------------------------------------------------------------- | --------------- | --------------------------------- | ---------------------------- | ---------------- |
| T4  | List Existing Stores                  | `GET /v2/merchants/my-stores`                                    | _status_        | _عدد stores / وصف الخطأ_          | اكتشاف الحالة الحالية        | _PASS/FAIL_      |
| T1  | Create Store without merchant_id      | `POST /v2/stores/create` (no merchant_id)                        | _status_        | _store_id أو رسالة الخطأ_         | إذا PASS → الخيار A مدعوم    | _PASS/FAIL_      |
| T2  | Create Store with DilMart merchant_id | `POST /v2/stores/create` (with merchant_id)                      | _status_        | _store_id أو رسالة الخطأ_         | يؤكد الخيار A                | _PASS/FAIL/SKIP_ |
| T3  | Create Merchant + Store               | `POST /v2/merchant-management/create` + `POST /v2/stores/create` | _status_        | _merchant_id + store_id أو الخطأ_ | إذا A فشل و B نجح → الخيار B | _PASS/FAIL_      |

---

## القرار

> **النموذج المعتمد**: _الخيار A (Stores فقط) / الخيار B (Merchant + Store) / غير محسوم_

### التبرير:

_اكتب هنا لماذا تم اختيار هذا النموذج بناءً على نتائج الاختبار._

---

## تفاصيل الاستجابات

### T4: List Existing Stores

```json
// ── Response ──
_paste raw response here_
```

**الملاحظات**: _أي stores موجودة؟ هل هناك merchant_id ظاهر؟_

---

### T1: Create Store WITHOUT merchant_id

```json
// ── Request Payload ──
{
  "store_name": "SPIKE_TEST_DilMart_Store_NoMerchant",
  "store_phone": "07901234567",
  "governorate_code": "BGD",
  "address": "Test address - Phase 0 Spike (will delete)"
}

// ── Response ──
_paste raw response here_
```

**الملاحظات**: _هل تم إنشاء store_id؟ هل ظهر merchant_id تلقائياً؟_

---

### T2: Create Store WITH DilMart merchant_id

```json
// ── Request Payload ──
{
  "store_name": "SPIKE_TEST_DilMart_Store_WithMerchant",
  "store_phone": "07901234568",
  "governorate_code": "BGD",
  "address": "Test address - Phase 0 Spike with merchant_id",
  "merchant_id": "_DilMart_merchant_id_"
}

// ── Response ──
_paste raw response here_
```

**الملاحظات**: _هل قبل merchant_id؟ هل ظهر store_id؟_

---

### T3: Create Merchant + Store

```json
// ── Merchant Request ──
{
  "merchant_name": "SPIKE_TEST_SubMerchant",
  "phone": "07901234569",
  "system_code": "SPIKE_TEST_xxx"
}

// ── Merchant Response ──
_paste raw response here_

// ── Store Request ──
{
  "store_name": "SPIKE_TEST_SubMerchant_Store",
  "store_phone": "07901234570",
  "governorate_code": "BGD",
  "address": "Test store for sub-merchant",
  "merchant_id": "_new_merchant_id_"
}

// ── Store Response ──
_paste raw response here_
```

**الملاحظات**: _هل يمكن إنشاء merchant جديد؟ هل له صلاحيات كافية؟_

---

## الخطوات التالية

- [ ] مراجعة النتائج مع المشرف
- [ ] تحديد النموذج النهائي (A أو B)
- [ ] تنظيف بيانات الاختبار من Jenni
- [ ] البدء بـ Migration (بعد موافقة المشرف)
- [ ] بناء Store Provisioning Service

---

## ملاحظات إضافية

_أي ملاحظات أو مفاجآت من API Jenni — endpoints غير موثقة، حقول إضافية في الاستجابة، أخطاء غير متوقعة، إلخ._
