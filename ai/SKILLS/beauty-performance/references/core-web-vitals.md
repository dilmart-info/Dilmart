# Core Web Vitals

Google's Core Web Vitals are the standard for measuring real-user performance. They affect SEO ranking, are user-perceptible, and have well-defined optimization paths. This document explains each metric, how to measure, and how to fix.

## The three metrics

| Metric | Measures | Good | Needs improvement | Poor |
|---|---|---|---|---|
| **LCP** (Largest Contentful Paint) | Loading | ≤2.5s | 2.5-4s | >4s |
| **INP** (Interaction to Next Paint) | Interactivity | ≤200ms | 200-500ms | >500ms |
| **CLS** (Cumulative Layout Shift) | Visual stability | ≤0.1 | 0.1-0.25 | >0.25 |

Google ranks pages where 75th percentile of users hits "good" thresholds.

## LCP (Largest Contentful Paint)

**What it measures**: The time from navigation to when the largest visible content element finishes rendering.

**Largest = biggest in the viewport.** Usually the hero image or a large heading on commerce sites.

### Common LCP elements

For a product detail page:
```
<main>
  [Hero product image]  ← THIS is the LCP element
  <h1>Product Name</h1>
  <p>Price: AED 89</p>
  [Add to cart]
</main>
```

For a category page:
```
<main>
  [Banner image]        ← Possibly LCP
  <h1>Category Name</h1>
  [grid of product cards]
</main>
```

LCP element changes based on viewport and content. Check in DevTools → Performance Insights.

### What slows LCP

1. **Slow server response (TTFB)** — page HTML takes too long to start
2. **Render-blocking resources** — JS/CSS that delays parsing
3. **Resource load delays** — image isn't requested until late
4. **Large resource size** — image is 2MB
5. **Client-side rendering** — content rendered after JS executes

### How to fix LCP

#### 1. Improve server response time

```
TTFB target: <600ms
TTFB excellent: <300ms
```

Strategies:
- Edge functions / edge rendering
- CDN with HTML caching (s-maxage)
- Database query optimization
- Static generation where possible

#### 2. Prioritize LCP resource

For hero image:

```html
<link rel="preload" 
      as="image" 
      href="/hero.avif" 
      type="image/avif" 
      fetchpriority="high"
      imagesrcset="/hero-400.avif 400w, /hero-800.avif 800w, /hero-1200.avif 1200w"
      imagesizes="100vw">
```

And on the image tag:

```html
<img src="/hero.avif" 
     fetchpriority="high" 
     loading="eager"
     decoding="async"
     width="1200" 
     height="675"
     alt="...">
```

Don't lazy-load the hero. Lazy-loading the LCP element is the most common cause of poor LCP.

#### 3. Minify and compress

- Brotli compression on HTML, CSS, JS
- Modern image formats (AVIF, WebP)
- Strip unused CSS/JS

#### 4. Eliminate render-blocking resources

```html
<!-- Bad: blocks render -->
<link rel="stylesheet" href="all.css">

<!-- Good: critical inlined, rest async -->
<style>/* critical above-fold CSS, ~10KB max */</style>
<link rel="preload" href="rest.css" as="style" onload="this.rel='stylesheet'">
```

For JS:

```html
<!-- Bad: blocks parser -->
<script src="app.js"></script>

<!-- Better: async (don't block parser, runs ASAP) -->
<script async src="app.js"></script>

<!-- Best: defer (run after parsing) -->
<script defer src="app.js"></script>

<!-- For modules: defer by default -->
<script type="module" src="app.js"></script>
```

#### 5. Preconnect to required origins

```html
<link rel="preconnect" href="https://cdn.example.com">
<link rel="dns-prefetch" href="https://cdn.example.com">
```

Saves DNS + TCP + TLS handshake for resources from that origin.

#### 6. Server-side rendering / static generation

For commerce pages, render HTML server-side. Avoid:

```html
<!-- Bad: blank page until JS runs -->
<div id="app"></div>
<script src="app.js"></script>
```

Use Next.js, Remix, Astro, or similar.

### Measuring LCP

```js
import { onLCP } from 'web-vitals';

onLCP(({ value, attribution }) => {
  console.log('LCP:', value);
  console.log('LCP element:', attribution.element);
  console.log('Time to first byte:', attribution.timeToFirstByte);
  console.log('Resource load delay:', attribution.resourceLoadDelay);
  console.log('Element render delay:', attribution.elementRenderDelay);
});
```

