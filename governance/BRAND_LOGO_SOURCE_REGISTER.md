# Brand Logo Source Register

Tracks the provenance of every logo asset (or the reason none exists) for each
real product brand returned by `GET /marketplace/brands`. This register is the
audit trail behind `src/lib/brand-logo-registry.ts` — nothing is added to that
registry without a corresponding row here.

**Never** call a logo "official" unless the evidence below supports that claim.
No asset in this pack was scraped from Google Images/Pinterest/logo-download
sites, hotlinked, AI-generated, or redrawn. Every URL was fetched directly by
this research pass (`curl`, standard browser UA) — no login, no paywall.

## Legend

- **VERIFIED_OFFICIAL** — fetched directly from the brand's own primary domain.
- **VERIFIED_MANUFACTURER** — fetched directly from the manufacturer's own
  domain, or the manufacturer's identity is well evidenced but no logo file
  could be retrieved.
- **VERIFIED_AUTHORIZED_SOURCE** — an authorized distributor/catalogue page
  clearly supplied by the manufacturer.
- **IDENTITY_CONFIRMED_ASSET_NOT_FOUND** — identity is confirmed (official
  source found and read) but no usable logo file could be retrieved.
- **IDENTITY_NOT_PROVEN** — no Tier A/B source could confidently link the API
  brand name to a specific real company; the name is too generic/common, or no
  matching company was found at all.
- **ASSET_NOT_FOUND** — identity is plausible/evidenced, but no logo file was
  actually retrievable (technical block, no public asset, or the only asset
  found is unusable — e.g. white-only on this light pill).

---

## CURRENT PRODUCTION STATE (active — post Task 036 remediation)

Re-read from the live public API on 2026-08-14 (Task 037): **29 named brands**,
exact casing confirmed against `GET /marketplace/brands`, plus 236 products
with `brand = NULL` (never rendered as a brand — see §NULL below). This
section supersedes the historical 15-brand audit further down this file.

The UI is **fully API-driven** — this table (and the registry it backs) is
never hardcoded as the brand list; `GET /marketplace/brands` remains the only
source of truth for which brands exist. A missing row here just means that
brand renders its text-fallback pill, which is correct-by-design, not a bug.

