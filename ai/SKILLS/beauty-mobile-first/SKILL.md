---
name: beauty-mobile-first
description: Mobile-first design patterns, PWA implementation, touch gestures, bottom navigation, app-like transitions, and thumb-zone ergonomics for the beauty marketplace. Use this skill whenever designing or building mobile experiences, responsive layouts where mobile is primary, native-feel interactions, mobile checkout flows, offline support, app install prompts, or anything that needs to work flawlessly on phones. In MENA, mobile is 70-85% of traffic — every screen must be mobile-excellent before desktop. Trigger keywords include mobile, phone, smartphone, responsive, PWA, app, touch, swipe, gesture, bottom navigation, thumb zone, mobile-first, تصميم الجوال, الهاتف المحمول, تطبيق الويب, التنقل السفلي.
---

# Beauty Marketplace Mobile-First

In MENA, 70-85% of beauty e-commerce traffic is mobile. Many users have ONLY a phone. A "desktop site that also works on mobile" loses to a "mobile experience that also runs on desktop." Build for the phone first.

## Hard rules

1. **Mobile design completed BEFORE desktop.** No exceptions. Desktop is the responsive expansion.
2. **Touch targets ≥44×44pt** (iOS HIG) or ≥48×48dp (Material). Never smaller.
3. **Critical actions in thumb zone.** The thumb-reachable area is the bottom-center of the screen. Primary CTAs go there.
4. **Performance budget mobile: LCP <2.5s on 4G.** Slower devices and connections than you think.
5. **Native feel via gesture support.** Swipe to dismiss, pull to refresh, long-press for context — Android/iOS users expect these.
6. **PWA-ready by default.** Installable, offline shell, push notifications.
7. **Network-pessimistic.** Assume connection drops, slow loads, partial responses. Show useful state always.
8. **One-handed operation as default.** Power users use both hands; everyone should be able to do core tasks with one.

## Target devices

### iOS

- iPhone 8 / SE (smallest current screen: 375×667)
- iPhone 13 mini (375×812)
- iPhone 14 / 15 (390×844)
- iPhone Pro Max (430×932)

### Android

- Budget Android: 360×640 (still significant share in MENA)
- Mid-range: 360×800 (Samsung A-series, Xiaomi Redmi)
- Flagship: 412×915 (Pixel, Galaxy S)

### Test on the lowest

If it works on iPhone SE (375×667), it works on the rest. Design at 360-375px wide minimum.

## Reference files

| File | Purpose |
|---|---|
| `references/thumb-zones-and-touch.md` | Reachability, target sizes, gestures, haptics |
| `references/bottom-navigation.md` | Tab bar, drawer alternatives, when to use what |
| `references/mobile-checkout.md` | Single-page checkout, sticky CTA, accordion sections |
| `references/transitions-and-motion.md` | Page transitions, micro-interactions, scroll perf |
| `references/pwa-and-install.md` | Manifest, service worker, install prompt, offline shell |
| `references/network-and-offline.md` | Lie-fi, retry, cache strategy, error states |
| `references/native-app-considerations.md` | When/why native; bridge patterns; deep linking |

## Viewport setup

```html
<meta name="viewport" 
      content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
```

- `viewport-fit=cover` — content can extend to edges (notch area), use `safe-area-inset-*` CSS
- `interactive-widget=resizes-content` — when keyboard opens, content resizes (not viewport)

Always include safe-area handling:

```css
.bottom-nav {
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
}

.top-header {
  padding-top: env(safe-area-inset-top);
}
```

## Layout grid

Mobile uses single-column 12-grid (or 6-grid, simpler):

```css
.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
  padding-inline: var(--space-4);
  max-width: 100%;
}

@media (min-width: 768px) {
  .container {
    grid-template-columns: repeat(12, 1fr);
    padding-inline: var(--space-6);
  }
}
```

## Type sizes

| Element | Mobile | Tablet+ |
|---|---|---|
| H1 | 28-32px | 40-48px |
| H2 | 22-26px | 32-36px |
| H3 | 18-20px | 24-28px |
| Body | 16px | 16px |
| Small | 14px | 14px |
| Caption | 12px | 12px |

**Body never below 16px on mobile** — iOS auto-zooms inputs <16px on focus (annoying).

## Performance budget

