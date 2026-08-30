# Transitions & Motion

Motion gives the marketplace a "real app" feel. But over-motion makes it feel slow, draining, or amateurish. The discipline is: animate state changes, not decoration. Make every animation under 300ms unless it has a clear narrative purpose.

## Motion principles

1. **Purposeful, not decorative** — every animation answers a question (what just happened? where did this come from?)
2. **Fast, not flashy** — 150-300ms for most; never >500ms unless explicit narrative
3. **Predictable easings** — `ease-out` for entrances, `ease-in` for exits, `ease-in-out` for both
4. **Respect `prefers-reduced-motion`** — disable or reduce intensity
5. **Performance over polish** — 60fps or skip the animation; use `transform` and `opacity` only
6. **Native feel** — match OS conventions where possible

## Motion vocabulary

### Page transitions

When navigating between routes:

| Source → Destination | Transition |
|---|---|
| Home → Category | Fade |
| Category → PDP | Slide from right (LTR) / left (RTL) |
| PDP → Cart drawer | Slide in from right (LTR) / left (RTL) |
| Cart → Checkout | Slide from right |
| Tab to tab (bottom nav) | Instant (no animation) |
| Modal open | Fade + scale up |
| Bottom sheet open | Slide from bottom |
| Back gesture | Reverse of forward |

### Element transitions

| Element | Enter | Exit |
|---|---|---|
| Toast | Slide up + fade in | Fade out |
| Snackbar | Slide up | Slide down |
| Dropdown | Fade + slight scale | Fade |
| Tooltip | Fade | Fade |
| Modal | Fade + scale (0.95 → 1) | Fade + scale (1 → 0.95) |
| Drawer | Slide from side | Slide back |
| Bottom sheet | Slide from bottom | Slide back |
| List item add | Fade in + slide down | Slide left + fade out |
| Image lazy load | Fade in (200ms) | — |

## Duration & easing

### Standard durations

```css
:root {
  --duration-instant: 0ms;     /* state changes, focus */
  --duration-fast: 100ms;      /* hover, small state */
  --duration-base: 200ms;      /* most transitions */
  --duration-medium: 300ms;    /* page elements */
  --duration-slow: 500ms;      /* full page transitions */
  --duration-storytelling: 800ms; /* rare, intentional */
}
```

### Easings

```css
:root {
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);    /* default */
  --ease-out: cubic-bezier(0, 0, 0.2, 1);          /* entrances */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);            /* exits */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* playful */
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55); /* very playful, rare */
}
```

### Choosing duration

- Element <100px: 150-200ms
- Element 100-300px: 200-300ms
- Full screen transition: 300-400ms
- Storytelling/narrative: 500-800ms

If the user expects something to happen quickly (tap → response), use ≤200ms. If the user expects a journey (page change), use 300-400ms.

## CSS animations

### Fade in

```css
.fade-in {
  animation: fade-in var(--duration-base) var(--ease-out) forwards;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### Slide up + fade in (toasts, alerts)

```css
.slide-up {
  animation: slide-up var(--duration-medium) var(--ease-out) forwards;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Bottom sheet enter

```css
.bottom-sheet-enter {
  animation: sheet-up var(--duration-medium) var(--ease-out) forwards;
}

@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.bottom-sheet-exit {
  animation: sheet-down var(--duration-base) var(--ease-in) forwards;
}

@keyframes sheet-down {
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
}
```

### Modal enter (fade + scale)

```css
.modal-backdrop {
  animation: fade-in var(--duration-base) var(--ease-out);
}

.modal-content {
  animation: modal-in var(--duration-medium) var(--ease-out) forwards;
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

## View Transitions API

Modern browsers support View Transitions for full-page transitions:

```js
function navigate(url) {
  if (!document.startViewTransition) {
    // Fallback for unsupported browsers
    window.location.href = url;
    return;
  }
  
  document.startViewTransition(() => {
    // Update DOM here
    updatePageContent(url);
  });
}
```

```css
::view-transition-old(root) {
  animation: fade-out var(--duration-base) var(--ease-in);
}

::view-transition-new(root) {
  animation: fade-in var(--duration-base) var(--ease-out);
}
```

### Named view transitions for hero elements

```html
<img class="product-card-image" 
     style="view-transition-name: product-img-123" 
     src="..."/>
```

On the destination page (PDP):
```html
<img class="pdp-hero-image" 
     style="view-transition-name: product-img-123" 
     src="..."/>
```

Browser auto-animates the image from its position on the card to its position on the PDP. Magical effect, easy to implement.

## Framer Motion (React)

For React apps, Framer Motion is the most ergonomic motion library:

```jsx
import { motion } from 'framer-motion';

function ProductCard({ product }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
    >
      ...
    </motion.div>
  );
}
```

### List animations

```jsx
import { motion, AnimatePresence } from 'framer-motion';

