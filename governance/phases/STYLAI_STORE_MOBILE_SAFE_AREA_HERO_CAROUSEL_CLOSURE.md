# Mobile Safe Area & RTL Hero Carousel — Micro-Patch Closure Report

Two defects reproduced from a real APK and fixed. Nothing else was touched: no icon or
splash asset, no auth, no backend, no identifiers, no signing, no hero copy, imagery or
colours, no desktop layout.

---

## 1. Identity

| Field | Value |
|---|---|
| Phase | Mobile Safe Area & RTL Hero Carousel Micro-Patch |
| Branch | `fix/mobile-safe-area-hero-carousel` |
| Base SHA | `28802994b8b3784defb25eb962688c879d92cc0f` (local `chore/native-brand-assets` HEAD, **not pushed**) |
| Final SHA | single commit on this branch — `git rev-parse fix/mobile-safe-area-hero-carousel` |
| Commit | `fix(mobile): respect safe areas and repair rtl hero carousel` |
| Evidence | `governance/evidence/mobile-safe-area-hero-carousel/` |

The branch was cut from the local HEAD so the unpushed icon and splash work stays in
history. No `checkout main`, `pull`, `reset`, `clean`, `stash` or `rebase` was run.

---

## 2. Defect 1 — search bar behind the status bar

### Cause

`Header` is `sticky top-0` and the WebView runs edge-to-edge, so the header's top edge
sits at physical `y=0`, under the status bar and the display cutout.
`MobileTopPromoBlock` reserved nothing for that region, so its first row and the
`SearchBar` were painted underneath the clock, Wi-Fi, battery and cutout.

`src/index.css` already carried a `.safe-top` helper, but it is hardcoded to
`max(env(safe-area-inset-top), 24px)` and is only used by `AdminLayout` and
`AgentOrders` — never by the customer mobile header.

### Fix

`src/index.css` gains one variable and one utility:

```css
:root {
  --app-safe-area-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
}

.mobile-safe-area-top {
  padding-top: var(--app-safe-area-top);
}
```

The fallback order is the one Capacitor actually needs. `@capacitor/android@8.4.2`
ships the official `SystemBars` plugin, whose `insetsHandling` already defaults to
`"css"`; `SystemBars.java` reads
`WindowInsetsCompat.Type.systemBars() | displayCutout()`, divides by display density
and sets `--safe-area-inset-top/right/bottom/left` as inline custom properties on
`<html>`. iOS and the browser never define that variable and fall back to `env()`,
which resolves because `index.mobile.html` already declares `viewport-fit=cover`. The
trailing `0px` keeps every other environment at zero instead of collapsing the
declaration.

`mobile-safe-area-top` is applied to exactly one element — the `md:hidden` wrapper in
`MobileTopPromoBlock` that owns the header background. The background therefore still
bleeds behind the status bar while every interactive child starts below it. Nothing was
added to `SearchBar`, whose height and shape are unchanged, and `DesktopHeader` is
untouched.

No third-party safe-area plugin, no `windowOptOutEdgeToEdgeEnforcement`, no disabling
of edge-to-edge, no `overlaysWebView=false`, no hardcoded status bar height, no native
`MainActivity` change. `capacitor.config.ts` was not modified either: the official
default already produces the variables this fix consumes, verified in the installed
source rather than assumed.

No diagnostic logging was left behind — the inset was read through the DevTools
protocol during validation, not through code shipped in the bundle.

### Measured on the device

`--safe-area-inset-top` = **53px** (cutout inset 159 physical px ÷ dpr 3), and
`--app-safe-area-top` resolves to the same 53px.

| header state | scrollY | search input top | inside the 53px system region? |
|---|---|---|---|
| expanded | 0 | 105.0px | no |
| compact | 1218 | 59.5px | no |
| back to top | 0 | 105.0px | no |

The block's own `getBoundingClientRect().top` stays at `0`, so the background still
covers the status bar. Returning to the top restores the expanded offset with no jump.

---

## 3. Defect 2 — hero carousel seam in RTL

### Cause

`src/components/ui/carousel.tsx` builds slide gutters with the standard LTR idiom:
`-ml-4` on `CarouselContent` and `pl-4` on `CarouselItem`. Under
`direction: "rtl"` both land on the same trailing edge instead of straddling the
slides, so the track measures one gutter wider than its viewport and that transparent
1rem strip lets the near-black card behind it show through. Whenever two slides share
the screen the strip reads as a vertical seam, and the outgoing and incoming slides
appear split rather than butted together.

