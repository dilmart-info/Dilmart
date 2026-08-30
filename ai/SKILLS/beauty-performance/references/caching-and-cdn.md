# Caching & CDN

The fastest request is one you don't make. The next fastest is one served from the user's region. Caching at multiple layers — browser, service worker, CDN edge, origin — is the foundation of a fast marketplace serving customers across MENA from your servers anywhere.

## The cache hierarchy

```
User device
  ↓ (browser cache)
Service Worker cache
  ↓ (Workbox / custom)
CDN edge cache (Cloudflare/Fastly/etc.)
  ↓ (s-maxage)
Origin cache (Redis / app)
  ↓
Database / API
```

Each layer reduces latency and cost.

## CDN architecture

A CDN serves your content from edge locations close to users. Major options:

| CDN | Pros |
|---|---|
| **Cloudflare** | Free tier, many features, fast globally |
| **Fastly** | Most flexible (VCL), enterprise |
| **Vercel** | Tight integration with Next.js |
| **CloudFront** | AWS-native, integrates with Lambda@Edge |
| **Bunny CDN** | Affordable, MENA presence |

For MENA, ensure CDN has POPs (Points of Presence) in:
- UAE (Dubai)
- Saudi Arabia (Riyadh, Jeddah)
- Egypt (Cairo)
- Qatar / Kuwait / Bahrain

Cloudflare and Akamai have strongest MENA coverage.

## Cache-Control headers

This single header is the most important caching mechanism. Get it right.

```
Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800
```

- `public` — any cache can store (CDN OK)
- `private` — only browser, not shared caches
- `max-age=3600` — browser caches for 1 hour
- `s-maxage=86400` — CDN caches for 1 day (overrides max-age)
- `stale-while-revalidate=604800` — serve stale up to 7 days while revalidating in background

### Recipes

#### Immutable assets (JS, CSS, images with hashes in filename)

```
Cache-Control: public, max-age=31536000, immutable
```

Forever cache. URL changes when content changes (hash in name).

#### HTML page (revalidated frequently)

```
Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=600
```

- Browser: no cache (always revalidate)
- CDN: 5 min fresh, 10 min stale-while-revalidate
- Effect: 99% of requests hit CDN, page is at most 5 min stale

#### API response (per-user, dynamic)

```
Cache-Control: private, no-store
```

Don't cache. (e.g., user's cart, account)

#### API response (anonymous, dynamic)

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
```

CDN caches for 1 min. (e.g., product listing)

#### Search results

```
Cache-Control: public, s-maxage=30, stale-while-revalidate=120
```

Short cache for searches.

#### Product detail (semi-static)

```
Cache-Control: public, s-maxage=300, stale-while-revalidate=3600
```

5-minute fresh; 1-hour stale OK.

#### Static images

```
Cache-Control: public, max-age=31536000, immutable
```

Forever.

#### User-generated content (reviews)

```
Cache-Control: public, s-maxage=600
```

CDN caches; revalidate every 10 min.

## stale-while-revalidate (SWR)

`stale-while-revalidate` is the most underused powerful directive:

```
Cache-Control: s-maxage=60, stale-while-revalidate=600
```

Means:
- First 60 seconds: served from cache (fresh)
- Next 600 seconds (10 min total): served from cache (stale), CDN fetches new version in background
- After 600 seconds: cache miss, fetch new

User experience: always fast. Origin: only one request per stale window per CDN node.

Use whenever the content is OK being slightly stale (most commerce content):
- Product listings
- Search results
- Category pages
- Homepage

## ISR (Incremental Static Regeneration)

Next.js / Vercel pattern:

```jsx
// app/p/[slug]/page.tsx
export const revalidate = 300; // 5 min

export default async function ProductPage({ params }) {
  const product = await getProduct(params.slug);
  return <ProductDetail product={product} />;
}
```

Behavior:
- First request: page generated, cached at edge
- Within 5 min: served from edge cache (super fast)
- After 5 min: still served from cache, regeneration triggered
- New version replaces cache after regen completes

ISR = static performance + dynamic flexibility.

### On-demand revalidation

For changes that need immediate effect (e.g., vendor updates product):

```js
// API route
import { revalidatePath } from 'next/cache';

