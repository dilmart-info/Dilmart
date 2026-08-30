# Logical CSS for Bidirectional Layouts

Logical CSS properties are the single most important tool for building maintainable bidirectional UIs. They free you from writing `[dir="rtl"]` overrides everywhere and let one stylesheet serve both directions correctly.

## The mental model

Physical properties refer to absolute screen positions: `left`, `right`, `top`, `bottom`.

Logical properties refer to positions relative to writing direction:
- `inline-start` — where text begins (left in LTR, right in RTL)
- `inline-end` — where text ends (right in LTR, left in RTL)
- `block-start` — where new lines begin (top in horizontal writing modes)
- `block-end` — where new lines end (bottom in horizontal writing modes)

Browser flips automatically based on `dir` attribute. Zero code change.

## Complete property mapping

### Box model

| Physical | Logical |
|---|---|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `margin-top` | `margin-block-start` |
| `margin-bottom` | `margin-block-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `padding-top` | `padding-block-start` |
| `padding-bottom` | `padding-block-end` |

Shorthand variants:
- `margin-inline: 16px` = both start and end
- `margin-inline: 16px 24px` = start, end (in that order)
- `margin-block: 8px` = both block start and end

### Borders

| Physical | Logical |
|---|---|
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `border-top` | `border-block-start` |
| `border-bottom` | `border-block-end` |
| `border-left-color` | `border-inline-start-color` |
| `border-left-width` | `border-inline-start-width` |
| `border-left-style` | `border-inline-start-style` |
| `border-top-left-radius` | `border-start-start-radius` |
| `border-top-right-radius` | `border-start-end-radius` |
| `border-bottom-left-radius` | `border-end-start-radius` |
| `border-bottom-right-radius` | `border-end-end-radius` |

Border-radius naming: `{block}-{inline}` — so `border-start-end-radius` is "block-start, inline-end" corner.

### Positioning

| Physical | Logical |
|---|---|
| `left` | `inset-inline-start` |
| `right` | `inset-inline-end` |
| `top` | `inset-block-start` |
| `bottom` | `inset-block-end` |

Shorthands:
- `inset-inline: 0` = both start and end (full width)
- `inset-block: 0` = full height
- `inset: 0` = all four sides
- `inset: 8px 16px` = block, inline (TRBL-like)

### Text

| Physical | Logical |
|---|---|
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |
| `float: left` | `float: inline-start` |
| `float: right` | `float: inline-end` |
| `clear: left` | `clear: inline-start` |
| `clear: right` | `clear: inline-end` |

### Sizing

| Physical | Logical |
|---|---|
| `width` | `inline-size` |
| `height` | `block-size` |
| `min-width` | `min-inline-size` |
| `max-width` | `max-inline-size` |

`width`/`height` still work; logical versions are for when you want explicit "this is the inline dimension."

### Overflow

| Physical | Logical |
|---|---|
| `overflow-x` | `overflow-inline` |
| `overflow-y` | `overflow-block` |

## Common patterns

### Card with icon at start

```css
.icon-card {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
}

.icon-card-icon {
  flex-shrink: 0;
  inline-size: 40px;
  block-size: 40px;
}

.icon-card-content {
  flex: 1;
  text-align: start; /* aligns with text-start */
}
```

Works in both directions without changes.

### Pill / chip with close button

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-3);
  padding-block: var(--space-1);
  border-radius: var(--radius-full);
}

.chip-close {
  margin-inline-start: var(--space-1); /* small gap from text */
  margin-inline-end: calc(-1 * var(--space-1)); /* visual hug to edge */
}
```

### Sticky position with offset

```css
.sticky-cta {
  position: sticky;
  inset-block-end: 0;
  inset-inline: 0;
  padding: var(--space-4);
}
```

### Tooltip

```css
.tooltip {
  position: absolute;
  inset-block-start: 100%;
  inset-inline-start: 0;
  margin-block-start: var(--space-1);
}

.tooltip-arrow {
  position: absolute;
  inset-block-start: -4px;
  inset-inline-start: var(--space-3);
  /* Arrow position relative to start side */
}
```

### Form field with prefix icon

```css
.input-wrapper {
  position: relative;
}

.input-icon {
  position: absolute;
  inset-inline-start: var(--space-3);
  inset-block: 50%;
  transform: translateY(-50%);
}

.input-with-icon {
  padding-inline-start: calc(var(--space-3) * 2 + 20px); /* leave space for icon */
  padding-inline-end: var(--space-3);
}
```

In LTR, icon appears on left, input padding on left. In RTL, automatically flipped.

### Drawer slide-in

```css
.drawer {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 320px;
  transform: translateX(-100%); /* slides out to start side */
  transition: transform 0.3s ease-out;
}

.drawer.open {
  transform: translateX(0);
}
```

Wait — `translateX(-100%)` is direction-physical, not logical. In RTL, this moves the drawer to the right (off-screen), which is correct because in RTL, "start" is the right edge.

