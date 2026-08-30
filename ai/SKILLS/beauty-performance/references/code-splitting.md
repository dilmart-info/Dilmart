# Code Splitting & Bundle Discipline

JavaScript is the most expensive resource a browser handles. It has to download, parse, compile, then execute. Code splitting controls how much JS the browser pays for at each step. Done well, your marketplace loads in 1.5 seconds. Done poorly, in 10.

## Budgets (recap)

| Bundle | Initial load budget | Hard limit |
|---|---|---|
| First-load JS (per route) | <150KB | <200KB |
| First-load CSS (per route) | <30KB | <50KB |
| Total runtime JS | <500KB | <800KB |

Measured: gzipped, parse-time JS.

## Splitting strategies

### Route-based splitting

Each page = its own JS bundle. Default in Next.js, Remix, SvelteKit.

```
/                    → home.js (50KB)
/c/[category]        → category.js (80KB)
/p/[slug]            → pdp.js (95KB)
/cart                → cart.js (70KB)
/checkout            → checkout.js (180KB — payment SDKs)
/account             → account.js (60KB)
```

Shared code (header, footer, utilities) goes in a `shared.js` (~70KB) that's cached after first load.

### Feature-based splitting

Heavy features behind lazy imports:

```js
// Don't bundle image zoom in initial JS
async function openZoomGallery() {
  const { default: PhotoSwipe } = await import('photoswipe');
  // ... use it
}

// Don't bundle map until user opens "store locator"
async function openStoreLocator() {
  const { Map } = await import('@/components/Map');
  // render Map
}
```

Triggered by user action → not paid for upfront.

### Component-based splitting (React)

```jsx
import { lazy, Suspense } from 'react';

const ReviewSection = lazy(() => import('./ReviewSection'));

function PDP() {
  return (
    <>
      <ProductInfo />
      <Suspense fallback={<ReviewsSkeleton />}>
        <ReviewSection />
      </Suspense>
    </>
  );
}
```

ReviewSection loads only when needed. Render-blocking moves below the fold.

### Vendor splitting

Common dependencies (React, react-dom, framer-motion) get their own chunk:

```
- main.js (your code, 80KB)
- vendor.js (React + deps, 130KB) ← cached longer
- runtime.js (webpack runtime, 5KB)
```

When you update your code, vendor.js stays cached.

## Tree-shaking

Eliminate unused code from bundles.

### Use ES modules

```js
// Good — only imports `format` function
import { format } from 'date-fns';

// Bad — imports entire library (~250KB)
import * as dateFns from 'date-fns';
const x = dateFns.format(...);
```

### Direct file imports for large libraries

```js
// Even better — direct file path bypasses re-exports
import format from 'date-fns/format';
```

date-fns v3+ is fully tree-shakeable with default imports.

### Sideeffect-free packages

In `package.json`:

```json
{
  "sideEffects": false
}
```

Tells bundler: "removing unused imports is safe."

If some files DO have side effects (CSS imports, polyfills):

```json
{
  "sideEffects": ["*.css", "./src/polyfills.js"]
}
```

### Lodash trap

Most common bundle killer. Lodash imports ALL methods if you do:

```js
import _ from 'lodash';
_.debounce(fn, 200);
```

Fix:
```js
import debounce from 'lodash/debounce';
// OR
import { debounce } from 'lodash-es';  // ES module variant
```

### Bundle analyzer

```bash
# Webpack
npm install --save-dev webpack-bundle-analyzer
# Vite
npm install --save-dev rollup-plugin-visualizer
# Next.js
npm install --save-dev @next/bundle-analyzer
```

