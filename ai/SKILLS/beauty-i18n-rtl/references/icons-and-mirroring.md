# Icons & Mirroring

In RTL layouts, some icons must mirror to maintain meaning. Others must NOT mirror or they'd lose their meaning. Knowing which is which prevents the "AI-translated app" feel where everything's flipped including the brand logo.

## The mirroring rule

**Mirror icons that have inherent directionality** (point one way, depict motion, show progression).

**Don't mirror icons that** are symmetric, represent objects with established orientation in the real world, or are brand marks.

## Icons that MUST mirror

### Arrows and chevrons

```
LTR: →    RTL: ←
LTR: ←    RTL: →
LTR: ►    RTL: ◄
```

Used in:
- Pagination ("next" / "previous")
- Carousel controls
- Breadcrumb separators
- Tab indicators
- Dropdown carets (down-arrow itself doesn't flip; only if it's a side-pointing arrow)
- Back / forward buttons
- "View all" links with arrow

### Sliders and progress

Horizontal progress fills from start to end. In RTL, that's right to left.

```css
.progress {
  --pct: 50%;
}
.progress-fill {
  width: var(--pct);
  /* For LTR, fills from left */
}

[dir="rtl"] .progress-fill {
  /* Fills from right — same CSS works due to direction */
}
```

Most progress bars work automatically with `direction: rtl` on parent.

### Reply / forward arrows (email/chat)

```
LTR: ↩ Reply       ↪ Forward
RTL: ↪ Reply       ↩ Forward
```

### Send icon

```
LTR: ➤ (pointing right = sending out)
RTL: ⬅ (pointing left = sending out)
```

### List indent / outdent

```
LTR: ⇨ indent    ⇦ outdent
RTL: ⇦ indent    ⇨ outdent
```

### Sort indicators

```
LTR: ↑ ascending   ↓ descending
RTL: ↑ ascending   ↓ descending  (vertical — no flip)
```

Vertical arrows don't flip. Only horizontal.

### Back / forward navigation

Browser-style back/forward:

```
LTR: ← Back     Forward →
RTL: → Back     Forward ←
```

### "Continue" / "Next" buttons

```
LTR: Continue →
RTL: ← متابعة
```

The arrow follows the reading direction's "forward" concept.

## Icons that MUST NOT mirror

### Logos and brand marks

Never mirror logos. Brand identity is fixed:

```
LTR: BEAUTY
RTL: BEAUTY   (NOT YTUAEB)
```

Same applies to:
- Vendor logos
- Brand names with stylized typography
- Product packaging in images

### Real-world objects with orientation

Things humans recognize from the real world:

| Icon | Mirror? | Why |
|---|---|---|
| Camera | No | Camera shape is recognized |
| Clock | No | Clock face is universal |
| Calendar | No | Calendar layout is universal |
| Map pin | No | Pin always points down |
| Heart | No | Symmetric, no inherent direction |
| Star | No | Symmetric |
| Person silhouette | No (usually) | Face/body direction not crucial |
| Building, house | No | Architectural orientation is fixed |
| Car, plane | Sometimes | Depends on "going forward" implication |
| Phone | No | Hardware orientation is universal |
| Magnifying glass (search) | Sometimes | Handle goes on different side in RTL |
| Lock | No | Symmetric usually |
| Eye | No | Symmetric |
| Globe | No | Globe orientation depends on rotation depicted; usually symmetric |

### Time-direction icons (debate)

| Icon | Mirror? |
|---|---|
| Play ► | NO — universal media icon |
| Pause ‖ | No — symmetric |
| Stop ■ | No — symmetric |
| Rewind ◄◄ | No — universal |
| Fast forward ►► | No — universal |
| Volume up | No — universal |

Media controls are international conventions. Don't mirror them.

### Math symbols

```
+, -, =, ×, ÷
```

Don't mirror; same in both directions.

```
> and < (less than, greater than)
```

These actually have a semantic meaning. In math, they don't flip. In navigation arrows, they DO flip. Context matters.

### Currency symbols

```
$, €, £, ¥
```

Don't flip. Currency symbols are visual brands.

### Emoji

Emoji generally don't flip. The platform vendor (Apple, Google) handles RTL contexts.

## Special cases

### Magnifying glass (search)

The glass is symmetric, but the handle has direction:

```
LTR: 🔍 (handle points to bottom-right)
RTL: 🔎 (handle points to bottom-left — mirror)
```

OR keep symmetric magnifying glass (no handle):

```
LTR: ⊙
RTL: ⊙ (same — no direction)
```

