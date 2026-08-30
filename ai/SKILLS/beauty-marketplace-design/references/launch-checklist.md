# Launch Checklist — 40 Points

Before declaring any storefront "done", run this checklist. Each item is binary (pass/fail). Aim for 40/40.

## Visual design (10)

- [ ] Typography uses the chosen display + UI pair from SKILL.md §2; no generic Arial/Roboto fallbacks visible
- [ ] No purple→pink hero gradients anywhere (the universal AI-slop tell)
- [ ] Max 3 font weights loaded (e.g., 400/500/700)
- [ ] All colors come from CSS variables; grep finds zero `#XXXXXX` outside `design-tokens.css`
- [ ] Spacing follows the 4px scale; no `margin: 13px` etc.
- [ ] All buttons share one of the 5 variants defined in `component-library.md`
- [ ] Product cards visually match `product-card.md` (price heavier than name, stars + count, badge max 2)
- [ ] Discount badge uses the notched shape (not a plain rectangle)
- [ ] Custom category icons are consistent (same line weight, same style) — no Material Icons mixed in
- [ ] Section dividers exist where the spec calls for them (between hero and category strip, etc.)

## Layout (5)

- [ ] Homepage zone order matches `homepage-anatomy.md` §3
- [ ] Header sticks to top on scroll with subtle shadow
- [ ] Right column on PDP is sticky past the fold
- [ ] Container max-width respected at 1280px, doesn't break on ultrawide
- [ ] Section spacing is 64px desktop / 40px mobile between zones

## Responsiveness (5)

- [ ] Tested at: 360, 414, 768, 1024, 1280, 1440 widths
- [ ] Mobile layout reorders per `homepage-anatomy.md` mobile section
- [ ] Product grid: 4 cols at ≥1024px, 3 at 768–1023, 2 at <768
- [ ] No horizontal page scroll at any tested width
- [ ] Mobile sticky bottom-bar appears on PDP on scroll

## Interaction & motion (5)

- [ ] Hover states defined for: buttons, product cards, swatches, category tiles, links
- [ ] Card hover: lift 2px + shadow over 180ms `cubic-bezier(0.2, 0.8, 0.2, 1)`
- [ ] All animations respect `prefers-reduced-motion: reduce`
- [ ] Hero slider pauses on hover, focus, and reduced-motion
- [ ] No animation longer than 320ms on UI affordances

## Performance (5)

- [ ] LCP < 2.0s on simulated slow-3G
- [ ] Above-the-fold gzipped weight < 200 kb
- [ ] Below-the-fold images all use `loading="lazy"`
- [ ] Product images served in AVIF or WebP with proper srcset
- [ ] Hero LCP image preloaded with `<link rel="preload">`

## Accessibility (5)

- [ ] Color contrast: all text passes WCAG AA (4.5:1 normal, 3:1 large)
- [ ] All interactive elements reachable via keyboard
- [ ] Focus rings visible (2px primary-500 with 2px offset)
- [ ] Every image has `alt` (decorative ones use `alt=""`)
- [ ] All buttons/links have accessible names (text or `aria-label`)

## RTL / i18n (3)

- [ ] Logical CSS properties used (`padding-inline-start`, not `padding-left`)
- [ ] Layout flips correctly under `dir="rtl"`
- [ ] Arabic font stack loaded when locale = ar; English stack otherwise

## Trust & conversion (5)

- [ ] Price visible on every product card without hovering
- [ ] Star rating + review count present everywhere a product appears
- [ ] Stock state visible within 100px of price on PDP
- [ ] "Authenticity guaranteed" badge appears at least 3 times on homepage (hero, PDP trust panel, footer)
- [ ] Vendor info shown on PDP with rating + follower count

## SEO (2)

- [ ] Every PDP includes Schema.org Product JSON-LD
- [ ] Breadcrumbs use `<nav aria-label="Breadcrumb">` with `<ol>` and Schema.org breadcrumb JSON-LD

---

## How to use this checklist

Run through it linearly. The first time you fail an item, **fix it immediately** before continuing to the next — accumulated debt is exponentially harder to clear later.

If you're working on a partial scope (just the homepage, just the PDP), use only the relevant sections. But mark the rest as "N/A" explicitly — never silent.

If the user asks "is it done?", quote your score: "Currently 36/40. Failing items: …". This is more truthful than "it's done" and shows the user the trade-offs.

## What this checklist deliberately doesn't cover

- Backend API correctness — out of scope for storefront design
- Payment integration — handled in `beauty-checkout-flow`
- Inventory data model — backend concern
- Email notifications — out of scope
- Admin/vendor dashboard — handled in `beauty-vendor-dashboard`

Those have their own skill-level checklists.
