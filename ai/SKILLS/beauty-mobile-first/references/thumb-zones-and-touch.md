# Thumb Zones, Touch Targets & Gestures

The thumb is the primary input device on mobile. Designing for the thumb's natural reach determines whether users can actually use your interface one-handed — which they want to, and often must (groceries in the other hand, kid on the hip, etc.).

## The thumb-zone model

Steven Hoober's research on mobile grip patterns yields three zones:

```
┌─────────────────┐
│   STRETCH       │  ← top of screen (uncomfortable for thumb)
│                 │
│   STRETCH       │
├─────────────────┤
│                 │
│   OK            │  ← middle (acceptable reach)
│                 │
├─────────────────┤
│                 │
│   NATURAL       │  ← bottom (most comfortable, "thumb zone")
│                 │
└─────────────────┘
        ↑
   thumb pivots from here
```

### Implications

| Zone | Use for |
|---|---|
| **Natural (bottom 1/3)** | Primary actions: Add to cart, Buy now, Next |
| **OK (middle 1/3)** | Content interaction: tap to expand, secondary actions |
| **Stretch (top 1/3)** | Branding, search bar (less frequent taps), close button |

### Handedness

Most users (~80-90%) hold phone in one hand and operate with thumb on the same side. Designs should NOT assume:
- Always right-hand (left-handers exist; right-handers sometimes switch)
- Both hands (often only one)

Solution: keep primary CTAs centered horizontally (or full-width) so they're reachable by either thumb.

### Phone size matters

On phones like iPhone 15 Pro Max (430×932px), even "natural zone" is too tall for full thumb reach without re-gripping. iOS users use Reachability (double-tap home indicator) to slide content down — design with awareness that very top of large phones is genuinely uncomfortable.

## Touch target sizes

### Minimum sizes

| Standard | Size |
|---|---|
| iOS HIG | 44×44 points |
| Material Design | 48×48 dp |
| WCAG 2.5.5 (AAA) | 44×44 CSS pixels |
| Microsoft | 9mm diameter (~34px) |

**Use 44px minimum for everything.** For critical actions, prefer 48-56px.

### Visual size vs hit area

The visual element can be smaller than the hit area:

```css
.icon-button {
  width: 24px;          /* visual icon */
  height: 24px;
  padding: 12px;        /* invisible padding extends tap target */
  /* total tap area: 48x48 */
}
```

This keeps interfaces visually light while remaining touch-friendly.

### Spacing between targets

Minimum 8px gap between tappable elements. Tighter than this and users tap the wrong thing.

Exception: lists where each row is a single tap target. Then the row itself is the target, no internal subtargets.

## Specific elements

### Buttons

```css
.btn {
  min-height: 48px;
  min-width: 48px;
  padding-inline: var(--space-4);
  padding-block: var(--space-3);
  font-size: 16px;
  border-radius: var(--radius-md);
}

.btn-large {
  min-height: 56px;
  font-size: 18px;
  font-weight: 600;
}

.btn-icon {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

### Form inputs

```css
.input {
  min-height: 48px;
  font-size: 16px; /* prevents iOS zoom */
  padding-inline: var(--space-3);
  padding-block: var(--space-3);
}
```

### Links inline in text

Even inline links should be tappable:

```css
.prose a {
  /* ensure line-height makes link tappable */
  padding-block: 4px;
  text-decoration: underline;
  text-underline-offset: 4px;
}
```

### Checkbox / radio

The label should extend the tap area:

```html
<label class="checkbox-label">
  <input type="checkbox" />
  <span class="text">I agree to terms</span>
</label>
```

```css
.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 48px;
  padding-block: var(--space-2);
  cursor: pointer;
}

.checkbox-label input {
  width: 24px;
  height: 24px;
}
```

The whole row is tappable, not just the small checkbox.

### Toggle switches

```css
.switch {
  width: 56px;
  height: 32px;
  /* visually compact but touchable */
}

.switch-wrapper {
  /* outer wrapper adds tap area */
  display: inline-flex;
  padding: 8px;
  cursor: pointer;
}
```

### Dropdowns / select

Native `<select>` triggers OS picker on mobile — preferable to custom dropdowns for most cases:

```html
<select class="select">
  <option>Choose size</option>
  <option>30ml</option>
  <option>50ml</option>
