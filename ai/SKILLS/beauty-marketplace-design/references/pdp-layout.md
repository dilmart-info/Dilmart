# PDP — Product Detail Page Layout

The single most important conversion page. ~50% of marketplace visits land on a PDP directly from search, social, or ads. Every element below has been validated by reference marketplaces (Sephora, Cult Beauty, Noon, Amazon Beauty).

## Above-the-fold layout (desktop ≥ 1024px)

```
Breadcrumbs: Home > Hair Care > Shampoo > L'Oréal Vitamino Color
─────────────────────────────────────────────────────────────────────

┌────────────────────────────┐    ┌────────────────────────────────┐
│  ◯ ◯ ◯ ◯ ◯  ← thumbnails  │    │  L'OREAL PROFESSIONNEL          │
│  (vertical strip)          │    │  Vitamino Color Shampoo 300ml   │
│                            │    │                                  │
│  ┌──────────────────────┐ │    │  ★★★★★ 4.7  (1,284 reviews) ↗   │
│  │                      │ │    │                                  │
│  │   MAIN PRODUCT       │ │    │  Color:  ●●● Blue · Gold · Red  │
│  │   IMAGE              │ │    │  Size:   [100ml] [300ml] [1L]   │
│  │   (zoom on hover)    │ │    │                                  │
│  │                      │ │    │  $24.99  $34.99  Save 29%       │
│  │                      │ │    │  Inclusive of VAT                │
│  └──────────────────────┘ │    │                                  │
│                            │    │  ✓ In stock  •  Authentic        │
│  [♡ Save]  [⤴ Share]      │    │  🚚 Free delivery · Tomorrow    │
└────────────────────────────┘    │                                  │
                                   │  [   −   1   +   ]              │
                                   │                                  │
                                   │  [    ADD TO CART      ]        │
                                   │  [   Buy Now           ]        │
                                   │                                  │
                                   │  ┌────────────────────────────┐ │
                                   │  │ 🛡 Authenticity guaranteed │ │
                                   │  │ ↩ 30-day returns           │ │
                                   │  │ 💬 Pro consultation        │ │
                                   │  └────────────────────────────┘ │
                                   │                                  │
                                   │  Sold by: L'Oréal Official Store│
                                   │           ★ 4.9 · 12k followers │
                                   └────────────────────────────────┘
```

Grid: 50/50 split. Gap: 48px. Max-width 1280px container with 32px side padding.

On scroll past the gallery, the right column **becomes sticky** (sticky purchase panel). Critical for long PDPs.

## Gallery column (left)

### Thumbnail strip
- Vertical on desktop (left of main image), horizontal below on tablet/mobile
- 5–8 thumbnails visible. Each 64×64. Scroll if more.
- Current thumbnail: 2px primary-500 border
- Hover: 1px ink-700 border, scale 1.02

### Main image
- Square 1:1 aspect ratio
- White or `--color-surface-2` background
- `contain` fit (never crop product)
- Hover: cursor changes to magnifier; on click, opens lightbox modal
- On hover (desktop): zoom-on-hover effect — a 1.5× zoomed pane appears to the right showing the cursor's region

### Lightbox modal
- Full-screen overlay, backdrop `rgba(11,11,15,0.92)`
- Image centered, can pan and zoom (pinch on mobile)
- Arrows to next/prev, thumbnail strip at bottom
- × close button top-right

### Video support
- If product has video, it appears as a thumbnail with ▶ play icon overlay
- Click → expands to play inline (16:9 aspect)
- Muted by default, controls visible

### Save / Share row (below gallery)
- Save button: heart icon + "Save" label
- Share button: opens native share sheet (mobile) or fallback (copy link + social icons) on desktop

## Purchase panel (right)

### Brand line
- 12px uppercase, weight 600, letter-spacing 0.08em
- Color: ink-500
- Linked to brand storefront page
- Hover: primary-600

### Product name (H1)
- Display font, 24–28px desktop, 22px mobile
- Weight 600, ink-900
- 2–3 lines max; no truncation here (this IS the product)

