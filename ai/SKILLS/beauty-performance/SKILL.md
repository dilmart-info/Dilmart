---
name: beauty-performance
description: Web performance engineering for the beauty marketplace — Core Web Vitals (LCP, INP, CLS), image optimization, code splitting, edge caching, JavaScript budgets, list/grid rendering, font loading, and third-party script management. Use this skill whenever performance is a concern — slow page loads, jank, poor mobile scores, conversion drops, SEO penalty risks, or just to set baselines. In MENA, network conditions vary widely; performance discipline is the difference between conversion and abandonment. Trigger keywords include performance, Core Web Vitals, LCP, INP, CLS, slow, lazy load, optimization, bundle size, caching, CDN, image optimization, الأداء, السرعة, تحسين.
---

# Beauty Marketplace Performance

Performance is conversion. In MENA, 60-70% of shoppers leave a slow site. A 1-second delay can drop conversion by 7%. Google penalizes slow sites in search rankings. Performance discipline is non-negotiable.

## Performance budgets (hard)

| Metric | Target | Hard limit | Beyond = ship-blocker |
|---|---|---|---|
| LCP (4G) | <2.0s | <2.5s | >3.0s |
| INP | <100ms | <200ms | >300ms |
| CLS | <0.05 | <0.10 | >0.25 |
| TBT (3G) | <300ms | <500ms | >1000ms |
| TTI | <3.5s | <5.0s | >8.0s |
| First Load JS | <150KB | <200KB | >300KB |
| First Load CSS | <30KB | <50KB | >100KB |
| First Load fonts | <100KB | <150KB | >250KB |
| Hero image | <100KB | <200KB | >400KB |
| Total page weight (above-fold) | <500KB | <800KB | >1.5MB |
| Time to first byte (TTFB) | <300ms | <600ms | >1000ms |

Measured at p75 (75th percentile of real users), not "best case in DevTools".

## Reference files

| File | Purpose |
|---|---|
| `references/core-web-vitals.md` | LCP, INP, CLS deep-dive; how to measure and fix |
| `references/image-optimization.md` | AVIF/WebP, responsive images, lazy loading |
| `references/code-splitting.md` | Bundle splitting, lazy imports, tree-shaking |
| `references/caching-and-cdn.md` | Edge caching, cache headers, ISR/SSG |
| `references/font-loading.md` | Font display, preload, subsetting, FOUT/FOIT |
| `references/list-rendering.md` | Virtualization, infinite scroll, grid performance |
| `references/third-party-scripts.md` | Analytics, chat widgets, ads — load without harming Core Web Vitals |
| `references/api-performance.md` | Database queries, N+1, pagination, edge functions |

## The performance hierarchy

Optimize in this order:

### 1. Serve fast (TTFB)
- CDN / edge functions for HTML
- Database query optimization
- Cache HTML at edge (or use SSG)
- Compress responses (Brotli > gzip)

### 2. Render fast (FCP, LCP)
- Inline critical CSS
- Preload hero image
- Preload critical fonts
- Defer non-critical resources
- Reduce JS in critical path

### 3. Respond fast (INP)
- Avoid long tasks (>50ms)
- Yield to browser (scheduler.yield)
- Debounce input handlers
- Memoize expensive computations
- Web Workers for heavy work

### 4. Stay stable (CLS)
- Reserve space for images (width/height attrs)
- Reserve space for ads, embeds
- Don't insert content above the fold dynamically
- Use `font-display: optional` or preload fonts

### 5. Stay efficient (bundle, network)
- Code splitting by route, by feature
- Tree-shake aggressively
- Lazy-load below-fold
- Service worker caching

## Measurement

### Real User Monitoring (RUM)

Track actual user metrics, not just lab tests:

```js
// web-vitals library
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

function sendToAnalytics(metric) {
  analytics.track('web_vitals', {
    name: metric.name,
    value: metric.value,
    rating: metric.rating, // 'good' | 'needs-improvement' | 'poor'
    page: window.location.pathname,
    connection: navigator.connection?.effectiveType,
  });
}

onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);
onFCP(sendToAnalytics);
onTTFB(sendToAnalytics);
```

### Tools

- **Lighthouse** — lab testing, automated audits
- **Chrome DevTools Performance** — flame chart, long tasks
- **Chrome DevTools Coverage** — unused CSS/JS
- **WebPageTest** — multi-location, multi-device testing
- **PageSpeed Insights** — RUM + Lighthouse combined
- **Search Console** — Core Web Vitals report from real users
- **Sentry / Datadog** — RUM in production

### Test conditions

Test on:
- iPhone SE (1st gen) or low-end Android
- Slow 4G (CPU 4× throttle, 1.6 Mbps download)
- Cold cache (first visit)

If it works there, it works everywhere.

## Critical pages

Order by business value; optimize accordingly:

