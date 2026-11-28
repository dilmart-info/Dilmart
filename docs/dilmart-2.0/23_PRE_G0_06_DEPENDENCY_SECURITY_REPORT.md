# DilMart 2.0 — PRE-G0-06 Dependency Security Review

Date: 2026-11-27
Task: PRE-G0-06
Engineering debt: ED-04
Repository: https://github.com/dilmart-info/Dilmart
Baseline SHA: `920e2c8b6a0311ca6ca139a37b87bb274e562170`
PR #68: not merged and not included. Its only file is `.github/workflows/pre-g0-schema-evidence.yml`.
G0: **OPEN / BLOCKED**
Production: not contacted. No dependency was upgraded.

## Verdicts

| Item | Verdict |
|---|---|
| PRE-G0-06 evidence task | **PASS WITH NOTES** |
| ED-04 | **OPEN** |

The audit ran and the critical and high advisories were classified. Nothing was patched. A completed audit is not remediation.

## 1. Tools and lockfiles

| Tool | Version |
|---|---|
| Git | 2.54.0.windows.1 |
| Node | v22.22.3 |
| npm | 11.17.0 |

| Lockfile | SHA-256 |
|---|---|
| `package-lock.json` | `6c1956e17335c32cd8c16a673accf0ad221bd0c849000675885fc8921831ba12` |
| `backend/package-lock.json` | `25a0528331368afe16784b9a959670600a8d1f666efadf41018d0d84fedd36e8` |

Commands, each with exit code 1 because advisories were present. The JSON parsed and the stderr was the existing `devdir` npm warning, not a registry failure.

```text
npm audit --json --package-lock-only
npm audit --omit=dev --json --package-lock-only
```

Install used for later lint, not for the audit:

```text
npm ci --ignore-scripts --no-audit --no-fund
```

Exit code 0 in both packages. Project `package.json` files have no `prepare` or `preinstall` script. Dependency lifecycle scripts were not executed.

Raw JSON is in `D:\DilMart-preg0-06-07-private` and is not committed.

## 2. Counts

| Tree | Mode | Total | Critical | High | Moderate |
|---|---|---:|---:|---:|---:|
| Root | all | 35 | 6 | 13 | 16 |
| Root | `--omit=dev` | 8 | 2 | 3 | 3 |
| Backend | all | 15 | 1 | 8 | 6 |
| Backend | `--omit=dev` | 7 | 1 | 4 | 2 |

The all-dependency totals match the Phase 0.2a historical observation. That match is a new registry read on this SHA, not a copied result. Production-only counts were not in that historical note.

## 3. Critical and high matrix

`REACHABLE / APPLICABLE` means the vulnerable package is on a located application path. It does not mean an exploit was run. `NOT APPLICABLE — EVIDENCE REQUIRED` is not a safety claim.

