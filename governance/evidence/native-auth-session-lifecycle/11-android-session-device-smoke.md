# Android session / offline / logout device smoke (micro-patch)

Head: `14f272552f70cacad2f7126f2d0303a4226d251f`

## Same-key Phase 3 APK

| Check | Result |
|---|---|
| Force-stop / relaunch authenticated | PASS |
| Offline cold-start route | `#/profile` |
| Offline auth screen | false |
| Offline secure session present | true |
| Offline overlay | true |
| Online context recovery | PASS |
| Logout secure key absent | PASS |
| Logout relaunch logged out | PASS |
| Fresh reinstall unauthenticated | PASS |

Evidence: `31-micropatch-device-matrix.json`, `33-logout-final.json`

## Final CI APK (`android-debug-apk-30280209630`)

```text
FINAL_CI_APK_SHA256=B968AD5F159C771B40AA17A0188A6A9D7B6ABFCD47564E51B2407F207EEA2BFB
INSTALLED_APK_SHA256=B968AD5F159C771B40AA17A0188A6A9D7B6ABFCD47564E51B2407F207EEA2BFB
FORCE_STOP_RELAUNCH=PASS
OFFLINE_COLDSTART_ROUTE=#/profile
OFFLINE_AUTH_SCREEN=false
OFFLINE_SECURE_SESSION_PRESENT=true
ONLINE_CONTEXT_RECOVERY=PASS
```

Evidence: `34-final-ci-apk-device.json`
