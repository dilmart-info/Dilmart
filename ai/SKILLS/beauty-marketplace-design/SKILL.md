---
name: beauty-marketplace-design
description: Build production-grade, conversion-optimized storefront interfaces for a beauty, hair, barbering, salon-supplies, and personal-care marketplace. Use this skill whenever the user wants to design or implement ANY part of a beauty/salon/cosmetics e-commerce marketplace — homepage, category pages, product cards, product detail pages (PDP), navigation, hero sections, banners, brand pages, or full storefront layouts. Use it even when the request is phrased as "design a beauty store", "make a cosmetics website", "build a salon supplies marketplace", "كتالوج مستحضرات تجميل", "متجر حلاقة", or similar. This skill is the entry point for visual identity, layout system, component patterns, and aesthetic decisions for the storefront. Reference it before writing any storefront code.
---

# Beauty Marketplace — Master Storefront Design Skill

This skill produces storefront interfaces that compete with Ozon, Noon, Sephora, Lookfantastic, Cult Beauty, SalonCentric, and Beauty & Salon Supplies. It is the **first skill to load** for any storefront-facing work.

## 1. Mental Model: This Is Not a Boutique

A marketplace storefront is a **dense, browseable supermarket** — not a minimal D2C brand site. The number-one mistake when designing for beauty/salon supplies is mimicking luxury brand sites (Glossier, Aesop) instead of marketplaces. Marketplace shoppers want:

- **Information density** — many products visible at once
- **Decisive trust signals** — price, rating, reviews count, badges, delivery promise
- **Scannable hierarchy** — eyes flow from category → product → CTA in under 2 seconds
- **No surprises** — patterns mirror Amazon/Noon/Ozon so users feel oriented

Reject these aesthetic temptations:
- Huge hero with one product and lots of whitespace (kills conversion)
- Pastel-only palettes with no contrast (kills scannability)
- Serif-heavy "editorial" type for product cards (kills readability)
- Hidden navigation, hamburger-only menus on desktop (kills discoverability)

Embrace these instead:
- Compact, scannable product grids (4–6 cols desktop, 2 cols mobile)
- High-contrast price tags and "Add to cart" buttons
- Persistent mega-menu with category iconography
- Sticky search bar with category dropdown + autocomplete
- Visible delivery, return, and authenticity promises above the fold

## 2. Visual Identity System

The marketplace needs a **distinctive but professional** identity. The default palette below balances beauty-industry warmth with marketplace clarity. Override only when the user explicitly requests another direction.

### Color tokens (use CSS variables — never hard-code)

```css
:root {
  /* Primary — warm signature, used for CTAs, links, active states */
  --color-primary-50:  #FFF1F2;
  --color-primary-100: #FFE4E6;
  --color-primary-300: #FDA4AF;
  --color-primary-500: #E11D48;   /* main CTA */
  --color-primary-600: #BE123C;   /* CTA hover */
  --color-primary-700: #9F1239;

  /* Neutrals — text, borders, surfaces */
  --color-ink-900: #0B0B0F;       /* primary text */
  --color-ink-700: #2A2A33;
  --color-ink-500: #6B6B78;       /* secondary text */
  --color-ink-300: #C9C9D1;
  --color-ink-100: #EFEFF3;
  --color-surface:   #FFFFFF;
  --color-surface-2: #FAFAFC;     /* page background */
  --color-surface-3: #F3F3F7;     /* card hover, skeleton */

  /* Accents — used sparingly */
  --color-gold:    #B8893A;       /* premium / luxury badge */
  --color-success: #0E9F6E;       /* in-stock, verified */
  --color-warning: #F59E0B;       /* low stock, hot deal */
  --color-danger:  #DC2626;       /* sold out, error */
  --color-info:    #2563EB;       /* informational tags */

  /* Discount system */
  --color-discount-bg: #FFE4E6;
  --color-discount-fg: #BE123C;
}
```

### Typography — pair, don't pile

Pick **one display face + one UI face**. Defaults:

