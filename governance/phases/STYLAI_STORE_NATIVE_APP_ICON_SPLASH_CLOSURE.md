# Native App Icon & Splash Branding — Closure Report

Micro-phase. Scope is native brand resources only: the Android/iOS launcher icon and the native
splash screen. No business logic, no backend, no auth, no identifiers, no signing.

---

## 1. Identity

| Field | Value |
|---|---|
| Phase | Native App Icon & Splash Branding (micro-phase) |
| Branch | `chore/native-brand-assets` |
| Base SHA | `a95df07b0fcdaa3921e659f1732d156f43f18aa4` (`origin/main`, squash of PR #64) |
| Final SHA | single commit on this branch — `git rev-parse chore/native-brand-assets` |
| Commit | `chore(mobile): update native app icon and splash branding` |
| Evidence | `governance/evidence/native-app-icon-splash/` |

Base was taken from a freshly synced `main`, not from the previous phase branch. Phase 3
(`feat/native-auth-session-lifecycle`) is untouched and its documents are preserved.

---

## 2. Goal

1. The launcher icon must come exclusively from `assets/icon-only.png`.
2. The native splash screen must show the full lockup from `assets/logo.png`.
3. Both platforms, all densities, generated — not a single hand-swapped PNG.
4. No redesign, no recolour, no re-typesetting, no crop, no stretch of either source.

---

## 3. What was wrong before

- Every native icon and splash resource still carried the **previous "SAB" brand** and had never
  been regenerated since the initial import (`dd30680`).
- The iOS app icon and the iOS splash were the **stock Capacitor placeholders** (blue X on white).
- `assets/icon-foreground.png` was a byte-identical copy of `assets/icon-only.png`, so the adaptive
  foreground was full-bleed. Combined with the 16.7% inset that `@capacitor/assets` writes into
  `mipmap-anydpi-v26/ic_launcher.xml`, a circular launcher mask cut the gold frame corners.
- `assets/icon-background.png`, `assets/splash.png` and `assets/splash-dark.png` did not exist, so
  the adaptive background fell back to `--iconBackgroundColor '#ffffff'` — white, against a black
  icon — and the `drawable-night/**` splash set kept the old brand.
- `values/styles.xml` set only `android:background` on `AppTheme.NoActionBarLaunch`. Capacitor 8
  calls `installSplashScreen()` on every API level, and that attribute is not one the
  core-splashscreen path reads, so the launch window fell back to the system default light
  background — a white flash on cold start.
- `LaunchScreen.storyboard` used `scaleAspectFill` on a square image, which crops a portrait
  screen down to the central ~46% of the canvas.
- `cap:icons` generated **Android only**, and quoted its colours with single quotes, which
  PowerShell and cmd do not strip.
- Two stale Android Studio template drawables (teal `ic_launcher_background.xml`, the green robot
  `ic_launcher_foreground.xml`) plus a stale white `ic_launcher_background` colour were still
  packaged into the APK.

---

## 4. Source images (unmodified)

| File | Size | Mode | SHA-256 |
|---|---|---|---|
| `assets/icon-only.png` | 1500x1502 | RGBA | `01f05b2c2f53a9d13090112e7aeb59beb4effcfc596f92fd78fffb2363029c3a` |
| `assets/logo.png` | 2101x709 | RGBA | `1b92b8a79583bce4556d85b5790c1a95eeddc69992d7af653e716d02cb554812` |

Both are byte-identical to their state on `main`. Neither was edited, renamed or deleted.

`assets/icon-only.png` is **1500x1502, i.e. 2px off square**, and its opaque artwork is
`1366x1328` at offset `61,82`. It is comfortably above the 1024x1024 floor, so generation
proceeded; the non-squareness is absorbed by the square derived files rather than by editing the
source or by upscaling anything.

Brand background `#0F0D0B` was **measured**, not chosen: it is the mean colour of every fully
opaque pixel inside `icon-only.png` with luminance below 40. `scripts/mobile/build-brand-source-assets.mjs`
recomputes it on every run and aborts if it drifts.

---

## 5. Derived sources

Written by `npm run brand:assets` (`scripts/mobile/build-brand-source-assets.mjs`). Re-running the
script reproduces byte-identical files.

| File | Size | Content | SHA-256 |
|---|---|---|---|
| `assets/icon-foreground.png` | 1024x1024 | icon artwork scaled to 804x782, centred | `401017fb76514a2a19dc0557d0b29d0a3e8265fcb364c1392a9f38941ca09202` |
| `assets/icon-background.png` | 1024x1024 | flat `#0F0D0B` | `698a738cb642dcc25df56cf78a35e2866f145b8a957f01eac63db8632c2e262c` |
| `assets/android/icon.png` | 1024x1024 | icon artwork at 933px, transparent margin | `f580ba0643e17cd960662432c050066faadf3e3cd37bc2e1caee55f496fd43f1` |
| `assets/ios/icon.png` | 1024x1024 | same as above; flattened to `#0F0D0B` by the generator | `f580ba0643e17cd960662432c050066faadf3e3cd37bc2e1caee55f496fd43f1` |
| `assets/splash.png` | 2732x2732 | full lockup at 1366x441 on `#0F0D0B` | `8c3d8297122abb4ecb2a687469ef907818bae1836ba4a4b20d62f620484646d4` |
| `assets/splash-dark.png` | 2732x2732 | identical | `8c3d8297122abb4ecb2a687469ef907818bae1836ba4a4b20d62f620484646d4` |
| `assets/android/splash.png` | 2732x2732 | full lockup at 820x265 on `#0F0D0B` | `fd014663ca87a1bd017f0a937dce741fc51b0442615f03194e2b96855574bcc7` |
| `assets/android/splash-dark.png` | 2732x2732 | identical | `fd014663ca87a1bd017f0a937dce741fc51b0442615f03194e2b96855574bcc7` |

### Why the adaptive foreground is scaled to 78.5%

`@capacitor/assets` writes a 16.7% inset on both adaptive layers, so the foreground drawable lands
on the central 66.6% of the 108dp canvas — exactly the 72dp visible viewport. A circular launcher
mask is a 72dp circle inscribed in that viewport and clips anything whose radius from centre
exceeds half the foreground width. The artwork's maximum opaque radius is 1.097x its own
half-width, so a full-bleed foreground loses the gold frame corners. Scaling the artwork so its
maximum radius lands at 95% of the inscribed circle keeps the entire gold frame and the shopping
bag visible under square, rounded-square and circular masks, while still filling ~78.5% of the
viewport — it does not read as a small icon inside a large black tile, because the surrounding
background is the same black the artwork already uses.

### Why Android gets its own splash source

iOS renders the square splash through `LaunchScreen.storyboard`. With `scaleAspectFit` the whole
canvas is always visible, so a 50%-of-canvas logo is 50% of the screen width — inside the
requested 45–55% band.

Android is different. `@capacitor/assets` cover-crops the square canvas into every drawable
template (the narrowest is 720x1280, keeping only the central 66.7% of the width) and the plugin
then applies a further centre-crop to reach the real screen aspect. On a 20:9 phone that compounds
to roughly the central 45% of the canvas, so a 50% logo would be cropped. `assets/android/splash.png`
is sized for that double crop at 30% of the canvas and still lands near 65% of the device width.
Both variants keep the lockup centred, contained, unstretched and uncropped.

---

## 6. Files changed

81 files.

### Configuration and tooling (9)
```
package.json                                     cap:assets / cap:assets:android / cap:assets:ios /
                                                 brand:assets / native:assets:check; cap:icons kept
                                                 as an alias; npx dropped in favour of the locked
                                                 local binary; explicit --assetPath assets
capacitor.config.ts                              plugins.SplashScreen block
android/app/src/main/res/values/styles.xml       core-splashscreen theme attributes
android/app/src/main/res/values/colors.xml       NEW - brandSplashBackground #0F0D0B
ios/App/App/Base.lproj/LaunchScreen.storyboard   scaleAspectFill -> scaleAspectFit, brand backdrop
ios/.../AppIcon.appiconset/Contents.json         rewritten by the generator
ios/.../Splash.imageset/Contents.json            rewritten by the generator, dark appearance added
scripts/mobile/build-brand-source-assets.mjs     NEW
scripts/mobile/check-native-brand-assets.mjs     NEW
.github/workflows/native-foundation.yml          native brand asset guard step, both jobs
```

### Brand sources (8 added / 1 replaced)
`assets/icon-foreground.png` replaced; `assets/icon-background.png`, `assets/splash.png`,
`assets/splash-dark.png`, `assets/android/icon.png`, `assets/android/splash.png`,
`assets/android/splash-dark.png`, `assets/ios/icon.png` added.

### Android generated resources (50 regenerated)
- 24 launcher PNGs: `mipmap-{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/{ic_launcher,ic_launcher_round,ic_launcher_foreground,ic_launcher_background}.png`
- 26 splash PNGs: `drawable/`, `drawable-night/`, `drawable-{port,land}[-night]-{ldpi..xxxhdpi}/splash.png`
- `mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` were rewritten identically

### iOS generated resources (7)
`AppIcon.appiconset/AppIcon-512@2x.png` replaced; six `Default@{1,2,3}x~universal~anyany[-dark].png`
added.

### Removed (6)
```
android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml   stale AS template (green robot)
android/app/src/main/res/drawable/ic_launcher_background.xml       stale AS template (#26A69A)
android/app/src/main/res/values/ic_launcher_background.xml         stale white colour
ios/.../Splash.imageset/splash-2732x2732.png                       orphaned by the new Contents.json
ios/.../Splash.imageset/splash-2732x2732-1.png                     orphaned
ios/.../Splash.imageset/splash-2732x2732-2.png                     orphaned
```
The three Android files were verified unreferenced before deletion — `mipmap-anydpi-v26/*.xml`
points at `@mipmap/...`, never at `@drawable/...`. The APK was rebuilt afterwards and still builds.

### Deliberately not changed
`AndroidManifest.xml` (the generator re-asserted the same `android:icon` / `android:roundIcon`
values, producing no diff), `applicationId`, `appId`, `appName`, package name, permissions,
`launchMode`, iOS bundle identifier, signing, provisioning, `src/main.mobile.tsx`, and every web,
backend, Supabase and business file.

---

## 7. Commands run

| Command | Result |
|---|---|
| `git fetch origin`, `git checkout main`, `git pull --ff-only origin main` | ok — `main` advanced `7bd1bbf` → `a95df07` |
| `git checkout -b chore/native-brand-assets` | ok |
| `npm run brand:assets` | ok, deterministic on re-run |
| `npm run cap:assets` | ok — android: 186 generated, ios: 15 generated |
| `npm run build:mobile` | ok |
| `npm run mobile:boundary` | PASS — forbidden modules: none |
| `npx cap sync android` | ok — 6 plugins |
| `npx cap sync ios` | ok — pod install and xcodebuild skipped (Windows host) |
| `npm run native:assets:check` | PASS |
| `npm test` | PASS — 14 files, 86 tests |
| `npm run lint` | 464 problems (452 errors, 12 warnings) — identical to base, 0 new, 0 in `scripts/mobile/` |
| `android/gradlew.bat assembleDebug --no-daemon` | BUILD SUCCESSFUL, twice |
| `adb install -r app-debug.apk` | Success |
| `git diff --check` | clean |

`npm ci` was not run: `node_modules` was already installed at the locked versions
(`@capacitor/*` 8.4.2, `@capacitor/assets` 3.0.5, `@capacitor/splash-screen` 8.0.2, `sharp` 0.32.6)
and `package-lock.json` was not modified by this phase.

---

## 8. Android smoke test

Emulator `Pixel_10_Pro_XL`, **Android 17 / API 37** — the Android 12+ splash API path.
APK: `android/app/build/outputs/apk/debug/app-debug.apk` (12.79 MB).

All 15 checks in the task brief were executed; full transcript in
`governance/evidence/native-app-icon-splash/09-android-smoke-test.txt`.

- Launcher icon renders circle-masked with the **gold frame and shopping bag fully intact**.
- Cold launch shows the splash at `rgb(18,16,13)` with **white% = 0.0** across every captured
  frame, in both dark and light system mode. No white flash before, during or after.
- Transition into the customer shell is direct: splash → shell, no blank frame.
- Two independent cold launches after `am force-stop` behave identically.

Screenshots: `governance/evidence/native-app-icon-splash/screenshots/`.

---

## 9. Android 12+ constraint — read this

Capacitor 8 calls `androidx.core.splashscreen.SplashScreen.installSplashScreen()` on **every** API
level and falls back to the legacy ImageView splash only if that call throws. On API 31+ the
platform draws the launch screen itself from the theme: `windowSplashScreenBackground` plus a
centre-placed `windowSplashScreenAnimatedIcon` that the system **clips to a circle**.

A 3:1 wordmark cannot survive that circle. There is no supported way to place the full lockup at
the centre of the Android 12+ system splash. What this phase delivers instead is the correct
branded form of that platform splash: the brand background with the brand app icon.

The full lockup from `assets/logo.png` is still what ships in:
- every `drawable*/splash.png` — the legacy fallback path and pre-A12 behaviour,
- the iOS `Splash.imageset`, where `LaunchScreen.storyboard` renders it in full.

If the full lockup must appear on Android 12+, the remaining options are
`android:windowSplashScreenBrandingImage` (API 31+, bottom-anchored, explicitly discouraged by
Google) or an in-app logo screen rendered by React after the splash hides. Both are product
decisions outside this micro-phase and were not implemented.

---

## 10. Splash timing

`capacitor.config.ts` now sets `launchShowDuration: 3000` with `launchAutoHide: true`.

The plugin default is 500ms. The measured cold-start-to-first-paint on the emulator was well past
that, so the default auto-hide fired before the bundle painted — the white flash. The new value is
a **fail-safe ceiling only**: `src/main.mobile.tsx` still hides the splash as soon as the customer
shell has rendered, and that path was left untouched because the smoke test shows it firing well
before the ceiling. If the JS bundle ever failed to boot, the splash now clears after 3s instead of
hanging.

`backgroundColor` and `showSpinner` are set for the programmatic and fallback paths. Both are
documented options present in the installed `@capacitor/splash-screen@8.0.2` type definitions.
`androidScaleType`, `backgroundColor` and `showSpinner` are documented as inert on the Android 12
launch path; the theme attributes cover that path instead.

---

## 11. Regression guard

`scripts/mobile/check-native-brand-assets.mjs`, wired as `npm run native:assets:check` and added to
both jobs of `native-foundation.yml`. It reads PNG IHDR headers directly — no image library, no new
dependency, no external binary, sub-second runtime.

It fails if: a brand source is missing or undersized; a derived source is missing or not square;
any of the 24 Android launcher resources, the 2 adaptive XMLs or the 26 splash drawables are gone;
the iOS AppIcon is missing, undersized or **carries an alpha channel**; any of the 6 iOS splash
images are missing; `styles.xml` stops setting `windowSplashScreenBackground` or
`windowSplashScreenAnimatedIcon`; or `LaunchScreen.storyboard` reverts to `scaleAspectFill`.

---

## 12. Known limitations

1. **Android 12+ splash shows the icon, not the lockup.** Platform constraint, section 9.
2. **iOS was not built.** Windows host, no Xcode and no CocoaPods. `npx cap sync ios` succeeded and
   the asset catalogs and storyboard were verified as files, but Simulator/Release/Archive builds
   must be confirmed on macOS or by the `ios-foundation` CI job.
3. **`ic_launcher_round.png` clips the gold frame corners on API 24–25.** The generator builds that
   PNG by circle-masking the full-bleed icon and takes no separate input for it. On API 26+ the
   adaptive `mipmap-anydpi-v26/ic_launcher_round.xml` takes precedence, so this affects only
   Android 7.0–7.1 launchers that request a round icon.
4. **No physical Android device.** Emulator only.
5. **The adaptive foreground is sized to the circular mask, not to Google's 66dp safe zone.**
   Honouring the 66dp guarantee would shrink the artwork to roughly half the viewport. Exotic OEM
   masks smaller than a circle could still clip the outer gold frame.
6. **Low contrast on "Styl".** The lockup's "Styl" glyphs are near-black with gold rims, so on the
   brand-black splash they read mainly by their gold edge. This is the artwork's own palette; it
   was not altered. Flagged for a human design call.
7. **`npm run lint` still fails**, exactly as it does on `main` (452 pre-existing errors in
   `src/**`). No unrelated file was touched.
8. **Asset weight.** The brand sources and the generated iOS splashes are large PNGs
   (`assets/` grew by ~5.5 MB, the iOS catalog by ~5 MB). They do not enter the web bundle, but the
   IPA will carry them.

---

## 13. Risks

| Risk | Status |
|---|---|
| Adaptive icon cropping | Mitigated — measured radial fit, verified under three masks on device |
| Android 12 splash | Mitigated within platform limits — theme attributes verified on API 37 |
| Alpha in the iOS icon | Mitigated — output is RGB with no alpha channel; the guard enforces it |
| White flash | Mitigated — measured white% = 0.0 across cold launches, light and dark |
| Full lockup used as the app icon | Prevented — the icon derives only from `icon-only.png`; `assets/logo.png` is loaded by the generator first but every icon output it writes is overwritten by the explicit icon inputs that follow |
| Regeneration touching unintended files | Contained — `AndroidManifest.xml` produced no diff; the 81 changed files were enumerated and reviewed; the three deleted Android resources were verified unreferenced and the APK was rebuilt after deletion |
| iOS runtime unverified | Open — needs macOS or CI |

---

## 14. Worktree note

`.claude/settings.local.json` carried a local modification before this phase began. It was left
unstaged and is not part of the commit. The 85 untracked `.tmp-*` scratch files from the previous
phase and the two pre-existing stashes were left untouched. No `git reset`, `git clean`, stash or
force push was run.