`attribution` tells you WHY LCP was slow — invaluable for debugging.

### LCP in Chrome DevTools

1. Open Performance Insights tab
2. Reload page
3. View "LCP by Phases" — shows time spent in TTFB, load delay, load time, render delay
4. Each phase has specific optimizations

## INP (Interaction to Next Paint)

**What it measures**: The latency between user input (tap, click, keyboard) and the next visual update.

Replaces FID (First Input Delay) — INP measures ALL interactions, not just the first.

### What slows INP

1. **Long tasks** on the main thread (>50ms)
2. **Heavy event handlers** (e.g., complex re-renders)
3. **Non-optimized React/Vue re-renders**
4. **Layout thrashing** (forced reflows)
5. **Large DOM** (rendering many elements on each update)

### How to fix INP

#### 1. Break up long tasks

```js
// Bad: blocks 200ms
function heavyTask() {
  for (let i = 0; i < 100000; i++) {
    process(items[i]);
  }
}

// Better: yields to browser
async function heavyTask() {
  for (let i = 0; i < 100000; i++) {
    process(items[i]);
    if (i % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

// Best: scheduler.yield() (modern browsers)
async function heavyTask() {
  for (let i = 0; i < 100000; i++) {
    process(items[i]);
    if (i % 1000 === 0 && scheduler.yield) {
      await scheduler.yield();
    }
  }
}
```

#### 2. Debounce input handlers

```js
import { debounce } from 'lodash-es';

const handleSearch = debounce((query) => {
  performSearch(query);
}, 200);

input.addEventListener('input', (e) => handleSearch(e.target.value));
```

#### 3. Avoid React re-render storms

```jsx
// Bad: re-renders on every input
function Parent() {
  const [value, setValue] = useState('');
  return (
    <>
      <input value={value} onChange={e => setValue(e.target.value)} />
      <HugeList items={hugeArray.filter(x => x.includes(value))} />
    </>
  );
}

// Better: memoize, debounce
function Parent() {
  const [value, setValue] = useState('');
  const debouncedValue = useDebouncedValue(value, 200);
  const filtered = useMemo(
    () => hugeArray.filter(x => x.includes(debouncedValue)),
    [debouncedValue]
  );
  return (
    <>
      <input value={value} onChange={e => setValue(e.target.value)} />
      <HugeList items={filtered} />
    </>
  );
}
```

#### 4. Web Workers for heavy work

```js
// Main thread
const worker = new Worker('/worker.js');
worker.postMessage({ items });
worker.onmessage = (e) => updateUI(e.data);

// worker.js
self.onmessage = (e) => {
  const result = processItems(e.data.items);
  self.postMessage(result);
};
```

Heavy computations (image processing, data filtering, etc.) run off-thread.

#### 5. Virtualize long lists

If rendering 1000 product cards, only render those in viewport:

```jsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={1000}
  itemSize={300}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <ProductCard product={products[index]} />
    </div>
  )}
</FixedSizeList>
```

Renders only ~5-10 visible items + buffer. INP stays fast even with huge lists.

#### 6. Optimize CSS

Avoid expensive CSS:
- `filter: blur()` — repaints expensive
- `box-shadow` with large blur — expensive
- `position: fixed` with backdrop-filter — very expensive
- Animations on properties other than `transform`/`opacity`

Use `will-change` sparingly:

```css
.will-animate {
  will-change: transform; /* tells browser to prepare */
}
```

Remove `will-change` after animation completes.

### Measuring INP

```js
import { onINP } from 'web-vitals';

onINP(({ value, attribution }) => {
  console.log('INP:', value);
  console.log('Slow interaction target:', attribution.eventTarget);
  console.log('Interaction type:', attribution.interactionType);
  console.log('Input delay:', attribution.inputDelay);
  console.log('Processing duration:', attribution.processingDuration);
  console.log('Presentation delay:', attribution.presentationDelay);
});
```

Use Chrome DevTools Performance panel to find specific long tasks.

## CLS (Cumulative Layout Shift)

**What it measures**: How much visible content unexpectedly shifts during page load.

Score = (impact fraction) × (distance fraction)