| Metric | Target | Hard limit |
|---|---|---|
| LCP (4G) | <2.0s | <2.5s |
| FID/INP | <100ms | <200ms |
| CLS | <0.05 | <0.1 |
| TTI | <3.5s | <5s |
| First load JS | <150KB | <200KB |
| First load CSS | <30KB | <50KB |
| Image (LCP) | <100KB | <200KB |

See companion skill `beauty-performance/` for detailed performance specs.

## Critical mobile screens

Ordered by importance (every pixel matters most here):

1. **Homepage** — first impression, must hook
2. **Search/category results** — most browsing happens here
3. **Product detail page (PDP)** — conversion happens here
4. **Cart drawer** — micro-funnel
5. **Checkout** — drop-off cliff if bad
6. **Order tracking** — emotional, returned to multiple times
7. **Account** — secondary but matters

For each, design mobile FIRST. Apply desktop responsively.

## Common mobile patterns

### Sticky bottom CTA

The bottom CTA is the highest-conversion zone:

```
┌──────────────────────────┐
│                          │
│  [product content]       │
│                          │
│                          │
├──────────────────────────┤  ← Sticky bottom
│  AED 89.00               │
│  [    ADD TO CART    ]   │
└──────────────────────────┘
```

- Stays in place during scroll
- Big tap target (full width minus padding)
- Price visible left, primary CTA right (or full-width if no price)
- Honors safe-area-inset-bottom

### Pull to refresh

On lists (home, orders, search results):

```html
<div class="scroll-container" data-pull-to-refresh>
  <div class="refresh-indicator">
    <span class="arrow">↓</span>
    <span class="text">Pull to refresh</span>
  </div>
  <!-- content -->
</div>
```

Standard gesture; users expect it. Animate refresh icon during pull.

### Bottom sheet

For secondary actions (filters, share, more options):

```
┌──────────────────────────┐
│                          │
│  [page content dimmed]   │
│                          │
├──────────────────────────┤  ← sheet pops up
│  ━━                      │  ← drag handle
│                          │
│  Filter by               │
│                          │
│  [filter options]        │
│                          │
│  [   Apply  ]            │
└──────────────────────────┘
```

- Drag handle at top (visual cue + drag-to-dismiss)
- Swipe down to dismiss
- Tap backdrop to dismiss
- Heights: half (default), full (with handle to expand)

### Snap-scroll horizontal carousels

For featured products, brand strips, categories:

```css
.carousel {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  gap: var(--space-3);
  scroll-padding-inline: var(--space-4);
  padding-inline: var(--space-4);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.carousel-item {
  flex: 0 0 80vw; /* width per slide */
  scroll-snap-align: start;
}
```

- Snap-stop on each card
- Peek of next card visible (encourages scrolling)
- No visible scrollbar
- Smooth momentum on iOS via `-webkit-overflow-scrolling`

### Skeleton screens (not spinners)

While loading content:

```
┌────────────────┐
│ ░░░░░░░░░░░░░░ │  ← image skeleton
│                │
│ ░░░░░░░░░ ░░░░ │  ← title skeleton
│ ░░░░░░░░       │  ← subtitle skeleton
│                │
│ ░░░░░░         │  ← price skeleton
└────────────────┘
```

- Skeletons hint at content shape (better than spinner)
- Animate with subtle pulse (1.5s ease-in-out)
- Replace section-by-section as content arrives

### Optimistic UI

After user action, show success immediately, sync in background:

- Add to cart → cart counter increments immediately, then sync
- Like a review → heart fills immediately, then sync
- Submit form → form clears + success state, then sync

If sync fails: subtle revert + error toast with retry.

### Bottom nav (5-tab max)

```
┌─────────────────────┐
│   [content]         │
│                     │
│                     │
├──────┬──────┬───────┤
│ Home │ Cat. │ Bag · │ ← bottom nav
│  🏠  │  📁  │ 🛍 (3)│
└──────┴──────┴───────┘
```

See `bottom-navigation.md` for details.

### Search-first patterns

Mobile screens are too small for top nav. Make search prominent:

```
┌──────────────────────────┐
│  [Search products...    🔍] ← persistent, sticky
├──────────────────────────┤
│                          │
│  [content]               │
```

- Search input large enough to tap easily
- Voice search button next to search input (use Web Speech API or native)
- Recent searches dropdown