| Brand (API) | Count | Identity status | Source classification | Source org / domain | Source URL | Original format | Local asset | Registry status | Visual status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Beesline | 4 | CONFIRMED_REAL_BRAND | **VERIFIED_OFFICIAL** | Beesline (Lebanon, apitherapy skincare, since 1993) | `beesline.com` | Official site CDN header asset | PNG | `src/assets/brands/beesline-logo.png` | Wired | Visible/usable | Black wordmark + bee glyph. Store's products are soaps — exact category + region match (Beesline distributes in Iraq) |
| Big Roc | 2 | Moderate (product line evidenced) | ASSET_NOT_FOUND | Manufacturer per Alibaba listings only (unconfirmed) | — | Reseller/marketplace listings only | — | *(not wired)* | Not wired | Carried forward unchanged from prior pass — no official manufacturer site found |
| Cecilia | 1 | IDENTITY_NOT_PROVEN | — | — | — | Many independent reseller listings ("Cecilia Hair Brush") | — | *(not wired)* | Not wired | Renamed from `Cecila` by Task 036's spelling fix; identity conclusion unchanged — sold by numerous unrelated retailers, no single manufacturer |
| Derby | 1 | CONFIRMED_REAL_BRAND | **VERIFIED_OFFICIAL** | Derby razor blades (Turkey, since 1939) | `derby-blades.com` | Official site header, `alt="Derby Logo"` | PNG | `src/assets/brands/derby-logo.png` | Wired | Visible/usable | Black "DERBY" wordmark. Category match: razor blades. *Note:* this product's own title reads "لايون" ("Lion"), unrelated to Derby — a pre-existing product-title data-quality issue, out of this task's scope (only `products.brand` was ever remediated, never `products.name`) |
| Dingling | 7 | High (per Task 031/032 audit) | ASSET_NOT_FOUND | Zhejiang/Shanghai Dingling Electric Appliances | `dingling.en.alibaba.com` | Manufacturer's Alibaba storefront (Tier B, CAPTCHA-blocked) | — | *(not wired)* | Not wired | Re-attempted this pass — still unreachable (connection timeout) |
| Dorco | 3 | CONFIRMED_REAL_BRAND | **VERIFIED_OFFICIAL** | Dorco Co., Ltd. (Korea, razor blades since 1955) | `dorcoglobal.com` | Official site, real vector logo | SVG | `src/assets/brands/dorco-logo.svg` | Wired | Visible/usable | Black wordmark, genuine `<path>` vector data (not a raster trace). Category match: razor blades |
| Dos Lunas | 8 | CONFIRMED_REAL_BRAND | ASSET_NOT_FOUND | Dos Lunas Cosmetics (UK-licensed co. UK00003348346, Dubai-registered) | `doslunasuae.com` / `doslunas.net` | Official site (JS-rendered SPA; no static `<img>` logo tag retrievable by direct fetch in this environment) | — | *(not wired)* | Not wired | High identity confidence — official site confirms cream/deodorant/fragrance range, exact category match to store's products. Asset retrieval blocked by client-side rendering, not by identity doubt |
| Enzo | 10 | Moderate (unchanged) | ASSET_NOT_FOUND | Guangzhou-based manufacturer (per search only, unconfirmed exact company) | `enzoita.com` (candidate, unreachable) | Manufacturer website (Tier A, unreachable) | — | *(not wired)* | Not wired | Re-attempted this pass — candidate domain still does not resolve. "Enzo" is also a very common name elsewhere; residual collision risk noted |
| Falcon | 1 | CONFIRMED_REAL_BRAND (product line) | ASSET_NOT_FOUND | Treet Corporation Ltd. (Pakistan) — "Falcon" is one of Treet's DE-blade product lines | `treetcorp.com` (parent company; no distinct Falcon-only trademark asset found) | Manufacturer confirmed via multiple independent retailer listings ("Treet Falcon" blades) | — | *(not wired)* | Not wired | Real product, exact category match (disposable razor blade). No standalone Falcon logo exists separate from Treet's own corporate mark — reusing Treet's logo here would misrepresent a product line as the parent brand (same reasoning as RAVE below) |
| Gavaro | 37 | IDENTITY_NOT_PROVEN | — | — | — | — | — | *(not wired)* | Not wired | Dedicated re-search this pass (scissors/spray/scrub context) still returned zero matches for a "Gavaro" manufacturer. Largest unresolved bucket in the current taxonomy |
| Gillette | 11 | CONFIRMED_REAL_BRAND | **VERIFIED_OFFICIAL** | Gillette (Procter & Gamble) | `gillette.com` | Official site header, `alt="gillette logo"` | PNG | `src/assets/brands/gillette-logo.png` | Wired | Visible/usable | Blue Gillette script wordmark with registered-trademark mark. Category match: razors/shaving. (Product titles transliterate as "جوليت" — an Iraqi-market colloquial spelling of Gillette, not a different brand; the brand-field assignment itself was photo-verified in Task 035/036, not re-litigated here) |
| JRL | 4 | CONFIRMED_REAL_BRAND | IDENTITY_CONFIRMED_ASSET_NOT_FOUND | JRL Professional / JRLUSA | `jrlusa.com` | Official site — confirms JRL sells single-edge razor blades (`jrlusa.com/products/single-edge-razor-blades`), exact category match | PNG (white-on-transparent) | *(not wired)* | Not wired | Only a white logo variant (`JRL_White_Logo`) was locatable on the official site — invisible on this design's light pill, per policy §9 kept on text fallback rather than recoloring the trademark |
| Kemei | 44 | High (per Task 031/032 audit) | IDENTITY_CONFIRMED_ASSET_NOT_FOUND | Yiwu Kemei Electric Appliances Co., Ltd. | `kemei.net` | Official manufacturer website | PNG (white-on-transparent) | *(not wired)* | Not wired | Carried forward unchanged — largest single brand bucket in the current taxonomy. White-on-transparent logo remains unusable on the light pill |
| Lattafa | 10 | CONFIRMED_REAL_BRAND | **VERIFIED_OFFICIAL** | Lattafa Perfumes Industries L.L.C. | `lattafa.com` | Official brand website | SVG | `src/assets/brands/lattafa-logo.svg` | Wired (unchanged since Task 031) | Visible/usable | Kept exactly as-is per Task 037 instructions — not re-verified or redrawn |
| Lord | 1 | CONFIRMED_REAL_BRAND | **VERIFIED_OFFICIAL** | LORD Co. (Solomon Holding Group, Alexandria, Egypt — razor blades since 1930) | `razorslord.com` | Official site header, real vector logo | SVG | `src/assets/brands/lord-logo.svg` | Wired | Visible/usable | Self-contained badge (blue rounded box + white "LORD" wordmark) — renders correctly on the light pill without needing an external colored background. Category match: razor blades. *Note:* this product's own title reads "WAHL" — a pre-existing product-title data-quality issue, out of this task's scope |
| Lumafofo | 1 | Low-moderate (unchanged) | IDENTITY_NOT_PROVEN | — | — | Reseller listings + an Instagram account (`@lumafofo`) | — | *(not wired)* | Not wired | Instagram alone is not a Tier A/B logo source |
| Malian | 2 | IDENTITY_NOT_PROVEN | — | — | — | — | — | *(not wired)* | Not wired | No Tier A/B source found for a "Malian" blade manufacturer |
| Mixueer | 2 | IDENTITY_NOT_PROVEN | — | — | — | Reseller listings only (e.g. Glysee) | — | *(not wired)* | Not wired | No company name or official site identified |
| Nishman | 6 | High (per Task 031/032 audit) | ASSET_NOT_FOUND | Asil Group | `nishman.com.tr` | Official brand website (Tier A, JS/bot-challenge blocked) | — | *(not wired)* | Not wired | Re-attempted this pass with a full desktop UA — still returns a bot-challenge, not the real page |
| O'me'do | 3 | IDENTITY_NOT_PROVEN | — | — | — | — | — | *(not wired)* | Not wired | Special-character brand name (apostrophes) — registry normalization, rendering, `aria-label`, URL encoding, and backend filtering were all explicitly verified this pass (see PR description §O'me'do); no manufacturer identified for the logo itself |
| O3 | 6 | IDENTITY_NOT_PROVEN | — | — | — | — | — | *(not wired)* | Not wired | Products are titled "اوزون" ("Ozone") — no scissors manufacturer of this name was found |
| Omega | 4 | CONFIRMED_REAL_BRAND | **VERIFIED_OFFICIAL** | Pennellificio Omega S.p.A. (Italy, est. 1931) | `omegabrush.com` | Official site | PNG | `src/assets/brands/omega-logo.png` | Wired | Visible/usable | Red oval "OMEGA — MADE IN ITALY" mark with Greek Ω glyph. Store's own titles literally read "اوميكا ايطالي" ("Omega Italian") — exact category + country match |
| Philips | 1 | CONFIRMED_REAL_BRAND | IDENTITY_CONFIRMED_ASSET_NOT_FOUND | Koninklijke Philips N.V. | `philips.com` | Official site (media-library/brand-desk assets sit behind a JS-driven download flow; no static logo file retrievable by direct fetch) | — | *(not wired)* | Not wired | Category plausible (replacement shaver blades). Identity is essentially certain (globally famous brand); only the asset retrieval failed |
| RAVE | 2 | High (unchanged) | ASSET_NOT_FOUND | Lattafa Perfumes Industries L.L.C. (RAVE is a Lattafa fragrance line) | `fragrantica.com/designers/RAVE.html` (identity evidence only) | Third-party fragrance database | — | *(not wired)* | Not wired | Store's `RAVE` products are titled "عطر ناو اسود"/"عطر ناو ومن" ("Rave Now"), matching Lattafa's real 2022 fragrance. Deliberately not wired to Lattafa's own logo — would misrepresent a distinct product line as the parent brand |
| SAWENSITO | 1 | Low-moderate (unchanged) | IDENTITY_NOT_PROVEN | — | — | Reseller listings only (Malaysia) | — | *(not wired)* | Not wired | No manufacturer name or official site identified |
| Velvet | 1 | IDENTITY_NOT_PROVEN | — | — | — | — | — | *(not wired)* | Not wired | Product title is a generic wax-heater accessory bowl with zero brand-name text — no identity evidence at all |
| VGR | 9 | CONFIRMED_REAL_BRAND | **VERIFIED_MANUFACTURER** | Ningbo VGR Electric Appliance Co., Ltd. | `cnvgr.com` | Official manufacturer site — legal name confirmed via the site's own structured (JSON-LD) data | PNG | `src/assets/brands/vgr-logo.png` | Wired | Visible/usable | Teal "VGR / VOYAGER" registered-trademark wordmark. Category match: hair clippers/trimmers |
| Wahl | 2 | **CONFIRMED_REAL_BRAND (narrow, changed status)** | ASSET_NOT_FOUND | Wahl Clipper Corporation | — | Task 035's direct product-photo verification (not re-attempted this pass) | — | *(not wired)* | Not wired | **Status change from the historical audit below:** after Task 036's remediation, all 339 mislabeled rows were moved off `Wahl`; the 2 rows that remain are the specific products with extraordinary photo evidence of being genuine Wahl-brand accessories (a spray bottle and a lather bowl). Identity is now **confirmed**, not contradicted. No logo work attempted this pass — Wahl was not on the Task 037 priority list, and its globally famous trademark warrants extra care for a 2-product bucket; stays on text fallback |
| Wokali | 2 | High (per Task 031/032 audit) | ASSET_NOT_FOUND | WokaLi (Zhejiang) Biotechnology Co., Ltd. | `wokali.com.cn` | Official manufacturer website (Tier A/B, unreachable) | — | *(not wired)* | Not wired | Re-attempted this pass — domain still does not resolve/connect from this environment |

