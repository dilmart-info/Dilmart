# Network & Offline

In MENA, connectivity ranges from 5G fiber in central Dubai to spotty 3G in rural Egypt or Saudi Arabia. The marketplace must work — or fail gracefully — at every connection quality. Network resilience separates "polished app" from "frustrating experience."

## Network conditions to design for

| Condition | Bandwidth | Latency | Strategy |
|---|---|---|---|
| 5G | 100+ Mbps | <20ms | Use everything |
| 4G LTE | 5-50 Mbps | 30-80ms | Standard target |
| 3G | 1-5 Mbps | 100-300ms | Code-split, lazy load |
| Slow 3G | <1 Mbps | 300-1000ms | Skeleton, prioritize critical |
| Lie-fi | 0 effective | timeouts | Treat as offline |
| Offline | 0 | — | Cached experience |

Lie-fi (connected to a network but no actual data) is the worst. User has signal bars; nothing loads. Apps must detect timeout and treat as offline.

## Detection

### Navigator.onLine

```js
if (!navigator.onLine) {
  // We're definitely offline
}

window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);
```

Reliable for clearly offline (airplane mode, no signal). NOT reliable for slow/intermittent connections.

### NetworkInformation API

```js
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

if (connection) {
  const type = connection.effectiveType; // 'slow-2g' | '2g' | '3g' | '4g'
  const saveData = connection.saveData; // user has data-saver mode
  const downlink = connection.downlink; // Mbps
  
  connection.addEventListener('change', () => {
    console.log('Connection changed:', connection.effectiveType);
  });
}
```

Not supported on Safari. Use as enhancement, not requirement.

### Data Saver detection

```js
const saveData = navigator.connection?.saveData;

if (saveData) {
  // Reduce image quality, skip videos, less polling
}
```

Users on Data Saver want less data. Respect that:
- Lower-quality images
- No autoplay video
- Less aggressive prefetching

## Timeout strategy

Standard `fetch()` has no default timeout. Implement one:

```js
async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  }
}
```

### Timeouts per request type

| Request type | Timeout |
|---|---|
| Critical (checkout, payment) | 30s |
| Standard API | 8s |
| Image | 15s |
| Background prefetch | 5s |
| Search autocomplete | 2s |
| Analytics | 3s (best-effort) |

If a request takes longer than expected, show progress:

```js
const slowTimer = setTimeout(() => {
  showSlowConnectionMessage();
}, 3000); // After 3s, indicate slow

const response = await fetchWithTimeout(url);
clearTimeout(slowTimer);
```

## Retry strategy

### Exponential backoff with jitter

```js
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options);
      if (response.ok) return response;
      if (response.status >= 400 && response.status < 500) {
        // Don't retry client errors
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      if (i === retries - 1) throw err;
    }
    
    // Exponential backoff with jitter
    const delay = Math.min(1000 * Math.pow(2, i), 10000) + Math.random() * 1000;
    await new Promise(r => setTimeout(r, delay));
  }
}
```

### When to retry

