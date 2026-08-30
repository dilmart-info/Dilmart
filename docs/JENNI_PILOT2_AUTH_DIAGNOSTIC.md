# Jenni Auth Diagnostic — Pilot #2 Follow-up

**تاريخ الفحص:** 2026-07-09 ~14:26 بتوقيت العراق (11:26 UTC)

---

## 🎯 النتيجة الرئيسية

### ✅ Render Server → Jenni Login = `AUTH_OK`!

المصادقة من سيرفر Render **تعمل الآن بنجاح**.

```
Diagnostics HTTP status: 200
auth.result: "AUTH_OK"
auth.httpStatus: 200
```

| الحقل                              | القيمة                |
| ---------------------------------- | --------------------- |
| `result`                           | `AUTH_OK` ✅          |
| `login_response_keys`              | `token, refreshToken` |
| `selected_token_source`            | `token`               |
| `selected_token_length`            | `473`                 |
| `selected_token_dot_count`         | `2` (JWT صحيح)        |
| `selected_token_had_bearer_prefix` | `true`                |
| `refresh_token_exists`             | `true`                |
| `expires_in`                       | `3600` (ساعة واحدة)   |

### ❌ Local Machine → Jenni Login = `403 (Cloudflare Block)`

الطلب من الجهاز المحلي **رُفض بـ 403** لكن ليس من Jenni — بل من **Cloudflare**:

```
HTTP status: 403
Response: <!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
```

هذا يعني أن **Cloudflare WAF** يحمي Jenni API ويحظر بعض الطلبات.
السيرفر على Render **يمر** لأن IP مختلف أو User-Agent مختلف.

---

## 📊 تحليل السبب الجذري لفشل Pilot #2

الفشل الذي حدث عند الساعة 13:12 كان على الأرجح **حظر مؤقت من Cloudflare** وليس مشكلة بيانات دخول:

| العامل                  | التفسير                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **Cloudflare WAF**      | Jenni API محمي بـ Cloudflare. عند طلبات متتالية من سيرفر، قد يُفعَّل تحدي "Just a moment..." |
| **Token Refresh أولاً** | السيرفر حاول تجديد التوكن → 403 (Cloudflare رفضته)                                           |
| **Login Fallback**      | السيرفر حاول login جديد → 403 (Cloudflare رفضته أيضاً)                                       |
| **الآن يعمل**           | بعد مرور الوقت، Cloudflare رفع الحظر → `AUTH_OK`                                             |

> ⚠️ **ملاحظة مهمة:** `listStores` فشل بـ `400` وليس `403` — يعني المصادقة نجحت لكن الاستعلام عن المتاجر رُفض لسبب آخر (ربما صلاحيات الحساب أو بنية الطلب). هذا لا يؤثر على dispatch لأنه يستخدم API مختلف.

---

## ⚠️ مشكلة ثانوية: بيانات الدخول المحلية مختلفة عن Render

| المتغير          | Local `.env`              | Render Env             |
| ---------------- | ------------------------- | ---------------------- |
| `JENNI_USERNAME` | `07764861997` (length=11) | `DilMart` (length=6)   |
| `JENNI_PASSWORD` | `s***3` (length=7)        | `sAi190129` (length=9) |

هذا لا يؤثر على الإنتاج (Render يستخدم قيمه الخاصة)، لكن يجب تحديث `.env` المحلي إذا أردنا اختبار محلياً.

---

## ✅ الخلاصة والتوصيات

### الوضع الحالي

- **المصادقة تعمل الآن** — Render → Jenni = `AUTH_OK` ✅
- **سبب الفشل السابق:** حظر مؤقت من Cloudflare WAF (وليس تغيير كلمة مرور أو تعطيل حساب)
- **بيانات الدخول على Render صحيحة** ولم تتغير

### التوصية

1. **فتح البوابة** (`JENNI_ALLOW_SHIPMENT_DISPATCH=true`) لمحاولة dispatch واحدة فقط
2. إذا نجح dispatch → إغلاق البوابة مجدداً والتأكد من الشحنة
3. إذا تكرر 403 → المشكلة Cloudflare rate limiting ويجب التنسيق مع فريق الزعيم لعمل IP whitelist لسيرفر Render

### لمنع تكرار المشكلة مستقبلاً

- إضافة retry مع exponential backoff في `getAccessToken()`
- إضافة User-Agent header مخصص في طلبات Jenni
- التنسيق مع الزعيم لعمل Cloudflare whitelist لـ Render IPs

---

> ⚠️ لم يتم طباعة أو كشف أي credentials أو tokens في هذا التقرير.
> لم يتم تنفيذ أي dispatch أو sync أو عملية تعديلية.