Run analysis after build. Look for:
- Duplicate dependencies (multiple versions)
- Large libraries you don't need
- Polyfills shipped to modern browsers
- Source maps in production (don't ship)

## Dynamic imports

```js
// Loaded only when this code runs
const Component = await import('./Component');
```

Webpack/Vite create a separate chunk. Loaded asynchronously.

### Patterns

```js
// On button click
button.addEventListener('click', async () => {
  const { showModal } = await import('./modal');
  showModal();
});

// Route change (handled by framework)

// IntersectionObserver: load when section visible
observer.observe(reviewsSection, async () => {
  const { default: Reviews } = await import('./Reviews');
  renderReviews(Reviews);
});
```

## React-specific

### React.lazy + Suspense

```jsx
import { lazy, Suspense } from 'react';

const Reviews = lazy(() => import('./Reviews'));

<Suspense fallback={<Skeleton />}>
  <Reviews />
</Suspense>
```

### Loadable components (more flexible)

```jsx
import loadable from '@loadable/component';

const Reviews = loadable(() => import('./Reviews'), {
  fallback: <Skeleton />,
});
```

Supports SSR (where React.lazy historically didn't).

### React Server Components (RSC)

Newer pattern — components render on server, ship zero JS to client:

```jsx
// app/p/[slug]/page.tsx (server component)
export default async function ProductPage({ params }) {
  const product = await getProduct(params.slug); // server-side fetch
  return (
    <>
      <ProductInfo product={product} />        {/* server component */}
      <AddToCartButton productId={product.id} /> {/* client component */}
    </>
  );
}
```

Server components: no JS shipped.
Client components: only what's truly interactive.

Result: massive JS reduction. Beauty marketplace can be 80% server components.

### Next.js Image, Link, Script

These are pre-optimized:

```jsx
import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';

<Image src="/hero.jpg" width={1200} height={675} alt="..." />
<Link href="/p/shampoo">View</Link>
<Script src="https://analytics.example/script.js" strategy="afterInteractive" />
```

Use them.

## CSS code splitting

### Critical CSS inlined

Above-the-fold CSS inlined in `<head>`:

```html
<head>
  <style>
    /* Critical CSS for above-fold only (~10KB) */
    body { font-family: ...; }
    .header { ... }
    .hero { ... }
    /* etc. */
  </style>
  
  <link rel="preload" href="/styles/rest.css" as="style" onload="this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="/styles/rest.css"></noscript>
</head>
```

Tools to extract critical CSS:
- Critical (Filamenttgroup)
- Critters (used by Next.js)
- CSS Critical

### Per-route CSS

Each route has only its CSS:

```
/p/[slug] → pdp.css (12KB)
/c/[cat]  → category.css (8KB)
```

Common CSS in `shared.css`. Routes import only what they need.

### Tailwind

Tailwind generates utility classes only for ones you use:

```html
<div class="flex p-4 bg-white">
```

Production CSS: ~5-20KB total, regardless of how many utilities Tailwind ships.

### CSS-in-JS (caveat)

Runtime CSS-in-JS (Emotion, Styled Components) ships JS to generate CSS. For commerce, prefer:
- Tailwind (zero runtime)
- CSS Modules
- Vanilla Extract (compile-time)
- Linaria (compile-time)

## Polyfills

### Differential serving

Modern browsers don't need polyfills. Use `<script type="module">` for modern, `<script nomodule>` for legacy:

```html
<script type="module" src="modern.js"></script>
<script nomodule src="legacy.js"></script>
```

Modern browsers: load modern.js (no polyfills, ~30% smaller).
Legacy browsers: load legacy.js (with polyfills).

### Or skip legacy entirely

If your audience is 95%+ modern browsers (IE11 is gone — verify with analytics), don't ship polyfills.

`browserslist` in package.json:
```json
"browserslist": [
  ">0.5% in mena",
  "not dead",
  "not ie 11"
]
```

Tells Babel/Vite what to target. Smaller output.

## Vendor chunks

Common dependencies in their own chunks for better caching:

```js
// webpack config
optimization: {
  splitChunks: {
    chunks: 'all',
    cacheGroups: {
      react: {
        test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
        name: 'react',
        priority: 20,
      },
      framework: {
        test: /[\\/]node_modules[\\/](framer-motion|@radix-ui)[\\/]/,
        name: 'framework',
        priority: 15,
      },
      vendor: {
        test: /[\\/]node_modules[\\/]/,
        name: 'vendor',
        priority: 10,
      },
    },
  },
}
```

When you ship a code update, only your `main.js` changes. Vendor chunks stay cached.

## Long-term caching

```
Asset URLs:
/main.abc123.js          ← hash in name
/vendor.def456.js
/styles.ghi789.css
```

Headers:
```
Cache-Control: public, max-age=31536000, immutable
```

Forever cache. Content changes → URL changes (new hash) → new file → cache miss intentional.

## Library audit

Audit every dependency. Common offenders:

| Library | Issue | Alternative |
|---|---|---|
| Moment.js | 70KB + huge bundle | date-fns, dayjs (5KB), or native Intl |
| Lodash (full) | 70KB | lodash-es with tree-shaking, or native |
| jQuery | 30KB | Vanilla JS / framework |
| Material UI v4 | Large | MUI v5 with tree-shaking, Radix, Headless UI |
| Bootstrap (full) | 60KB CSS + JS | Tailwind |
| Animate.css | 60KB | Custom CSS + transitions |
| Font Awesome (full) | Huge | Lucide, Heroicons, Tabler (subset) |

For each dependency, ask:
- Do I use enough to justify the size?
- Is there a smaller alternative?
- Can I write this in vanilla?

## Build tools

### Vite

- Fast dev (native ESM in dev)
- Rollup-based production build
- Excellent tree-shaking
- HMR
- Recommended for new projects

### Webpack

- Mature, configurable
- Slower than Vite
- Tree-shaking works but config-heavy

### esbuild / SWC

- Faster than Babel
- Used by Vite (esbuild) and Next.js (SWC)
- Less configurable

### Turbopack (Next.js)

- New, fast
- Still maturing

## Performance budgets in CI

```yaml
# .github/workflows/perf.yml
name: Performance budget

on: pull_request

jobs:
  size-limit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - uses: andresz1/size-limit-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

`.size-limit.json`:
```json
[
  {
    "name": "Homepage JS",
    "path": ".next/static/chunks/pages/index-*.js",
    "limit": "150 KB"
  },
  {
    "name": "PDP JS",
    "path": ".next/static/chunks/pages/p/[slug]-*.js",
    "limit": "180 KB"
  },
  {
    "name": "Checkout JS",
    "path": ".next/static/chunks/pages/checkout-*.js",
    "limit": "200 KB"
  }
]
```

PR fails if any bundle exceeds budget. Forces conscious bundle decisions.

## Lazy-loading patterns

### On viewport

```js
const observer = new IntersectionObserver(async (entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      const module = await import('./component.js');
      module.init(entry.target);
      observer.unobserve(entry.target);
    }
  }
}, { rootMargin: '100px' });

