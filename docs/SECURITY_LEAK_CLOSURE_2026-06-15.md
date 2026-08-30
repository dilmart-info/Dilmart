# 🔒 SECURITY LEAK CLOSURE — 2026-06-15

> **Incident Date**: 2026-06-15  
> **Closure Date**: 2026-06-15  
> **Severity**: Medium — credentials exposed in Git commit  
> **Status**: ✅ CLOSED — credentials rotated, files cleaned

---

## Incident Summary

A test script (`backend/scripts/smoke_test_api.mjs`) was committed in `6743b00` containing:

- Supabase anon key (hardcoded JWT)
- Production backend URL (hardcoded)
- Admin email + password (hardcoded)
- Merchant email + password (hardcoded)

## Actions Taken

| #   | Action                                                           | Status                                          |
| --- | ---------------------------------------------------------------- | ----------------------------------------------- |
| 1   | Deleted `smoke_test_api.mjs` from Git                            | ✅ commit `1ea1ee4`                             |
| 2   | Added `smoke_test*`, `*credentials*`, `*secret*` to `.gitignore` | ✅                                              |
| 3   | Rotated admin panel credentials                                  | ✅ New admin: `DilMart77@gmail.com`             |
| 4   | Removed old admin email from `admin/Login.tsx` placeholder       | ✅ This commit                                  |
| 5   | Removed hardcoded email from `test-render-auth.mjs`              | ✅ Now reads `ADMIN_EMAIL` env var              |
| 6   | Git history rewrite                                              | ❌ Deferred — decided after credential rotation |

## Remaining Exposure (Git History)

> [!WARNING]
> The leaked credentials remain in Git history (commit `6743b00`).
> Since passwords have been rotated, this is low-risk but not zero-risk.
> A `git filter-branch` or `bfg` cleanup can be done later if needed.

## Post-Closure Scan Results

### 1. `signInWithPassword` — 8 results, ALL SAFE

| File                                                 | Verdict | Notes                               |
| ---------------------------------------------------- | ------- | ----------------------------------- |
| `src/pages/Auth.tsx:50`                              | ✅ Safe | Login UI — reads user input         |
| `src/pages/merchant/Login.tsx:24`                    | ✅ Safe | Login UI — reads user input         |
| `src/pages/admin/Login.tsx:24`                       | ✅ Safe | Login UI — reads user input         |
| `governance/phases/PHASE_1_ANALYSIS_REPORT.md` (×3)  | ✅ Safe | Documentation — function names only |
| `scripts/architecture/supabase-guard-allowlist.json` | ✅ Safe | Architectural docs                  |

### 2. `password:` in backend — 4 results, ALL SAFE

| File                                  | Verdict | Notes                                       |
| ------------------------------------- | ------- | ------------------------------------------- |
| `merchant-applications.service.ts:35` | ✅ Safe | Passes `payload.password` from request body |
| `jenni-auth.service.ts:61`            | ✅ Safe | Reads from `this.password()` = env variable |
| `admin.service.ts:331`                | ✅ Safe | Passes `payload.password` from request body |
| `jenni-identity-spike.mjs:77`         | ✅ Safe | Reads from env variable `PASSWORD`          |

### 3. `SUPABASE_ANON_KEY` — 1 result, SAFE

| File                                               | Verdict | Notes                               |
| -------------------------------------------------- | ------- | ----------------------------------- |
| `supabase/functions/create-agent-user/index.ts:22` | ✅ Safe | `Deno.env.get('SUPABASE_ANON_KEY')` |

### 4. `nuxeseltd` — 2 results remaining

| File                                 | Verdict       | Notes                             |
| ------------------------------------ | ------------- | --------------------------------- |
| `docs/JENNI_GROUNDWORK_REPORT.md:25` | ✅ Acceptable | Documents the incident itself     |
| **`admin/Login.tsx`** — CLEANED      | ✅ Fixed      | Replaced with generic placeholder |
| **`test-render-auth.mjs`** — CLEANED | ✅ Fixed      | Now uses `ADMIN_EMAIL` env var    |

### 5. `ebloz` — 1 result, ACCEPTABLE

| File                                 | Verdict       | Notes                         |
| ------------------------------------ | ------------- | ----------------------------- |
| `docs/JENNI_GROUNDWORK_REPORT.md:26` | ✅ Acceptable | Documents the incident itself |

### 6. `DilMart-store-backend.onrender.com` in code — 7 results

| File                                            | Verdict     | Notes                                 |
| ----------------------------------------------- | ----------- | ------------------------------------- |
| `backend/tests/phase5a-checkout-live.test.mjs`  | ⚠️ Low risk | Default URL fallback — no credentials |
| `backend/tests/phase5a-checkout-smoke.test.mjs` | ⚠️ Low risk | Default URL fallback — no credentials |
| `backend/scripts/test-render-auth.mjs`          | ⚠️ Low risk | URL hardcoded — credentials from .env |
| `backend/scripts/jenni-webhook-smoke.mjs`       | ⚠️ Low risk | URL in comment — no credentials       |
| `backend/scripts/jenni-sync-reference.mjs`      | ⚠️ Low risk | URL in comment — no credentials       |

> Production URL exposure is low-risk: it's a public Render URL.
> No credentials are hardcoded alongside it in any remaining file.

## Conclusion

- **No hardcoded passwords exist in the current codebase.**
- **No hardcoded Supabase keys exist in the current codebase.**
- **Old admin email removed from UI and scripts.**
- **Git history still contains the leak** — acceptable given credential rotation.
- **No further action required** unless history rewrite is decided later.