### Current-state summary

| Status | Count | Brands |
|---|---|---|
| VERIFIED_OFFICIAL / VERIFIED_MANUFACTURER | 8 | Beesline, Derby, Dorco, Gillette, Lattafa, Lord, Omega, VGR |
| IDENTITY_CONFIRMED_ASSET_NOT_FOUND / ASSET_NOT_FOUND (identity evidenced, no usable file) | 12 | Big Roc, Dingling, Dos Lunas, Enzo, Falcon, JRL, Kemei, Nishman, Philips, RAVE, Wahl, Wokali |
| IDENTITY_NOT_PROVEN | 9 | Cecilia, Gavaro, Lumafofo, Malian, Mixueer, O'me'do, O3, SAWENSITO, Velvet |

**Wired into `src/lib/brand-logo-registry.ts`: 8 of 29.** The other 21 render
the existing brand-name text fallback, which is correct and by design — not a
bug. `Kemei` (44 products) and `Gavaro` (37 products) — the two largest
buckets — are both still on text fallback (a real-but-unusable logo, and an
unidentified brand, respectively); this is expected, not an oversight.

### NULL-brand products (236)

236 currently-visible products carry `brand = NULL`. `MarketplaceService.getBrands()`
explicitly filters `.not("brand", "is", null).neq("brand", "")` — a NULL-brand
product can never appear as a brand row, "Unknown" or otherwise. These products
remain fully reachable through categories, search, and general store browsing;
only the dedicated Brand rail/`/brands` page excludes them. No DB or backend
change was made or needed for this — verified against the existing code.

