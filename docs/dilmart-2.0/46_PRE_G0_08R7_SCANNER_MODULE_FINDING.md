# 46 — PRE-G0-08R7 Scanner Module Finding

Status: **SP-06 BLOCKED.** Scanner acceptance is **not PASS**.
D09: **OPEN.** G0: **OPEN / BLOCKED.**

Reports 36–45 are unchanged. This report records the owner's physical scanner attempt and the follow-up on the already installed qualification APK.
PR: [#81](https://github.com/dilmart-info/Dilmart/pull/81), previous head `925b78fc43a00200b664cf43f40ae295934d7d7e`.

No new APK was built or installed. The SQLCipher store, the synchronization protocol and the earlier evidence files were not modified. No commercial scanner plugin was purchased. No production database, backend, Render service or Supabase project was touched.

---

## 1. Owner result

On the Samsung SM-M315F, the installed R6 qualification app (`com.dilmart.spike.capacitor.r6`, APK `744c22a5…6b5386`) was used for the physical scan test. Both attempts failed before a code was read.

| Attempt | Result |
|---|---|
| `bridge-scan-3c29598e-d139-4b86-9bb2-ff5993cd645c` | `accepted: false`, 135 ms |
| `bridge-scan-bdbd4701-c28e-4895-9698-ae55763755a6` | `accepted: false`, 72 ms |

Both files record the same reason:

```text
The Google Barcode Scanner Module is not available. You must install it first using the installGoogleBarcodeScannerModule method.
```

That string is the plugin constant `ERROR_GOOGLE_BARCODE_SCANNER_MODULE_NOT_AVAILABLE`. The scan button calls `BarcodeScanner.scan()` and does not check or install the module first. No barcode value was accepted. **SP-06 is BLOCKED because that module was missing. This is not scanner acceptance.**

## 2. Installed plugin

| Item | Evidence |
|---|---|
| Plugin | `@capacitor-mlkit/barcode-scanning` 8.2.2, Apache-2.0 |
| Native class in the APK | `io.capawesome.capacitorjs.plugins.mlkit.barcodescanning.BarcodeScannerPlugin` |
| Button path | `www/app.js` calls `registerPlugin("BarcodeScanner").scan()` |
| Code-scanner dependency | `com.google.android.gms:play-services-code-scanner:16.1.0` |
| Bundled-model dependency, also in the APK | `com.google.mlkit:barcode-scanning:17.3.0` |
| Model file packaged in the APK | `assets/mlkit_barcode_models/barcode_ssd_mobilenet_v1_dmp25_quant.tflite` |

The installed dex contains `scan`, `startScan`, `isGoogleBarcodeScannerModuleAvailable`, `installGoogleBarcodeScannerModule`, and the exact error string above. Capacitor dispatches those names from JavaScript to the native plugin, so the running APK can call them without a new build.

`scan()` is the Google code scanner. Google documents that API as an unbundled Play Services module that must be downloaded before use. `startScan()` is the other method in the same plugin: CameraX plus the bundled ML Kit model. The qualification button does not call `startScan()`.

## 3. Availability on the phone

The screen was off. It was woken and the existing R6 activity was brought forward. No security setting was changed.

`isGoogleBarcodeScannerModuleAvailable()` on the installed app returned:

```text
{ "available": false }
```

## 4. Install from the existing APK

The same running app called `installGoogleBarcodeScannerModule()`. No APK was rebuilt or installed. The call returned `started: true`. The plugin's progress events then reached a terminal success state:

| `state` | Plugin meaning | `progress` |
|---|---|---|
| 2 | DOWNLOADING | 0 |
| 2 | DOWNLOADING | 100 |
| 6 | INSTALLING | 100 |
| 4 | COMPLETED | 100 |

A second `isGoogleBarcodeScannerModuleAvailable()` returned `{ "available": true }`.

The module is installed in Google Play Services on this phone. It is not part of the R6 APK. Another phone, or a Play Services reset, would need the download again.

## 5. Physical retest

After the module reported available, `scan()` was called once on the installed app. The resumed activity was Google's scanner UI:

```text
com.google.android.gms/.mlkit.barcode.ui.BarcodeScanningActivityProxy
```

No QR code and no Code-128 code was placed in front of the camera. The UI was closed. The call finished with `scan canceled.` No barcode was returned, and this direct call did not go through the scan button, so it did not write a store operation or a new harness scan file.

**QR was not scanned. Code-128 was not scanned. SP-06 is not PASS.**

The camera permission on the R6 package is still `granted=false`. `startScan()` was not run.

## 6. Bundled offline scanner for a future driver app

This is an evaluation only. It was not built, not installed and not accepted as a scan result.

| Option | Already in the qualification APK | Offline | Licence / cost | Fit |
|---|---|---|---|---|
| Current `scan()` (Play Services code scanner 16.1.0) | Yes, and it is the button | No. First use downloads the scanner module. This phone now has it. | Free Google Play Services API. Not a purchased plugin. | Blocks on a missing module, as the owner saw. Unsuitable as the only production path. |
| Same plugin's `startScan()` with `com.google.mlkit:barcode-scanning:17.3.0` | Method and bundled model file are already in the APK. The button does not call it. | Yes for the model. Google documents the bundled artifact as statically linked and available immediately, about 2.4 MB. The tflite file is in this APK. | Free ML Kit Android library. Not a purchased plugin. Maven licence text was not re-fetched in this round. | Preferred production candidate. Needs the camera permission and a rebuild before it can replace the button. Not executed here. |
| ZXing Android Embedded 4.3.0 (`com.google.zxing:core` 3.4.1) | No | Yes. No Play Services download. | Apache-2.0. No purchase. | Fallback if the driver app must not depend on Google Play Services. Needs a new dependency and a rebuild. Not executed. |
| Commercial scanner SDKs | No | Varies | Paid | Not considered. None was purchased. |

`startScan()` supports QR Code and Code-128 in the ML Kit format list. That compatibility is from the library documentation and the plugin already compiled into this APK. It is not a physical decode result. A production switch still needs an approved rebuild, a camera-permission flow, and the owner scan steps in report 45 section 12.1.

Google documents the code scanner as requiring API 23 or higher. This app's minSdk is 24, so that requirement is met. Only this Android 12 phone was checked.

## 7. What remains blocked

- **SP-06** stays **BLOCKED**. The owner's attempts failed because the Google module was missing. The module is now present on this phone, and the scanner UI opens, but no QR or Code-128 was read.
- The owner can repeat report 45 section 12.1 on the same installed app: QR `SPIKE-R7-SCAN-001`, the same code again, then Code-128 `SPIKE-R7-SCAN-002`, then an invalid code. Those results are not recorded here.
- D09 remains **OPEN**. G0 remains **OPEN / BLOCKED**. No PR merge.

## 8. Device state after this check

- The R6 app was force-stopped. No other DilMart app was changed. The phone was not rebooted.
- Camera permission remains denied. The Play Services barcode-scanner module remains installed on this phone.
- Reports 36–45 and the earlier R7 result files were not edited.
