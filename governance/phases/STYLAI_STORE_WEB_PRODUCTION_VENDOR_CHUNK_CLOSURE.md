# Emergency Web Production Bundle Runtime Fix — Closure Report

Production outage. `https://store.DilMart.org` served a black screen because the web
bundle threw while evaluating its own vendor chunks. Fixed by removing the hand-written
`manualChunks` from the web Vite config. Nothing else was changed.

---

## 1. Identity

| Field     | Value                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Phase     | Emergency Web Production Bundle Runtime Fix                                                                  |
| Branch    | `fix/web-production-vendor-chunk`                                                                            |
| Base SHA  | `8e60a1a48da7f41fd28aeb3db8b3a930481b835a` (local `fix/mobile-safe-area-hero-carousel` HEAD, **not pushed**) |
| Final SHA | single commit on this branch — `git rev-parse fix/web-production-vendor-chunk`                               |
| Commit    | `fix(web): prevent production vendor chunk initialization crash`                                             |
| Evidence  | `governance/evidence/web-production-vendor-chunk/`                                                           |

Branched from the local HEAD so every earlier unpushed change stays in history. No
`checkout main`, `pull`, `reset`, `clean`, `stash` or `rebase` was run.

---

## 2. Symptom

`https://store.DilMart.org` returned HTTP 200 with a valid `index.html`, downloaded every
chunk successfully, and then rendered nothing.

```
Uncaught TypeError: Cannot read properties of undefined (reading 'forwardRef')
    at https://store.DilMart.org/assets/vendor-C-dDIgRE.js:25:15
```

Reproduced in headless Chrome against production: `#root` had **0** children, the body
had **0** characters of visible text, no service worker was involved, and **no network
request failed**.

---

## 3. The published artifact was correct

`netlify.toml` already declared the right pair and was not modified:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

| build                  | config                  | output         | target            |
| ---------------------- | ----------------------- | -------------- | ----------------- |
| `npm run build`        | `vite.config.ts`        | `dist/`        | Netlify web       |
| `npm run build:mobile` | `vite.mobile.config.ts` | `dist-mobile/` | Capacitor APK/IPA |

Every production chunk was downloaded and byte-compared against a local build of the
same commit — `index-D8WZyAIR.js`, `vendor-C-dDIgRE.js`, `vendor-react-BeDS4LWl.js` and
`vendor-radix-nHqKWmXK.js` were all **identical**. `dist-mobile` was never uploaded.
The outage was in the bundle itself, not in the deployment.

---

## 4. Root cause

`vite.config.ts` bucketed `node_modules` by package name:

```
vendor-react : react/, react-dom/, scheduler/, react-router*, @tanstack/react-query
vendor-radix : @radix-ui/*
vendor       : everything else
```

That split packages away from the dependencies they evaluate against:

| forced into `vendor-react`      | but its runtime dependency landed in `vendor` |
| ------------------------------- | --------------------------------------------- |
| `react-router-dom` 6.30.4       | `@remix-run/router` 1.23.3                    |
| `@tanstack/react-query` 5.101.4 | `@tanstack/query-core` 5.101.4                |

Meanwhile every package left in `vendor` — lucide-react, sonner, embla, zustand and the
rest — imports `react`, which lives in `vendor-react`.

The two chunks therefore imported each other, which the emitted files prove directly:

```
vendor-react-BeDS4LWl.js   import{i as ie,g as Xu,r as Gu,...}from"./vendor-C-dDIgRE.js"
vendor-C-dDIgRE.js         import{r as R,R as O,...}from"./vendor-react-BeDS4LWl.js"
```

ES modules evaluate a cycle depth-first. The entry's **first** static import is
`vendor-react`; `vendor-react`'s first statement imports `vendor`; so `vendor` ran to
completion while `vendor-react` had not initialised a single export. The crash site,
`vendor-C-dDIgRE.js` line 25 column 15, is lucide-react's module-level factory:

```js
const e2=R.forwardRef(({color:t="currentColor",size:e=24,...},c)=>R.createElement("svg",...))
```

`R` is the live binding to `vendor-react`'s React namespace. At that instant it was
`undefined`, so `R.forwardRef` threw before React ever mounted — a black screen.

---

## 5. Chunk dependency, before and after

**Before**

```
index-D8WZyAIR.js ──► vendor-react-BeDS4LWl.js ──► vendor-C-dDIgRE.js
                  ├─► vendor-radix-nHqKWmXK.js         │
                  └─► vendor-C-dDIgRE.js               │
                          ▲                            │
                          └────────────────────────────┘   CYCLE
```