### Re-attempt candidates (for a future pass, not this task)

1. **Dos Lunas** — real official site confirmed, but it is a client-rendered
   SPA; a browser-rendered fetch (not a raw `curl`) would likely locate the
   header logo.
2. **Philips** — same as above; `ourbrand.philips.com`/media-library assets
   are behind a JS download flow.
3. **Nishman** — still blocked by a JS/bot challenge.
4. **Wokali** — still a DNS/connectivity failure from this environment.
5. **Dingling** — the Alibaba storefront is still CAPTCHA-walled; try a
   non-Alibaba manufacturer domain search.
6. **Kemei / JRL** — ask each manufacturer whether a dark/colored logo
   variant exists (only white-on-transparent versions were found).

---

## HISTORICAL PRE-REMEDIATION AUDIT (obsolete — kept for evidence trail only)

This section is the original register produced across Tasks 031–032, against
the **pre-Task-036 contaminated taxonomy**: 15 brand values, dominated by 341
rows incorrectly tagged `brand = 'Wahl'` (later found to be a placeholder
value covering perfumes, clippers, and other unrelated products — see
`docs/` audit trail for Tasks 033–035). Task 036 executed the approved
row-level remediation in production on 2026-08-14; the "CURRENT PRODUCTION
STATE" section above is what replaced it. **Do not use anything in this
section as current fact** — several rows below (`Cecila`, `Omedo`, `Vewet`,
and the entire `Wahl` conclusion) have since been superseded.