document.querySelectorAll('.lazy-load').forEach(el => observer.observe(el));
```

Load component just before user scrolls to it.

### On hover

```jsx
<Link 
  to="/p/shampoo"
  onMouseEnter={() => prefetchModule('product-page')}
>
```

User hovers (about to click) → prefetch the module.

### On focus

For keyboard users:

```jsx
<button 
  onFocus={() => prefetchModule('payment')}
  onClick={openPayment}
>
```

### On idle

```js
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    // Prefetch likely next routes
    import('./likely-next-page.js');
  });
}
```

When browser is idle, prefetch optimistically.

### After interaction

```js
// Don't load analytics until first interaction
let analyticsLoaded = false;
function loadAnalytics() {
  if (analyticsLoaded) return;
  analyticsLoaded = true;
  return import('./analytics.js');
}

window.addEventListener('click', loadAnalytics, { once: true });
window.addEventListener('keydown', loadAnalytics, { once: true });
window.addEventListener('scroll', loadAnalytics, { once: true });
```

Defers non-critical scripts until user shows engagement.

## Critical request chain

Reduce dependencies between requests:

```
Bad chain:
HTML → main.js → chunk.js → component.js → API

Better:
HTML → preload(API) + preload(main.js) → API + main.js parallel
```

Use `<link rel="modulepreload">` for critical modules:

```html
<link rel="modulepreload" href="/main.js">
<link rel="modulepreload" href="/vendor.js">
```

## Performance impact of frameworks

Rough first-load JS (gzipped, idle app):

| Framework | First-load JS |
|---|---|
| Astro (HTML-first, partial hydration) | 0-30KB |
| Qwik (resumable) | 1KB |
| SolidJS | 7KB |
| Svelte | 10KB |
| Preact | 4KB |
| Vue 3 | 33KB |
| React 18 | 45KB |
| Angular | 100KB+ |

For commerce, Astro and Qwik are excellent. React is the industry default and viable with discipline.

## Server-side rendering reduces client JS

```jsx
// CSR (client-side rendering)
function PDP() {
  const [product, setProduct] = useState(null);
  useEffect(() => {
    fetch(`/api/products/${slug}`).then(r => r.json()).then(setProduct);
  }, [slug]);
  if (!product) return <Skeleton />;
  return <ProductDetail product={product} />;
}
```

Client ships:
- React runtime
- All component code
- Fetch logic
- Loading state

vs.

```jsx
// SSR
export async function getServerSideProps({ params }) {
  const product = await getProduct(params.slug);
  return { props: { product } };
}