Actually, `translateX(-100%)` always moves the element 100% of its width to the LEFT (physical). In RTL, the drawer is anchored to `inset-inline-start: 0` which is the RIGHT edge — so moving 100% left would still leave it visible (just shifted).

Use this pattern instead:

```css
.drawer {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 320px;
}

.drawer:not(.open) {
  /* Animate to off-screen using logical positioning */
  transform: translateX(-100%);
}

[dir="rtl"] .drawer:not(.open) {
  transform: translateX(100%); /* flip the translate */
}
```

Modern alternative — CSS `translate` longhand and logical:

```css
.drawer {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 320px;
  /* Use CSS custom property to set direction */
  transform: translateX(var(--off-x, -100%));
}

[dir="rtl"] .drawer {
  --off-x: 100%;
}

.drawer.open {
  --off-x: 0;
}
```

For new browsers, look into:
- `translate: var(--tx) var(--ty)` — separate transform property
- View Transitions API for slide animations (handles direction)

### Modal close button

```css
.modal-close {
  position: absolute;
  inset-block-start: var(--space-3);
  inset-inline-end: var(--space-3);
}
```

Close (×) always in the "far corner" — top-right in LTR, top-left in RTL.

## Direction-aware transforms

Pure transforms (`translateX`, `rotate`, etc.) are NOT direction-aware. You have to handle them manually.

### Mirroring icons

```css
.icon-back {
  /* Default arrow points LEFT (back in LTR) */
}

[dir="rtl"] .icon-back {
  transform: scaleX(-1); /* mirror to point right */
}
```

Or use SVG with `transform="scale(-1, 1)"` conditional.

Better: use directional icons that come in two variants:

```jsx
<Icon name={dir === 'rtl' ? 'chevron-left' : 'chevron-right'} />
```

Or generic "next" icon (no inherent direction shown):

```html
<span class="icon-next">→</span>
```

```css
.icon-next {
  display: inline-block;
}

[dir="rtl"] .icon-next {
  transform: scaleX(-1);
}
```

### Scrollable carousels

Scroll direction flips with RTL:

```css
.carousel {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
}
```

Works correctly with `dir="rtl"`. Items scroll right-to-left.

But: scroll position in JS uses physical pixels. `scrollLeft = 0` is the start (right edge in RTL).

```js
// Scroll to start
carousel.scrollTo({ left: 0, behavior: 'smooth' });
// Works in both directions — 0 is always start
```

Some older browsers had quirks; check with current browser matrix.

## Animations & transitions

### Slide-in animations

Use logical via CSS variables:

```css
@keyframes slide-in-from-start {
  from { transform: translateX(var(--slide-from, -100%)); }
  to { transform: translateX(0); }
}

.slide-in {
  --slide-from: -100%;
  animation: slide-in-from-start 0.3s ease-out;
}

[dir="rtl"] .slide-in {
  --slide-from: 100%;
}
```

### Page transitions with View Transitions API

```css
::view-transition-old(root) {
  animation: 0.3s ease-in slide-out-to-start;
}

::view-transition-new(root) {
  animation: 0.3s ease-out slide-in-from-end;
}

@keyframes slide-out-to-start {
  to { transform: translateX(-100%); }
}

@keyframes slide-in-from-end {
  from { transform: translateX(100%); }
}

[dir="rtl"] {
  /* Flip the animations */
}
@keyframes slide-out-to-start-rtl {
  to { transform: translateX(100%); }
}
```

## When to use `[dir="rtl"]` overrides

Logical properties cover 95% of cases. Reach for `[dir="rtl"]` overrides when:

1. **Mirroring transforms**:
   ```css
   [dir="rtl"] .arrow-icon { transform: scaleX(-1); }
   ```

2. **Custom shadow direction** (if the design demands different shadow angles per direction):
   ```css
   .card { box-shadow: 4px 4px 8px rgba(0,0,0,0.1); }
   [dir="rtl"] .card { box-shadow: -4px 4px 8px rgba(0,0,0,0.1); }
   ```

3. **Background-image positioning**:
   ```css
   .bg-pattern {
     background-image: url('pattern.png');
     background-position: left top;
   }
   [dir="rtl"] .bg-pattern {
     background-position: right top;
   }
   ```

4. **Third-party libraries** that don't support logical properties.

## Tailwind CSS

Tailwind 3.3+ supports logical utilities:

```html
<!-- Logical -->
<div class="ps-4 pe-2 ms-1 me-3 start-0 end-4 text-start">

<!-- Equivalent physical (avoid these) -->
<div class="pl-4 pr-2 ml-1 mr-3 left-0 right-4 text-left">
```

Tailwind classes:
- `ps-{n}` = padding-inline-start
- `pe-{n}` = padding-inline-end
- `pt-{n}` = padding-top (still works; rare to need block-logical)
- `pb-{n}` = padding-bottom
- `ms-{n}` / `me-{n}` = margin-inline-start/end
- `start-{n}` / `end-{n}` = inset-inline-start/end
- `text-start` / `text-end`
- `border-s` / `border-e` = border-inline-start/end

Direction-specific variants:
- `ltr:` — only LTR
- `rtl:` — only RTL