| Brand (API, pre-remediation) | Status | Source org / domain | Source URL | Source type | Original format | Local asset | Identity confidence | Notes |
|---|---|---|---|---|---|---|---|---|
| Lattafa | **VERIFIED_OFFICIAL** | Lattafa Perfumes Industries L.L.C. — `lattafa.com` | `https://lattafa.com/wp-content/uploads/2024/04/lattafa-logo-final-2.svg` | Official brand website (Tier A) | SVG | `src/assets/brands/lattafa-logo.svg` | High — famous UAE perfume house (est. 1980); store's `Lattafa` products are perfumes, exact category match; the fetched `<img>` carries `alt="Lattafa Perfumes"` on lattafa.com itself; gold emblem visually matches the mark printed on the store's own Lattafa product packaging photos | Real vector paths, gold `#D1A647`, portrait emblem mark (their actual header logo, not a horizontal wordmark) — this is the only row that survived unchanged into the current-state table above |
| Kemei | ASSET_NOT_FOUND | Yiwu Kemei Electric Appliances Co., Ltd. — `kemei.net` | `https://www.kemei.net/` (logo at `shopcdnalpha.grainajz.com/.../logo/....png`) | Official manufacturer website (Tier A/B) | PNG (261×83) | *(not wired)* | High | White glyphs on transparent — invisible on this design's light pill. Carried forward unchanged |
| RAVE | ASSET_NOT_FOUND | Lattafa Perfumes Industries L.L.C. (RAVE is a Lattafa fragrance line) | `https://www.fragrantica.com/designers/RAVE.html` (identity only) | Third-party fragrance database | — | *(not wired)* | High | Carried forward unchanged |
| Dingling | ASSET_NOT_FOUND | Zhejiang/Shanghai Dingling Electric Appliances Co. | `https://dingling.en.alibaba.com/` | Manufacturer's Alibaba storefront (Tier B, blocked) | — | *(not wired)* | High | Carried forward unchanged |
| Big Roc | ASSET_NOT_FOUND | (manufacturer per Alibaba listings: CN Jiangxi Xirui Manufacturing Co.) | — | Reseller/marketplace listings only | — | *(not wired)* | Moderate | Carried forward unchanged |
| Nishman | ASSET_NOT_FOUND | Asil Group — `nishman.com.tr` | `https://www.nishman.com.tr/` | Official brand website (Tier A, blocked) | — | *(not wired)* | High | Carried forward unchanged |
| Wokali | ASSET_NOT_FOUND | WokaLi (Zhejiang) Biotechnology Co., Ltd. — `wokali.com.cn` | `https://wokali.com.cn/` | Official manufacturer website (Tier A/B, unreachable) | — | *(not wired)* | High | Carried forward unchanged |
| Enzo | ASSET_NOT_FOUND | (manufacturer per search: Guangzhou-based ENZO electrical appliance factory) | `https://www.enzoita.com/` (unreachable) | Manufacturer website (Tier A, unreachable) | — | *(not wired)* | Moderate | Carried forward unchanged |
| SAWENSITO | IDENTITY_NOT_PROVEN | — | — | Reseller listings only (Malaysia) | — | *(not wired)* | Low-moderate | Carried forward unchanged |
| Lumafofo | IDENTITY_NOT_PROVEN | — | — | Reseller listings + Instagram (`@lumafofo`) | — | *(not wired)* | Low-moderate | Carried forward unchanged |
| Cecila | IDENTITY_NOT_PROVEN | — | — | Many independent reseller listings ("Cecilia Hair Brush") | — | *(not wired)* | Low | **Superseded** — renamed to `Cecilia` by Task 036; identity conclusion unchanged, see current-state table |
| Omedo | IDENTITY_NOT_PROVEN | — | — | — | — | *(not wired)* | None | **Superseded** — Task 036 split these rows into `O'me'do`; the old `Omedo` value no longer exists in production |
| Vewet | IDENTITY_NOT_PROVEN | — | — | — | — | *(not wired)* | None | **Superseded** — Task 036 corrected these rows to `Velvet`; the old `Vewet` value no longer exists in production |
| Gavaro | IDENTITY_NOT_PROVEN | — | — | — | — | *(not wired)* | None | Carried forward unchanged — see current-state table (still unresolved, now the largest bucket) |
| Wahl | ~~**IDENTITY_NOT_PROVEN — actively contradicted**~~ | — | — | This store's own product data (pre-remediation) | — | *(not wired)* | **Disproven** (at the time) | **Superseded** — this conclusion applied to the pre-remediation 341-row `Wahl` bucket, which was overwhelmingly perfumes/air-fresheners mislabeled `Wahl`. Task 036 moved 339 of those rows to their correct brands; the 2 rows now left as `Wahl` are the opposite finding — confirmed genuine Wahl accessories. See the current-state table's `Wahl` row |