function ProductList({ products }) {
  return (
    <AnimatePresence>
      {products.map((p) => (
        <motion.div
          key={p.id}
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ duration: 0.2 }}
        >
          <ProductCard product={p} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
```

`layout` prop animates position changes automatically when items reorder.

## Micro-interactions

### Add to cart

User taps "Add to cart":

1. Button briefly scales down (95%) then back (98%) → press feedback
2. Cart icon in nav scales up (110%) briefly → notification
3. Badge count increments with brief pulse
4. Toast appears: "Added to cart"
5. (Optional) Subtle haptic vibration

Total time: <500ms.

```jsx
function addToCart() {
  // Optimistic UI
  setCartCount(c => c + 1);
  animateCartIcon();
  showToast('Added to cart');
  
  if ('vibrate' in navigator) navigator.vibrate(10);
  
  // Sync with server
  await api.addToCart(productId);
}
```

### Like / wishlist heart

Heart fill animation:

```css
@keyframes heart-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

.heart-button.active svg {
  fill: var(--color-primary);
  animation: heart-pop 0.3s var(--ease-spring);
}
```

Or fancier (Twitter-style):
- Initial heart pops + bursts of small particles
- 12 confetti circles radiate out
- Total ~600ms

### Loading skeleton

Pulse animation:

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-neutral-200) 0%,
    var(--color-neutral-100) 50%,
    var(--color-neutral-200) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Scroll-into-view animations

For sections that animate in as user scrolls:

```jsx
import { motion } from 'framer-motion';

<motion.section
  initial={{ opacity: 0, y: 30 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: '-100px' }}
  transition={{ duration: 0.3 }}
>
  ...
</motion.section>
```

- `once: true` — animate once, not every time it scrolls into view
- `margin: '-100px'` — trigger when 100px into viewport
- Don't overdo — every section animating in feels excessive

### Tab switch (within page)

```jsx
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.2 }}
  >
    {tabContent}
  </motion.div>
</AnimatePresence>
```

## Scroll-driven animations

### Parallax (use sparingly)

```css
.hero-bg {
  position: absolute;
  inset: 0;
  background-image: url('hero.jpg');
  transform: translateY(calc(var(--scroll) * 0.5));
}
```

Apply parallax only to subtle backgrounds. Aggressive parallax causes motion sickness.

### Sticky header behavior

Header shrinks/transforms as user scrolls:

```js
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const scroll = window.scrollY;
  if (scroll > 50) {
    document.body.classList.add('scrolled');
  } else {
    document.body.classList.remove('scrolled');
  }
  lastScroll = scroll;
});
```

```css
.header {
  height: 80px;
  transition: height var(--duration-base) var(--ease-out);
}

body.scrolled .header {
  height: 56px;
}
```

### Progress indicators

Reading progress on long articles:

```css
.progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--color-primary);
  width: var(--scroll-pct, 0%);
  transition: width 0.1s linear;
  z-index: 100;
}
```

```js
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  const total = document.body.scrollHeight - window.innerHeight;
  const pct = (scrolled / total) * 100;
  document.documentElement.style.setProperty('--scroll-pct', `${pct}%`);
});
```

## Reduced motion

Always respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This nukes all motion. More nuanced approach:

```css
@media (prefers-reduced-motion: reduce) {
  .card-animation {
    /* Keep functional transitions, remove decorative */
    transform: none !important;
  }
  
  .parallax {
    transform: none !important;
  }
}
```

In JS:
```js
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = prefersReducedMotion ? 0 : 0.3;
```

## Performance

### Use transform and opacity only

Animating `width`, `height`, `top`, `left`, `padding`, `margin` triggers layout (expensive). Use:

```css
/* Bad — triggers layout on each frame */
.move {
  left: 0;
  transition: left 0.3s;
}
.move.moved { left: 100px; }

