# Jenni Authentication Failure — Pilot #2

**تاريخ الحادثة:** 2026-07-09 ~13:12 بتوقيت العراق (10:12 UTC)

---

## بيانات الطلب

| الحقل                      | القيمة                                  |
| -------------------------- | --------------------------------------- |
| `order_number`             | `DUK-260709-1769`                       |
| `order_id`                 | `e3998985-aa2c-4657-bbf2-86cd04463f61`  |
| `dispatch_status`          | `failed`                                |
| `provider_shipment_id`     | `null` ← **لم يُنشأ أي شحنة لدى Jenni** |
| `external_shipment_number` | `DUK-260709-1769`                       |
| `airway_bill_number`       | `null`                                  |
| `provider_current_step`    | `null`                                  |
| `dispatched_at`            | `null`                                  |
| `last_synced_at`           | `null`                                  |
| `jenni_store_id`           | `null`                                  |
| `dispatch_error`           | `Jenni authentication failed.`          |

---

## حالة الطلب الداخلية

| الحقل             | القيمة                |
| ----------------- | --------------------- |
| `delivery_status` | `assigned_to_company` |
| `order status`    | `preparing`           |

الطلب بقي في حالة `assigned_to_company` ولم ينتقل إلى أي حالة شحن لأن الإرسال فشل قبل الوصول إلى Jenni.

---

## أحداث التوصيل المسجلة

| الحدث                 | من                   | إلى                   | المنفذ  | الوقت                     |
| --------------------- | -------------------- | --------------------- | ------- | ------------------------- |
| `assigned_to_company` | `pending_assignment` | `assigned_to_company` | `admin` | `2026-07-09T10:12:46 UTC` |

> **لا يوجد حدث `provider_dispatched`** — مما يؤكد أن الشحنة لم تُرسل فعلياً إلى Jenni.

---

## ملخص سجلات Render

```
01:12:31 PM  WARN  [JenniAuthService] Jenni token refresh success=false status=403
01:12:31 PM  ERROR [JenniAuthService] Jenni login success=false status=403
01:12:31 PM  POST /api/admin/orders/.../delivery/dispatch-jenni status=503 duration=1794ms

01:13:02 PM  WARN  [JenniAuthService] Jenni token refresh success=false status=403
01:13:02 PM  ERROR [JenniAuthService] Jenni login success=false status=403
01:13:02 PM  POST /api/admin/orders/.../delivery/dispatch-jenni status=503 duration=1759ms

01:14:54 PM  WARN  [JenniAuthService] Jenni token refresh success=false status=403
01:14:55 PM  ERROR [JenniAuthService] Jenni login success=false status=403
01:14:55 PM  POST /api/admin/orders/.../delivery/dispatch-jenni status=503 duration=1759ms
```

### التسلسل التقني:

1. Backend حاول تجديد التوكن المحفوظ مسبقاً → Jenni ردّت `403 Forbidden`
2. Backend حاول تسجيل دخول جديد بالـ username/password → Jenni ردّت `403 Forbidden`
3. الكود رمى `ServiceUnavailableException("Jenni authentication failed.")` (سطر 79 في [jenni-auth.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-auth.service.ts#L79))
4. الـ dispatch أُوقف قبل إرسال أي طلب إنشاء شحنة → HTTP 503 أُرجع للواجهة

---

## التحقق من عدم إرسال الشحنة

| الفحص                                             | النتيجة                                |
| ------------------------------------------------- | -------------------------------------- |
| `provider_shipment_id = null`                     | ✅ لا يوجد shipment_id — لم تُنشأ شحنة |
| `dispatched_at = null`                            | ✅ لم يُسجل وقت إرسال                  |
| `dispatch_status = failed`                        | ✅ الحالة مسجلة كفشل                   |
| `dispatch_error = "Jenni authentication failed."` | ✅ السبب: فشل المصادقة فقط             |
| لا يوجد حدث `provider_dispatched`                 | ✅ لم يصل الكود لمرحلة الإرسال         |
| `last_synced_at = null`                           | ✅ لم تتم أي مزامنة                    |

---

## حالة بوابات الحماية

| البوابة                         | القيمة                        |
| ------------------------------- | ----------------------------- |
| `JENNI_ALLOW_SHIPMENT_DISPATCH` | `false` ← أُغلقت بعد الفشل ✅ |
| Gate closed after failure       | **yes**                       |

---

## الخلاصة (Conclusion)

- ❌ **المصادقة رُفضت من طرف Jenni بردّ HTTP 403** على كل من refresh و login.
- ✅ **لم تُنشأ أي شحنة لدى Jenni** — الفشل حدث في مرحلة المصادقة قبل الوصول لـ API إنشاء الشحنة.
- ✅ **البوابة أُغلقت** (`JENNI_ALLOW_SHIPMENT_DISPATCH=false`) لمنع أي محاولة إضافية.
- ⏳ **بانتظار تأكيد من فريق Jenni / الزعيم** حول:
  - هل تم تغيير كلمة المرور أو تعطيل الحساب؟
  - هل تم تغيير اسم المستخدم (`DilMart`) أو الصلاحيات؟
  - هل هناك IP whitelist أو حظر مؤقت على الحساب؟

---

> ⚠️ **ملاحظة:** لم يتم طباعة أو كشف أي credentials أو tokens في هذا التقرير.
> لم يتم تنفيذ أي عملية تعديلية (dispatch/sync/env change).