| Package | Installed | Advisory | Direct | Exposure | Class |
|---|---|---|---|---|---|
| `@capacitor/android` | 8.4.2 | GHSA-rvm3-566m-v7fv, range `>=8.3.5 <8.4.3`, fix 8.6.3, not a major | yes | Native binary. `capacitor.config.ts` sets `androidScheme: 'https'` and does not set `server.url`. | POTENTIALLY REACHABLE |
| `@capacitor/ios` | 8.4.2 | same GHSA and fix 8.6.3 | yes | Same native package family | POTENTIALLY REACHABLE |
| `proxy-addr` | 2.0.7 | GHSA-jqcg-44mw-7w3h, range `1.1.0 - 2.0.7` | no, via `express@5.2.1` | Every backend HTTP request. `main.ts` sets `trust proxy` to a hop count, or `false` when `STORE_TRUSTED_PROXY_HOPS` is 0. The advisory is an IPv4-mapped IPv6 trusted-subnet bypass. | POTENTIALLY REACHABLE |
| `vitest` | 3.2.7 | GHSA-82fw-gwwq-j7x9 plus `tinypool` critical GHSAs. Fix vitest 5.1.2, major | yes, dev | Test runner. Production audit omits it. | NOT APPLICABLE — EVIDENCE REQUIRED |
| `tinypool` | 1.1.1 | GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr. Worker-option prototype-pollution gadgets. Fix follows vitest 5.1.2 | no, via vitest | Test process only if untrusted worker options are passed. Committed scripts do not do that. | NOT APPLICABLE — EVIDENCE REQUIRED |
| `handlebars` | 4.7.9 | GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f, and a moderate companion. Includes CVE-2026-33937 in the title | no, via `conventional-changelog-writer` | Release changelog tooling. No application import. | NOT APPLICABLE — EVIDENCE REQUIRED |
| `tar` | 6.2.1 nested; top-level 7.5.22 is outside `<=7.5.20` | multiple path and parser GHSAs, including critical GHSA-23hp-3jrh-7fpw | no, via `@capacitor/assets` → nested `@capacitor/cli@5.7.8` | Asset-generation CLI, not the shipped bundle | POTENTIALLY REACHABLE |
| `zod` | 3.25.76 | GHSA-mrhx-c7xc-m3w5, range `<4.6.6`, fix 4.6.7, major | yes, production | Memory exhaustion on oversized constrained collections. The only `src` import is `src/pages/admin/Agents.tsx`, and that schema is four strings. No `z.array` in `src`. | NOT APPLICABLE — EVIDENCE REQUIRED |
| `vite` | 5.4.21 | eight GHSAs. The high one is GHSA-587h-7wmj-h5pm in `launch-editor` on Windows. Fix vite 8.4.0, major | yes, dev | Dev server. Omitted from the production audit. | POTENTIALLY REACHABLE |
| `@capacitor/assets` | 3.0.5 | high through nested CLI, `tar`, and `sharp`. Fix 4.0.0, major | yes, dev | `cap:assets` scripts | POTENTIALLY REACHABLE |
| `sharp` | under assets | GHSA-f88m-g3jw-g9cj and companions. Fix follows assets 4.0.0 | no | Asset CLI | POTENTIALLY REACHABLE |
| `@capacitor/cli` nested | 5.7.8 under assets; direct CLI is 8.4.2 and is outside this advisory range | high through `tar` and `rimraf` | no | Asset CLI only | POTENTIALLY REACHABLE |
| `@xmldom/xmldom` | 0.9.10 | XML injection and DoS GHSAs | no, via `@trapezedev/project` and `plist` | Native project patching CLI | POTENTIALLY REACHABLE |
| `multer` | 2.1.1 | DoS GHSAs through 2.4.0, including GHSA-wc9g-mqfw-jrwm. Semver-compatible fix advertised | no, via `@nestjs/platform-express@11.1.19` | `FileInterceptor("file")` in `admin-merchant-products-import.controller.ts` and `merchant-products.controller.ts` | REACHABLE / APPLICABLE |
| `body-parser` | 2.2.2 | GHSA-27r3-jxmh-p828, range `2.0.0 - 2.3.0` | no, via express | Global JSON parser | POTENTIALLY REACHABLE |
| `ws` | backend 8.20.0; root jsdom copy 8.21.1 is outside `8.0.0 - 8.20.1` | GHSA-96hv-2xvq-fx4p | no, via `@supabase/realtime-js@2.104.0` | No `realtime` or `WebSocketGateway` use found in `backend/src` | NOT APPLICABLE — EVIDENCE REQUIRED |
| `@nestjs/platform-express` | 11.1.19 | high because it depends on vulnerable `multer`. Semver-compatible fix advertised | yes | Backend HTTP platform | REACHABLE / APPLICABLE |
| `nanoid` | 3.3.16 | GHSA-2v37-7h3g-55p8, custom generator with size 0. Range `<3.3.18` | no, only parent found is dev `postcss` | Production audit still lists it. No `src` import and no `customAlphabet` call found. | UNVERIFIED |
| `source-map-js` | via postcss | GHSA-68fv-2mgg-jv7q | no, parent `postcss` | Production audit lists it. No application import found. | UNVERIFIED |
| `js-yaml` | root 4.3.0, backend 4.1.1 | quadratic YAML GHSAs, including CVE-2026-59870 in one title | no, via `@eslint/eslintrc` and backend `cosmiconfig` | Lint and config loading | NOT APPLICABLE — EVIDENCE REQUIRED |
| `fast-uri` | 3.1.0 | host-confusion and SSRF GHSAs | no, via `ajv` | Dev, webpack, and eslint parents. Not in the production audit. No `@IsUrl` in `backend/src`. | NOT APPLICABLE — EVIDENCE REQUIRED |
| `brace-expansion`, `browserslist`, `minimatch`, `replace`, `@trapezedev/project` | several nested copies | glob, stats, or native-project DoS and traversal advisories | no | Build, lint, or asset CLIs. Not production request handlers. | NOT APPLICABLE — EVIDENCE REQUIRED |

The audit payload exposes GHSA identifiers. CVE numbers are recorded only where an advisory title contains one. No exploit was executed.

## 4. Remediation packages

Do not apply these in this task.

1. **Native runtime, non-major.** Move `@capacitor/android`, `@capacitor/ios`, and the matching `@capacitor/core` and direct `@capacitor/cli` from 8.4.2 to the verified fix 8.6.3. Rebuild Android and iOS, run `cap sync`, and smoke the WebView origin. Keep this separate from the assets major.
2. **Backend HTTP, semver-compatible where the audit says so.** Update `@nestjs/platform-express@11.1.19` far enough to lift `multer@2.1.1` past 2.4.0, `body-parser@2.2.2` past 2.3.0, and `proxy-addr@2.0.7` past 2.0.7. Re-test both file-import controllers, JSON body limits, and `STORE_TRUSTED_PROXY_HOPS`. No `npm audit fix --force`.
3. **Realtime socket, only if product code starts using it.** Backend `ws@8.20.0` needs at least 8.21.0. No realtime call site was found, so this is not the first package.
4. **Zod major, separate.** 3.25.76 to 4.6.7. Re-test `Agents.tsx` and `@hookform/resolvers`. The located schema does not exercise the collection bug; the upgrade is still a major compatibility change.
5. **Dev server and tests, majors together.** Vite 5.4.21 to 8.4.0 and Vitest 3.2.7 to 5.1.2, which also replaces `tinypool@1.1.1`. Run the frontend test suite and a Windows dev-server check. This does not by itself change the native binary.
6. **Asset CLI major, separate.** `@capacitor/assets` 3.0.5 to 4.0.0, then regenerate icons and compare them. That is the advertised path for nested `tar@6.2.1`, nested CLI 5.7.8, and `sharp`. Do not point it at untrusted archives.

## 5. Independent review

A reviewer should re-run both audit commands on `920e2c8` and confirm the counts in section 2. ED-04 stays open until an authorized change lands one or more of the packages above and names what it re-tested. Unverified `nanoid` and `source-map-js` production-audit membership still needs an explanation before anyone calls them runtime-safe or drops them.