### Rating row
- Stars (filled per rating) + "4.7" numeric + "(1,284 reviews)" link
- Clicking the count smooth-scrolls to reviews section below
- 14px text

### Variant selectors

**Color/Shade selector** (when applicable):
- Label: "Color:" + currently selected name
- Swatches: 32×32 circle, 2px white inner ring, 1px ink-300 outer border
- Selected swatch: 2px primary-500 outer border
- Out of stock swatch: diagonal line through, 50% opacity
- Hover swatch: tooltip with shade name + "in stock" / "out of stock"

**Size/Volume selector:**
- Pill buttons: 40px tall, padding 0 16px, 1px ink-300 border
- Selected: bg ink-900, white text
- Out of stock: ink-300 text, strikethrough, no pointer

**Pro-only variants:** If user is not logged in or not pro-tier, show with a small lock icon and "Pro account required" tooltip.

### Price block

```
$24.99  $34.99  Save 29%
Inclusive of VAT
```

- Current price: 28px, weight 700, ink-900 (or primary-600 if discount)
- Original price: 17px, weight 400, ink-500, strike
- Savings: 14px, weight 600, discount-fg color
- Tax/VAT note: 12px, ink-500
- For pro accounts: show pro price below: "Pro price: $19.99 (save $5)" with `--color-gold` accent

### Stock + delivery block

Combined into a single high-trust panel:
```
✓ In stock           Authentic
🚚 Free delivery     Order in 4h 22m → tomorrow
↩ 30-day returns     Pay in 4 with [PayPal/Tabby]
```

Each line: 14px text, icon 16px, mix of success green + ink-700.

If out of stock:
```
✗ Currently unavailable
   Expected back in 2 weeks
   [ Notify me when available ]
```

### Quantity + CTAs

- Quantity stepper: 120px wide. Disabled at boundaries.
- Primary CTA: "Add to cart" — full width, 52px tall, primary background.
- Secondary CTA: "Buy now" — full width, 52px tall, ink-900 background, white text.
- On click "Add to cart": button shows spinner 400ms → success state ("✓ Added to cart"), then a mini-cart drawer slides in (handled by `beauty-checkout-flow` skill).

### Trust panel (below CTAs)
Small box, 1px ink-100 border, 12px radius:
- 🛡 Authenticity guaranteed — sourced directly from brand
- ↩ 30-day no-questions return
- 💬 Free consultation with our pros

Each line ~13px, ink-700.

### Vendor block (below trust panel)
```
Sold by: L'Oréal Official Store
         ★ 4.9 (8,442 reviews) · 12,341 followers
         [ Visit store ] [ Contact seller ]
```

The seller name links to the vendor's storefront page.

## Below-the-fold sections (in order)

### Section A: Tabs / Accordion — Product details

Tabbed on desktop, accordion on mobile.

Tabs:
1. **Description** (default open) — Marketing copy, key benefits, use cases
2. **Ingredients** — Full INCI list (CRITICAL for cosmetics). Highlight allergens/key actives. Each ingredient is a chip; click reveals what it does.
3. **How to use** — Step-by-step. Numbered list with optional illustration per step.
4. **Specifications** — Table: Volume, Origin, Shelf life, Format, EAN/UPC, SKU
5. **Reviews** (count badge) — see Section C

### Section B: Recommended add-ons / "Often bought together"

3-item bundle layout:
```
┌─────┐   ┌─────┐   ┌─────┐
│  📷  │ + │  📷  │ + │  📷  │     Total: $54.97  $69.97
│Shamp│   │Cond.│   │Mask │     Save $15
└─────┘   └─────┘   └─────┘     [ Add 3 to cart ]
```

Each item has its own check box. Total updates as items toggle.

### Section C: Reviews block

