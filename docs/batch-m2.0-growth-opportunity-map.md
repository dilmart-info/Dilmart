# Batch M2.0 — Growth Opportunity Map

Maps **audited gaps** to **planned M2 batches** (no implementation in M2.0). Use this to avoid scope creep: only pull work into the batch that owns it.

---

## 1. Search quality & semantics

| Opportunity | Pain today | Target batch |
|-------------|------------|--------------|
| Formal search contract (query rules, empty query, normalization, single-field scope) | Name-only ILIKE; inconsistent empty behavior header vs API | **M2.1** |
| Document limitations for PM/UX | Users expect “Google-like” relevance | **M2.1** + user-facing copy in **M2.4** |

---

## 2. Ranking, sort labels, and clarity

| Opportunity | Pain today | Target batch |
|-------------|------------|--------------|
| Defaults per surface (home buckets vs listing vs stores) | “مختارات فاخرة” vs `is_best_seller`; storefront newest-only | **M2.2**, **M2.3** |
| Disambiguate featured / best seller / new / offers | Same as above | **M2.2** |
| Storefront sort/pagination | 48 cap, no user sort | **M2.2** (rules) + **M2.6** (UX) |

---

## 3. Discovery & conversion surfaces

| Opportunity | Pain today | Target batch |
|-------------|------------|--------------|
| Home section order, visibility rules, empty bucket handling | Possible sparse layout; weak link to `/stores` | **M2.3** |
| `/products` search results UX, headings, filters relationship | Basic empty state; weak query | **M2.4** |
| `/stores` cards, intro, counts, sort UX | Thin cards; no total count | **M2.5** |
| `/store/:slug` hero, grid, trust, path to PDP | Cap/sort; limited persuasion | **M2.6** |
| `/product/:slug` hierarchy, CTA, suggested block | Good baseline; room for conversion tuning | **M2.7** |

---

## 4. Performance & read discipline

| Opportunity | Pain today | Target batch |
|-------------|------------|--------------|
| Home payload size; duplicate category fetches | Multiple queries + cache key fragmentation | **M2.8** |
| `ILIKE` search cost; offers filter path | Documented tech debt in service | **M2.8** |
| DTO/select tightening | Already column-restricted on many paths; re-verify under load | **M2.8** |

---

## 5. Growth hooks (foundation only)

| Opportunity | Pain today | Target batch |
|-------------|------------|--------------|
| Wishlist, recently viewed, saved search strategy | Present in app as pieces; not a unified growth story | **M2.9** |
| Campaign entry points | Not consolidated | **M2.9** |

---

## 6. Explicitly out of scope for M2 (master plan)

- Finance / commissions  
- Delivery orchestration  
- Merchant onboarding flows  
- Reviews/ratings (unless later batch)  
- SEO/sitemap expansion  
- Native apps  
- Full ML recommendations  
- Payments expansion  

---

## 7. Priority rollup (P1 from audit)

1. **M2.1** — Search contract + stable backend behavior.  
2. **M2.2** — Ranking/sort rules and label honesty.  
3. **M2.3** — Home discovery (including `/stores` entry).  
4. **M2.4** — Listing search UX & empty states.  
5. **M2.5–M2.7** — Stores, storefront, PDP conversion.  
6. **M2.8** — Browse performance discipline.  
7. **M2.9** — Growth hooks map and guardrails.
