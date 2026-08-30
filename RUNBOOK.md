# DilMart-store Store — Runbook Mobile (Capacitor)

## A) تجديد أيقونة التطبيق

عند تغيير الشعار في `assets/`:

```bash
npm run cap:icons
```

الشعار المصدري: `assets/icon-only.png` أو `assets/logo.png` (يفضّل 1024×1024 بيكسل أو أكبر).

---

## B) Build & Sync

```bash
npm ci
npm run build
npx cap sync
```

Or in one step:

```bash
npm run cap:sync
```

**تشغيل على جهاز/محاكي:**

- **Android:** `npx cap open android` → Run في Android Studio
- **iOS:** يتطلب Mac + Xcode. على Mac: `npx cap open ios` → Run في Xcode

> ملاحظة: على Windows لا يتوفر CocoaPods (مطلوب لـ iOS). لبناء iOS استخدم جهاز Mac.

---

## C) تغيير الدومين لاحقًا

- **Local mode (الحالي):** لا تغيير مطلوب — الأصول تُحمّل من `dist`
- **Remote mode:** عدّل `server.url` في `capacitor.config.ts` ثم `npx cap sync`

---

## D) Hotfix سريع

1. **تعديل الويب:** عدّل الكود → `npm run build` → `npx cap sync`
2. **تعديل Native:** عدّل في `ios/` أو `android/` مباشرة ثم Rebuild من Xcode/Android Studio

---

## Deliverables Checklist

| #   | البند                                   | الحالة |
| --- | --------------------------------------- | ------ |
| 1   | Capacitor initialized + platforms added | ✅     |
| 2   | config: `webDir=dist`                   | ✅     |
| 3   | build/sync/run success (Android)        | ✅     |
| 4   | Offline screen (Network plugin)         | ✅     |
| 5   | External link handler (Browser plugin)  | ✅     |
| 6   | Android back navigation                 | ✅     |
| 7   | Splash/loading                          | ✅     |
| 8   | Privacy + Support value-add             | ✅     |

---

## الملفات المُضافة/المُعدّلة

- `capacitor.config.ts` — إعداد Capacitor مع webDir=dist
- `src/lib/capacitor.ts` — دالة فتح روابط خارجية + كشف native
- `src/components/CapacitorAppWrapper.tsx` — Offline + روابط خارجية + زر الرجوع
- `src/components/OfflineScreen.tsx` — شاشة Offline
- `src/pages/Support.tsx` — صفحة الدعم
- `src/main.tsx` — إخفاء Splash بعد التحميل