export async function POST(req) {
  // ... update product
  revalidatePath(`/p/${slug}`);
  return Response.json({ ok: true });
}
```

Triggered after vendor changes; updates everywhere in seconds.

## Edge functions vs origin

Some logic runs better at edge:

| Run at edge | Run at origin |
|---|---|
| Geolocation routing | Database writes |
| A/B test variant selection | Complex queries |
| Auth check (JWT verify) | Payments processing |
| Bot detection | Inventory updates |
| Personalization (cookie-based) | Sensitive operations |

```ts
// Edge function example (Vercel/Cloudflare Workers/Deno Deploy)
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const country = req.geo?.country || 'AE';
  const userId = req.cookies.get('userId');
  
  const cacheKey = `products:${country}:${userId}`;
  
  const cached = await env.KV.get(cacheKey);
  if (cached) return Response.json(JSON.parse(cached));
  
  const products = await fetch(`https://api.example/products?country=${country}`);
  await env.KV.put(cacheKey, await products.text(), { expirationTtl: 300 });
  
  return Response.json(await products.json());
}
```

## Cache keys

What constitutes "same request"?

Default: URL + method.

But sometimes more:
- `Accept-Language` (English vs Arabic content)
- `User-Agent` (mobile vs desktop)
- Country (different products available)
- Currency
- Logged-in vs anonymous

Use `Vary` header:

```
Vary: Accept-Language, Accept-Encoding, Cookie
```

Tells CDN: "Cache differently based on these headers." Each combination = separate cache entry.

Be careful with `Vary: Cookie` — every distinct cookie = separate cache. Use `Vary: Cookie` only when needed; better: split cookied/non-cookied content.

## Cache invalidation

The hardest problem in computer science.

### Time-based (best)

Let cache expire. Set realistic TTL based on how stale is OK:

| Content | TTL |
|---|---|
| Homepage | 60s |
| Category page | 5 min |
| Product page | 5 min |
| Reviews | 10 min |
| Vendor profile | 1 hour |
| Brand list | 1 day |
| Static assets | Forever (versioned) |

Most use cases don't need explicit invalidation — just wait.

### Surrogate keys / cache tags

Tag cache entries with logical groupings:

```
GET /p/shampoo
Cache-Tag: product-123, brand-456, category-789
```

When product 123 changes:

```js
await cdn.purgeByTag('product-123');
```

Purges all pages tagged with `product-123` across the CDN.

Cloudflare Enterprise, Fastly, Vercel — all support cache tags.

### URL purging

```js
await cdn.purgeUrl('https://example.com/p/shampoo');
```

Specific URL. Slower if you have many URLs to purge.

### Global purge (last resort)

```js
await cdn.purgeAll();
```

Drops everything. Use sparingly — origin gets hammered.

## Cache warming

After major content change, "warm" the cache by pre-fetching:

```js
async function warmCache(urls) {
  await Promise.all(urls.map(url => fetch(url)));
}

// After deploy, warm critical pages
const popularPages = [
  '/', '/c/hair', '/c/skin', '/c/makeup',
  ...topProducts.map(p => `/p/${p.slug}`),
];
await warmCache(popularPages);
```

CDN nodes fetch fresh content; users hit warmed cache.

## CDN-side image processing

Don't generate every image size upfront. Use CDN transforms:

```
https://cdn.example.com/img/hero.jpg?w=800&fm=avif&q=80
```

CDN transforms on first request, caches result. Reuse cached for all subsequent requests for that exact URL.

Cloudflare Images, Imgix, Cloudinary, Bunny — all support this.

Pros:
- One source image, many variants on demand
- Add new sizes/formats without re-uploading

Cons:
- First request to a new variant has CPU overhead
- More CDN cost (per-request pricing on transforms)

## DNS

CDN typically has its own DNS for fastest routing. CNAME your domain:

```
www.example.com  →  CNAME  →  example.cloudflare-dns.com
```

Or use the CDN's nameservers entirely (Cloudflare proxies all DNS).

DNS caching:
- Set high TTL for stable records (3600+)
- Set low TTL when planning DNS changes (300 before migration)

## HTTP/2 and HTTP/3

Modern protocols matter:

- **HTTP/2** — multiplexed (one connection, many requests). Enabled by default on most CDNs.
- **HTTP/3** (over QUIC) — faster on flaky networks (common in MENA). Cloudflare, Fastly support; enable if available.

Enable on origin too:
- Nginx 1.25+ supports HTTP/3
- Most modern web servers support HTTP/2

Effect: 20-30% latency reduction on slow networks.

## Compression

- **Brotli** — best ratio, all modern browsers
- **gzip** — fallback
- **deflate** — legacy

Enable both. Negotiate via `Accept-Encoding`:

```
Accept-Encoding: br, gzip, deflate
```

Most CDNs auto-compress responses. Verify in browser DevTools → response headers.

Pre-compress static assets at build time:

```
main.js          (uncompressed, 200KB)
main.js.gz       (gzip, 60KB)
main.js.br       (brotli, 50KB)
```

CDN serves the right file based on Accept-Encoding.

## Edge KV storage

Many CDNs offer key-value storage at edge:

- Cloudflare Workers KV
- Vercel Edge Config
- Deno Deploy KV
- AWS DynamoDB Global Tables

Use for:
- Feature flags
- A/B test assignments
- Country-based content variations
- Rate limiting state
- Recently-viewed products (per user)

Pros: low latency, globally distributed.
Cons: eventually consistent (writes propagate over minutes).

## Origin shielding

CDN feature: pin one "shield" POP. All other POPs go through it:

```
User → Edge POP → Shield POP → Origin
```

Edge POPs cache from Shield, not Origin directly.

Effect: Origin sees only 1 request per content per cache window, instead of N (one per POP).

Critical for high-traffic content with short TTLs.

## Cache hit ratio

Monitor:

```
Cache hit ratio = cache_hits / (cache_hits + cache_misses)
```

Good: >95% at CDN.
Excellent: >99%.
Bad: <80%.

If hit ratio is low, investigate:
- Cache TTLs too short
- Vary headers fragmenting cache
- URL parameters varying (e.g., tracking params)
- Personalized content not split correctly

### URL parameter handling

Tracking params (`utm_source`, etc.) shouldn't fragment cache:

```
/p/shampoo            ← clean URL, caches well
/p/shampoo?utm=email  ← if cached separately, hit ratio drops
```

Configure CDN to ignore tracking params:

```js
// Cloudflare Workers
const url = new URL(request.url);
const trackedParams = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid'];
trackedParams.forEach(p => url.searchParams.delete(p));
const cacheUrl = url.toString();
```

Or use Cache Rule in Cloudflare dashboard.

## Origin protection

CDN shields origin from traffic. But origin must handle CDN miss requests:

- Rate limit per origin
- Connection pooling (don't exhaust origin)
- Circuit breaker (fail fast if origin is down)
- Graceful degradation (CDN serves stale on origin error)

```
Cache-Control: public, max-age=300, stale-if-error=86400
```

If origin returns 5xx, CDN serves stale up to 1 day. Site stays up even when origin is down.

## Geographic considerations

### Multi-region origins

Closer origin = faster CDN miss responses. For MENA-focused marketplace:

- Primary: EU (Frankfurt, London) — close to MENA
- Secondary: ME (Bahrain has AWS region)
- Failover: US

CDN routes to nearest origin based on latency.

### Country-specific routing

```js
// Edge function
const country = req.geo?.country;
const origin = country === 'SA' ? 'origin-ksa.example.com' 
              : country === 'EG' ? 'origin-egypt.example.com'
              : 'origin-global.example.com';