Most marketplaces keep magnifying glass as-is (most icons are simple enough that the handle direction isn't a strong cue).

### Edit / pencil

A pencil tilts in one direction. Don't mirror; pencils are real objects.

```
✏️ (tilted upper-left to lower-right)
```

### Speech bubble / chat

Speech bubbles have a tail:

```
LTR: 💬 (tail on left side)
RTL: 💬 (tail on right side — flipped)
```

If used as a chat icon: flip the tail. The bubble itself is symmetric.

### Shopping cart / bag

Carts and bags often have a handle on one side:

```
LTR cart: 🛒 (handle on left)
RTL cart: 🛒 (handle on right — mirror)
```

Bags usually symmetric.

### Bookmark / ribbon

```
LTR: 🔖 (might tilt one way)
RTL: 🔖 (mirror)
```

### Reply / forward (in email)

```
LTR: ↩ ↪
RTL: ↪ ↩
```

Flip both, then their meanings stay correct.

## Implementing icon mirroring

### CSS transform (simplest)

For icons that need to mirror:

```css
.icon-arrow {
  /* Default LTR orientation */
}

[dir="rtl"] .icon-arrow {
  transform: scaleX(-1);
}
```

This horizontally flips the icon. For SVG, this works perfectly.

### Logical class names

```html
<!-- Better than scaleX flips: dedicated icons -->
<svg class="icon icon-forward">...</svg>
<svg class="icon icon-back">...</svg>
```

In RTL, "forward" still means "next" — the icon component swaps the asset.

### SVG sprites with direction

```html
<!-- LTR -->
<svg><use href="#icon-arrow-forward"></svg>

<!-- RTL — different sprite -->
<svg><use href="#icon-arrow-forward-rtl"></svg>
```

Use a component that handles direction internally:

```jsx
function Icon({ name, direction }) {
  const dir = useDirection();
  const finalName = (direction === 'auto' && dir === 'rtl') ? `${name}-rtl` : name;
  return <svg><use href={`#${finalName}`} /></svg>;
}
```

### Tailwind RTL utilities

```html
<svg class="rtl:-scale-x-100">...</svg>
```

`rtl:` variant applies in RTL only. `-scale-x-100` mirrors horizontally.

### Icon libraries

| Library | RTL support |
|---|---|
| **Lucide** | Manual flip via CSS |
| **Heroicons** | Manual flip |
| **Material Symbols** | Some have built-in RTL versions |
| **Phosphor** | Manual flip |
| **Tabler** | Manual flip |
| **Iconoir** | Manual flip |

Most icon libraries provide the default LTR direction. RTL handling is on you.

## Asset organization

### Per-direction icons

```
public/
  icons/
    arrow-back.svg          ← used in both directions, flipped via CSS
    arrow-back-rtl.svg      ← optional, if CSS flip doesn't look right
    chevron-down.svg        ← never flipped
    play.svg                ← never flipped
    cart.svg                ← decision: flip or not?
    cart-rtl.svg            ← optional manual version
```

### Component-level decision

```jsx
// In Icon component
const ICONS_THAT_MIRROR = new Set([
  'arrow-back',
  'arrow-forward',
  'chevron-left',
  'chevron-right',
  'reply',
  'forward',
  'send',
  'undo',
  'redo',
]);

function Icon({ name }) {
  const dir = useDirection();
  const shouldMirror = dir === 'rtl' && ICONS_THAT_MIRROR.has(name);
  
  return (
    <svg className={shouldMirror ? 'scale-x-flip' : ''}>
      <use href={`#${name}`} />
    </svg>
  );
}
```

## Real-world icon examples

### Pagination

```jsx
function Pagination({ current, total }) {
  return (
    <nav>
      <button aria-label={t('previous')}>
        <Icon name="chevron-left" /> {/* mirrors in RTL */}
      </button>
      <span>{current} / {total}</span>
      <button aria-label={t('next')}>
        <Icon name="chevron-right" /> {/* mirrors in RTL */}
      </button>
    </nav>
  );
}
```

In LTR: ← 1/10 →
In RTL: → 1/10 ←

### Breadcrumb

```jsx
function Breadcrumb({ items }) {
  return (
    <nav>
      {items.map((item, i) => (
        <Fragment key={item.label}>
          <a href={item.href}>{item.label}</a>
          {i < items.length - 1 && (
            <Icon name="chevron-right" /> {/* mirrors in RTL */}
          )}
        </Fragment>
      ))}
    </nav>
  );
}
```

### Carousel arrows

```jsx
<button className="carousel-prev">
  <Icon name="chevron-left" /> {/* mirrors */}
</button>
<button className="carousel-next">
  <Icon name="chevron-right" /> {/* mirrors */}
</button>
```

Functionally:
- LTR: "prev" goes left, "next" goes right
- RTL: "prev" goes right, "next" goes left

### Tab indicator

If a tab has an indicator that animates between tabs:

```css
.tab-indicator {
  position: absolute;
  bottom: 0;
  height: 3px;
  background: var(--color-primary);
  transition: transform 0.2s;
}

