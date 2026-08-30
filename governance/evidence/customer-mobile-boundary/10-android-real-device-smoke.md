# Android real-device smoke — Customer Mobile Boundary

**Device:** samsung SM-M315F · Android 12 (API 31) · 1080x2340  
**CI APK artifact:** `android-debug-apk-30213607718`  
**CI / Installed APK SHA-256:** `2CE7D4326DB821525578ADB6B394A952BE4C062A9F7A7EBF8D9D32C2B65AA045`  
**Install:** `adb uninstall com.DilMart.store` + `adb install` CI APK  
**Code head for APK:** `9a85181b759cfaa285455124cc3b465edc2d6663` (Footer/IconNav merchant entry gated + boundary tests)  
**CORS preflight:** PASS (`HTTP 200` marketplace home; prior `https://localhost` origin allowlist)  
**NATIVE_MERCHANT_ENTRY_COUNT:** `0`  
**TEST_ACCOUNT_CLEANUP:** `PASS`

## Matrix

| #   | Item                      | Result | Notes                                                           |
| --- | ------------------------- | ------ | --------------------------------------------------------------- |
| 1   | Fresh install             | PASS   | CI APK Streamed install Success                                 |
| 2   | First cold launch         | PASS   | MainActivity + Capacitor                                        |
| 3   | Splash → Home             | PASS   | Home marketplace UI with banners/data                           |
| 4   | Arabic RTL rendering      | PASS   | `lang=ar` `dir=rtl`                                             |
| 5   | Home data loading         | PASS   | CDP CORS probe 200; categories=9 merchants=1 products=8         |
| 6   | Stores listing            | PASS   | `#/stores` active merchant listing; no merchant CTAs            |
| 7   | Products listing          | PASS   | `#/products` categories + product grid                          |
| 8   | Product detail            | PASS   | Opened product detail with price/stock                          |
| 9   | Add to cart               | PASS   | Exact `أضف إلى السلة` click                                     |
| 10  | Change cart quantity      | PASS   | lucide-plus qty control                                         |
| 11  | Kill and reopen           | PASS   | force-stop + relaunch                                           |
| 12  | Cart persistence          | PASS   | Cart retained after kill/reopen                                 |
| 13  | Customer login            | PASS   | Ephemeral smoke session → profile authenticated                 |
| 14  | Customer logout           | PASS   | Settings → `تسجيل الخروج من الحساب`; keys cleared               |
| 15  | Profile                   | PASS   | `#/profile` loyalty + account tabs                              |
| 16  | Addresses                 | PASS   | `#/my-account/addresses`                                        |
| 17  | Orders                    | PASS   | `#/my-account/orders`                                           |
| 18  | Checkout screen           | PASS   | Checkout form (no real order)                                   |
| 19  | Order tracking            | PASS   | Track-order form                                                |
| 20  | Wishlist                  | PASS   | Empty wishlist; no merchant CTAs                                |
| 21  | Offline screen            | PASS   | Wifi/data disable while running → `لا يوجد اتصال بالإنترنت`     |
| 22  | Network restoration       | PASS   | Radios re-enabled; overlay cleared                              |
| 23  | Android hardware Back     | PASS   | Nested back + root back; no `d is not a function`               |
| 24  | External link             | PASS   | Support/social `https` + external targets                       |
| 25  | Foreground/background     | PASS   | HOME then resume MainActivity                                   |
| 26  | No access to `#/admin`    | PASS   | `#/admin/login` → NotFound                                      |
| 27  | No access to `#/merchant` | PASS   | `#/merchant/login` → NotFound                                   |
| 28  | No access to `#/agent`    | PASS   | `#/agent/orders` → NotFound                                     |
| 29  | No blank screen           | PASS   | Root mounted; marketplace UI visible                            |
| 30  | No fatal WebView error    | PASS   | Final logcat: 0 FATAL / uncaught / CORS / `d is not a function` |

## Counts

```text
ANDROID_SMOKE_PASS=30
ANDROID_SMOKE_FAIL=0
ANDROID_SMOKE_BLOCKED=0
ANDROID_SMOKE_NOT_RUN=0
NATIVE_MERCHANT_ENTRY_COUNT=0
TEST_ACCOUNT_CLEANUP=PASS
```

## Classification

```text
CODE + ANDROID CI-ARTIFACT DEVICE VALIDATION COMPLETE
SUPERVISOR REVIEW PENDING
```