```

Useful for regulatory data residency (some MENA countries require data in-country).

## Cache busting

When you deploy new code, browsers need new files.

### Versioned URLs

```
/static/main.abc123.js  ← URL changes when content changes
```

Old URL = old content (already in cache). New URL = new request.

### Cache-busting query strings (less ideal)

```
/static/main.js?v=2026.05.16
```

Some CDNs treat query strings differently. Hashed URLs are more reliable.

### HTML doesn't cache (or short cache)

HTML references the latest hashed asset URLs. So:

```
HTML cache: short (5 min)
Asset cache: forever
```

When you deploy, HTML is invalidated quickly, references new assets, browsers download new files.

## Service Worker caching

See `beauty-mobile-first/references/pwa-and-install.md` for full SW patterns.

Quick note: SW complements CDN. Cached at user's device for instant repeat loads. Especially important for slow MENA connections.

## Monitoring

Track:
- **Hit ratio** per content type
- **Origin bandwidth** (cost driver)
- **CDN bandwidth** (cost driver)
- **TTFB** at CDN
- **TTFB** at origin (when miss)
- **Cache age** distribution (how long served from cache)

CDN dashboards (Cloudflare Analytics, Fastly Logs) provide most of this.

## Real-time data

Some content NEEDS to be fresh:
- Cart contents
- Stock levels
- Prices (when frequently changing)
- Order status

Don't cache. Use:
- `Cache-Control: private, no-store`
- WebSocket / SSE for push updates
- ETags + conditional fetches

```
GET /cart
ETag: "abc123"

Next request:
GET /cart
If-None-Match: "abc123"
→ 304 Not Modified (no body, fast)
```

## Cost optimization

CDN cost = bandwidth + requests.

Reduce:
- Larger TTLs (fewer origin fetches)
- Image optimization (smaller bytes)
- Brotli compression
- Smart routing (fewer round trips)

Monitor: cost per 1000 requests, GB transferred. Trends matter more than absolute numbers.

## Anti-patterns

- ❌ No `Cache-Control` headers (browsers use defaults, often nothing)
- ❌ `Cache-Control: no-cache, no-store` everywhere (kills CDN value)
- ❌ Same TTL for everything (some content needs to be fresh, some doesn't)
- ❌ `private` on shared content (CDN can't cache, origin gets hammered)
- ❌ Long TTL on stock/price data (users see wrong info)
- ❌ Short TTL on static assets (waste of bandwidth)
- ❌ No `s-maxage` (CDN doesn't know to cache longer than browser)
- ❌ `Vary: User-Agent` (fragments cache wildly)
- ❌ URL params for tracking that bust cache
- ❌ Global purge on every deploy (cache stampede)
- ❌ Cache that doesn't honor purge requests (debug nightmare)
- ❌ CDN with no edge in MENA (high latency for primary audience)
- ❌ No origin shielding (origin gets request per POP per content)
- ❌ Trusting browser cache for shared assets across users (use service worker or CDN)
- ❌ Same configuration for HTML and JS/CSS (different lifecycles)