.tab-indicator.tab-2 { transform: translateX(100%); }
.tab-indicator.tab-3 { transform: translateX(200%); }
```

`translateX` doesn't account for RTL. Use percentage-based positioning or logical properties:

```css
.tab-indicator.tab-2 { 
  inset-inline-start: 33.33%; 
}
```

## Reading direction in graphs/charts

Bar charts, line charts: axis direction matters.

### Bar chart with categories

```
LTR:
|
|  ▓▓
|  ▓▓ ▓▓
|  ▓▓ ▓▓ ▓▓
|__A__B__C__
```

In RTL, same chart but X axis flipped:

```
RTL:
|
|     ▓▓
|     ▓▓ ▓▓
|     ▓▓ ▓▓ ▓▓
|__ج__ب__أ__
```

(Categories in same order, but axis labels read right-to-left and bars positioned accordingly.)

Most charting libraries (Chart.js, Recharts) need explicit configuration for RTL.

### Line chart over time

Time axis goes left-to-right in LTR (older → newer).

In RTL? Convention varies:
- Some argue: time still goes L→R because Arabic readers parse time left-to-right when shown as a "timeline"
- Others: flip so older is on the right (matching reading flow)

**Recommendation: keep time L→R even in RTL**. This matches how data is typically presented in MENA business contexts. Add direction-aware axis labels.

### Pie chart

No direction; doesn't change. Maybe label positions change to follow text direction.

## Accessibility

Icons need alt text:

```html
<button aria-label="السابق">  <!-- "Previous" in Arabic -->
  <Icon name="chevron-left" aria-hidden="true" />
</button>
```

The icon is decorative; the button's aria-label provides accessibility.

If the icon is the entire content (no text):

```jsx
<button>
  <Icon name="cart" aria-label={t('cart')} />
</button>
```

Or use `<svg role="img" aria-label="..."/>` for inline.

## Loading state icons

Spinners are usually rotational — no horizontal direction:

```css
@keyframes spin {
  from { transform: rotate(0); }
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}
```

For loading dots (●●●), no direction needed.

## Empty state icons

Decorative icons for empty states (empty cart, no results):

```
- Empty cart: cart icon with X or sad face — symmetric, no flip
- No search results: magnifying glass — sometimes flip
- 404: usually number/letter design — usually no flip
- No notifications: bell with line through — symmetric
```

## Custom illustration approach

For brand illustrations (homepage hero, empty states):
- If they depict actions/scenes, consider mirroring
- If they're abstract decorations, keep as-is

Some marketplaces create:
- LTR version with character facing right (toward "next" content)
- RTL version with character facing left (same metaphor)

Costs more but feels considered.

## Testing icons

### Manual

Open page in RTL, scan every icon:
- Does it point the right way?
- Does it still convey meaning?
- Does it look "right" or off?

### Common mistakes

After enabling RTL, check:
- Brand logo: should NOT flip (often does accidentally with `transform: scaleX(-1)` on parent)
- Back button: should flip to point in the new "back" direction
- Pagination arrows: should both flip
- Magnifying glass: usually fine either way

## Brand consideration

Sometimes the marketing/design team wants specific icons NOT to mirror, even if convention says they should. Get sign-off; usability matters but brand consistency matters too.

Example: a brand uses a stylized "play triangle" pointing right as part of their logomark. Don't mirror it just because RTL says to.

## Summary table

| Icon type | Mirror in RTL? |
|---|---|
| Arrows (→ ← ↑ ↓) | Only horizontal (→ ←) |
| Chevrons | Only horizontal |
| Back button | Yes |
| Next button | Yes |
| Reply / forward | Yes |
| Send | Yes |
| Carousel arrows | Yes |
| Pagination arrows | Yes |
| Logo / brand mark | No |
| Magnifying glass | Usually no (or just handle) |
| Heart | No (symmetric) |
| Star | No (symmetric) |
| Camera, clock | No |
| Person, face | Usually no |
| Building, car | No (recognizable objects) |
| Play/pause/stop | No (international convention) |
| Volume | No |
| Currency symbols | No |
| Math operators | No |
| Emoji | Platform handles |
| Speech bubble (with tail) | Yes (the tail) |
| Cart with handle | Usually yes |
| Pencil | No |

## Anti-patterns

- ❌ Mirroring all icons mechanically (logos flip, brand identity breaks)
- ❌ Not mirroring directional icons (arrows pointing wrong way)
- ❌ Different icons for back button in LTR vs RTL (just flip the same one)
- ❌ Forgetting to mirror SVG paths inside icon components
- ❌ Using `scaleX(-1)` on icon parent that affects child text
- ❌ Mirroring tilt-direction of icons that have no semantic direction (random)
- ❌ Mirroring media controls (play, pause are universal)
- ❌ Maintaining two separate icon sets for LTR/RTL (use CSS transforms)
- ❌ Hardcoding `transform: scaleX(-1)` instead of using `[dir="rtl"]`
- ❌ Mirroring images in product cards (product photos shouldn't flip)
- ❌ Forgetting to mirror animated arrows (animation goes wrong direction)
- ❌ Mirroring sort/filter chevrons that have semantic meaning (down arrow ≠ up arrow flipped)
