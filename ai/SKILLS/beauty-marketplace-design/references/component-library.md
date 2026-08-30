# Component Library — 25 Core Components

Every storefront UI is composed from this set. If you find yourself inventing a new component, first check whether one of these covers it.

## Table of contents

1. Button (5 variants)
2. Icon button
3. Input (text, number, email)
4. Select / Dropdown
5. Checkbox
6. Radio
7. Toggle / Switch
8. Tag / Chip
9. Badge
10. Star rating
11. Price (with discount)
12. Quantity stepper
13. Product card (see `product-card.md`)
14. Product card horizontal (cart, comparison)
15. Category tile (round image + label)
16. Brand tile
17. Section header
18. Breadcrumbs
19. Pagination
20. Sort dropdown
21. Filter chip row
22. Modal / Drawer
23. Toast / Snackbar
24. Tooltip
25. Skeleton loader

---

## 1. Button

5 variants, 3 sizes (sm/md/lg). Always 8px radius, 600 weight label.

| Variant | Use | Background | Text | Border |
|---------|-----|------------|------|--------|
| Primary | Add to cart, Buy now, Checkout | `--color-primary-500` | white | none |
| Secondary | Save, Continue shopping | `--color-ink-900` | white | none |
| Outline | Cancel, Filter, less-frequent actions | transparent | `--color-ink-900` | 1px ink-300 |
| Ghost | Subtle in-context actions | transparent | `--color-ink-700` | none |
| Danger | Remove, Delete | transparent | `--color-danger` | 1px danger |

Sizes:
- sm: 32px tall, 12px horizontal padding, 13px text
- md: 40px tall, 16px horizontal padding, 14px text
- lg: 48px tall, 24px horizontal padding, 15px text

States: hover (darken bg 8%), active (darken 12%), disabled (50% opacity, no pointer events), loading (replace label with spinner, keep width).

Min tap target on touch: 44×44 effective area (use padding, not width).

---

## 2. Icon button

Square button, icon only. 32 / 40 / 48 sizes. `aria-label` always required.

Variants: ghost (default), filled (primary-500 bg with white icon), outline.

---

## 3. Input

48px tall (44px on mobile is acceptable). 12px radius. 1px ink-300 border. Padding: 12px 16px.

States:
- Focus: border `--color-primary-500`, 3px ring `rgba(225,29,72,0.12)`
- Error: border `--color-danger`, helper text in danger
- Disabled: bg `--color-surface-3`, text ink-500

Label position: above input, 13px weight 500, ink-700. Required indicator: `*` in `--color-danger` after label.

Helper text: 12px below input. Two types: hint (ink-500) or error (danger).