function PDP({ product }) {
  return <ProductDetail product={product} />;
}
```

Client ships only React + interactive bits. SSR HTML loads instantly.

## Hydration cost

After SSR, React "hydrates" — attaches event handlers. Hydration is expensive.

For commerce, "selective hydration" (React 18) or "islands architecture" (Astro) hydrate only interactive parts:

```jsx
// Most of page: static HTML, no JS
// Just the add-to-cart button hydrates
<ProductInfo product={product} /> {/* static */}
<AddToCartButton productId={product.id} /> {/* interactive */}
```

## CSS-in-JS caveats

Runtime CSS-in-JS evaluates styles on every render:

```jsx
// styled-components
const Button = styled.button`
  color: ${props => props.primary ? 'red' : 'blue'};
`;
```

For every render, JS computes the className. Slow on large pages.

Better: Tailwind, CSS Modules, or compile-time CSS-in-JS (Vanilla Extract, Linaria).

## Server actions / RPCs

Reduce client JS by moving logic server-side:

```jsx
// Next.js Server Action
'use server';
async function addToCart(formData) {
  const productId = formData.get('productId');
  await db.cart.add(productId);
  revalidatePath('/cart');
}

export function AddToCartForm({ productId }) {
  return (
    <form action={addToCart}>
      <input type="hidden" name="productId" value={productId} />
      <button>Add to cart</button>
    </form>
  );
}
```

Client: minimal JS for form submit.
Server: handles logic, returns updated UI.

## Monitoring bundle size over time

Tools:
- **bundlewatch** — track bundle size in CI
- **size-limit** — per-bundle limits
- **next-bundle-analyzer** — Next.js specific
- **Statoscope** — webpack analysis with diffs

Set up dashboards:
- Per-route bundle size over time
- Top dependencies by size
- New dependencies added

Alert when:
- Total bundle > +20% week over week
- Single dependency > 50KB added
- Build size grows >10MB total

## Anti-patterns

- ❌ Single huge bundle for entire app
- ❌ Loading polyfills for browsers that don't need them
- ❌ Importing entire libraries when you use one function
- ❌ Runtime CSS-in-JS on critical paths
- ❌ Multiple versions of React/lodash/etc. in same bundle (duplicates)
- ❌ Source maps in production (ships massive .map files)
- ❌ Unused features bundled (e.g., date picker localization for 50 locales when you use 2)
- ❌ Synchronous network calls during render
- ❌ Hydrating entire page when only one button is interactive
- ❌ Loading analytics before user interacts (wastes critical bandwidth)
- ❌ "We'll optimize later" with no budgets
- ❌ Building for IE11 in 2026 (audit your actual users)
- ❌ Bundle analyzer never run (you can't optimize what you can't see)
- ❌ Same bundle for desktop and mobile (mobile budget is tighter)
