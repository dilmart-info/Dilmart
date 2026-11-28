# UI state matrix
| State | Driver-facing Arabic | Behavior |
|---|---|---|
| Loading | جارٍ التحقق | disable conflicting action; skeleton, no fake values |
| Empty | لا توجد مهام حالياً | only after authoritative scoped response |
| Cached/stale | آخر تحديث… | time/version visible; no live claim; expired sensitive data hidden |
| Captured/pending | محفوظ على الجهاز — بانتظار المزامنة | only after durable commit; no authoritative confirmation |
| Sending | جارٍ الإرسال | same operation ID; prevent multiple business actions |
| Uncertain | جارٍ التحقق من نتيجة العملية | status lookup; no repeat physical action |
| Acknowledged/confirmed | تم التأكيد من الخادم | typed authoritative receipt/version only |
| Retryable | تعذر الاتصال — ستتم إعادة المحاولة | bounded backoff/jitter; 429/503; retain evidence |
| Conflict | تعارض يتطلب معالجة | 409; show safe reason; never overwrite physical evidence |
| Unauthorized/revoked | الوصول موقوف | 401/403 or concealed 404; stop protected sync and tracking; restricted evidence recovery |
| Storage/key/corruption | تعذر الحفظ بأمان | fail closed; stop new critical actions; no empty replacement |
| Location denied | صلاحية الموقع مطلوبة | no shift start, no crash (F1); settings/recheck |
| GPS stale | الموقع غير حديث | block new automatic assignment; preserve custody |
| Camera denied/unavailable | المسح غير متاح | permission, safe retry, authorized manual lookup only |
| Invalid/duplicate scan | رمز غير مطابق / مكرر | no extra custody effect; exact reason |
| OTP invalid/expired | تعذر التحقق من الرمز | bounded retry/server policy; no bypass |
| Cash discrepancy | يوجد فرق في المبلغ | truthful actual evidence; hold settlement/duplicate collection |
| Counterpart pending | بانتظار تأكيد الطرف الآخر | no normal custody/remittance completion |
| Push hint | يوجد تحديث | fetch authoritative API; not assignment |
| Shift close blocked | توجد مهام أو عهدة تحتاج معالجة | controlled exception; no silent clear |
Show confirmed cash and pending evidence independently; missing value is unknown. Offline cached reads only within scope/expiry. Only critical evidence uses durable queue; telemetry may have bounded loss according to approved policy. On account switch purge ordinary PII cache, preserve restricted evidence. All states require keyboard/accessibility, RTL, no color-only signal. Exact error codes and transitions await PRE-G0-10.