</select>
```

Custom dropdowns must:
- Tap target ≥48px
- Open as bottom sheet (not floating menu)
- Have visible drag-to-dismiss handle
- Support keyboard navigation if user has external keyboard

### Tab bars

```css
.tab-bar {
  display: flex;
}

.tab {
  flex: 1; /* equal width */
  min-height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-block: var(--space-2);
}

.tab-icon {
  width: 24px;
  height: 24px;
}

.tab-label {
  font-size: 12px;
  margin-top: 2px;
}
```

## Gesture vocabulary

Each gesture has user expectations. Learn them; don't reinvent.

### Tap

- Single primary action
- 100ms delay typical between tap and visual feedback (use 0ms — feels instant)
- Touch feedback: subtle background change, ripple (Material), or none (iOS-like)

### Long-press

- Context menu, secondary actions
- 500-700ms hold required (OS-typical)
- Feedback at 200ms (visual cue something's happening)
- Vibration on activation (10ms)

Example: long-press a product card → quick menu with "Add to wishlist", "Hide", "Share"

### Swipe horizontal

- Card carousels (left/right)
- Dismiss notifications (right or left)
- Reveal actions (swipe row left to expose delete)
- Tabs (swipe between tab content)

Threshold: 50px movement = commit to swipe.

### Swipe vertical

- Pull-to-refresh (top, swipe down)
- Dismiss bottom sheet (top of sheet, swipe down)
- Scroll-to-top (some apps; rare)

### Pinch

- Image zoom only
- Don't use for navigation (too easy to trigger accidentally)

### Double-tap

- Image zoom (PDP gallery)
- Don't overload — single tap should be primary action

### Edge swipe

- iOS back swipe (swipe from left edge to go back)
- Don't override — users rely on it
- For modals, use swipe-down to dismiss instead

## Implementation patterns

### Tap with active state

```css
.btn {
  background: var(--color-primary);
  transition: background 0.1s;
}

.btn:active {
  background: var(--color-primary-700);
  transform: scale(0.98); /* subtle press effect */
}

/* Remove tap highlight on iOS */
.btn {
  -webkit-tap-highlight-color: transparent;
}
```

### Active state for cards (whole row tappable)

```css
.card {
  cursor: pointer;
  transition: background 0.1s;
}

@media (hover: hover) {
  .card:hover {
    background: var(--color-neutral-50);
  }
}

.card:active {
  background: var(--color-neutral-100);
}
```

Use `@media (hover: hover)` to apply hover ONLY where hover is supported (desktop). On touch, `:active` triggers instead.

### Long-press detection

```js
let pressTimer;
const target = document.querySelector('.long-pressable');

target.addEventListener('touchstart', (e) => {
  pressTimer = setTimeout(() => {
    // Long press triggered
    if ('vibrate' in navigator) navigator.vibrate(10);
    openContextMenu(e.target);
  }, 500);
});

target.addEventListener('touchend', () => clearTimeout(pressTimer));
target.addEventListener('touchmove', () => clearTimeout(pressTimer));
target.addEventListener('touchcancel', () => clearTimeout(pressTimer));
```

Better: use a library like Hammer.js to handle edge cases.

### Swipeable cards (e.g., dismissible notifications)

```js
import Hammer from 'hammerjs';

const card = document.querySelector('.card');
const hammer = new Hammer(card);

hammer.on('swipeleft', () => {
  card.style.transform = 'translateX(-100%)';
  card.style.opacity = '0';
  setTimeout(() => card.remove(), 200);
});
```

For complex swipe-to-action patterns (Gmail-style):
- Show colored background under card
- Card translates with finger
- Past threshold → commit action
- Below threshold → snap back

### Pinch-to-zoom on images

For product images, use a library:
- [PhotoSwipe](https://photoswipe.com/) — lightbox with pinch zoom
- [react-zoom-pan-pinch](https://github.com/prc5/react-zoom-pan-pinch) — React version

Native pinch zoom via CSS `touch-action: pan-x pan-y pinch-zoom` is possible but error-prone.

## Haptic feedback

### Web Vibration API

```js
function tap() { navigator.vibrate?.(10); }
function success() { navigator.vibrate?.([10, 50, 10]); }
function error() { navigator.vibrate?.([50, 100, 50]); }
```

Limitations:
- Android only (iOS Safari doesn't support Vibration API)
- User can disable in OS settings
- Doesn't trigger from iframes

### When to use

- Add to cart: light tap (10ms)
- Toggle on/off: nothing or very light
- Long-press activation: medium tap (20ms)
- Success state: brief pattern
- Error state: longer pattern

### When NOT to use

- Repeatedly (annoying)
- For decoration (e.g., page transitions)
- For passive notifications (let OS handle)
- Without user consent (some users explicitly turn off, respect it)

## Reachability for large phones

iPhone Pro Max and large Androids have screens too tall for full thumb reach. Solutions:

### Bottom-anchor important actions

Don't put primary CTAs at the top of long forms; the user can't tap them after scrolling. Use sticky bottom CTAs.

### Pull-down sections

Some apps (Twitter, Instagram) implement pull-down to access:
- Profile menu (pull down on home)
- Search (pull down on lists)

User uses thumb to pull, then taps revealed UI in natural zone.

### "Reachability" mimics

```html
<button class="reach-up" aria-label="Bring content closer">
  <svg>...</svg>
