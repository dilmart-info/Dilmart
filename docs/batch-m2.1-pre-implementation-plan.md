# Batch M2.1 — Search Contract Stabilization  
## Pre-implementation plan only (no code in this document)

**Status:** Approved for planning — implementation starts only after this plan is accepted.  
**Scope boundary:** Search **contract + behavior alignment** for **public product listing search** only. **No** M2.2+ work mixed in.

---

## 1. Binding constraints (non-negotiable)

M2.1 **must not** introduce:

| Forbidden | Notes |
|-----------|--------|
| Relevance / ranking engine | Sort remains **user-selected** (`newest` / price), not query-dependent scoring. |
| Fuzzy matching | Keep substring match semantics only (see §4). |
| Typo correction | Out of scope. |
| Full-text search expansion | No `tsvector`, no multi-column weighted search in this batch. |
| Merchant search | `/stores` and merchant APIs unchanged for search. |
| Category / entity search | Search applies to **product name** only; `category_slug` stays a separate filter. |
| Dedicated `/search` route | Search URL remains **`/products?search=...`** (and optional `category`, `page`, `sort`). |

**Allowed:** `trim`, optional **internal spacing normalization**, **case-insensitive** matching (existing `ILIKE` behavior).  
**Not allowed:** stemming, transliteration, fuzzy expansion, phonetic matching.

---

## 2. Audit — current behavior (baseline)

### 2.1 Public UX entry points

| Entry | Behavior today |
|-------|----------------|
| **Header search** (`Header.tsx`) | On submit: if `searchQuery.trim()` non-empty → `navigate(/products?search=...)`. Whitespace-only does not navigate. |
| **Listing** (`Products.tsx`) | Reads `search` from URL; passes to `apiClient.getMarketplaceProducts({ search })`. Title shows search term when trimmed non-empty. |

### 2.2 Client → API

`getMarketplaceProducts` (`api-client.ts`): adds `search` to query string **only if** `payload.search` is truthy (`if (payload.search) params.set(...)`). Empty string is not sent; **spaces-only** strings **are** truthy in JS → could be sent if ever passed.

### 2.3 API → database

`MarketplaceService.listProducts` (`marketplace.service.ts`):

- `if (params.search) query = query.ilike("name", '%${params.search}%')`
- **Truthy check:** `""` is falsy → no filter. **`"   "`** is truthy → `ILIKE '%   %'` (degenerate / unintended).
- **Scope:** `products.name` only (already documented in `marketplace-list.contract.ts`).
- **Case:** `ILIKE` → case-insensitive for typical Latin/Unicode case folding per Postgres.

### 2.4 Sort + search interaction

- `sort` defaults to **`newest`** when omitted (`params.sort ?? "newest"`).
- Same ordering applies whether or not `search` is set: **price** or **created_at** — no relevance reordering.

### 2.5 Response shape

`GET /marketplace/products` returns `{ items, total, offset, limit }` — unchanged in M2.1 (contract stabilization, not a new DTO).

### 2.6 Gaps to close in M2.1 (not later batches)

| Gap | Issue |
|-----|--------|
| **Whitespace-only / inconsistent trimming** | URL manually edited to `search=+` or spaces can produce odd server behavior. |
| **No documented min length** | “Very short query” behavior is implicit. |
| **Header vs API normalization** | Header trims for navigation; deep links may bypass trim unless listing/API normalize. |
| **Contract scattered** | Rules split between service comment and `marketplace-list.contract.ts`; need single canonical doc + aligned code. |

---

## 3. Target contract (exact plan)

### 3.1 Search scope

- **Entities:** **Products only** (active products, active merchants — unchanged).
- **Field:** **`products.name`** only.
- **Match type:** **Case-insensitive substring** (`ILIKE` with wildcards), **no** ranking within results beyond the user’s **`sort`** choice.

### 3.2 Normalization pipeline (canonical order)

Apply **before** deciding whether search filter applies and **before** building the `ILIKE` pattern:

1. **Trim** leading/trailing whitespace from the raw `search` query parameter.
2. **Optional (recommended):** collapse consecutive **internal** whitespace runs to a **single ASCII space** (`\s+` → single space). Document if implemented; if omitted, state “internal spaces preserved” explicitly.
3. **No** other transforms: no lowercasing required for SQL (ILIKE); no NFC/NFKD; no stemming; no transliteration.

**After normalization:**

| Condition | Behavior |
|-----------|----------|
| **Empty query** | Param absent, **or** present but normalizes to **empty string** → **do not** apply name filter; listing behaves as browse (subject to `category_slug`, pagination, etc.). |
| **Whitespace-only** | After trim (and collapse if used) → empty → same as **empty query** (no search filter). |
| **Very short query** | After normalization, length **&lt; N** characters → **recommended `N = 2`:** treat as **no search filter** (same as empty). **Alternative (stricter):** `400 Bad Request` with a stable error code — pick **one** rule in implementation. Default recommendation: **no filter** (M2.4 can improve messaging). If `N = 2`, a single character does not search — document as product decision. |