**After** — `manualChunks` removed, Rollup derives the boundaries from the real module
graph:

```
index-DFvihrxk.js        static chunk imports: 0
no vendor-*.js chunks emitted
92 JavaScript chunks total, all route-level from React.lazy dynamic imports
```

An automated scan of the static import graph across all 92 chunks reports
**0 cycles**. The entry is self-contained, so no cross-chunk binding can be read before
it is initialised.

---

## 6. Fix

One config edit. `vite.config.ts` loses the whole `rollupOptions.output.manualChunks`
block and keeps `chunkSizeWarningLimit`, `modulePreload` and `minify`. A comment records
why the split must not come back.

`viteCapacitorFix()` was left in place — it rewrites the modulepreload feature probe and
is unrelated to the cycle. `vite.mobile.config.ts` was not touched.

None of the forbidden shortcuts were used: no React downgrade, no `forwardRef` shim, no
monkey patch, no `node_modules` edit, no `window.React`, no disabled minification, no
post-build file surgery, no edits to `dist`, no new dependency, and no change to
HeroSlider, the safe-area work or any component that uses `forwardRef`.

---

## 7. Verification

| Check                                 | Before fix                       | After fix                        |
| ------------------------------------- | -------------------------------- | -------------------------------- |
| `npm run build`                       | ok                               | ok                               |
| Production preview, route `/`         | rootChildren **0**, 2 exceptions | rootChildren **5**, 0 exceptions |
| Production preview, route `/products` | rootChildren **0**, 2 exceptions | rootChildren **5**, 0 exceptions |
| Production preview, route `/auth`     | rootChildren **0**, 2 exceptions | rootChildren **5**, 0 exceptions |
| `npm run web:production-smoke`        | **FAIL**, exit 1                 | **PASS**, exit 0                 |
| Chunk cycles                          | 1                                | 0                                |

Detailed probe of the fixed preview on `/`:

```
HTTP status of /  : 200
exceptions        : 0
console errors    : 0
JS/script failures: 0
failed requests   : 16 — all HTTP 500 from DilMart-store-backend.onrender.com/api/*
                    (marketplace/home, marketplace/categories, desktop-quick-links,
                     analytics ingest). Backend availability, not the bundle.
```

Regression suite:

| Command                       | Result                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `npm test`                    | **99 passed / 16 files**                                                                  |
| `npm run lint`                | 464 problems (452 errors, 12 warnings) — identical to base, 0 new, 0 in the changed files |
| `npm run arch:guard`          | PASS — 0 violations                                                                       |
| `npm run auth:guard`          | 1 violation — pre-existing Windows-only false positive, section 10                        |
| `npm run mobile:boundary`     | PASS — forbidden modules: none                                                            |
| `npm run native:assets:check` | PASS                                                                                      |
| `git diff --check`            | clean                                                                                     |

Earlier work verified still in place: `--app-safe-area-top` and `.mobile-safe-area-top`
in `src/index.css`, the safe-area class on `MobileTopPromoBlock`, `ml-0` /
`basis-full pl-0` in `HeroSlider`, all five brand sources under `assets/`, the Android
launcher mipmaps and splash drawables, the iOS `AppIcon` and `Splash.imageset`, and the
`windowSplashScreen*` attributes in `styles.xml`.

---

## 8. Files changed

| File                                       | Change                                                   |
| ------------------------------------------ | -------------------------------------------------------- |
| `vite.config.ts`                           | `manualChunks` removed; explanatory comment added        |
| `scripts/web/check-production-preview.mjs` | new — production preview smoke guard                     |
| `package.json`                             | new `web:production-smoke` script                        |
| `governance/…`                             | this report, `CURRENT_PHASE.md`, closure index, evidence |

`vite.mobile.config.ts`, `netlify.toml`, `vite-capacitor-fix.js`, every source component
and every native file are untouched.

---

## 9. Production build smoke guard

`npm run web:production-smoke` — `scripts/web/check-production-preview.mjs`.

It checks `dist/index.html` exists, that every file it references is on disk, and that
it does not point at the mobile bundle; then serves `dist/` through `vite preview`,
drives real headless Chrome over the DevTools Protocol, and visits `/`, `/products` and
`/auth`. It exits 1 when `#root` is empty, when the page renders no text, on any uncaught
exception, on any `window.onerror` or `unhandledrejection`, on a console error matching
`forwardRef` / `Cannot read properties of undefined` / `React is undefined` /
`is not a function` / `Cannot access '`, or when a JavaScript request fails.