</button>
```

Tap → translate content down by 50% so top elements are reachable. Rarely needed.

## Drag-and-drop on mobile

Touch-based drag is finicky. Use sparingly:

- Reorder list items: long-press to grab, drag to reorder
- Filter chips: swipe to remove
- Image upload: drag images into upload zone (works less well than tap-to-pick)

Use HTML5 drag-and-drop with polyfill for mobile, or libraries like `react-beautiful-dnd`.

## Accidental tap prevention

For destructive or expensive actions (delete, place order), use:

### Confirmation modals

```
Delete this address?
This can't be undone.

[ Cancel ]   [ Delete ]
```

### Hold to confirm

```
[ Hold to delete ]  ← user holds for 1s
```

Slider fills up; releases before full = cancel. Used in some hardware controls; rare in web.

### Swipe-to-action

```
Swipe to confirm order →
```

User must swipe a slider all the way right. Common in dating apps and some checkouts.

## Mobile-specific UI components

### Bottom sheet (preferred over modal)

```
┌──────────────────────────┐
│  [content dimmed]        │
│                          │
│                          │
├──────────────────────────┤
│  ━━━                     │ ← drag handle
│                          │
│  Sheet title             │
│                          │
│  [content]               │
│                          │
└──────────────────────────┘
```

Affordances:
- Drag handle at top (visual cue)
- Swipe down to dismiss
- Tap backdrop to dismiss
- Heights: half-screen default, expand to full

Implementation:
- Use `<dialog>` element where supported
- Or library: react-spring-bottom-sheet, vaul, framer-motion

### Action sheet (iOS-style)

For 3+ choices that benefit from larger labels:

```
┌──────────────────────────┐
│  What would you like     │
│  to do with this item?   │
├──────────────────────────┤
│  ◯ Share                 │
│  ◯ Save to wishlist      │
│  ◯ Hide from results     │
│  ◯ Report                │
├──────────────────────────┤
│  [    Cancel    ]        │
└──────────────────────────┘
```

### Floating action button (FAB)

```
┌──────────────────────────┐
│                          │
│  [content]               │
│                          │
│                          │
│                  ┌──┐    │
│                  │ +│    │  ← FAB
│                  └──┘    │
└──────────────────────────┘
```

For a single primary action that should always be reachable. Used in many MENA delivery apps for "filter."

- Bottom-right (LTR) / bottom-left (RTL)
- 56dp diameter
- Above bottom nav (if both used)
- Shadow for depth

### Snackbar / toast

Brief messages:

```
┌──────────────────────────┐
│  Added to cart       UNDO│
└──────────────────────────┘
```

- Appears bottom, above nav
- Duration: 3-5 seconds
- Optional action button (UNDO)
- Stack if multiple

## Anti-patterns

- ❌ Tap targets <44px (iOS) / <48dp (Android)
- ❌ Hover-only interactions (no hover on touch)
- ❌ Primary CTAs at the top of long pages
- ❌ Tiny close (×) buttons in corner
- ❌ Modals with no dismiss gesture (forces user to find ×)
- ❌ Swipe gestures with no visual cue
- ❌ Excessive haptics (annoying)
- ❌ Tooltips on touch (no hover, never trigger)
- ❌ Tiny text < 14px requiring zoom
- ❌ Auto-zoom on input focus (use 16px font size)
- ❌ Disabling pinch zoom for accessibility users
- ❌ Long-press as the ONLY way to access an action
- ❌ Edge swipes that conflict with iOS back gesture