Example: a banner inserts at the top, pushing content down 30% of viewport → CLS ~0.3 (poor).

### What causes CLS

1. **Images without dimensions** — page reflows when image loads
2. **Ads/embeds inserted dynamically** — content jumps
3. **Fonts that swap (FOUT)** — text reflows
4. **Dynamically-injected content above fold** — banners, notifications
5. **Animations that change layout** (e.g., animating `height` instead of `transform`)

### How to fix CLS

#### 1. Always specify image dimensions

```html
<!-- Bad: no dimensions, image loads → shifts -->
<img src="hero.jpg" alt="...">

<!-- Good: dimensions reserve space -->
<img src="hero.jpg" width="1200" height="675" alt="...">
```

For responsive images:

```html
<img src="hero.jpg" 
     srcset="..."
     sizes="..."
     style="aspect-ratio: 16/9; width: 100%; height: auto;"
     alt="...">
```

`aspect-ratio` reserves space even when responsive sizing.

#### 2. Reserve space for ads/embeds

```html
<div class="ad-slot" style="min-height: 250px; background: var(--color-neutral-100);">
  <!-- ad loads here, no shift -->
</div>
```

If ad doesn't load: graceful fallback (empty space or housekeeping content).

#### 3. Font loading without FOUT

Use `font-display: optional` (no swap, less CLS) or `swap` with preload:

```html
<link rel="preload" 
      as="font" 
      href="/fonts/main.woff2" 
      type="font/woff2" 
      crossorigin>
```

```css
@font-face {
  font-family: 'Tajawal';
  src: url('/fonts/tajawal.woff2') format('woff2');
  font-display: swap;
  /* CSS size-adjust prevents shift when font swaps */
  size-adjust: 100%;
  ascent-override: 90%;
}
```

`size-adjust` and `ascent-override` make fallback font match web font's metrics → no shift when web font loads.

