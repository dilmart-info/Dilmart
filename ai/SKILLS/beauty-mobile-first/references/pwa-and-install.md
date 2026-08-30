# PWA & Install

A Progressive Web App is the cheapest path to "app-like" presence without building native iOS/Android apps. Installable, offline-capable, push-enabled, fast. For MENA where storage is precious on lower-end devices, PWA can win over forcing a 50MB native app download.

## Why PWA before native

| Aspect | PWA | Native |
|---|---|---|
| Build cost | One codebase, web team | Separate iOS + Android teams |
| Distribution | Direct install from URL | App stores (15-30% fees) |
| Updates | Instant (next visit) | App Store review delays |
| Discoverability | Web search + share links | App Store search only |
| Storage | KBs | 30-100MB typical |
| Push notifications | Yes (Android + iOS 16.4+) | Yes |
| Offline | Yes | Yes |
| Native APIs | Limited | Full |
| Initial load | Fast (cached) | App store download |
| Trust | Web (slight disadvantage) | App store (slight advantage) |

For most marketplaces, start PWA. Build native later if scale demands it.

## Core PWA requirements

For Add-to-Home-Screen prompt:

1. HTTPS (production)
2. Valid `manifest.json`
3. Service worker registered
4. Icons (multiple sizes)
5. `display: standalone` or `fullscreen` in manifest
6. Some user engagement (varies by browser)

## Manifest.json

```json
{
  "name": "Beauty Marketplace",
  "short_name": "Beauty Mkt",
  "description": "Beauty, hair, and salon supplies",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FFFFFF",
  "theme_color": "#E11D48",
  "lang": "en",
  "dir": "ltr",
  "categories": ["shopping", "lifestyle", "beauty"],
  
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  
  "screenshots": [
    {
      "src": "/screenshots/home-mobile.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "platform": "narrow",
      "label": "Home screen"
    },
    {
      "src": "/screenshots/product-mobile.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "platform": "narrow",
      "label": "Product page"
    },
    {
      "src": "/screenshots/home-desktop.png",
      "sizes": "1920x1080",
      "type": "image/png",
      "platform": "wide",
      "label": "Desktop view"
    }
  ],
  
  "shortcuts": [
    {
      "name": "Search",
      "url": "/search",
      "description": "Find products",
      "icons": [{ "src": "/icons/shortcut-search.png", "sizes": "192x192" }]
    },
    {
      "name": "My orders",
      "url": "/account/orders",
      "description": "Track your orders",
      "icons": [{ "src": "/icons/shortcut-orders.png", "sizes": "192x192" }]
    },
    {
      "name": "Wishlist",
      "url": "/wishlist",
      "description": "Saved products",
      "icons": [{ "src": "/icons/shortcut-wishlist.png", "sizes": "192x192" }]
    },
    {
      "name": "Cart",
      "url": "/cart",
      "description": "Your shopping cart",
      "icons": [{ "src": "/icons/shortcut-cart.png", "sizes": "192x192" }]
    }
  ],
  
  "share_target": {
    "action": "/share-receive",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

### Link from HTML

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#E11D48">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Beauty Mkt">
```

### Icon requirements

- 192×192 (standard)
- 512×512 (standard)
- Maskable variants (Android adaptive icons)
- Apple touch icon (180×180)
- Favicon (32×32, 16×16)

Maskable icons need safe area (inner 80% must contain the logo, outer 20% can be cropped by various device shapes).

## Service worker

The service worker enables offline support, caching, and push notifications.

### Registration

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    }).then(reg => {
      console.log('SW registered:', reg);
    }).catch(err => {
      console.error('SW failed:', err);
    });
  });
}
```

### Caching strategies

#### Cache-first (for assets that rarely change)

```js
const CACHE_NAME = 'beauty-mkt-v1';
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/css/main.css',
  '/js/main.js',
  '/fonts/main.woff2',
  '/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.destination === 'image') {
    // Cache-first for images
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).then(fetchResponse => {
          return caches.open('images').then(cache => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
  }
});
```

#### Network-first (for API responses)

```js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open('api').then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
```

#### Stale-while-revalidate (for the homepage)

Return cached version immediately, fetch fresh in background:

```js
self.addEventListener('fetch', (event) => {
  if (event.request.url === '/' || event.request.url.endsWith('/')) {
    event.respondWith(
      caches.open('pages').then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
  }
});
```

### Use Workbox (recommended)

Manually writing service workers is error-prone. Workbox handles common patterns:

```js
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache app shell
precacheAndRoute(self.__WB_MANIFEST);

// Images: cache-first, max 60 entries, 30 days
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

// API: network-first, fallback to cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api',
    networkTimeoutSeconds: 3,
  })
);

