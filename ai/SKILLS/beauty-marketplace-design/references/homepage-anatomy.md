# Homepage Anatomy — Implementation Detail

Each numbered zone below corresponds to the layout diagram in SKILL.md §3. This file is the implementation contract.

---

## Zone 1 — Utility Bar (32px)

Tiny, dense strip above the main header. Purpose: communicate the marketplace's universal promises and let the user switch context.

**Left side:**
- Delivery promise icon + text: "Free delivery on orders over $50"
- Or: rotating ticker of 3 promises (delivery, returns, authenticity)

**Right side:**
- Track order link
- Help / Contact link
- Currency selector (USD ▾)
- Language selector (EN ▾) — when present, RTL must flip via the `beauty-i18n-rtl` skill
- Sell on [Marketplace] link

Typography: 12px, ink-700 on surface-2 background. Hover underlines.

Mobile: collapse to a single horizontally scrolling promises ticker, no language/currency (move to drawer menu).

---

## Zone 2 — Main Header (64–72px, sticky)

The most important navigational element. Sticks to top on scroll, with a subtle shadow on stick.

```
[ LOGO ]  [ All categories ▾ ][   search input   ][🔍]  [📍 Deliver to][❤ Wishlist][👤 Account][🛒 Cart 3]
```

### Logo
- Left-aligned (right-aligned in RTL)
- SVG, monochrome, 32px tall max
- Links to homepage

### Search (the centerpiece — 50–60% of header width)
- Left segment: category dropdown ("All categories"). Width 160px. Hides on mobile.
- Middle: input. Placeholder rotates: "Search for shampoo, clippers, foundation..."
- Right segment: search button with magnifier icon. Primary color background.
- Autocomplete dropdown — see `search-bar.md`
- Mobile: input fills full width, button collapses to icon-only

### Right cluster (in order)
- **Deliver to** — shows current location/postcode. Click opens location modal.
- **Wishlist** — heart icon + count badge if > 0
- **Account** — user icon. Hover/click opens menu (Login | Register | Orders | Settings | Logout)
- **Cart** — bag icon + item count badge. Hover on desktop opens mini-cart preview (300ms delay).

All right-cluster items: 40×40 tap target, label below icon on desktop (10px), label hidden on mobile.

### Sticky behavior
- On scroll past 200px: header reduces from 72→56px, utility bar disappears, shadow appears
- Transitions: `height 200ms ease, transform 200ms ease`

---

## Zone 3 — Category Nav / Mega Menu (44px)

Horizontal bar of 10–14 top-level categories. The most-trafficked discovery surface after search.

Top-level categories for a beauty/salon marketplace (default order):

1. Hair Care
2. Hair Color
3. Hair Tools & Appliances
4. Barbering & Shaving
5. Skin Care
6. Makeup
7. Nails
8. Fragrance
9. Salon Equipment
10. Salon Furniture
11. Brands
12. Professional / Pro Zone
13. Sale
14. New In

Each top-level opens a mega-menu on hover (200ms delay) or click. Full mega-menu spec: `mega-menu.md`.

The "Sale" and "New In" links are styled distinctly:
- Sale: `--color-primary-600` text, weight 600
- New In: `--color-info` text + tiny pulse dot

---

## Zone 4 — Hero Slider (360–480px)

3–5 full-bleed promotional slides. Each slide has:
- Background image or gradient
- Headline (display font, 44–60px, max 6 words)
- Subhead (15–17px, max 12 words)
- Primary CTA button
- Optional secondary CTA

**Slider rules:**
- Autoplay 6 seconds per slide
- Pause on hover, focus, or `prefers-reduced-motion: reduce`
- Pagination dots bottom-center
- Arrows on hover (desktop) — hidden on mobile, swipe enabled
- Each slide is `<a>` to the destination; CTA buttons inside slide must stop propagation if they go elsewhere

**Content strategy:** Slide 1 = current biggest promotion. Slide 2 = new brand launch. Slide 3 = professional/B2B. Slide 4 = editorial/content. Slide 5 = app download.

**Mobile:** Height drops to 320px. Headline shrinks to 28px. Subhead optional.

---

## Zone 5 — Category Tiles (12–20 items)

Visual category browse. Each tile = round image + label.

```
┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│   ◯    │  │   ◯    │  │   ◯    │  │   ◯    │  │   ◯    │  │   ◯    │
│  img   │  │  img   │  │  img   │  │  img   │  │  img   │  │  img   │
│        │  │        │  │        │  │        │  │        │  │        │
│Shampoo │  │ Color  │  │Clippers│  │ Razors │  │Skincare│  │Makeup  │
└────────┘  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
```

- 6 columns on desktop, 4 on tablet, 3 on mobile
- Tiles wrap to multiple rows if total > one row's worth
- Circle image 96–120px, product photo on `--color-surface-3` background
- Label below: 13px weight 500, ink-900, single line, ellipsis if longer

These are *editorial* category cuts — not the full taxonomy. Pick ones with current promotional momentum. Refresh weekly.

---

## Zone 6 — Flash Deals (countdown + horizontal scroll)

The conversion engine. Time-pressured product strip.