| Status / error | Retry? |
|---|---|
| 200, 201, 204 | No (success) |
| 400 (bad request) | No (client error) |
| 401 (unauthorized) | No (auth issue) |
| 403 (forbidden) | No (permission) |
| 404 (not found) | No (don't pound a missing resource) |
| 429 (rate limited) | Yes, with respect for `Retry-After` header |
| 500-504 (server error) | Yes (transient) |
| Network error / timeout | Yes |

### User-initiated retry

For failed actions, give the user a retry button:

```
⚠ Couldn't load products
Check your connection and try again.

[ Retry ]
```

Don't auto-retry forever in the background. Visible button = user feels in control.

## Optimistic UI

Update UI immediately, sync later. Revert on failure.

### Add to cart

```js
function addToCart(productId) {
  // 1. Optimistic update
  const previousCart = [...cart];
  setCart([...cart, productId]);
  updateCartBadge(cart.length + 1);
  showToast('Added to cart');
  
  // 2. Sync with server
  api.addToCart(productId)
    .catch(err => {
      // 3. Revert on failure
      setCart(previousCart);
      updateCartBadge(previousCart.length);
      showToast('Couldn\'t add to cart. Try again.', 'error');
    });
}
```

### When NOT to use optimistic UI

- Payment / checkout (too critical)
- Account-changing actions (delete, change email)
- Anything irreversible

For these, show explicit "Processing..." state and wait for confirmation.

## Image loading

### Lazy load

```html
<img src="placeholder.jpg" 
     data-src="actual-image.jpg" 
     loading="lazy" 
     decoding="async"
     width="300" 
     height="300"
     alt="Product name">
```

- `loading="lazy"` native browser lazy-loading
- `decoding="async"` doesn't block render
- Specify `width` and `height` to prevent CLS

### Progressive image loading

Show low-quality placeholder, swap with high-quality when loaded:

```html
<picture>
  <source srcset="image.avif" type="image/avif">
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" 
       loading="lazy"
       style="background: url('data:image/svg+xml;base64,...') center/cover">
</picture>
```

Or use BlurHash / ThumbHash for tiny placeholder:

```js
import { decode } from 'blurhash';

const blurhash = product.imageBlurhash;
const canvas = document.createElement('canvas');
canvas.width = 32;
canvas.height = 32;
const ctx = canvas.getContext('2d');
const pixels = decode(blurhash, 32, 32);
const imageData = ctx.createImageData(32, 32);
imageData.data.set(pixels);
ctx.putImageData(imageData, 0, 0);
img.style.backgroundImage = `url(${canvas.toDataURL()})`;
```

### Responsive images

```html
<img 
  src="image-400.jpg"
  srcset="image-200.jpg 200w, 
          image-400.jpg 400w, 
          image-800.jpg 800w, 
          image-1200.jpg 1200w"
  sizes="(max-width: 600px) 90vw, 
         (max-width: 1200px) 45vw, 
         400px"
  loading="lazy"
  alt="Product">
```

Browser picks the best size for current viewport.

### Image quality by connection

```js
function getImageUrl(product, size = 'medium') {
  const connection = navigator.connection;
  const saveData = connection?.saveData;
  const slowConnection = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
  
  if (saveData || slowConnection) {
    return product.images.thumbnail; // 100x100, 5KB
  }
  
  return product.images[size]; // standard size
}
```

## Code splitting

Don't ship the entire app in one bundle. Split by route, feature, and behavior.

### Route-based splitting

```jsx
import { lazy, Suspense } from 'react';

const ProductPage = lazy(() => import('./ProductPage'));
const Checkout = lazy(() => import('./Checkout'));

<Suspense fallback={<Skeleton />}>
  <Route path="/p/:slug" element={<ProductPage />} />
  <Route path="/checkout" element={<Checkout />} />
</Suspense>
```

### Feature-based splitting

Heavy features loaded on-demand:

```js
// Image zoom only loaded when user opens gallery
async function openZoomGallery() {
  const { default: PhotoSwipe } = await import('photoswipe');
  // ... initialize
}
```

### Payment SDKs loaded only when needed

```js
async function loadPaymentSDK(method) {
  switch (method) {
    case 'stripe':
      return import('@stripe/stripe-js').then(m => m.loadStripe(KEY));
    case 'tabby':
      return import('@/payment/tabby');
    // ...
  }
}
```

## Prefetching

When user is about to navigate, prefetch the destination:

### Link hover prefetch

```jsx
<Link 
  to={`/p/${product.slug}`}
  onMouseEnter={() => prefetchProductPage(product.slug)}
  onFocus={() => prefetchProductPage(product.slug)}
>
  ...
</Link>
```

On mobile, prefetch on touch start (before tap completes):

```jsx
onTouchStart={() => prefetchProductPage(product.slug)}
```

### Idle prefetch

When browser is idle, prefetch likely next pages:

```js
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    prefetchTopCategories();
    prefetchCartIfNotEmpty();
  });
}
```

### Service worker prefetch

```js
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('app-shell').then(cache => 
      cache.addAll([
        '/',
        '/categories',
        '/search',
      ])
    )
  );
});
```

## Loading states

### Spinner vs skeleton

Use skeleton when content shape is predictable:

```html
<div class="skeleton-card">
  <div class="skeleton-image"></div>
  <div class="skeleton-line skeleton-title"></div>
  <div class="skeleton-line skeleton-subtitle"></div>
  <div class="skeleton-line skeleton-price"></div>
</div>
```

Use spinner only for:
- Action processing (button click → spinner inside button)
- Search submitted (just before results)
- Login/auth flow

### Don't show spinner under 200ms

If response is fast, no spinner needed. Avoid flicker:

```js
let timer;
function showLoadingIfSlow() {
  timer = setTimeout(() => setLoading(true), 200);
}

async function loadData() {
  showLoadingIfSlow();
  const data = await fetch(...);
  clearTimeout(timer);
  setLoading(false);
  setData(data);
}
```

## Error states

### Network error

```
┌─────────────────────────────┐
│  ⚠ Couldn't load            │
│                             │
│  We're having trouble        │
│  connecting. Check your     │
│  internet and try again.    │
│                             │
│  [ Retry ]                  │
└─────────────────────────────┘
```

### Slow connection warning

```
┌─────────────────────────────┐
│  ⏳ This is taking longer    │
│  than usual...              │
│                             │
│  Still loading, please wait │
└─────────────────────────────┘
```

Appears after 3s of slow load. Reassures user the app is still working.

### Server error (5xx)

```
┌─────────────────────────────┐
│  ⚠ Something went wrong     │
│                             │
│  We're working on it.       │
│  Please try again shortly.  │
│                             │
│  [ Retry ]   [ Reload ]     │
└─────────────────────────────┘
```

Differentiate from network error — the issue is server-side, not user's connection.

### Stale data warning

If user is viewing cached data while offline:

```
┌─────────────────────────────┐
│  📡 Offline — showing cached │
│  data from 2 minutes ago    │
└─────────────────────────────┘
```

Subtle banner at top, doesn't block content.

## Background sync

Service worker can defer failed requests and retry when online:

```js
// In main app
async function sendOrderRequest(orderData) {
  try {
    return await fetch('/api/orders', { method: 'POST', body: orderData });
  } catch (err) {
    // Queue for background sync
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('order-submit');
      // Store data in IndexedDB for sync to pick up
      await storeOrderForSync(orderData);
    }
  }
}

// In service worker
self.addEventListener('sync', (event) => {
  if (event.tag === 'order-submit') {
    event.waitUntil(retrySubmitOrders());
  }
});

async function retrySubmitOrders() {
  const pending = await getPendingOrders();
  for (const order of pending) {
    try {
      await fetch('/api/orders', { method: 'POST', body: order });
      await removePendingOrder(order.id);
    } catch (err) {
      // Will retry next sync event
    }
  }
}
```

Background sync requires browser support (Chrome, Edge). Fallback: retry in foreground on next visit.

## Polling vs WebSocket

For real-time data (order status, live prices), choose wisely:

### Polling

```js
async function pollOrderStatus(orderId) {
  while (true) {
    const status = await api.getOrderStatus(orderId);
    updateUI(status);
    if (status === 'delivered' || status === 'cancelled') break;
    await new Promise(r => setTimeout(r, 30000)); // every 30s
  }
}
```

Pros: simple, works through proxies.
Cons: wasted requests, latency.

### Server-Sent Events (SSE)

```js
const events = new EventSource('/api/orders/123/events');
events.addEventListener('status-change', (e) => {
  const status = JSON.parse(e.data);
  updateUI(status);
});
```

Pros: real-time, simple.
Cons: server-to-client only.

### WebSocket

```js
const ws = new WebSocket('wss://api.example.com/orders/123');
ws.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  updateUI(data);
});
```

Pros: bidirectional, real-time.
Cons: complex, requires server infra.

For most use cases (order updates, stock changes), SSE is simplest and sufficient.

## Bandwidth-aware features

### Auto-quality on video

```js
const connection = navigator.connection;
const isSlowConnection = connection?.effectiveType === '3g' || connection?.effectiveType === 'slow-2g';

if (videoEl) {
  videoEl.src = isSlowConnection ? video.lowQualityUrl : video.standardUrl;
}
```

### Preload images strategically

```html
<!-- For LCP image, preload -->
<link rel="preload" as="image" href="hero.jpg" fetchpriority="high">

<!-- For below-the-fold, lazy -->
<img loading="lazy" ...>
```

### Defer non-critical resources

```html
<!-- Critical CSS inline -->
<style>/* critical CSS */</style>

<!-- Non-critical CSS deferred -->
<link rel="preload" href="non-critical.css" as="style" onload="this.rel='stylesheet'">
```

## Service worker caching tiers

| Tier | Content | Strategy | TTL |
|---|---|---|---|
| App shell | HTML, JS, CSS, fonts | Cache-first | Forever (versioned) |
| Static assets | Logos, icons | Cache-first | 30 days |
| Product images | Lifestyle, packshots | Cache-first | 7 days, max 100 entries |
| API responses | Product list, search | Stale-while-revalidate | 1 hour |
| User data | Cart, account | Network-first | 0 (always fresh if online) |
| Real-time | Stock, prices | Network-only | — |

## Cache invalidation

After deployment:
- Service worker version bumps
- Browser updates SW in background
- Notify user of update (banner) and reload on consent

```js
// Versioned cache names
const CACHE_VERSION = 'v2';
const CACHE_NAME = `app-shell-${CACHE_VERSION}`;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
});
```

## Anti-patterns

- ❌ No timeout on fetch (waits forever on lie-fi)
- ❌ Aggressive retries that pound failing servers
- ❌ Caching API responses for too long (stale prices)
- ❌ Caching user-specific data with shared cache key
- ❌ No offline indication (user sees broken UI)
- ❌ Spinners with no error fallback (loop forever)
- ❌ Loading entire bundle upfront (slow first load)
- ❌ Auto-playing video over cellular
- ❌ Polling every 1s (battery + data drain)
- ❌ Service worker that breaks on update (users stuck)
- ❌ Optimistic UI for irreversible actions
- ❌ "Offline" page with no useful content (just an error message)
- ❌ Different content for online vs offline (confusing)
- ❌ Treating 404 as a retry-worthy error (don't pound missing resources)
- ❌ Loading hero image at full quality on Data Saver