*Rationale for `N = 2`:* reduces accidental single-key hits and aligns with common e-commerce guardrails without adding fuzzy logic.

### 3.3 URL contract (`/products`)

- **Canonical public search URL:** `/products?search=<string>` with optional `&category=`, `&page=`, `&sort=`.
- **No** new path; **no** redirect from `/products` to another route for search alone.
- Implementation may **normalize URL** client-side (e.g. strip empty `search`, replace `+` decoding) — detail left to implementation as long as behavior matches §3.2.

### 3.4 API contract (`GET /api/marketplace/products`)

| Item | Plan |
|------|------|
| **Parameter** | `search` (optional string). |
| **Processing** | Server applies **§3.2 normalization** so direct API clients get the same semantics as the storefront. |
| **Response** | Unchanged: `{ items, total, offset, limit }` with existing product row shape (merchant embed per existing contracts). |
| **Errors** | Only if **strict** min-length validation is chosen (optional); otherwise **200** with unfiltered or filtered listing. |

**Controller:** Continue to pass raw query string into service; **normalize inside `listProducts`** (single place of truth).

### 3.5 Frontend contract

| Surface | Plan |
|---------|------|
| **Header** | Keep “submit only when `trim()` non-empty”; optionally align displayed behavior with **§3.2** (e.g. don’t navigate if normalized length &lt; N). |
| **Products page** | When reading URL: treat search as **normalized** for display title + API call; optionally `replace` URL to canonical form (no empty `search`) — implementation detail, not required for DoD if API is authoritative. |

### 3.6 Search × sort relationship (binding)

| Question | Decision |
|----------|----------|
| Is **sort** user-controlled during search? | **Yes.** `sort` continues to apply: `newest` (default), `price-asc`, `price-desc`. |
| Default sort when `search` is present? | **Same as browse:** **`newest`** when `sort` is omitted. Search does **not** switch default to anything else. |
| Relevance sort? | **Not introduced** in M2.1 (forbidden). |

**Important user-facing implication:** Results are **not** “most relevant first”; they are **newest or price** per selection. Copy in M2.4 may clarify; M2.1 only stabilizes contract.

### 3.7 Artifacts to produce in implementation phase

| Artifact | Purpose |
|----------|---------|
| **`marketplace-search.contract.ts`** (new, backend) or extend **`marketplace-list.contract.ts`** | Single canonical comment block or exported constants: `SEARCH_FIELD`, normalization steps, `MIN_SEARCH_LENGTH`, sort+search rules. |
| **Mirror or re-export** in frontend **`src/lib/marketplace-search.types.ts`** (optional) | Shared min length / helpers if client normalizes — only if needed to avoid drift. |
| **Update `marketplace.service.ts`** | Apply normalization + min-length rule once. |
| **Tests** (if project has API/unit tests for marketplace) | Empty, whitespace-only, 1-char, 2-char, trim, `sort` + `search` combo. |

*Naming is indicative; exact files follow repo conventions.*

---

## 4. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Behavior change** for bookmarks with `search=` or 1-character queries | Medium | Document in implementation report + changelog; `N = 2` is intentional. |
| **API vs client drift** if only one side normalizes | Medium | Normalize on **server**; client optional alignment. |
| **Scope creep** (fuzzy, FTS, merchant search) | Medium | Code review against §1; reject out-of-scope PRs. |
| **Arabic/digit edge cases** for “character” length | Low | Use **JavaScript string length** / **code units** consistently; document limitation (no grapheme cluster handling in M2.1). |

---

## 5. Definition of Done (implementation phase — not yet executed)

M2.1 is **done** when:

1. **Written contract** matches §3 and lives in the repo (backend contract file updated or extended).  
2. **Backend** `listProducts` implements normalization + **very short** rule per §3.2 (single chosen alternative for validation vs no-filter).  
3. **No** new routes, **no** relevance sort, **no** fuzzy/FTS/merchant/category search.  
4. **Response shape** unchanged from current listing.  
5. **Sort** remains user-controlled with default **`newest`** when `sort` omitted, including when `search` is set.  
6. **Implementation report** + **manual verification matrix** (empty / whitespace / short / normal query × sort).  
7. **Regression notes:** any bookmark or API client relying on old whitespace-only behavior.

---

## 6. Explicitly deferred (not M2.1)

- M2.4 UX copy, empty states, “weak query” messaging polish.  
- M2.2 ranking labels and home bucket semantics.  
- Performance tuning of `ILIKE` (indexes) — optional note only if measured later (M2.8).  

---

## 7. Approval gate

Proceed to **implementation** only after:

- Product sign-off on **`N`** (min length after trim) and **strict 400 vs silent no-filter** choice.  
- Engineering sign-off that §3 is complete and frozen for this batch.