```html
<div class="rotate-0 rtl:rotate-180">
  <!-- Icon flips in RTL -->
</div>
```

## React/CSS-in-JS

### Emotion / Styled Components

```jsx
import styled from '@emotion/styled';

const Card = styled.div`
  padding-inline: 16px;
  margin-block-end: 8px;
  border-inline-start: 1px solid;
  text-align: start;
`;
```

Logical properties work out of the box.

### Stitches / Vanilla Extract / Pandasea

Same — logical properties supported in modern CSS-in-JS.

### Inline styles (avoid when possible)

```jsx
<div style={{ paddingInlineStart: '16px' }} />
```

Works in modern React (camelCase). Browsers support `padding-inline-start`.

## CSS variable trick for cross-cutting

Define base directional CSS variables:

```css
:root {
  --start: left;
  --end: right;
}

[dir="rtl"] {
  --start: right;
  --end: left;
}
```

Then use in places where logical isn't available:

```css
.gradient {
  background: linear-gradient(to var(--start), red, blue);
}
```

Note: this is escape-hatch; prefer logical properties.

## Browser support

Logical properties have **excellent** support in all modern browsers:

- Chrome/Edge: 89+ (2021)
- Firefox: 66+ (2019)
- Safari: 14+ (2020)

For older browsers (IE 11), use polyfills or fallback to physical with `[dir="rtl"]` overrides. In 2026, IE 11 is dead — don't worry about it.

## Testing

### DevTools toggle

Chrome DevTools: Rendering → Emulate CSS media `prefers-reduced-motion`, but for RTL:

1. Open DevTools
2. Elements panel
3. Find `<html dir="ltr">` → change to `<html dir="rtl">`
4. Page flips immediately

Toggle back and forth to verify both directions.

### Automated

```js
// In Cypress / Playwright
test('layout works in RTL', () => {
  cy.visit('/');
  cy.get('html').invoke('attr', 'dir', 'rtl');
  cy.matchImageSnapshot('home-rtl');
});
```

Visual regression testing per direction.

### Manual review

For every PR, check:
1. View the page in LTR — looks right?
2. Toggle `dir="rtl"` on `<html>` — still looks right?
3. Compare both screenshots side by side

## Common bugs

### Off-screen drawer

```css
/* Buggy */
.drawer {
  position: fixed;
  left: -320px; /* physical */
  transition: left 0.3s;
}
.drawer.open { left: 0; }
```

In RTL: drawer is positioned 320px LEFT of viewport (off-screen left). User can't see it. Should be positioned at start side (right edge in RTL).

Fix:
```css
.drawer {
  position: fixed;
  inset-inline-start: 0;
  transform: translateX(-100%);
  transition: transform 0.3s;
}
[dir="rtl"] .drawer {
  transform: translateX(100%);
}
.drawer.open {
  transform: translateX(0);
}
```

### Asymmetric padding

```css
/* Buggy */
.card {
  padding: 16px 24px 16px 8px; /* top right bottom left */
}
```

In RTL, the 24px ends up on the wrong side.

Fix:
```css
.card {
  padding-block: 16px;
  padding-inline: 8px 24px; /* start end */
}
```

### Hard-coded transforms

```css
/* Buggy */
.menu-button:hover {
  transform: translateX(4px); /* always moves right */
}
```

In RTL, this should move LEFT (toward inline-end is the visual direction of progression).

Fix:
```css
.menu-button:hover {
  transform: translateX(4px);
}
[dir="rtl"] .menu-button:hover {
  transform: translateX(-4px);
}
```

### Border-radius shortcuts

```css
.card {
  border-radius: 8px 0 0 8px; /* top-left, top-right, bottom-right, bottom-left */
}
```

In RTL, the rounding goes on the wrong corners.

Fix:
```css
.card {
  border-start-start-radius: 8px;
  border-end-start-radius: 8px;
}
```

Or use shorthand:
```css
.card {
  border-radius: 8px;
  border-inline-end: 8px 0;
}
```

(Note: that exact shorthand isn't standard; use longhand for clarity.)

## Anti-patterns

- ❌ Using `[dir="rtl"]` everywhere — should be the exception, not the rule
- ❌ Pixel-precise positions assuming LTR (`left: 17px`)
- ❌ Hard-coded `flex-direction: row-reverse` for RTL (use flex direction-awareness)
- ❌ Mirroring text content (Arabic doesn't read English backward)
- ❌ Forgetting to mirror icons that have direction
- ❌ Mirroring icons that DON'T have direction (e.g., a heart)
- ❌ Different positions for the same component in LTR/RTL (consistency matters)
- ❌ Testing only in LTR (every screen needs RTL pass)
- ❌ Manual RTL stylesheets (`rtl.css` separately) — maintenance nightmare
- ❌ Asymmetric design that genuinely looks different in each direction (designer should design once, accounting for both)
- ❌ Static SVGs with directional arrows but no flip variant
- ❌ JavaScript that detects language and inverts physical CSS at runtime (use CSS-only solutions)
