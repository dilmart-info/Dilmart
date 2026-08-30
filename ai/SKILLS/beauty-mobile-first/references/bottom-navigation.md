# Bottom Navigation

The bottom nav is the most important navigation pattern on mobile commerce. It puts core destinations in the thumb zone, anchors the app's structure, and signals "this is an app, not a website."

## When to use bottom nav

Use bottom nav when:
- 3-5 top-level destinations
- Users move frequently between them
- Mobile-first or mobile-primary app
- The destinations are conceptually parallel (none is a "child" of another)

Don't use bottom nav when:
- More than 5 destinations (split into menus instead)
- Mostly read-only content (no parallel surfaces to switch between)
- Pure landing pages

## Tab structure for beauty marketplace

Standard 5-tab structure:

```
┌─────┬─────┬─────┬─────┬─────┐
│ 🏠  │ 📁  │ 🔍  │ ❤️  │ 👤  │
│Home │Shop │Srch │Wish │ Me  │
└─────┴─────┴─────┴─────┴─────┘
```

Or 4 tabs with floating cart icon:

```
┌─────┬─────┬───┬─────┬─────┐
│ 🏠  │ 📁  │   │ ❤️  │ 👤  │
│Home │Shop │   │Wish │ Me  │
└─────┴─────┴───┴─────┴─────┘
         [Cart Bag]  ← floating
```

### Tab choices

| Tab | Label | Icon | What's there |
|---|---|---|---|
| Home | "Home" / "Discover" | 🏠 | Feed: editorial, promos, personalized |
| Shop | "Shop" / "Categories" | 📁 | Category tree, mega menu equivalent |
| Search | "Search" | 🔍 | Search-first surface |
| Wishlist | "Saved" / "Wishlist" | ❤️ | Saved products, lists |
| Account | "Me" / "Account" | 👤 | Profile, orders, settings |

### Cart placement