```
─────────────────────────────────────────────────────────────────
REVIEWS                                            [Write a review]

  4.7        Distribution               Filter by:
  ★★★★★     ★★★★★ ████████████ 78%    [All ▾] [With photos] [5★]
  1,284     ★★★★  ███ 14%              Sort: Most helpful ▾
            ★★★   █ 5%
  Verified  ★★    ▏ 2%
  reviews   ★     ▏ 1%

  Most mentioned: smooth (482) · color-safe (412) · scent (302)
                  smells great (281) · lasts long (244)

─── Individual reviews (paginated, 5 at a time) ───

┌────────────────────────────────────────────────────────────┐
│ ★★★★★  Verified buyer                                       │
│ Sara A.  ·  3 weeks ago  ·  Hair: curly, color-treated     │
│                                                              │
│ "Best shampoo I've used for colored hair…"                  │
│                                                              │
│ [📷] [📷]  ← review photos                                  │
│                                                              │
│ Was this helpful?  👍 (24)  👎 (1)                          │
└────────────────────────────────────────────────────────────┘
```

Review card details:
- Reviewer name (first + initial) + verified badge if purchased
- Date relative ("3 weeks ago") with absolute on hover
- Reviewer attributes (skin type, hair type) — pulls from their saved profile, optional
- Title line (review summary, weight 600)
- Body text (line-clamp 4, "Read more" reveals)
- Photos (1–4 thumbnails, click → lightbox)
- Helpfulness vote buttons

**Filters/sort:**
- All / With photos / 5★ / 4★ / 3★ / 2★ / 1★ chips
- Sort: Most helpful · Most recent · Highest rated · Lowest rated

**Pagination:** 5 reviews shown initially, "Show more reviews" button loads 5 more.

**Anti-fake-review signals:**
- "Verified buyer" badge only for users who actually purchased
- Show a moderation note: "All reviews are checked manually before publishing"

### Section D: Q&A (optional)

User-submitted questions with answers from sellers or other buyers. Pattern:
```
Q: Is this safe for keratin-treated hair?
A: Yes — sulfate-free formula is safe for keratin and Brazilian treatments.
   — L'Oréal Official  ·  2 weeks ago
```

### Section E: Recommended for you (4-column grid)

Standard product cards. Sourced from collaborative filtering ("Customers who bought this also bought…").

### Section F: Recently viewed (horizontal scroll)

Last 8 products the user has viewed. Stored in localStorage.

### Section G: From the same brand (horizontal scroll)

Other products from the same brand. Pulls 8 items, sorted by bestseller.

## Mobile layout differences

- Single column, gallery first, then purchase panel
- Sticky **bottom bar** appears on scroll past the fold:
  ```
  [Quantity stepper]  [Add to cart  $24.99]
  ```
  Bar is 64px tall, fixed to bottom, white background with top shadow.
- Tabs (Section A) become accordion
- Reviews summary section uses compact layout

## Schema.org structured data (required for SEO)

Embed JSON-LD on every PDP:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "...",
  "image": ["..."],
  "description": "...",
  "brand": { "@type": "Brand", "name": "L'Oréal Professionnel" },
  "sku": "...",
  "gtin13": "...",
  "offers": {
    "@type": "Offer",
    "price": "24.99",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "url": "..."
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "1284"
  }
}
</script>
```

## Performance budgets

- LCP element: main product image. Inline its `<link rel="preload">` and serve AVIF.
- Reviews block: lazy-loaded on scroll
- Recommended sections: lazy-loaded
- Lightbox modal HTML: not rendered until first hover/tap on main image
- Initial JS: <80kb. Defer everything non-critical.

## What NOT to do on PDP

1. **No auto-rotating product images** — disorienting and hurts mobile battery.
2. **No "Buy now" without showing a "review your order" step** — needs to feel safe even if it skips cart.
3. **No price hidden behind a login** — kills conversion; show pro price as additional info.
4. **No reviews under 3 stars hidden** — fakes credibility; users notice.
5. **No fixed CTA that overlaps the price** on mobile — leave the price visible.
6. **No "Available worldwide" without showing the actual deliverable country** — must show "Delivers to {country}" with edit link.