**Header row:**
- Title: "⚡ Flash Deals" (display font, 24px)
- Live countdown: `02:47:13` (numbers in monospace, refreshes every second)
- "See all" link on the right

**Scroller:**
- Horizontal scroll, 6 products visible desktop, 2.5 mobile
- Each card is a standard product card with one addition: a deal progress bar
- Progress bar: "247 sold / 500 available" with filled bar visualizing %
- Arrows on hover (desktop), swipe (mobile)
- Snap-to-card on scroll: `scroll-snap-type: x mandatory`

**Countdown logic:** Read deal end time from data. Render once server-side, then increment via JS. On reach zero, fade the section out and refetch.

---

## Zone 7 — New Arrivals (grid, 8–12 items)

Standard product grid. Section title + "See all". 4-column grid on desktop, 2 on mobile. No special treatment beyond a small `New` badge.

---

## Zone 8 — Brand Spotlight

Logo strip of trusted brands. 8–12 brand logos in a row.

- Each logo is a link to the brand's storefront page
- Grayscale logos by default (filter: grayscale(100%))
- Hover: filter removed, color logo appears
- Background: `--color-surface-2`
- All logos normalized to same height (~48px)
- For salon supplies marketplace, the must-have brand list:
  Wahl, BaByliss Pro, Andis, Oster, Hot Tools, GHD, Dyson, Olaplex, Redken, L'Oréal Pro, Schwarzkopf, Wella, Kérastase, Matrix

---

## Zone 9 — Shop by Concern

The diagnostic entry. Tiles or cards organized around customer problems, not product categories.

For a beauty marketplace, default concerns:
- Hair: Frizz · Damage · Hair Loss · Dandruff · Curly Hair · Color-Treated
- Skin: Acne · Aging · Dryness · Sensitivity · Hyperpigmentation · Sun Care
- Salon Pro: Setup a New Salon · Barber Tools · Color Mixing · Sanitization

Each concern → curated landing page (filtered category result).

---

## Zone 10 — Salon-Pro Zone

A visually-distinct section that opens the B2B door. Dark background (`--color-ink-900`), gold accents.

Contents:
- Headline: "Professional? Unlock pro pricing & bulk discounts"
- 3 benefit pillars (icons + 1-line copy): Bulk pricing · Free delivery · Pro-only brands
- CTA: "Apply for Pro account"
- Background: subtle barber-pole or scissor pattern in `--color-gold` at 8% opacity

This zone is **the marketplace's strategic moat**. Mass-market beauty sites don't have it.

---

## Zone 11 — Editorial / Blog (3–4 articles)

Cards with hero image + category tag + title + reading time.

- Tutorials (e.g. "How to fade a beard at home in 8 steps")
- Brand stories
- Trend reports ("The 2026 nail color forecast")
- Pro tips ("Sanitization standards for barbershops")

Drives SEO and dwell time. Links to a separate `/blog/` section.

---

## Zone 12 — Trust Strip (4 columns)

4 icon + label + sub-label promises:
- **Authentic products** — "100% verified directly from brands"
- **Easy returns** — "30-day no-questions return"
- **Secure payment** — "Stripe / Apple Pay / Cash on Delivery"
- **Customer support** — "24/7 in English & العربية"

Background: `--color-surface-2`. Icons monochrome, 32px.

---

## Zone 13 — Footer

5 columns:
1. About — Company, Careers, Press, Sustainability
2. Help — Contact, FAQ, Shipping, Returns
3. Sell — Become a vendor, Pro accounts, Affiliate
4. Categories — Top 6 product categories (links)
5. Connect — Newsletter input + social icons + app store badges

Bottom strip: copyright · privacy · terms · accessibility statement · cookie settings · payment method logos.

Dark theme (`--color-ink-900` background, `--color-ink-300` text). Hover on links: white.

---

## Section spacing

Between zones: 64px desktop, 40px mobile. Within a zone: 24px between section header and content.

Section headers all share the same structure:
```
SECTION TITLE                                    See all →
display font 24–32px                              link, 14px primary
short subhead in ink-500 if needed
```

---

## Mobile zone order (when different from desktop)

On mobile, the order changes to push conversion-critical content above the fold:

1. Utility bar (compressed to ticker)
2. Header (44px tall)
3. Hero (320px)
4. Category tiles (3 cols)
5. **Flash deals** (moved up)
6. Search-by-concern carousel (moved up)
7. New arrivals
8. Brand strip (horizontal scroll)
9. Salon-pro zone
10. Trust strip
11. Editorial
12. Footer

The category nav bar (zone 3) becomes a slide-out drawer from the hamburger menu.

---

## Performance budgets per zone

| Zone | Max kb (gzipped) | Lazy-load? |
|------|------------------|------------|
| Header + utility | 20 kb | no |
| Mega menu | 8 kb | yes (open on hover) |
| Hero slider | 60 kb total (LCP image inlined first) | first slide eager, rest lazy |
| Category tiles | 40 kb (use AVIF) | yes |
| Flash deals | 30 kb | yes |
| Other product grids | varies | always lazy below fold |

Total above-the-fold target: <200 kb gzipped, LCP <2.0s on slow-3G.
