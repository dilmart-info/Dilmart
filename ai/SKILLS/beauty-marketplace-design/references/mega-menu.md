# Mega Menu — Desktop Navigation

The mega menu is the single biggest desktop discovery surface after search. Build it right and the bounce rate drops 20%+.

## Trigger behavior

- Hover on category label → open after **200ms delay** (prevents accidental opens while moving cursor across the bar)
- Open instantly on keyboard focus or click
- Close on: mouse leaves entire menu area (with 150ms forgiveness), ESC key, or focus leaves menu
- Only ONE mega menu open at a time

## Visual structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HAIR CARE                                                              │
├─────────────────────────────────────────────────────────────────────────┤
│  By Concern         By Product Type        By Brand         Featured    │
│                                                                          │
│  Color Protection   Shampoos               Olaplex         ┌──────────┐ │
│  Damage Repair      Conditioners           L'Oréal Pro     │   IMG    │ │
│  Frizz Control      Masks & Treatments     Redken          │          │ │
│  Hair Loss          Leave-in Treatments    Kérastase       │  Promo   │ │
│  Curly Hair         Oils & Serums          Schwarzkopf     │  banner  │ │
│  Color-Treated      Styling Creams         Matrix          │          │ │
│  Sensitive Scalp    Hair Sprays            Wella           └──────────┘ │
│  Volume             Heat Protectants                                     │
│                                                                          │
│  → See all Hair Care                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

Width: full container width (~1280px), not 100vw. Aligned to the trigger label's container.
Height: auto, but max-height 540px with internal scroll if exceeded.
Background: white, shadow-lg, 16px radius bottom corners only.
Padding: 32px.

## Column structure

3–4 link columns + 1 featured slot (image or promo). The featured slot displays:
- A current promotion image (e.g. "Olaplex No.7 Bonding Oil — 20% off")
- Or an editorial article preview
- Or a "Top sellers in this category" mini-grid

Refresh the featured slot per category — never the same image across categories.

## Link styling

- Column header: 12px uppercase, weight 600, letter-spacing 0.08em, ink-500
- Links: 14px weight 400, ink-900
- Hover: ink-900 → primary-600, underline appears
- Active (current page): primary-600, weight 500
- 8px vertical gap between links

## Footer link

`→ See all {Category}` link at the bottom-left of the mega menu, primary color, weight 600. Always present.

## Top-level category bar (the trigger row)

Located in zone 3 of homepage layout. Each top-level item:

```html
<button class="catnav__item" aria-expanded="false" aria-haspopup="true" aria-controls="mm-haircare">
  Hair Care
</button>
```

- 14px text, weight 500, ink-900
- Padding: 12px 16px
- Hover/open state: background `--color-surface-3`, border-bottom 2px primary-500
- Special items (Sale, New In) have colored text per `homepage-anatomy.md`

## Mobile equivalent — Drawer menu

Hamburger icon in header opens a left drawer (right in RTL). Two-level navigation:

**Level 1 (visible on open):**
```
┌─────────────────────────┐
│ Hi, Sign in / Register  │
├─────────────────────────┤
│ Hair Care            ›  │
│ Hair Color           ›  │
│ Hair Tools           ›  │
│ Barbering            ›  │
│ Skin Care            ›  │
│ Makeup               ›  │
│ ...                     │
├─────────────────────────┤
│ Sale                    │
│ New In                  │
│ Pro Zone                │
├─────────────────────────┤
│ Track order             │
│ Help & Contact          │
│ Language: EN  ›         │
│ Currency: USD ›         │
└─────────────────────────┘
```

**Level 2 (sub-category, slides in from right):**
```
┌─────────────────────────┐
│ ‹ Hair Care             │
├─────────────────────────┤
│ Shop all Hair Care      │
├─────────────────────────┤
│ By Concern           ›  │
│ By Product Type      ›  │
│ By Brand             ›  │
└─────────────────────────┘
```

**Level 3 (concern/type list):**
```
┌─────────────────────────┐
│ ‹ By Concern            │
├─────────────────────────┤
│ Color Protection        │
│ Damage Repair           │
│ Frizz Control           │
│ ...                     │
└─────────────────────────┘
```

Animation: 240ms slide, no fade.

## Accessibility

- `role="menubar"` on the top-level bar, `role="menu"` on each mega menu, `role="menuitem"` on each link
- Arrow keys: Left/Right on top bar, Up/Down within open menu
- `Enter` opens the menu on focus, `Esc` closes
- Focus indicators visible at all times when navigating by keyboard
- The trigger button's `aria-expanded` state must reflect open/closed
- Backdrop screen-reader-text "Press Escape to close menu"

## Performance

- Mega menu HTML is in the DOM but `display: none` until first hover
- All images inside the featured slot lazy-loaded
- Don't fetch sub-category data on render — bundle the most common 8 sub-cat lists in the initial HTML

## Anti-patterns to avoid

1. **No hover-intent libraries** — a simple 200ms `setTimeout` is enough.
2. **No mega menu open by default on page load** — adds CLS, scares users.
3. **No mega menu that takes full viewport width** — looks amateur and crashes on ultrawide screens.
4. **No animation longer than 200ms on open/close** — feels slow.
5. **No links that aren't real `<a>` elements** — must be ctrl+click middle-clickable.
