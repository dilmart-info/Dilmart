# Competitive Teardowns — What to Copy, What to Skip

Eight reference marketplaces broken down by what they do well and what to learn from each. Use this when stuck on a design decision: see how Cult Beauty or Noon solved it, then re-execute in our visual identity.

---

## 1. Sephora.com

**Strengths to copy:**
- **Best-in-class shade swatches**: Color picker on PDP shows actual product photographed on different skin tones, not just digital color blocks. Implementation: when product has 8+ shades, group by undertone (Fair · Light · Medium · Tan · Deep) with sub-rows.
- **Ingredient transparency**: Every PDP exposes the full INCI list AND highlights "Clean at Sephora" / "Allergen-free" tags. Build the same — pull from a controlled ingredient taxonomy.
- **"Find it in store" geolocation**: For inventory products, shows local availability. Skip for pure online marketplace.

**Anti-patterns to avoid:**
- Massive logo-only header — wastes 60px of valuable above-the-fold space.
- "Beauty Insider" tier promotion is too aggressive on the PDP — keep loyalty messaging subtle.

---

## 2. Cultbeauty.com

**Strengths to copy:**
- **Concerns as primary navigation**: They surface "Skin Concerns" right next to product-type categories. This converts diagnostic shoppers far better than category trees. Replicate in our zone 9.
- **Editorial integration**: "Inside the Cult" content cards appear naturally between product sections, blending shopping with discovery.
- **Routine builder**: A guided multi-step product picker. Aspirational — implement later.

**Anti-patterns to avoid:**
- Hover-only mega menu, no tap to open. Breaks on touch laptops.

---

## 3. Lookfantastic.com

**Strengths to copy:**
- **Mega menu density**: Single mega menu shows by-category, by-brand, by-concern, AND a featured product card — all in 540px height without feeling cluttered. This is the gold standard. Mirror in `mega-menu.md`.
- **"Beauty Box" subscription integration**: A separate revenue stream surfaced subtly via a header link. Worth considering as a marketplace extension.

**Anti-patterns to avoid:**
- Excessive popups (newsletter, country selector, cookies) firing simultaneously on entry. Sequence them.

---

## 4. Noon.com (UAE marketplace)

**Strengths to copy:**
- **Best Arabic RTL implementation in e-commerce**: Every layout property mirrors correctly. Numerals stay LTR (prices, ratings, phone numbers). Mixed-direction text handled with `dir="auto"`.
- **Pricing transparency**: Shows "Inclusive of VAT" clearly. Shows international + local currency conversion. We must do the same.
- **Delivery promise on every card**: "Same-day delivery" or "Free delivery" badge appears on the product card itself, not just on PDP.
- **Express delivery zone (Noon Daily)**: Separate vertical for grocery-like fast delivery. For our marketplace, the analogue is "Salon Essentials Express" — barber/salon owners reordering daily-use products.

**Anti-patterns to avoid:**
- Too many promotional banners between product rows on the homepage; users learn to ignore them.

---

## 5. Ozon.ru (Russian giant)

**Strengths to copy:**
- **Filter sidebar density**: Filters are tightly packed (12+ visible in one viewport height) with smart defaults that surface based on category. Implement in `beauty-search-filters` skill.
- **"Add to cart" without leaving the grid**: Hovering a card reveals quantity selector inline. Reduces clicks to purchase by ~40%.
- **Product comparison**: 2–4 products side-by-side with attribute table. Includes specs, ratings, price-per-unit.
- **Honest review labels**: "Premium Review" badge on reviews from verified high-spend customers gives extra credibility.

**Anti-patterns to avoid:**
- Extremely dense type sizes (10px common). Loses elderly users entirely. Stick to ≥12px.
- Cyrillic font choices that don't translate; pick our own RTL/Arabic stack instead.

---

## 6. SalonCentric.com (Pro-only B2B)

**Strengths to copy:**
- **Pro authentication gate**: Pro pricing is locked behind license verification. Show "$XX retail / $YY pro" but require verification to unlock pro price. Mirrors what we want in zone 10.
- **Bulk pricing tables**: Quantity-based discounts shown on PDP as a small table (1–5: $X, 6–11: $Y, 12+: $Z). Critical for salon supplies.
- **Education library**: Free tutorials and certification programs as a separate section. Drives stickiness for pros.

**Anti-patterns to avoid:**
- B2C consumers feel locked out — show pro vs retail clearly so non-pros aren't confused.
- Dated visual design (lots of stock photography clutter). We can do better.

---

## 7. CosmoProf.com (Barber + Salon distribution)

**Strengths to copy:**
- **Pro school program integration**: Special pricing for cosmetology students. Mirror as a separate tier in our system.
- **Strong barbering-specific navigation**: Clippers, trimmers, blades, oils, capes — each their own sub-section. Reflects how barbers actually shop.

**Anti-patterns to avoid:**
- Cluttered homepage with 18+ banner positions. Visual hierarchy is gone.

---

## 8. Sallybeauty.com

**Strengths to copy:**
- **Color-IQ-style hair-color matching**: User selects current shade + desired shade, gets recommended products. Aspirational — implement as a phase 2 feature.
- **"Beauty Pass" loyalty surfacing**: Points balance shown in header always. Friction-free redemption at checkout.

**Anti-patterns to avoid:**
- Cluttered banners and pop-ups that interrupt browsing.

---

## Synthesis — Patterns to combine

The ideal beauty-marketplace storefront combines:

| From | Element | What we adopt |
|------|---------|---------------|
| Sephora | Shade swatches grouped by undertone | PDP color picker |
| Cult Beauty | Concerns as primary nav | Zone 9 of homepage |
| Lookfantastic | 4-column mega menu | Zone 3 mega menu |
| Noon | RTL excellence + delivery promise on card | i18n + product card |
| Ozon | Filter density + inline add-to-cart | Filters + card hover |
| SalonCentric | Pro-only pricing tier | Zone 10 + auth |
| CosmoProf | Deep barbering taxonomy | Categories |
| Sallybeauty | Color-matching diagnostic | Phase 2 feature |

What this combination gives us: a marketplace that serves consumers like Sephora, professionals like SalonCentric, and is dense/fast like Ozon — all wrapped in Cult Beauty's editorial flair and Noon's i18n maturity.

That positioning doesn't currently exist in the market. That's the differentiation.

---

## How to extract patterns

When you find yourself thinking "I'm not sure how to handle X":

1. Identify which 1–2 reference sites face the same problem
2. Open their solution (web search, or describe their pattern from memory)
3. Extract the **rule** they're applying, not the **visual**
4. Re-execute in our visual identity from `design-tokens.css`

Example: "How should I show ingredients on a PDP?"
- Reference: Sephora groups by Clean / Active / Allergen
- Rule: classify ingredients into 3–5 semantic buckets, color-code, allow click-to-detail
- Re-execute: build the same with our type system, our color tokens, our spacing

The rule survives; the visual is ours.