Number inputs in cart use the quantity stepper (#12), not plain number input.

---

## 4. Select / Dropdown

Same shell as input. Custom chevron right side. Native `<select>` allowed on mobile (better UX); on desktop, build with `<button>` + popover for control over option styling.

Option list: max-height 320px with scroll. Each option 40px tall, hover bg `--color-surface-3`. Selected has check mark on the right.

---

## 5. Checkbox

20×20 box, 4px radius, 1.5px border `--color-ink-300`. Checked: bg `--color-primary-500`, white checkmark icon.

Tap target via wrapper: 32px tall row, full clickable. Indeterminate state supported (for "Select all" headers).

---

## 6. Radio

20×20 circle, 1.5px border `--color-ink-300`. Checked: 6px inner dot `--color-primary-500`. Same tap-target wrapper as checkbox.

---

## 7. Toggle / Switch

44×24 pill. Off: bg `--color-ink-300`, knob right. On: bg `--color-primary-500`, knob left.

Wait, RTL flip — on LTR, off-knob is on the LEFT, on-knob is on the RIGHT. On RTL it mirrors automatically via the `beauty-i18n-rtl` skill.

Use only for binary settings (notifications on/off, dark mode). Never use a switch where a checkbox is more accurate (e.g. "agree to terms" → checkbox).

---

## 8. Tag / Chip

Compact rounded pill for categorization or filter display.

- Default: bg `--color-ink-100`, text ink-700, 24px tall, 12px horizontal padding, 12px text, 999px radius
- Removable: appends an × icon, button role, removes self on click
- Active filter chip: bg `--color-primary-100`, text `--color-primary-700`

Used in: filter chip row, applied filters above results, product attributes ("vegan", "cruelty-free").

---

## 9. Badge

Tiny status pill, even smaller than a tag. 18–22px tall, 6px radius, 11px text, weight 600, uppercase, letter-spacing 0.04em.

Variants:
- discount: bg `--color-discount-bg`, text `--color-discount-fg`
- new: bg `--color-info`, text white
- bestseller: bg `--color-gold`, text white
- pro: bg `--color-ink-900`, text `--color-gold`
- success / warning / danger: matching token colors

Special shape: discount badge can use a notched "ticket" shape via CSS clip-path:
```css
clip-path: polygon(0% 0%, 92% 0%, 100% 50%, 92% 100%, 0% 100%);
```

---

## 10. Star rating

5 stars in a row. Uses one SVG star path, masked with a percentage based on rating value.

CSS-only implementation:
```css
.stars {
  --rating: 0;
  --pct: calc(var(--rating) / 5 * 100%);
  display: inline-block;
  position: relative;
  font-size: 14px;
  line-height: 1;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #B8893A var(--pct), #E5E7EB var(--pct));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.stars::before { content: "★★★★★"; }
```

Sizes: 12px (product card), 14px (lists), 18px (PDP), 24px (review summary).

---

## 11. Price (with discount)

Three-part composite:
```html
<div class="price">
  <span class="price__now">$24.99</span>
  <s class="price__was">$34.99</s>
  <span class="price__save">−29%</span>
</div>
```

- `price__now`: weight 700, 18px (card) or 24–28px (PDP). Color ink-900, or `--color-primary-600` when discount present.
- `price__was`: weight 400, 13px, color ink-500, line-through.
- `price__save`: weight 600, 12px, color `--color-discount-fg`.

For per-unit pricing on salon supplies (e.g. "$0.85 / 100ml"): show below the main price in 11px ink-500.

Currency: always use the locale-formatted string from `Intl.NumberFormat`, not hand-built `$X.XX`.

---

## 12. Quantity stepper

Three-segment control: `[ − ] [  3  ] [ + ]`.

- Total width: 96px (card) or 120px (cart)
- Buttons: 32×32, icon button style, border `--color-ink-300`
- Center number input: text-align center, no spinner buttons (`appearance: none`)
- Min: 1 (in cart) or 0 (in stock-adjust). Max: stock available.
- Disabled at boundaries with reduced opacity.

Replaces the "Add to cart" button on product card after first add. Resets if cart cleared.

---

## 14. Product card horizontal (cart, comparison)

Used in cart drawer, mini-cart, order summary.

```
┌────────┬──────────────────────────────────────────────┐
│        │ Brand · Product name                          │
│  img   │ Variant: Color · Size                         │
│  80px  │                                               │
│        │ $24.99            [− 1 +]   [🗑]               │
└────────┴──────────────────────────────────────────────┘
```

Image 80×80 (60×60 in mini-cart). Total card height ~96px. 16px padding, divider between cards.

---

## 15. Category tile (round)

96–120px round container, photo or icon centered, label below.

```css
.cat-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.cat-tile__img {
  width: 96px; height: 96px;
  border-radius: 50%;
  background: var(--color-surface-3);
  display: grid;
  place-items: center;
  transition: transform 200ms ease, background 200ms ease;
}
.cat-tile:hover .cat-tile__img {
  transform: scale(1.04);
  background: var(--color-primary-100);
}
.cat-tile__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-ink-900);
}
```

---

## 16. Brand tile

Logo on white bg, 1px ink-100 border, 12px radius. 120×80 desktop, 100×60 mobile. Grayscale → color on hover.

---

## 17. Section header

```html
<header class="section-header">
  <div>
    <h2 class="section-header__title">Flash Deals ⚡</h2>
    <p class="section-header__sub">Ends in 02:47:13</p>
  </div>
  <a class="section-header__link" href="/deals">See all →</a>
</header>
```

Title: display font, 24–32px. Subhead: 14px ink-500. Link: 14px weight 500, primary color, no underline (underline on hover).

---

## 18. Breadcrumbs

```
Home  /  Hair Care  /  Shampoo  /  Color-treated
```

13px ink-500 for all but last item. Last item: weight 500, ink-900. Separator: `/` with 8px horizontal margin. Truncate middle items with `…` on mobile if total >3 levels.

ARIA: `<nav aria-label="Breadcrumb">` with `<ol>`. Each link gets `aria-current="page"` on the last.

---

## 19. Pagination

```
‹ Prev   1   2   ...   8   9 [10] 11   ...   24   25   Next ›
```

- Each page link: 40×40 button, ghost variant
- Current page: filled primary
- Prev/Next: outline buttons with arrow icons, disabled at boundaries
- On mobile: show only Prev | "Page 10 of 25" | Next

Most marketplace search results use **infinite scroll** instead — pagination is for SEO-critical category pages.

---

## 20. Sort dropdown

Standard select. Default options for product results:
- Most popular (default)
- Newest
- Price: Low to High
- Price: High to Low
- Rating: High to Low
- Discount: Highest first

Placed top-right of results grid.

---

## 21. Filter chip row

Above the product grid, shows currently applied filters as removable chips. Plus "Clear all" link on the right.

```
Showing: [Hair Care ×] [Under $30 ×] [Sulfate-free ×] [Brand: Olaplex ×]      Clear all
```

---

## 22. Modal / Drawer

Two patterns:
- **Modal** (centered overlay): for short forms, confirmations, image lightbox
- **Drawer** (slide from side): for filters, cart, account menu

Backdrop: `rgba(11,11,15,0.5)` with `backdrop-filter: blur(2px)`.
Animation: 240ms cubic-bezier(0.2, 0.8, 0.2, 1).
Mobile drawers slide from bottom (sheet) instead of side.

Close affordances: × button top-right, ESC key, backdrop click. Focus trap inside. Restore focus on close. Body scroll lock while open.

---

## 23. Toast / Snackbar

Slides up from bottom-right (bottom-center on mobile). 3 variants: success (green), info (blue), error (red). Dismisses after 4s (success/info) or stays sticky (error). Max 3 stacked.

Example: "Added to cart — View cart →"

---

## 24. Tooltip

Triggered by hover (desktop) or long-press (mobile). 280ms delay before show, 80ms before hide. Dark background `--color-ink-900`, white text, 12px, 6px radius, 8px padding. Arrow pointing to trigger.

Only use for **supplementary** info. Critical info must not be tooltip-only.

---

## 25. Skeleton loader

Animated placeholder. Background uses the shimmer gradient.

```css
@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}
.skeleton {
  background: linear-gradient(90deg,
    var(--color-surface-3) 0%,
    var(--color-ink-100) 50%,
    var(--color-surface-3) 100%);
  background-size: 2000px 100%;
  animation: shimmer 1.6s infinite linear;
  border-radius: var(--radius-md);
}
```

Use for: image placeholders, text rows, card grids while loading. Never use a centered spinner where a skeleton fits.

---

## Component composition rules

1. **One source of truth per component.** Style with CSS variables — if 3 buttons render differently, that's 3 bugs.
2. **Composition over variants.** A "ProductCardOnSale" doesn't exist. The card receives data; the data triggers the badge.
3. **No inline styles** except for dynamic values (CSS custom properties on parent).
4. **All interactive components support keyboard.** Tab order, Enter/Space activation, Esc to dismiss.
5. **All components work without JS** for the no-JS first paint. Interactivity enhances; doesn't replace.
6. **RTL is automatic** via logical CSS properties (`padding-inline-start`, `margin-inline-end`) — never use `padding-left`/`margin-right`.