Zero new dependencies: Chrome is discovered from the local install (`CHROME_PATH`
honoured), and Node 22's built-in `WebSocket` speaks CDP directly. Neither Playwright nor
Puppeteer was added.

It also refuses to run if the port is already answering with a **different** bundle. That
mattered here: the first run smoke-tested an unrelated `vite preview` from another
project that was bound to 4173 and reported a false PASS. The guard now compares the
served document against the entry file on disk before trusting any result.

The guard was not wired into CI in this task — it needs a Chrome binary on the runner,
which is a separate decision.

---

## 10. `auth:guard` false positive — pre-existing, not touched

`src/integrations/supabase/client.ts` is unmodified and correctly configures
`storage: authStorage`. The guard flags line 12, which is a **comment** quoting the
forbidden pattern:

```
// and is owned by @/lib/auth/auth-storage. Never hardcode `storage: localStorage`.
```

`stripComments()` strips line comments with `/\/\/.*$/`, but this worktree has CRLF line
endings, so after `split("\n")` every line still ends with `\r`. In JavaScript `.` does
not match `\r`, so `$` never anchors and the comment survives stripping. On an LF
checkout — which is what GitHub Actions uses — the guard passes.

Both the guard and the client file last changed in `a95df07`. Out of scope here and left
alone; raised for a separate patch.

---

## 11. Deployment artifact

```
Folder : E:\Project\DilMart-Store\dist          (8.1 MB)
dist/index.html sha256 b8f4b44480ee83fb4130ee3c7ec693114d289ec7ef79162e9669f4e9c16c6efe  (1389 B)
references             /assets/index-DFvihrxk.js
                       /assets/index-DR59cGdG.css
                       /DilMart-store-icon-only.png
contains dist-mobile   no
```

Netlify already builds this correctly from `netlify.toml`, so the supported redeploy is
to deploy the commit and let Netlify run `npm ci && npm run build` itself. For a manual
upload the folder is exactly `E:\Project\DilMart-Store\dist`, and the CLI form would be
`npx netlify-cli deploy --prod --dir dist`.

**No deploy was executed. No push, no PR, no merge.**

---

## 12. Not tested

- The fix has not been observed on the live domain — that requires a deploy, which is
  held for supervisor approval.
- Real browsers other than the local Chrome build, and mobile Safari/iOS Web.
- Authenticated flows, checkout and admin/merchant routes at runtime. The backend was
  returning HTTP 500 for `DilMart-store-backend.onrender.com/api/*` throughout, so only
  the shell render could be verified; those 500s predate this change and are unrelated to
  the bundle.
- Route smoke covered `/`, `/products` and `/auth` only. Product detail pages were not
  visited because the catalogue API was down.
- Bundle size/performance impact of dropping the manual split was not benchmarked. The
  entry grew to 963 KB because the vendor code now lives inside it rather than in three
  siblings; total transferred JavaScript is comparable, but no measurement was taken.

---

## 13. Remaining risks

| Risk                                          | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`dist-mobile` carries the identical cycle** | Confirmed by scan: `vendor-react ⇄ vendor`. It does not crash only because the mobile entry imports `vendor` first, so React initialises before lucide-react's top-level `forwardRef` runs. That is luck, not design — one change to the module graph could flip the import order and put the same black screen inside the APK. Left untouched because the APK passes its Android smoke test and the brief requires stopping and presenting evidence first. **This is the top follow-up.** |
| Entry chunk is now 963 KB                     | Everything the shell needs is in one file. It is above the 500 KB default warning but under the project's configured 2000 KB limit. If splitting is wanted later it must be driven by dynamic imports, never by name-based `manualChunks`.                                                                                                                                                                                                                                                 |
| Guard not in CI                               | `web:production-smoke` needs Chrome on the runner. Until it is wired up, a future config change could reintroduce a boot-time crash that `npm run build` still reports as successful.                                                                                                                                                                                                                                                                                                      |
| `auth:guard` red on Windows                   | Section 10. Cosmetic on CI, noisy locally.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `sharp` is not installed                      | `npm ci` aborted on sharp's libvips download (network timeout), so dependencies were restored with `npm ci --ignore-scripts`. The lockfile was not modified and nothing in this task needs sharp, but `npm run brand:assets` and `@capacitor/assets` will not run until it is reinstalled.                                                                                                                                                                                                 |
| Backend 500s                                  | `DilMart-store-backend.onrender.com` returned 500 for every marketplace endpoint during validation. Independent of this fix and worth its own check before declaring the site healthy after redeploy.                                                                                                                                                                                                                                                                                      |