### 1. Homepage (most traffic)
- Hero image: pre-rendered, AVIF, <100KB
- Categories: inline (no API call needed)
- Featured products: server-rendered, lazy-loaded images
- Reviews: lazy-loaded below fold
- Skeleton screen if any client fetching

### 2. Category / search results (most browsing)
- Server-rendered first page (12-24 products)
- Filters in URL (cacheable)
- Infinite scroll OR pagination (both work)
- Image lazy-load aggressively
- Prefetch on hover/touchstart

### 3. PDP (conversion happens here)
- Hero image: above the fold, priority
- Variant images: lazy-loaded
- Reviews: paginated, first 5 visible
- Recommendations: lazy-loaded
- Sticky add-to-cart bar (no jump when scrolling)

### 4. Checkout (last mile)
- Pre-fetched when user clicks "Checkout" from cart
- Payment SDKs loaded only when method selected
- Address autocomplete: client-side data when small enough
- No third-party scripts on checkout (analytics minimal)

## Image-heavy reality

For a beauty marketplace, images are 70-85% of page weight. They're also where most performance is won or lost.

See `image-optimization.md` for full details.

Quick wins:
- AVIF + WebP fallback
- Responsive `srcset` with `sizes`
- `loading="lazy"` on everything below fold
- `loading="eager"` and `fetchpriority="high"` on hero
- `decoding="async"`
- Explicit `width` and `height` to prevent CLS

## JavaScript discipline

### React-specific

```jsx
// Heavy component? Lazy-load
const ProductGallery = lazy(() => import('./ProductGallery'));

// Use Suspense
<Suspense fallback={<GallerySkeleton />}>
  <ProductGallery />
</Suspense>
```

### Avoid runtime CSS-in-JS for production

Emotion, Styled Components: great DX, slow runtime.

Better:
- Tailwind (zero runtime)
- CSS Modules + PostCSS (zero runtime)
- Vanilla Extract (compile-time)
- Pandas (zero runtime via codegen)

Marketplaces choose: zero-runtime CSS unless DX justifies the cost.

### Tree-shake aggressively

Use ES modules:

```js
// Good — imports only what's used
import { format } from 'date-fns/format';

// Bad — imports entire library
import * as dateFns from 'date-fns';
const x = dateFns.format(...);
```

Audit bundle:

```bash
npm install --save-dev webpack-bundle-analyzer
# Or for Vite/Rollup: rollup-plugin-visualizer
```

## Server-side rendering / SSG

Generate pages server-side or at build time:

| Page | Strategy |
|---|---|
| Homepage | ISR (Incremental Static Regeneration), revalidate every 60s |
| Category pages | ISR, revalidate every 5 min |
| PDP | ISR, revalidate every 5 min (stock check at runtime) |
| Brand pages | ISR, daily revalidate |
| Account / Cart / Checkout | SSR or CSR (per-user) |

Next.js example:

```jsx
// app/p/[slug]/page.tsx
export const revalidate = 300; // 5 minutes

export default async function ProductPage({ params }) {
  const product = await getProduct(params.slug);
  return <ProductDetail product={product} />;
}
```

## API patterns

### Edge functions for read-heavy

Push common reads to the edge:

```ts
// Edge function for category products
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { category, page } = parseQuery(req);
  const products = await getProducts({ category, page });
  
  return Response.json(products, {
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600'
    }
  });
}
```

### Batching

Avoid N+1 queries:

```ts
// Bad
for (const product of products) {
  const reviews = await getReviews(product.id); // N queries
}

// Good
const reviews = await getReviewsForProducts(products.map(p => p.id));
```

### GraphQL pitfalls

GraphQL is flexible but enables clients to over-fetch. Use:
- Persisted queries (server allowlist)
- Query depth limits
- Per-field rate limits

## Third-party scripts

Each third-party script is a tax on performance. Audit ruthlessly.

Common offenders:
- Google Tag Manager (loads many other scripts)
- Hotjar / FullStory (heavy)
- Live chat widgets (Intercom, etc.)
- Ad networks
- Sentry / error tracking (lightweight if configured correctly)

Strategies:
- Load on idle (`requestIdleCallback`)
- Load after user interaction
- Load only on specific pages (no chat widget on checkout)
- Server-side analytics where possible

## Caching tiers

```
User
  ↓
Browser cache (1-7 days for static)
  ↓
Service Worker cache (offline + faster repeat)
  ↓
CDN cache (s-maxage, edge nodes)
  ↓
Origin cache (Redis, application-level)
  ↓
Database
```

Each tier reduces load on the next. Aim for cache hit rates >95% at CDN.

### Cache headers

```
Static assets (immutable):
  Cache-Control: public, max-age=31536000, immutable

HTML pages (ISR):
  Cache-Control: public, s-maxage=300, stale-while-revalidate=600

API responses (per-user):
  Cache-Control: private, max-age=0, must-revalidate

API responses (shared):
  Cache-Control: public, s-maxage=60
```

## Compression