## Mobile-specific input handling

### Numeric inputs

```html
<input type="text" 
       inputmode="numeric" 
       pattern="[0-9]*" 
       autocomplete="cc-number">
```

- Triggers numeric keypad
- `inputmode` is the modern way; `pattern` for iOS Safari fallback
- `autocomplete` lets browser/password manager autofill

### Email inputs

```html
<input type="email" 
       inputmode="email" 
       autocomplete="email"
       enterkeyhint="next">
```

- Email keypad with @ shortcut
- `enterkeyhint` controls the Enter key label

### Phone inputs

```html
<input type="tel" 
       inputmode="tel" 
       autocomplete="tel-national">
```

### URL inputs

```html
<input type="url" 
       inputmode="url" 
       autocomplete="url">
```

### Disable iOS zoom on input

Inputs <16px font size cause iOS Safari to zoom in on focus. Fix with `font-size: 16px` minimum on all inputs.

Alternative (NOT recommended): `maximum-scale=1` in viewport meta — but this disables accessibility zoom.

### Keyboard avoidance

When keyboard opens, important UI must stay visible:

- Use `interactive-widget=resizes-content` viewport
- Position bottom sticky CTA above keyboard (`viewport units` or `dvh`):
  ```css
  .sticky-cta {
    position: fixed;
    bottom: 0;
    /* dvh = dynamic viewport height; adjusts to keyboard */
  }
  ```

## Touch gestures supported

| Gesture | Use |
|---|---|
| Tap | Primary action |
| Long-press (500ms) | Context menu, secondary action |
| Swipe left/right | Card carousel, dismiss notification, drawer |
| Swipe up | Reveal info, scroll to top button |
| Swipe down | Dismiss bottom sheet, refresh |
| Pinch-to-zoom | Image gallery (product photos) |
| Double-tap | Zoom in product image |
| Two-finger drag | (rarely) reorder list items |

Use libraries:
- [HammerJS](https://hammerjs.github.io/) for general gestures
- [interact.js](https://interactjs.io/) for drag/resize
- Native Web APIs (TouchEvent, PointerEvent) for fine-grained control

## Haptic feedback (where supported)

```js
if ('vibrate' in navigator) {
  navigator.vibrate(10); // brief tap
}
```

Use sparingly:
- Add to cart success: short vibration
- Error: double vibration
- Toggle: subtle tap

Many users disable in OS settings; never rely on it for critical feedback.

## App-like polish

### Page transitions

CSS view transitions (modern browsers):

```css
::view-transition-old(root) {
  animation: fade-out 0.2s ease-out;
}
::view-transition-new(root) {
  animation: fade-in 0.2s ease-in;
}
```

Or use framework router transitions:
- React Router with `<AnimatePresence>` (Framer Motion)
- Next.js Pages Router with custom transitions

Common patterns:
- PDP open: slide from right (or fade)
- PDP close: slide to right
- Modal: fade in + scale up
- Bottom sheet: slide from bottom

Don't over-do. Smooth feels good; flashy feels slow.

### Status bar styling (PWA)

```html
<meta name="theme-color" content="#E11D48">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

Match the brand color so the status bar feels integrated.

## Accessibility on mobile

- Tap targets ≥44pt (iOS), ≥48dp (Android)
- Adequate spacing between targets (≥8pt)
- Pinch-zoom NOT disabled (regression for vision-impaired users)
- Support TalkBack (Android) and VoiceOver (iOS)
- Test with: Android Dynamic Type, iOS Dynamic Type (text up to 200%)
- Color contrast: 4.5:1 minimum text, 3:1 large text

## Common mobile mistakes

- Hover-dependent UI (no hover on touch)
- Tiny text below 14px
- Inputs without inputmode
- Modal dialogs that can't be dismissed by gesture
- Long forms with no progress save
- Page reloads after every action
- Sticky header AND sticky footer eating 30% of screen
- Carousels with no peek of next card (users don't know to swipe)
- Images that don't lazy-load (data bills hurt in MENA)
- Auto-playing video with sound

## Resources

See companion skills:
- `beauty-marketplace-design/` — visual tokens, design system
- `beauty-performance/` — performance specifically
- `beauty-i18n-rtl/` — Arabic mobile considerations
- `beauty-checkout-flow/` — mobile checkout details