- **Display** (headings, hero, category titles): `"Fraunces", "Cormorant Garamond", Georgia, serif` — characterful but readable
- **UI** (everything else): `"Inter Tight", "IBM Plex Sans", system-ui, sans-serif` — tight, optical sizes, excellent at small px

For Arabic / RTL contexts, swap to:
- **Display Arabic**: `"Tajawal", "Cairo", "IBM Plex Sans Arabic", sans-serif`
- **UI Arabic**: same family — Arabic display serifs are risky at small sizes; sans-serif wins.

Type scale (modular, 1.2 ratio at small, 1.25 at large):
```
--fs-xs:   12px  / 16px
--fs-sm:   14px  / 20px
--fs-base: 15px  / 22px      ← product card body
--fs-md:   17px  / 24px
--fs-lg:   20px  / 28px
--fs-xl:   24px  / 32px
--fs-2xl:  32px  / 40px
--fs-3xl:  44px  / 52px      ← hero
--fs-4xl:  60px  / 64px
```

### Spacing & rhythm

4px base unit. Use only: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`. No arbitrary values.

### Radius & elevation

```css
--radius-sm: 6px;      /* tags, badges */
--radius-md: 10px;     /* buttons, inputs */
--radius-lg: 14px;     /* product cards */
--radius-xl: 20px;     /* modals, hero cards */
--radius-pill: 999px;

--shadow-sm: 0 1px 2px rgba(11,11,15,0.06);
--shadow-md: 0 4px 12px rgba(11,11,15,0.08);
--shadow-lg: 0 12px 32px rgba(11,11,15,0.12);
--shadow-cta: 0 6px 18px rgba(225,29,72,0.28);
```

## 3. Storefront Layout Anatomy

A high-converting beauty marketplace homepage has **these zones in this order**. Don't reorder without a reason.

```
┌─────────────────────────────────────────────────────┐
│ 1. UTILITY BAR   delivery promise · lang · currency │ 32px tall
├─────────────────────────────────────────────────────┤
│ 2. MAIN HEADER   logo · search · account · cart     │ 64–72px
├─────────────────────────────────────────────────────┤
│ 3. CATEGORY NAV  mega-menu, 10–14 top categories    │ 44px
├═════════════════════════════════════════════════════┤
│ 4. HERO SLIDER   3–5 promotional slides, autoplay   │ 360–480px
├─────────────────────────────────────────────────────┤
│ 5. CATEGORY TILES  12–20 round/square tiles, icons  │
├─────────────────────────────────────────────────────┤
│ 6. FLASH DEALS   countdown timer + horizontal scroll│
├─────────────────────────────────────────────────────┤
│ 7. NEW ARRIVALS  grid, 8–12 items                   │
├─────────────────────────────────────────────────────┤
│ 8. BRAND SPOTLIGHT  L'Oréal, Wahl, BaByliss, etc.   │
├─────────────────────────────────────────────────────┤
│ 9. SHOP BY CONCERN  hair type, skin type, etc.      │
├─────────────────────────────────────────────────────┤
│10. SALON-PRO ZONE   bulk pricing, B2B entry         │
├─────────────────────────────────────────────────────┤
│11. EDITORIAL/BLOG   3–4 articles, tutorials         │
├─────────────────────────────────────────────────────┤
│12. TRUST STRIP   authenticity · returns · payment   │
├─────────────────────────────────────────────────────┤
│13. FOOTER        4–5 columns, newsletter, app links │
└─────────────────────────────────────────────────────┘
```

For implementation specifics of each zone, see `references/homepage-anatomy.md`.

## 4. Component Patterns

The storefront is built from **~25 core components**. Each has strict rules. The full library is in `references/component-library.md`. The non-negotiable ones:

- **Product card** — see `references/product-card.md` (this is THE most important component)
- **Mega menu** — see `references/mega-menu.md`
- **Search bar with autocomplete** — see `references/search-bar.md`
- **Filter sidebar** — handled by the `beauty-search-filters` skill
- **PDP layout** — see `references/pdp-layout.md`
- **Cart drawer** — handled by the `beauty-checkout-flow` skill

## 5. Aesthetic Direction — How Not to Look Generic

Marketplaces all look similar. Differentiation comes from **micro-choices**:

1. **Custom category icons** — line-style, single-stroke, 1.5px weight, all matching. Never use generic Material Icons for category tiles.
2. **Editorial product photography frames** — slight off-white tint (`#FAFAFC`) for product images instead of pure white. Adds warmth.
3. **Distinctive discount badge shape** — a notched/torn-ticket shape, not a plain rectangle. CSS-only is fine.
4. **Hover micro-motion** — product card lifts 2px and shadow deepens over 180ms `cubic-bezier(0.2, 0.8, 0.2, 1)`. Subtle, never bouncy.
5. **Section transitions** — diagonal or curved section dividers between hero and category strip. SVG, decorative.
6. **Loading skeletons** — shimmer animated with `linear-gradient` in `--color-surface-3`. Never use spinners on product grids.

