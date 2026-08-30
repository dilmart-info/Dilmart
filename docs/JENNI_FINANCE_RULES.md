# 💰 JENNI FINANCE RULES — قواعد التحاسب المالي

> **Version**: 1.0  
> **Date**: 2026-06-15  
> **Status**: 📋 DOCUMENTED — قواعد ثابتة تُنفّذ بعد اختبار API 35

---

## 1. القاعدة الأساسية

> ⚠️ **DELIVERED ≠ وصول المال.**
> يجب الفصل بين إثبات الطلب كمكتمل وبين تأكيد وصول المال الفعلي.

---

## 2. سلسلة الأحداث المالية

```
┌─────────────────────────────────────────────────────────────┐
│                     الحدث المالي                              │
│                                                               │
│  1. DELIVERED webhook                                         │
│     → إنشاء accrual (إثبات الطلب كمكتمل)                     │
│     → الحالة: accrued                                         │
│     → لا يُحوّل شيء للتاجر                                    │
│                                                               │
│  2. Jenni Payment Statement (API 35)                          │
│     → تأكيد أن المال وصل لحساب DilMart                        │
│     → الحالة: remitted_to_platform                            │
│     → بعد التأكيد: التاجر يصبح payable                        │
│                                                               │
│  3. دفع فعلي للتاجر                                           │
│     → الحالة: paid                                            │
│     → مبلغ التاجر = COD المجموع - أجرة التوصيل - عمولة DilMart│
│                                                               │
│  ⚠️ لا يوجد تحاسب مباشر بين Jenni وأي تاجر                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. جدول الحالات المالية

| الحالة                 | المعنى            | متى يحدث                       | هل التاجر مستحق؟         |
| ---------------------- | ----------------- | ------------------------------ | ------------------------ |
| `accrued`              | الطلب تم تسليمه   | عند DELIVERED webhook          | ❌ لا — المال لم يصل بعد |
| `remitted_to_platform` | المال وصل DilMart | عند تأكيد من Payment API 35    | ⚠️ جاهز للدفع            |
| `payable_to_merchant`  | التاجر مستحق      | بعد تأكيد الوصول + خصم العمولة | ✅ نعم                   |
| `paid`                 | تم الدفع          | بعد التحويل الفعلي             | ✅ تم                    |
| `disputed`             | نزاع              | تغيير مبلغ أو مشكلة            | ❌ معلّق                 |

---

## 4. حالات خاصة

### DELIVERED_PRICE_CHANGED

```
→ يُثبت الطلب كـ delivered
→ amount_change_flag = true
→ requiresAdminReview = true
→ المبلغ الجديد يُحفظ في integration.new_amount_iqd
→ الأدمن يراجع ويوافق أو يرفض
→ لا accrual حتى حسم المبلغ
```

### PARTIALLY_DELIVERED

```
→ الحالة الداخلية: in_transit (لم يكتمل)
→ requiresAdminReview = true
→ لا accrual
→ ينتظر: إكمال التسليم أو إرجاع الباقي
```

### RETURNED بعد DELIVERED

```
→ إلغاء الـ accrual
→ financeReturned = true
→ إعادة حساب مبلغ التاجر
→ إذا كان settlement قد تم: يُخصم من الدفعة التالية
```

---

## 5. حساب مبلغ التاجر

```
مبلغ التاجر = COD المجموع فعلاً (cod_collected)
             - أجرة التوصيل (delivery_cost_actual)
             - عمولة DilMart

⚠️ يصبح payable فقط بعد:
  1. webhook DELIVERED
  2. تأكيد Payment Statement من Jenni
  3. حسم أي نزاعات (amount_change, partial delivery)
```

---

## 6. ما لا نبنيه الآن

| البند                              | السبب                             |
| ---------------------------------- | --------------------------------- |
| `jenni-settlement.service.ts` كامل | ننتظر اختبار API 35 الفعلي        |
| Automatic reconciliation           | ننتظر معرفة شكل Payment Statement |
| Merchant payout automation         | المرحلة الأولى يدوية              |
| Finance dashboard للتاجر           | المرحلة الأولى: الأدمن فقط        |

---

## 7. البيانات المحفوظة حالياً

عند query sync نحفظ هذه البيانات الخام في `order_delivery_integrations`:

| الحقل                  | المصدر          | الملاحظة             |
| ---------------------- | --------------- | -------------------- |
| `jenni_settlement_id`  | query response  | 0 = لم يُسوَّ        |
| `delivery_cost_actual` | `shipment_cost` | أجرة التوصيل الفعلية |
| `cod_collected`        | `amount_iqd`    | المبلغ المجموع فعلاً |

> هذه البيانات تُجمع فقط — لا تُستخدم في حسابات حتى الآن.
> بعد اختبار API 35 ومعرفة شكل Payment Statement نبني الـ reconciliation.