/* Good — GPU accelerated */
.move {
  transform: translateX(0);
  transition: transform 0.3s;
}
.move.moved { transform: translateX(100px); }
```

### will-change (carefully)

```css
.will-animate {
  will-change: transform;
}
```

Tells browser to prepare for transform changes. Use just before animation starts; remove after. Overuse is worse than not using.

### Avoid scroll-jacking

Don't override native scroll. Native scroll is buttery; custom JS scroll is laggy. Smooth scroll API is fine:

```js
element.scrollIntoView({ behavior: 'smooth', block: 'start' });
```

### Don't animate everything

If you have 50 product cards each animating in, performance dies. Stagger or use viewport-triggered (only animate visible).

## Audio (rare for marketplaces)

Don't auto-play sound. Ever. Even on PDP video.

If a user opts in (e.g., a "tap to unmute" button on video), respect it.

## Page enter animations

When user lands on a new page:

```js
// First time visiting (no history) — animate in
// Returning via back button — instant

const isFirstVisit = !history.state?.visited;
if (isFirstVisit) {
  document.body.classList.add('page-enter');
  history.replaceState({ visited: true }, '');
}
```

```css
.page-enter > * {
  animation: page-fade-in var(--duration-medium) var(--ease-out);
}
```

## Animation libraries comparison

| Library | Best for |
|---|---|
| CSS animations | Simple, decorative animations |
| Web Animations API | Programmatic, JS-native |
| Framer Motion | React apps, complex orchestration |
| GSAP | Heavy animation needs, very performant |
| Lottie | Designer-built animations (AfterEffects exports) |
| View Transitions API | Page-level transitions |

Pick the lightest option that does what you need.

## Lottie for hero animations

For homepage hero, success states, empty states — designer-created Lottie animations:

```jsx
import Lottie from 'lottie-react';
import successAnimation from './success.json';

<Lottie 
  animationData={successAnimation} 
  loop={false} 
  autoplay 
  style={{ width: 200 }}
/>
```

Lottie files are JSON, much smaller than video, and SVG-based (scalable).

Use sparingly:
- Order success
- Empty wishlist illustration
- Onboarding hero
- 404 page

## Examples of well-done motion

### Apple
- Subtle, fast, purposeful
- Page transitions barely noticeable but feel polished

### Stripe
- Beautiful animated illustrations on landing pages
- Subtle micro-interactions throughout

### Linear
- Snappy, instant feedback
- Page transitions <200ms

### Instagram
- Like animation is iconic
- Story progress bar uses CSS

### Sephora app
- Add-to-cart flying icon
- Tab switch transitions
- Image gallery momentum

## Anti-patterns

- ❌ Animations that take >500ms for everyday actions (feels slow)
- ❌ Animating padding/margin/width (janky)
- ❌ Decorative animations on every element (overwhelming)
- ❌ Auto-playing videos (especially with sound)
- ❌ Parallax everywhere (motion sickness)
- ❌ Custom scrollbar animations (rarely worth it)
- ❌ Spinner animation when content takes <200ms (just show content)
- ❌ Bounce/spring on every interaction (juvenile feeling)
- ❌ Ignoring `prefers-reduced-motion`
- ❌ Different animation speeds for similar actions (inconsistent)
- ❌ Cascading delays on lists with 50+ items (last item appears way after first)
- ❌ "Skeleton" that doesn't match the content shape (looks broken when content arrives)
- ❌ Modal that animates open in 300ms but closes in 50ms (asymmetric)
- ❌ Mocking system gestures (e.g., faux iOS swipe-back on Android)