Measured before the fix: a fully dark vertical band **48 physical px** wide between the
two slides — exactly 16 CSS px × dpr 3.

### Fix

Local to `HeroSlider`. A repo-wide search for `<Carousel`, `<CarouselContent` and
`<CarouselItem` shows `HeroSlider` is the only consumer, but the shared defaults were
still left alone so no other surface can regress:

```tsx
<CarouselContent className="ml-0">
  <CarouselItem className="basis-full pl-0">
```

`cn()` merges through `tailwind-merge`, and the cancellation was verified rather than
assumed — both interactively and as a permanent assertion in the new test file:
`twMerge("flex -ml-4", "ml-0") === "flex ml-0"`, and `pl-4` does not survive `pl-0`.

Autoplay also gained an interaction guard. It previously ran a bare
`setInterval(() => api.scrollPrev(), 7200)` that could fire on top of a drag. It now
watches embla's `pointerDown` and `settle` events and skips a tick while the user is
interacting. The 7.2s cadence, the RTL `scrollPrev` direction, `loop`, `align: "start"`
and the indicator logic are unchanged, and no autoplay library was added.

### Measured on the device

| | before | after |
|---|---|---|
| track `margin-left` | -16px | **0px** |
| item `padding-left` | 16px | **0px** |
| track width | viewport + 16px | **414px** |
| viewport width | 414px | 414px |
| item widths | — | 414, 414, 414, 414, 414 |
| gap between items | 16px | **0, 0, 0, 0** |
| dark band, mid-transition | 48px | **0px at rest and settled** |

Across 40s of autoplay (**5 advances**, `0→4→3→2→1→0→4`) the settled `trackX` was always
an exact multiple of the 414px viewport, so no half slide is ever left on screen, and
the active indicator matched the visible slide in every sample. On the two samples that
landed mid-transition the coverage of the two visible slides summed to exactly `1.000` —
the slides tile the viewport with no gap even in flight.

A vertical gesture over the hero scrolled the page 123px and moved the carousel
**0.00px** horizontally.

---

## 4. Files changed

| File | Change |
|---|---|
| `src/index.css` | `--app-safe-area-top` variable and `.mobile-safe-area-top` utility |
| `src/components/header/MobileTopPromoBlock.tsx` | safe-area class + `data-testid` on the wrapper that owns the header background |
| `src/components/HeroSlider.tsx` | `ml-0` / `basis-full pl-0` overrides, `data-testid`s, autoplay interaction guard |
| `src/components/header/mobile-safe-area.test.tsx` | new, 6 tests |
| `src/components/hero-slider-rtl-geometry.test.tsx` | new, 7 tests |
| `governance/…` | this report, `CURRENT_PHASE.md`, closure index, evidence |

`src/components/ui/carousel.tsx` was deliberately **not** modified. `SearchBar.tsx`,
`Header.tsx`, `DesktopHeader.tsx`, `BottomNav.tsx`, `capacitor.config.ts`,
`AndroidManifest.xml`, `styles.xml` and every native, backend and business file are
untouched.

---

## 5. Tests

13 new tests, both suites targeted at the two defects rather than a broad snapshot.

Safe area (`mobile-safe-area.test.tsx`):
the class is present exactly once and on the background-owning block; the search input
lives inside that block and carries no inset of its own; no inline pixel padding is
baked into the component; the inset survives non-home routes; the collapsing compact
rows sit inside the safe-area block and never carry the class themselves;
`DesktopHeader` renders zero instances.

Hero carousel (`hero-slider-rtl-geometry.test.tsx`):
the track carries no horizontal spacing class and resolves to `ml-0`; every item is
`basis-full pl-0` with no spacing class; the `tailwind-merge` cancellation is asserted
directly; the section keeps `dir="rtl"`; one indicator per slide; both desktop arrows
still render; and a separate case proves the **shared carousel defaults are unchanged**
for any future consumer (`-ml-4` and `pl-4` still applied when not overridden).

| Command | Result |
|---|---|
| `npm test` | **99 passed / 16 files** (86 before, +13) |
| `npm run lint` | 464 problems (452 errors, 12 warnings) — identical to base, 0 new, 0 in touched files |
| `npm run build:mobile` | ok |
| `npm run mobile:boundary` | PASS — forbidden modules: none |
| `npx cap sync android` | ok, 6 plugins |
| `android/gradlew.bat assembleDebug` | BUILD SUCCESSFUL |
| `git diff --check` | clean |

