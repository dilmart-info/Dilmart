# DilMart 2.0 — PRE-G0-07 Lint Baseline

Date: 2026-11-27
Task: PRE-G0-07
Engineering debt: ED-05
Repository: https://github.com/dilmart-info/Dilmart
Baseline SHA: `920e2c8b6a0311ca6ca139a37b87bb274e562170`
PR #68: not merged and not included
G0: **OPEN / BLOCKED**
No rule, suppression, or source file was changed.

## Verdicts

| Item | Verdict |
|---|---|
| PRE-G0-07 evidence task | **PASS WITH NOTES** |
| ED-05 | **OPEN** |

The frontend historical baseline was reproduced. The backend command does not pass. The comparison prototype is ready for a separate implementation task and is not enforcement yet.

## 1. Commands and versions

Installed from the committed lockfiles with `npm ci --ignore-scripts --no-audit --no-fund`. Local ESLint was used. `npx` was not used.

| Package | Script | ESLint | Exit |
|---|---|---|---|
| Root | `eslint "src/**/*.{ts,tsx}" "scripts/**/*.mjs"` | 9.39.5 | 1 |
| Backend | `eslint "src/**/*.ts"` | 9.39.4 | 1 |

Node v22.22.3, npm 11.17.0, Git 2.54.0.windows.1. The same commands were repeated with `-f json`. Those JSON files also exited 1. They stay in `D:\DilMart-preg0-06-07-private` and are not committed.

## 2. Results

| Package | Files with diagnostics | Errors | Warnings |
|---|---:|---:|---:|
| Root | 89 | 449 | 33 |
| Backend | 48 | 555 | 1 |

Root rules:

| Rule | Count |
|---|---:|
| `@typescript-eslint/no-explicit-any` | 446 |
| `react-refresh/only-export-components` | 25 |
| `react-hooks/exhaustive-deps` | 8 |
| `@typescript-eslint/no-empty-object-type` | 2 |
| `no-control-regex` | 1 |

The 446 `no-explicit-any` findings are errors. The 33 warnings are the React refresh and hook rules. The other three findings are errors. 446 + 2 + 1 = 449.

Backend rules:

| Rule | Count |
|---|---:|
| `@typescript-eslint/no-explicit-any` | 549 |
| `@typescript-eslint/no-require-imports` | 2 |
| `no-extra-boolean-cast` | 2 |
| `no-empty` | 1 |
| `no-useless-escape` | 1 |
| unused `eslint-disable` directive, no rule id | 1 warning |

Largest root files include `src/pages/admin/OrderDetail.tsx` (104) and the admin and marketplace API modules. Largest backend files include `backend/src/modules/finance/courier-finance.service.ts` (114) and `backend/src/modules/admin/admin.service.ts` (86). Per-file inventories remain in the private JSON.

## 3. Historical comparison

Phase 0.2a recorded 449 frontend errors, 33 frontend warnings, and 446 `no-explicit-any` errors. This run matches those three numbers. The historical count does not include the backend. The backend result is a new measurement: 555 errors and 1 warning. Lint still fails in both packages. Critical CI still does not run these scripts.

## 4. No-new-diagnostic comparison

A temporary prototype lives only in `D:\DilMart-preg0-06-07-private\lint-fingerprint\`. It is not committed and no workflow was edited.

Each diagnostic becomes a fingerprint of normalized path, rule id, severity, collapsed message, and the trimmed source line. Line and column are stored for display and are excluded from the identity, so a moved line with the same text is not a new diagnostic. Comparison uses multiset counts:

- a higher count is a new occurrence
- a lower count is a resolved occurrence
- a path absent from the previous set is a new file
- the same path, rule, message, and source line moving from warning to error is a promotion
- replacing one violation with a different rule or source line shows both the removal and the addition, so equal totals cannot hide it

`node lint-fingerprint/test.mjs` printed `lint-fingerprint proof: 6 cases passed`. The cases were line movement, a new file, a duplicate source line, a swap that keeps the total similar, a warning promoted to an error, and a resolved diagnostic.

The prototype is ready to be copied into an authorized implementation task. It is not ready as a gate. That task still has to pin the local ESLint invocation, record this baseline outside the public diagnostic dump, and decide whether backend and root are separate baselines. They must stay separate: adding the backend count to 449 would invent a failure that the historical frontend baseline never contained.

## 5. Independent review

Re-run the two scripts on `920e2c8` with the lockfile ESLint and expect root `449 errors, 33 warnings` and backend `555 errors, 1 warning`. ED-05 stays open until the fingerprint check is implemented and reviewed. A reproduced baseline is not a lint pass.