- **Brotli**: smaller than gzip, supported widely now
- **gzip**: fallback
- Configure CDN/server to serve Brotli when accepted

```
Accept-Encoding: br, gzip, deflate
```

Most CDNs (Cloudflare, Fastly, Vercel, AWS CloudFront) support Brotli out of the box.

## Pre-loading

```html
<!-- Hero image -->
<link rel="preload" as="image" href="/hero.avif" type="image/avif" fetchpriority="high">

<!-- Critical font -->
<link rel="preload" as="font" href="/fonts/tajawal-700.woff2" type="font/woff2" crossorigin>

<!-- Critical script -->
<link rel="modulepreload" href="/scripts/critical.js">
```

Don't over-preload. >5-10 preloads = browser delays everything.

## Prefetching

When user is likely to navigate, prefetch the destination:

```jsx
<Link 
  to={`/p/${product.slug}`}
  onMouseEnter={() => prefetch(`/p/${product.slug}`)}
>
```

Or use Next.js Link, which auto-prefetches on viewport.

## Render strategies by viewport

### Above-the-fold
- Server-rendered or static
- Critical CSS inlined
- Hero image preloaded
- No JS required to render

### Below-the-fold (lazy)
- Skeleton shown initially
- Components lazy-loaded
- Images lazy-loaded
- Hydrate when scrolled into view (React Server Components, Astro, Qwik)

## Mobile-specific performance

See companion skill `beauty-mobile-first/references/network-and-offline.md`.

Key points:
- Touch responsiveness critical (INP <100ms)
- 50% smaller images on small screens
- Even tighter JS budget (slower CPUs)
- Service worker for instant repeat loads
- Skeleton during slow networks

## RTL performance

Arabic text rendering is not slower than Latin. BUT:
- Arabic fonts add 100-150KB to font budget
- Use `unicode-range` to load Arabic font only when needed
- Subset fonts to commonly used Arabic glyphs

```css
@font-face {
  font-family: 'Tajawal';
  src: url('tajawal-700.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
}
```

## Common performance killers

| Killer | Impact | Fix |
|---|---|---|
| Unoptimized hero image | LCP +1-2s | AVIF, preload, fetchpriority |
| Synchronous third-party scripts | Blocks rendering | Async, defer, or remove |
| Web fonts without `font-display` | FOIT, blocks LCP | `font-display: swap` |
| Inline base64 images | Bloats HTML | External + lazy |
| Heavy hydration | INP spikes | Islands, Server Components |
| N+1 API calls | Slow API responses | Batch, denormalize |
| Unindexed DB queries | Slow TTFB | Add indexes |
| No caching | Every request hits origin | CDN + edge + browser cache |
| Layout shifts from late content | CLS >0.25 | Reserve space, skeleton |
| Long tasks (>50ms) | INP poor | Break up work, scheduler.yield |

## Performance regression prevention

### CI checks

```yaml
# .github/workflows/perf.yml
- name: Lighthouse CI
  run: npx @lhci/cli@latest autorun
  env:
    LHCI_BUILD_CONTEXT__CURRENT_BRANCH: ${{ github.head_ref }}
```

Fail PR if:
- LCP > 2.5s
- CLS > 0.1
- INP > 200ms
- Bundle size +10% from baseline

### Bundle size monitoring

```yaml
- uses: andresz1/size-limit-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

Tracks bundle size diff per PR.

### Visual regression for CLS

Compare screenshots before/after; flag layout shifts.

## Performance budgets per route

```json
// budgets.json
[
  {
    "path": "/",
    "resourceSizes": [
      { "resourceType": "script", "budget": 150 },
      { "resourceType": "stylesheet", "budget": 30 },
      { "resourceType": "image", "budget": 400 },
      { "resourceType": "font", "budget": 100 }
    ],
    "timings": [
      { "metric": "lcp", "budget": 2000 },
      { "metric": "cls", "budget": 0.1 },
      { "metric": "inp", "budget": 100 }
    ]
  }
]
```

Enforce per-route. Different routes have different budgets.

## Anti-patterns

- ❌ Optimizing only desktop (most users are mobile)
- ❌ Testing on fast WiFi (real users are on 4G)
- ❌ Caching too aggressively (stale prices/stock)
- ❌ Not caching enough (origin overloaded)
- ❌ Loading the entire app on first page (route-split instead)
- ❌ Massive third-party scripts for "engagement features"
- ❌ Hero image as a CSS background (can't be preloaded properly)
- ❌ No `width`/`height` on images (CLS)
- ❌ Animated loaders that hide actual performance issues
- ❌ Premature optimization (profile first, then optimize)
- ❌ Treating performance as a "one-time fix" (regressions sneak in continuously)
- ❌ Ignoring INP (focused only on FCP/LCP)
- ❌ Heavy A/B testing scripts on critical pages
- ❌ Server-side rendering everything (CSR is fine for personalized content like cart)
- ❌ Trusting Lighthouse score alone (RUM is ground truth)
