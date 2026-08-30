# Ambiguous Product Decisions

## ARD-775 — Lattafa musk listing vs Asdaaf Salamah packaging

### Option A — Preserve catalog identity (Lattafa musk oil)
- Required: verified Lattafa musk/oil packaging matching «مسك السلامه»
- Result: **HOLD** — no verified musk-oil packshot found matching the listed identity
- Evidence search: official distributor pages surface Salamah as EDP (Asdaaf), not a Lattafa musk oil

### Option B — Re-identify to Asdaaf Salamah EDP (frozen for execution prep)
- Evidence:
  1. Current packaging and Batch100 source image are ASDAAF SALAMAH EDP 100ml
  2. Official distributor listing: https://www.lattafa.my/perfumes/lattafa/salamah/
  3. Catalog Arabic «السلامه» aligns with Salamah naming
- Proposed changes (proposal-only):
  - name → `عطر سلامة من أسداف 100 مل`
  - brand → `Asdaaf`
  - category_slug → `perfumes`
  - slug → `عطر-سلامة-اسداف-100-مل-ard-775` (slug allowed **only** for ARD-775)
  - short_description → `عطر سلامة من أسداف بحجم 100 مل، أو دو بارفان للجنسين مناسب للاستخدام اليومي والمناسبات.`
  - detailed description unchanged/null
  - image → local verified Salamah packshot
- Decision: **READY_FOR_EXECUTION_REVIEW** (Option B) with `requires_human_approval=true`

## ARD-823 — 100 مل perfume vs 50ml set

- Bottle + box print **EAU DE PARFUM 50 ML**; deodorant included
- Batch100 image source path already referenced `50ml`
- No independent evidence that the merchant sellable SKU is a standalone 100ml bottle
- Decision: propose **sizes→50 مل** and name clarifying set; retain matching set image
- Status: **READY_FOR_EXECUTION_REVIEW** with human approval

## ARD-2511 — size confirmation

- Authoritative: lattafa.my CDN path `…60ml…` + bottle etch **60 ml / 2.0 FL.OZ.**
- Corroboration: Lattafa India lists Ana Abiyedh Poudrée as 60ML
- Outcome: **VERIFIED_60ML**
- Propose sizes→60 مل; identity Poudrée remains
- Status: **READY_FOR_EXECUTION_REVIEW**

## ARD-1191

- **KNOWN_HOLD** — unchanged; no proposals in this package