The built CSS was checked directly for the fix surviving minification:
`.mobile-safe-area-top{padding-top:var(--app-safe-area-top)}` and
`--app-safe-area-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`.

---

## 6. APK and device

```
android/app/build/outputs/apk/debug/app-debug.apk   12,868,402 B  (12.87 MB)
```

Device : Android emulator `Pixel_10_Pro_XL`, `emulator-5554`
OS     : Android 17, API 37
Screen : 1344x2992, density 480 (dpr 3), CSS viewport 448px, cutout inset 159px
Launch : `adb install -r` → Success, `am start -W` → `LaunchState: COLD`, `TotalTime: 3368 ms`

---

## 7. Smoke test results

Safe area — 1 through 11: search bar fully clear of the clock, Wi-Fi, battery and
cutout; no part of the input inside the system region; clearance is the real 53px inset
with no extra padding; the header background covers the top of the screen; scrolling
into compact mode keeps the input at 59.5px, still below the inset; scrolling back
restores 105px with no jump; the emulator has a real punch-hole cutout
(`cutoutSpec` present) so the notch case is covered; portrait tested. Light/dark system
UI has no effect on this inset, which is geometry rather than theme.

Hero carousel — 1 through 12: five autoplay advances observed; a 48s screen recording
captured; manual swipes in both directions plus a fast swipe; no black gap; no white
edge; no split text after snap; no half slide left over; image, overlay and content move
as one panel; the active indicator matched the slide in every sample; a vertical gesture
produced 0.00px of horizontal drift; settled positions are always exact multiples of the
viewport width, which is the numeric form of "no jank at the snap".

Evidence:

```
governance/evidence/mobile-safe-area-hero-carousel/
├─ 00-git-base.txt
├─ 01-root-cause.txt
├─ 02-device-measurements.txt      full CDP transcript, autoplay table, seam scan
├─ 03-tests.txt · 04-lint.txt · 05-mobile-boundary.txt · 06-android-build.txt
└─ screenshots/
   ├─ 01-before-header-under-status-bar.png
   ├─ 02-before-hero-seam-mid-transition.png
   ├─ 03-after-header-clears-status-bar.png
   ├─ 04-after-compact-mode-search-below-status-bar.png
   ├─ 05-after-hero-no-seam-mid-drag.png
   ├─ 06-after-hero-single-slide-at-rest.png
   └─ 07-after-hero-smoke-48s.mp4      48s, 720x1280, 5.5 MB
```

---

## 8. Not tested

- Physical Android hardware. Emulator only.
- iOS at runtime. Windows host, no Xcode or CocoaPods. The safe-area chain falls back to
  `env(safe-area-inset-top)` there, which is the standard iOS path and is already enabled
  by `viewport-fit=cover`, but it was not observed on a device or simulator.
- Landscape orientation.
- Devices whose status bar height differs materially from 53px, including tablets and
  waterfall displays.
- The screen recording was captured at 720x1280 rather than 60fps native: the emulator
  encoder refused 1344x2992 (`unable to configure video/avc codec … err=-22`) and fell
  back automatically. Frame-by-frame decoding was done through DOM geometry sampling
  instead, since no local ffmpeg is available.
- Android versions below 17. The Capacitor inset injection runs on every API level, but
  only API 37 was exercised.

---

## 9. Remaining risks

| Risk | Assessment |
|---|---|
| A future consumer of the shared carousel hits the same RTL gutter | Open by design. The shared defaults were left alone to avoid regressing anything else; the new test pins the current default so the change is at least visible. Making the shared component direction-aware is a separate task. |
| `BottomNav` carries a `safe-area-inset-bottom` class that does not exist in any stylesheet | Pre-existing and untouched — the brief only allows touching `BottomNav` if an independent overlap is found, and none was observed. The bottom inset is currently unhandled; worth its own patch. |
| `.safe-top` still hardcodes a 24px floor | Pre-existing, used only by `AdminLayout` and `AgentOrders`, both outside this scope. |
| Autoplay guard depends on embla emitting `settle` | If a drag ended without `settle`, autoplay would stay paused. Embla emits `settle` after every scroll, including cancelled drags, and five advances plus three manual swipes were observed with autoplay resuming each time. |
| iOS inset unverified | Falls back to `env()`, the standard path, but needs a macOS or CI run to confirm. |
| `npm run lint` still fails | Exactly as on `main` — 452 pre-existing errors in `src/**`. No unrelated file was touched. |
| Evidence video adds 5.5 MB to the repository | Accepted deliberately; the brief requires the smoke video and its path. |