Tools: [Fontaine](https://github.com/unjs/fontaine), `next/font` (Next.js).

#### 4. Don't insert content above the fold dynamically

```jsx
// Bad: cart count banner pushes content
{cartCount > 0 && (
  <div className="cart-banner">You have {cartCount} items</div>
)}
<main>...</main>

// Better: pre-reserve space or position absolute
<div className="cart-banner" style={{ minHeight: cartCount > 0 ? 'auto' : 0 }}>
  {cartCount > 0 && `You have ${cartCount} items`}
</div>
```

Or use a fixed-position toast that doesn't affect layout.

#### 5. Use `transform` for animations

```css
/* Bad: animating height causes layout shift */
.menu {
  height: 0;
  transition: height 0.3s;
}
.menu.open {
  height: 300px;
}

/* Good: transform doesn't shift other content */
.menu {
  transform: scaleY(0);
  transform-origin: top;
  transition: transform 0.3s;
}
.menu.open {
  transform: scaleY(1);
}
```

#### 6. Skeleton screens

When showing loading state, use skeleton matching the eventual content shape:

```html
<div class="product-card-skeleton" style="min-height: 380px;">
  <div class="skeleton-image" style="aspect-ratio: 1;"></div>
  <div class="skeleton-line"></div>
  <div class="skeleton-line"></div>
</div>
```

When actual content arrives, replaces skeleton with same dimensions = no shift.

### Measuring CLS

```js
import { onCLS } from 'web-vitals';

onCLS(({ value, attribution }) => {
  console.log('CLS:', value);
  console.log('Largest shift:', attribution.largestShiftTarget);
  console.log('Largest shift time:', attribution.largestShiftTime);
  console.log('Largest shift value:', attribution.largestShiftValue);
});
```

Chrome DevTools → Performance Insights → "Layout Shifts" — shows each shift and what caused it.

## Other useful metrics

### FCP (First Contentful Paint)

When first text or image renders. Good <1.8s.

Less important than LCP for SEO but useful for "page is alive" perception.

### TTFB (Time to First Byte)

Time from navigation to first byte received. Good <800ms, excellent <300ms.

If TTFB is bad, no other optimization saves you. Fix server/network first.

### TBT (Total Blocking Time)

Sum of all long tasks (>50ms) between FCP and TTI. Good <300ms.

Surrogate for INP in lab testing.

### TTI (Time to Interactive)

When page is fully responsive. Less standardized than INP.

## Per-page targets

| Page type | LCP target | INP target | CLS target |
|---|---|---|---|
| Homepage | <2.0s | <100ms | <0.05 |
| Category | <2.0s | <100ms | <0.05 |
| PDP | <2.0s | <100ms | <0.05 |
| Search results | <1.8s | <100ms | <0.05 |
| Cart | <1.5s | <100ms | <0.05 |
| Checkout | <2.0s | <100ms | <0.05 |
| Account | <2.5s | <150ms | <0.1 |

Critical pages get stricter budgets.

## Real-world fix examples

### Fix #1: Hero image loaded late

Before:
```html
<img src="hero.jpg" alt="..." class="hero-image">
```

LCP: 3.8s (hero image discovered late, browser doesn't know it's important)

After:
```html
<!-- In <head> -->
<link rel="preload" as="image" href="hero.avif" fetchpriority="high">

<!-- In body -->
<img src="hero.avif" 
     fetchpriority="high"
     loading="eager"
     decoding="async"
     width="1200" 
     height="675"
     alt="...">
```

LCP: 1.8s. Saved 2 seconds.

### Fix #2: Long task on add-to-cart

Before:
```js
function addToCart(productId) {
  const newItems = [...cart, productId];
  saveToLocalStorage(newItems); // 50ms
  updateAnalytics(newItems); // 30ms
  recomputeRecommendations(newItems); // 200ms <-- the culprit
  setState({ items: newItems });
}
```

INP: 280ms (poor)

After:
```js
function addToCart(productId) {
  const newItems = [...cart, productId];
  setState({ items: newItems }); // synchronous, fast
  
  // Defer expensive work
  requestIdleCallback(() => {
    saveToLocalStorage(newItems);
    updateAnalytics(newItems);
  });
  
  // Defer recommendation re-compute, OR do server-side
  setTimeout(() => recomputeRecommendations(newItems), 0);
}
```

INP: 40ms (good)

### Fix #3: CLS from banner inserting

Before:
```jsx
{showBanner && <PromoBanner />}
<HeroSection />
```

When banner loads from API: pushes hero down. CLS: 0.18.

After:
```jsx
<div style={{ minHeight: showBanner === undefined ? 48 : 0 }}>
  {showBanner && <PromoBanner />}
</div>
<HeroSection />
```

Reserve space while banner is loading. CLS: 0.02.

Or position banner absolutely so it doesn't affect layout:
```jsx
<PromoBanner style={{ position: 'fixed', top: 0 }} />
<main style={{ paddingTop: 48 }}>...</main>
```

## Browser support

Web Vitals API is well-supported:
- Chrome 88+
- Edge 88+
- Safari (partial — LCP, FCP supported; CLS partial; INP not yet)
- Firefox (partial)

In production:
- Use `web-vitals` polyfills/library for cross-browser
- Real user data: Chrome only for most metrics (but Chrome is the dominant browser)

## Lighthouse vs RUM

**Lighthouse** (lab):
- Fixed test conditions (Moto G4, 4× CPU throttle, slow 4G)
- Synthetic; doesn't match real users
- Useful for catching regressions
- Run in CI

**RUM** (real users):
- Actual user devices, networks, locations
- Long tail of slow experiences
- Ground truth for Google rankings
- Use `web-vitals` to capture

Track both. Lighthouse for prevention, RUM for monitoring.

## Anti-patterns

- ❌ Optimizing for Lighthouse score, not real users
- ❌ Lazy-loading the LCP image (most common LCP killer)
- ❌ No `width`/`height` on images (CLS guaranteed)
- ❌ Heavy event handlers that run synchronously on every input
- ❌ Animating `height`/`width` instead of `transform`
- ❌ Loading all CSS in `<head>` synchronously
- ❌ Massive third-party scripts in critical path
- ❌ Server-side rendering everything (CSR is fine for cart/account)
- ❌ Trusting "average" metrics (use p75 or p95)
- ❌ Testing only on fast WiFi
- ❌ Treating LCP as "image load time" — it's the whole pipeline
- ❌ Ignoring INP because "FID was good"
- ❌ Re-rendering large lists on every input
- ❌ FOUT prevention via `font-display: block` (causes invisible text)
- ❌ One-time fixes without monitoring (regressions slip in)