// Pages: stale-while-revalidate
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({
    cacheName: 'pages',
  })
);
```

## Offline experience

### Offline page

```js
// In service worker
const OFFLINE_PAGE = '/offline';

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_PAGE))
    );
  }
});
```

Offline page UI:

```
┌─────────────────────────────┐
│                             │
│         📡                  │
│                             │
│  You're offline             │
│                             │
│  Check your connection and  │
│  try again.                 │
│                             │
│  Things you can still do:   │
│  - View your saved products │
│  - View your last orders    │
│  - Browse cached categories │
│                             │
│  [ Try again ]              │
│                             │
└─────────────────────────────┘
```

### What works offline

Cache for offline:
- App shell (header, footer, nav)
- Recently viewed products
- Cart contents (local state already)
- Wishlist
- Last 5 orders
- Account info (name, email)
- Browse history

Doesn't work offline:
- New search (no cache yet)
- Checkout (needs network)
- Real-time stock check
- Order placement

### Network status indicator

```js
window.addEventListener('online', () => {
  showToast('Back online ✓');
  document.body.classList.remove('offline');
});

window.addEventListener('offline', () => {
  showToast('You\'re offline');
  document.body.classList.add('offline');
});
```

```css
body.offline::before {
  content: 'You\'re offline';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--color-warning);
  color: white;
  text-align: center;
  padding: var(--space-2);
  z-index: 100;
}
```

## Install prompt

### Custom install button

Default Chrome prompt is intrusive. Capture the event and show your own:

```js
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showCustomInstallButton();
});

function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      analytics.track('pwa_installed');
    }
    deferredPrompt = null;
  });
}
```

### When to prompt

Don't show install prompt on first visit (too aggressive). Show when:

- User has visited 3+ times OR
- User has spent >5 minutes on site OR
- User has added an item to cart OR
- User has placed an order

```js
function shouldShowInstallPrompt() {
  const visits = parseInt(localStorage.getItem('visits') || '0');
  const hasOrdered = localStorage.getItem('hasOrdered') === 'true';
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
  
  return !isInstalled && (visits >= 3 || hasOrdered);
}
```

### Install banner UI

```
┌─────────────────────────────┐
│  📱 Install Beauty Mkt       │
│  Get fast access from your   │
│  home screen                 │
│  [Install]   [Not now]   ×   │
└─────────────────────────────┘
```

- Appears as a non-intrusive banner
- Bottom of screen (above bottom nav)
- "Not now" → don't ask for 7 days
- "×" → don't ask for 30 days

### iOS install (different)

iOS doesn't support `beforeinstallprompt`. Detect iOS and show instructions:

```js
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.navigator.standalone;

if (isIOS && !isStandalone) {
  showIOSInstallInstructions();
}
```

iOS install banner:

```
┌─────────────────────────────┐
│  📱 Install this app          │
│  Tap [share icon] then       │
│  "Add to Home Screen"        │
│  [Got it]                ×    │
└─────────────────────────────┘
```

Animation showing where Safari's share icon is.

## Push notifications

### Permission flow

Don't ask immediately. Ask after relationship is established:

```js
// Bad: ask on first page load
// Good: ask after meaningful event

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  
  // Show custom soft-prompt first
  showSoftPrompt({
    message: 'Get notified when your order ships and when prices drop on items you love.',
    actions: [
      { label: 'Yes, notify me', onClick: () => Notification.requestPermission() },
      { label: 'Maybe later', onClick: dismissPrompt }
    ]
  });
}

// Trigger after:
// - First order placed
// - Adding to wishlist
// - 3rd visit
// NEVER on first page load
```

### Subscribe to push

```js
async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
  
  // Send subscription to your server
  await fetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### Receive push (in service worker)

```js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    image: data.image,
    data: { url: data.url },
    actions: data.actions || [],
    tag: data.tag,
    requireInteraction: data.priority === 'high'
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      const url = event.notification.data.url || '/';
      
      // Focus existing tab if available
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Else open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
```

### Notification types