Cart can be:
1. **Persistent icon top-right** (always visible, doesn't take a tab)
2. **Floating action button** (center, prominent)
3. **5th tab** (replacing one of above)

Best practice: **persistent top-right icon with badge**, frees up tab slot for search.

```
┌─────────────────────────────┐
│  Logo            🔔  🛍 (3) │  ← top header
│                             │
│  [page content]             │
```

## Anatomy

```
┌─────┬─────┬─────┬─────┬─────┐
│  🏠  │  📁  │  🔍  │  ❤️  │  👤  │  ← icons (24x24)
│ Home │Shop │Srch │Wish │ Me  │  ← labels (12px)
│ ━━━ │     │     │     │     │  ← active indicator
└─────┴─────┴─────┴─────┴─────┘
   ↑     ↑     ↑     ↑     ↑
  tab  tab   tab   tab   tab
```

### Specs

```css
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  
  background: var(--color-surface);
  border-top: 1px solid var(--color-neutral-200);
  
  /* Respect home indicator area on iOS */
  padding-bottom: env(safe-area-inset-bottom);
  
  display: grid;
  grid-template-columns: repeat(5, 1fr);
}

.tab {
  min-height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-block: var(--space-2);
  
  color: var(--color-neutral-500);
  font-size: 12px;
  text-decoration: none;
  
  position: relative;
}

.tab[aria-current="page"] {
  color: var(--color-primary);
}

.tab-icon {
  width: 24px;
  height: 24px;
}

.tab-label {
  margin-top: 2px;
  font-weight: 500;
}

/* Active indicator (top bar) */
.tab[aria-current="page"]::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 3px;
  background: var(--color-primary);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}
```

### Badge / notification dot

For tabs with counts (e.g., wishlist, cart):

```html
<a class="tab" href="/wishlist">
  <div class="icon-wrapper">
    <svg class="tab-icon">...</svg>
    <span class="badge" aria-label="3 items">3</span>
  </div>
  <span class="tab-label">Wishlist</span>
</a>
```

```css
.icon-wrapper {
  position: relative;
}

.badge {
  position: absolute;
  top: -4px;
  right: -8px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--color-primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: 4px;
}
```

For counts >99, show "99+".

For non-numeric notification, show a colored dot:

```css
.badge-dot {
  position: absolute;
  top: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
}
```

## Behavior

### Tap to navigate

Clear, immediate. Like browser tabs, switching is instant.

### Tap on currently active tab

When user taps the tab they're already on:
- If scrolled down → scroll to top of current page
- If at top → optionally refresh (some apps), or no-op
- For "Home" → return to root of home (not deep within)

This is a beloved iOS pattern; replicate it.

### Tab persistence

Tabs maintain their own scroll position and state:

```
User: Home tab → scrolls down → taps Shop → browses categories → taps Home
Expected: returns to scrolled position on Home, not top
```

Implementation: keep state per tab (use React Router with state preservation or similar).

### Tab navigation history

Tabs are NOT stacked in browser history. Pressing back should:
- Go BACK to the previous page WITHIN the current tab
- Only when at root of tab, exit the app (or go to previous tab)

This matches native app behavior.

## Hiding bottom nav

### Hide when scrolling down

```js
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const current = window.scrollY;
  if (current > lastScroll && current > 100) {
    bottomNav.classList.add('hidden');
  } else {
    bottomNav.classList.remove('hidden');
  }
  lastScroll = current;
});
```

```css
.bottom-nav {
  transform: translateY(0);
  transition: transform 0.2s ease;
}

.bottom-nav.hidden {
  transform: translateY(100%);
}
```

This gives more vertical space for content. Bottom nav returns on scroll up.

Caution: be careful with sticky CTAs. If bottom nav hides, sticky CTA should adjust position.

### Hide on certain screens

Some screens benefit from full immersion:
- Product detail (focused on the product, not navigation)
- Cart (focused on checkout flow)
- Checkout (definitely hide — distraction is conversion killer)
- Image gallery (full-screen mode)

### Show on certain screens (override)

- Home: always show
- Category/search results: always show
- Account: always show

## RTL handling

Bottom nav layout is LTR by default. For RTL:

```css
[dir="rtl"] .bottom-nav {
  /* Tab order flips automatically with grid */
  direction: rtl;
}

[dir="rtl"] .badge {
  right: auto;
  left: -8px;
}
```

In Arabic, the tab order typically flips:
- LTR: Home | Shop | Search | Wish | Me
- RTL: Me | Wish | Search | Shop | Home

CSS Grid handles this automatically with `direction: rtl`.

## Alternatives to bottom nav

### Top tab bar

```
┌─────┬─────┬─────┬─────┐
│ All │ New │Sale │Pro  │ ← horizontal scroll if needed
└─────┴─────┴─────┴─────┘
[content]
```

Use for filtering content WITHIN a page, not for top-level navigation. Often combined with bottom nav.

### Hamburger menu

```
┌─────────────────────────────┐
│ ☰  Logo               🛍 (3)│
├─────────────────────────────┤
```

Hidden menu, click ☰ to open drawer. Pros:
- Many menu items fit
- Cleaner UI

Cons:
- Discoverability (out of sight)
- Extra tap to access
- Doesn't show what's available

**Anti-pattern for primary navigation** on mobile commerce. Use bottom nav OR menu, not menu as primary.

Acceptable use of hamburger:
- Secondary navigation (Account submenu)
- Less-used items (help, settings)
- Combined with bottom nav (hamburger holds rarely-used items)

### Drawer/side menu

Slides in from left (LTR) or right (RTL):

```
┌──────────────┬──────────────┐
│              │              │
│  [drawer]    │  [content]   │
│              │  dimmed      │
│              │              │
└──────────────┴──────────────┘
```

Triggered by hamburger or edge-swipe. Closes on tap-backdrop or swipe-back.

### Combination

Many marketplaces use both:
- Bottom nav: Home, Shop, Search, Wishlist, Me
- Hamburger (or "Me" tab): help, settings, language, country, log out

## Accessibility

```html
<nav class="bottom-nav" role="navigation" aria-label="Primary">
  <a class="tab" href="/" aria-current="page">
    <span aria-hidden="true" class="icon">🏠</span>
    <span class="label">Home</span>
  </a>
  ...
</nav>
```

- `role="navigation"` on the nav
- `aria-label="Primary"` distinguishes from secondary nav
- `aria-current="page"` on active tab
- Icon `aria-hidden` (label provides accessible text)
- Tab order works with screen readers (TalkBack, VoiceOver)

### Larger tap targets via padding

```css
.tab {
  min-height: 56px;
  padding-block: 12px; /* extends tap target beyond visible label */
}
```

### Reduced motion

Disable animations for users with `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  .bottom-nav {
    transition: none;
  }
}
```

## Performance

- Bottom nav loaded with initial HTML (above the fold visual)
- Icons inline SVG (no extra request)
- Active state CSS-only (no JS for routing visualization)
- Total nav weight: <5KB

## Edge cases

### Keyboard open

When the on-screen keyboard appears, the bottom nav should:
- Move ABOVE the keyboard (CSS dvh helps)
- OR hide entirely (less ideal — user loses navigation)

With `interactive-widget=resizes-content` viewport, the bottom nav stays in viewport above keyboard.

### Landscape orientation

Mobile in landscape (rare for commerce, common for media):
- Bottom nav becomes ridiculously wide
- Consider hiding or transforming
- Tablet landscape often switches to sidebar

```css
@media (orientation: landscape) and (max-height: 480px) {
  /* Phone landscape — minimal vertical space */
  .bottom-nav {
    display: none;
  }
  .top-nav-replacement {
    display: flex;
  }
}
```

### Foldable phones

Galaxy Z Fold / Pixel Fold: when unfolded, treat as tablet:
- Bottom nav → sidebar
- Use container queries or feature detection

### Very small screens

iPhone SE (375px): 5 tabs with labels still fit:
- Icon 24px + label 12px = ~50px tall per tab
- 5 tabs across 375px = 75px width each → enough room

If labels truncate (long words like "Wishlist" in some languages):
- Switch to icon-only on narrowest screens
- Or use shorter labels

## Animation polish

### Active tab transition

```css
.tab {
  transition: color 0.2s ease;
}

.tab[aria-current="page"]::before {
  /* indicator slides in */
  animation: slide-in 0.2s ease-out;
}

@keyframes slide-in {
  from {
    transform: translateX(-50%) scaleX(0);
  }
  to {
    transform: translateX(-50%) scaleX(1);
  }
}
```

### Icon transitions

For tabs that have filled and outline icon variants (inactive = outline, active = filled):

```css
.tab-icon-filled {
  display: none;
}

.tab[aria-current="page"] .tab-icon-outline {
  display: none;
}

.tab[aria-current="page"] .tab-icon-filled {
  display: block;
}
```

### Badge appearance animation

When badge count increases:

```css
@keyframes badge-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

.badge.updated {
  animation: badge-pop 0.3s ease-out;
}
```

## Real-world examples

### Noon
- 5 tabs: Home, Shop, Categories, Wishlist, More
- Cart icon top-right with badge
- RTL on Arabic

### Amazon
- 5 tabs: Home, Search, Browse, Cart, Account
- Cart is a tab (high-volume action)

### Sephora
- 5 tabs: Home, Shop, Beauty (community), Beauty Insider, Me
- Search persistent in top header

### Cult Beauty
- 4 tabs + cart in nav
- Categories accessed via Shop tab as bottom sheet

## Anti-patterns

- ❌ More than 5 tabs (overload, tiny tap targets)
- ❌ Bottom nav without icons (icons aid recognition)
- ❌ Bottom nav without labels (icons alone are ambiguous, esp. for new users)
- ❌ Hiding bottom nav permanently after one scroll (jarring)
- ❌ Animated icons that distract (subtle is OK, dancing is not)
- ❌ Tab content that loads when tapped (preload all tab roots)
- ❌ Different bottom nav on different pages (consistency matters)
- ❌ Tab labels that don't match destination ("Discover" → loads "Shop")
- ❌ Active state too subtle (user can't tell where they are)
- ❌ Color-only active state (accessibility — also use shape, weight, indicator)
- ❌ Cart hidden inside Account tab (cart is high-frequency, deserves prominence)
- ❌ Bottom nav covering content (provide bottom padding equal to nav height)