Avoid AI-slop tells: purple-pink gradients on hero, generic Unsplash beauty stock photos with the same blonde-woman-touching-her-face shot, "Lorem ipsum" subtitles, three-feature-icon rows with no real copy.

## 6. Competitive Reference Points

When in doubt, the following sites have been industry-validated for beauty marketplace UX. Study their solutions:

- **Sephora.com** — best PDP, swatches, ingredient transparency
- **Cultbeauty.com** — best editorial integration, "Concerns" navigation
- **Lookfantastic.com** — best mega-menu density
- **Noon.com (UAE)** — best Arabic RTL marketplace pattern
- **Ozon.ru** — best filter sidebar, dense grid
- **SalonCentric.com** — best B2B/pro-tier integration
- **CosmoProf.com** — best barber-supply vertical
- **Sallybeauty.com** — best loyalty-program surfacing

Do not copy. Extract the *pattern* (e.g., "Cult Beauty surfaces 'Skin Concerns' as a primary nav") and re-execute it with the visual identity above.

## 7. Workflow

When the user asks for any storefront work:

1. **Confirm scope** — Homepage? PDP? Category? Full storefront? Mobile, desktop, or both?
2. **Pick the aesthetic direction** — Use the default identity in §2 unless told otherwise. State the direction in one sentence before coding.
3. **Layout first, polish second** — Get the zone order and grid right. Then refine type, color, motion.
4. **Load the right sub-skills** — For filters → `beauty-search-filters`. For checkout → `beauty-checkout-flow`. For RTL → `beauty-i18n-rtl`. Etc.
5. **Reference the component library** — Never invent a card layout when `references/product-card.md` exists.
6. **Validate against the checklist** — see `references/launch-checklist.md` before declaring done.

## 8. Reference files (read on demand)

- `references/homepage-anatomy.md` — each zone in implementation detail
- `references/component-library.md` — all 25 core components, with code-ready specs
- `references/product-card.md` — the single most important component
- `references/mega-menu.md` — desktop nav structure & a11y
- `references/search-bar.md` — autocomplete patterns, recent searches, popular searches
- `references/pdp-layout.md` — product detail page, gallery, variants, reviews block
- `references/launch-checklist.md` — 40-point QA pass before shipping
- `references/design-tokens.css` — copy-paste-ready CSS variables
- `references/competitive-teardowns.md` — what each reference site does well & why

## 9. Hard rules — do not violate

- **No `Inter` alone as display font.** Pair it or use something more distinctive for headings.
- **No purple gradient heroes.** That is the universal "AI-made" tell.
- **No more than 3 font weights loaded** — typically 400, 500, 700.
- **No image carousels without pause-on-hover and keyboard controls.**
- **No "Add to cart" button below 44×44px tap target** — even on desktop.
- **Price must be the most visually heavy element on the product card** — heavier than the product name.
- **Star rating + review count are mandatory** on every product card. If absent in data, omit the whole rating row — never fake it.
- **Original-price strikethrough must use `<s>` or `text-decoration: line-through`** and a muted color — never red on red.
- **Stock state must be communicated within 100px of the price**, not buried in a tab.

Follow these and the storefront will already outperform 80% of beauty e-commerce in the wild.