| Type | Trigger | Action |
|---|---|---|
| Order shipped | Order status change | Open tracking page |
| Order delivered | Delivery confirmed | Open order, suggest review |
| Order arriving today | Day-of estimate | Open tracking |
| Price drop | Wishlist item price drop >10% | Open product |
| Back in stock | Wishlist item restocked | Open product |
| Flash sale | New limited-time deal | Open category |
| Cart reminder | Abandoned cart 24h | Open cart |
| Personalized recommendation | New product matches interests | Open product |

### Notification frequency

Cap to avoid annoyance:
- Max 1 per day (excluding transactional)
- User-controlled categories (in settings)
- "Quiet hours" (10pm-8am local time)
- Easy to unsubscribe

## Share API

Allow users to share products via native share sheet:

```js
async function shareProduct(product) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: product.name,
        text: `Check out ${product.name} on Beauty Marketplace`,
        url: product.url
      });
    } catch (err) {
      // User cancelled
    }
  } else {
    // Fallback: copy to clipboard or show custom share menu
    navigator.clipboard.writeText(product.url);
    showToast('Link copied');
  }
}
```

## Share target (receive shares)

The marketplace can be a share target — user shares an image from gallery → opens app's image search:

```json
// In manifest.json
"share_target": {
  "action": "/share-receive",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "title": "name",
    "files": [
      {
        "name": "image",
        "accept": ["image/*"]
      }
    ]
  }
}
```

Service worker handles `/share-receive`:

```js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/share-receive' && event.request.method === 'POST') {
    event.respondWith(handleSharedImage(event.request));
  }
});
```

## App-like polish

### Status bar

```html
<meta name="theme-color" content="#E11D48" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
```

### Splash screen (Android)

Auto-generated from manifest:
- `background_color` → splash background
- Icon → splash logo

For iOS, requires multiple splash images per device size:

```html
<link rel="apple-touch-startup-image" 
      media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)"
      href="/splash/iphone-x-portrait.png">
```

### "Standalone" detection

When user installs and opens from home screen, the app runs in standalone mode (no browser chrome):

```js
if (window.matchMedia('(display-mode: standalone)').matches) {
  document.body.classList.add('standalone');
}
```

```css
body.standalone .web-only-banner {
  display: none;
}

/* Show install prompt only in web mode */
body:not(.standalone) .install-prompt {
  display: block;
}
```

### Pull-to-refresh in standalone

PWA in standalone mode loses browser's pull-to-refresh. Implement manually:

```js
let touchStartY = 0;
let touchEndY = 0;

document.addEventListener('touchstart', (e) => {
  if (window.scrollY === 0) {
    touchStartY = e.touches[0].clientY;
  }
});

document.addEventListener('touchmove', (e) => {
  touchEndY = e.touches[0].clientY;
  const pull = touchEndY - touchStartY;
  if (pull > 0 && window.scrollY === 0) {
    document.body.style.transform = `translateY(${Math.min(pull / 2, 80)}px)`;
  }
});

document.addEventListener('touchend', () => {
  const pull = touchEndY - touchStartY;
  if (pull > 100) {
    location.reload();
  } else {
    document.body.style.transform = '';
  }
});
```

Or use a library: `pulltorefreshjs`.

## Update flow

Service worker updates on browser open. To notify users:

```js
// In main app
navigator.serviceWorker.register('/sw.js').then(reg => {
  reg.addEventListener('updatefound', () => {
    const newWorker = reg.installing;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // New version available
        showUpdateAvailableBanner();
      }
    });
  });
});

function applyUpdate() {
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  window.location.reload();
}
```

```js
// In service worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

Update banner:

```
┌─────────────────────────────┐
│  ✨ New version available    │
│  [Update]   [Later]         │
└─────────────────────────────┘
```

## Testing PWA

- Chrome DevTools → Application tab → Manifest, Service Workers
- Lighthouse PWA audit
- Test on real devices (different OS versions)
- Test offline mode
- Test install/uninstall flows
- Test push notifications (use a test server)

## Anti-patterns

- ❌ Asking for notification permission on first page load
- ❌ Aggressive install prompt before user is engaged
- ❌ Cache-first for prices/stock (always show stale data)
- ❌ Not invalidating cache on app updates (users stuck on old version)
- ❌ Push notifications more than once per day (uninstall trigger)
- ❌ Promotional pushes to all users (irrelevant pushes get blocked)
- ❌ No way to disable specific notification categories
- ❌ Service worker that breaks on first visit
- ❌ Heavy install size (PWAs should be lean)
- ❌ Different UX in standalone vs browser (should match)
- ❌ Offline page is just a "no internet" message (give them something to do)
- ❌ Forcing PWA install (users may prefer browser)
