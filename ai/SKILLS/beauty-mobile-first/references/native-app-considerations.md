# Native App Considerations

A PWA is the right starting point. But at scale — once you hit certain thresholds of user engagement, transaction volume, or platform requirements — native apps become worthwhile. This doc covers when to make that jump, how to bridge web and native, and how to manage dual presence (web + native) without doubling your team.

## When to invest in native

### Strong signals for native

1. **High install intent demonstrated** — PWA install rate >15% suggests users want an app
2. **Daily active users >50k** — economics of native start to make sense
3. **High-frequency users** — beauty subscribers, salon owners ordering weekly
4. **Push notification engagement critical** — iOS Safari push is limited; native is fuller
5. **Feature requirements** — Apple Pay/Google Pay in-app, biometric auth, deep OS integration
6. **App Store visibility** — searching the store for "beauty marketplace" is a discovery channel
7. **Geofencing / location features** — native geolocation is more reliable
8. **Performance budget exceeded** — you've optimized PWA to the max and still need more
9. **Competitive necessity** — competitors have apps and customer perception suffers

### Weak signals (don't go native)

- "Apps look more professional" — outdated perception
- "Investors want an app" — bad reason, build for users
- "PWA isn't trendy" — irrelevant; users care about working software

## Strategy options

### Option 1: PWA only (recommended start)

Build a best-in-class PWA. Skip the App Store complexity.

Pros:
- One codebase
- No store fees
- Instant updates
- Lower team cost

Cons:
- No App Store presence
- Limited iOS push (until 16.4+)
- Some users won't install PWAs

### Option 2: PWA + thin native wrappers

Wrap your PWA in a native shell:

- **Capacitor** (Ionic) — preferred for new projects
- **Cordova** — older, mature
- **PWABuilder** — Microsoft's tool for generating native wrappers from PWA

Pros:
- Reuse PWA code
- App Store presence
- Add specific native APIs as needed
- One web team builds for all platforms

Cons:
- Limited true-native feel
- App Store reviews still apply
- Performance is web's performance

This is the right middle-ground for most marketplaces.

### Option 3: True native

Separate iOS (Swift/SwiftUI) and Android (Kotlin/Jetpack Compose) apps.

Pros:
- Best performance
- Full platform integration
- True native feel

Cons:
- Two separate codebases
- Two teams (or stretched team)
- Slow iteration (App Store reviews)
- Higher maintenance cost

### Option 4: Cross-platform (React Native, Flutter)

One codebase, native UI:

- **React Native** — sharable logic with web app if React-based
- **Flutter** — separate ecosystem, but very performant

Pros:
- One codebase, two platforms
- Closer to native performance
- Significant code sharing with web

Cons:
- Some platform-specific quirks
- Library ecosystem trade-offs

For beauty marketplace, **React Native makes sense** because:
- Web team likely uses React already
- Logic (cart, API calls, business rules) can be shared
- Native modules where needed (camera, biometrics)

## Recommended path

For new marketplaces:

1. **Phase 1 (months 0-6):** PWA only. Optimize for installability.
2. **Phase 2 (months 6-12):** Capacitor wrapper for App Store presence. Add platform-specific features (Apple Pay, biometrics).
3. **Phase 3 (year 2+):** Evaluate if React Native rebuild justifies cost. Only if PWA limitations clearly costing revenue.

Most marketplaces never need Phase 3.

## Code sharing strategy

### Maximize reuse

Architect web to allow shared business logic with native:

```
/packages
  /core            ← shared business logic (TypeScript)
    /api          ← API client
    /models       ← types, schemas
    /utils        ← helpers
    /hooks        ← React hooks (work on web + RN)
  /web            ← Next.js web app
  /mobile         ← React Native or Capacitor app
```

Use monorepo (Turborepo, Nx, pnpm workspaces).

### Shared logic

```ts
// packages/core/api/cart.ts
import { z } from 'zod';

export const CartSchema = z.object({
  id: z.string(),
  items: z.array(z.object({
    productId: z.string(),
    qty: z.number(),
  })),
  totalMinor: z.number(),
});

export async function addToCart(productId: string, qty: number) {
  // Universal logic — runs anywhere
  return fetch('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ productId, qty }),
  });
}
```

Web and mobile both import this. Platform-specific bits (e.g., persisting cart locally) wrap it.

### Platform-specific UI

UI must adapt to platform conventions:
- Tab bar at bottom on iOS, can be top on Android
- Back button: iOS gesture (swipe), Android has system back button
- Navigation patterns differ

Don't force iOS UI on Android or vice versa.

## Bridge patterns (web ↔ native)

When using a wrapper (Capacitor), bridge between web and native:

### Web → native

```ts
// In web code
import { Geolocation } from '@capacitor/geolocation';

async function getLocation() {
  if (Capacitor.isNativePlatform()) {
    const coords = await Geolocation.getCurrentPosition();
    return coords;
  } else {
    // Web fallback
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve(pos),
        err => reject(err)
      );
    });
  }
}
```

### Native → web

```ts
// Send events from native to web (Capacitor)
import { App } from '@capacitor/app';

App.addListener('appUrlOpen', (event) => {
  // Deep link received
  router.navigate(event.url);
});

App.addListener('appStateChange', (state) => {
  if (state.isActive) {
    // App came to foreground — refresh data
    refreshCart();
  }
});
```

## Native-specific features

### Apple Pay

```ts
// Capacitor or RN plugin
import { ApplePay } from '@capacitor-community/apple-pay';

const result = await ApplePay.makePayment({
  paymentSummary: {
    merchantIdentifier: 'merchant.com.beauty.marketplace',
    countryCode: 'AE',
    currencyCode: 'AED',
    items: [
      { label: 'Subtotal', amount: '267.00' },
      { label: 'Shipping', amount: '0.00' },
      { label: 'Total', amount: '267.00' },
    ],
  },
});
```

Apple Pay in-app has higher conversion than web. Worth the native integration.

### Google Pay

```ts
import { GooglePay } from '@capacitor-community/google-pay';

const result = await GooglePay.requestPayment({
  totalPrice: '267.00',
  currencyCode: 'AED',
  countryCode: 'AE',
});
```

### Biometric authentication

```ts
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

async function loginWithBiometric() {
  const isAvailable = await NativeBiometric.isAvailable();
  if (!isAvailable.isAvailable) return;
  
  const verified = await NativeBiometric.verifyIdentity({
    reason: 'Log in to your account',
    title: 'Beauty Marketplace',
    subtitle: 'Use Face ID to authenticate',
  });
  
  if (verified) {
    const credentials = await NativeBiometric.getCredentials({
      server: 'com.beauty.marketplace',
    });
    // Auto-login with stored credentials
  }
}
```

Face ID / Touch ID makes login frictionless. Major UX upgrade.

### Camera (barcode, product image search)

```ts
import { Camera } from '@capacitor/camera';

const photo = await Camera.getPhoto({
  quality: 80,
  resultType: 'uri',
  source: 'CAMERA',
});

// Upload for image search
const result = await searchByImage(photo.webPath);
```

Use cases:
- Scan barcode on existing product (look it up)
- Take photo of product to search "find similar"
- Profile picture upload
- Submit review with photo

### Native push notifications

Compared to web push, native push:
- More reliable delivery
- Richer notifications (images, action buttons)
- Better engagement metrics
- iOS support is full (vs Safari's limited)

```ts
import { PushNotifications } from '@capacitor/push-notifications';

await PushNotifications.requestPermissions();
await PushNotifications.register();

PushNotifications.addListener('registration', (token) => {
  // Send token to server
  api.registerPushToken(token.value);
});

PushNotifications.addListener('pushNotificationReceived', (notification) => {
  // Handle foreground notification
});

PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
  // User tapped notification
  router.navigate(action.notification.data.url);
});
```

### Haptic feedback

```ts
import { Haptics, ImpactStyle } from '@capacitor/haptics';

await Haptics.impact({ style: ImpactStyle.Light });
```

Native haptics are richer than web Vibration API.

### Background tasks

```ts
import { BackgroundRunner } from '@capacitor/background-runner';

// Run code while app is backgrounded (e.g., sync pending orders)
BackgroundRunner.execute({
  label: 'sync-orders',
  src: 'sync.js',
});
```

Limited on iOS (background time is strict).

## Deep linking

### Universal links (iOS) / App links (Android)

When a user taps `https://beauty-marketplace.com/p/SKU` on their phone, if the app is installed, it opens the app at that product page. Otherwise, opens browser.

### Setup

#### iOS (apple-app-site-association)

Host at `/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.beauty.marketplace",
        "paths": ["/p/*", "/c/*", "/order/*", "/account/*"]
      }
    ]
  }
}
```

#### Android (assetlinks.json)

Host at `/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.beauty.marketplace",
      "sha256_cert_fingerprints": ["..."]
    }
  }
]
```

### Handle in app

```ts
// Capacitor
import { App } from '@capacitor/app';

App.addListener('appUrlOpen', (event) => {
  const url = new URL(event.url);
  const path = url.pathname;
  
  // Route to appropriate screen
  router.navigate(path);
});
```

### Custom URL scheme (fallback)

Some legacy links use custom schemes:

```
beauty://product/SKU-123
```

Handled the same way. Use Universal Links by default; custom schemes only when needed.

## Push deep linking

Notifications should open to relevant content:

```json
{
  "notification": {
    "title": "Your order has shipped",
    "body": "Track order ORD-...-A7F9"
  },
  "data": {
    "url": "/orders/ORD-20260516-A7F9K2",
    "type": "order_shipped"
  }
}
```

Tapping notification → app opens to order detail page.

## App Store strategy

### iOS App Store

Requirements:
- Apple Developer account ($99/year)
- App Store Connect setup
- App icon (1024×1024)
- Screenshots (multiple device sizes)
- App preview videos (optional but recommended)
- Privacy policy URL
- Support URL
- Review notes for App Review team

Review process:
- 1-3 day initial review
- Common rejection reasons:
  - In-app purchase rules (must use Apple's IAP for digital goods)
  - Privacy disclosures
  - Misleading screenshots
  - Crash on launch (test thoroughly)

### Google Play Store

Requirements:
- Google Play Developer account ($25 one-time)
- Play Console setup
- App icon, screenshots, feature graphic
- Privacy policy URL
- Data safety form
- Content rating

Review process:
- Hours to days
- Less strict than Apple

### App Store Optimization (ASO)

- **Title**: include brand + key term ("Beauty Marketplace — Hair, Makeup, Salon")
- **Subtitle/Short description**: 80 chars highlighting value prop
- **Description**: long-form, focus on first 3 lines (above the fold)
- **Keywords (iOS)**: 100 chars, separated by commas
- **Screenshots**: showcase 5-7 key features with captions
- **Preview video**: 15-30s
- **Localization**: per language/country (Arabic for MENA crucial)

## App Store fees

Apple and Google take 15-30% of in-app purchases:
- 30% standard
- 15% for small developers (<$1M/year) or year 2+ subscriptions
- 15% after first year for subscriptions

For physical goods (your products), App Store fees do NOT apply if checkout is web-based or external payment processor (Stripe, etc.). Use Stripe SDK or web-redirect for product purchases.

**Avoid**: using Apple/Google IAP for physical goods. Use only for genuine in-app digital purchases (premium features, etc.).

## Dual-presence strategy

Once you have native, the question is: web or native?

### Promote based on context

**On mobile web:**
```
🎁 Get the app for faster checkout
[ Open in app ] [ Continue in browser ]
```

**On desktop:**
```
[QR code]   Scan to download our app
```

### Smart banner (iOS)

```html
<meta name="apple-itunes-app" content="app-id=123456789">
```

iOS Safari shows automatic banner at top.

### Smart App Banner (custom)

For more control, build your own:

```jsx
function SmartAppBanner() {
  const isInApp = checkIfInApp();
  if (isInApp) return null;
  
  return (
    <div className="smart-banner">
      <img src="/app-icon.png" />
      <div>
        <strong>Beauty Marketplace</strong>
        <p>Get the app for faster checkout</p>
      </div>
      <a href="bma://" onClick={tryOpenApp}>Open</a>
    </div>
  );
}
```

### Don't be annoying

- Banner appears once, dismissable
- Respect dismissal for 30+ days
- Never block content
- Mobile web should still be excellent for those who choose it

## Sharing logic and data

### Account sync

User logs in on web, then opens app — should be logged in:

- Single sign-on via JWT/session token
- Store token in secure storage (Keychain on iOS, KeyStore on Android)
- Web → app handoff via Universal Link with token

### Cart sync

User adds to cart on phone (browser) → opens app → should see same cart:

- Cart stored server-side per user
- Anonymous users: cart linked to device ID or browser cookie
- Login merges anonymous cart with user's saved cart

### Wishlist, history, settings — all server-stored

Anything user creates should sync across platforms. Local-only state is bad UX.

## Performance differences

### Web (PWA)
- JS-heavy frameworks (React, Vue) ship JS
- First load: slow (download JS, parse, execute)
- Subsequent: fast (cached)

### Native wrapper (Capacitor)
- Same web code, but bundled with app (no first-load cost)
- Faster first launch
- WebView performance still web's performance

### True native / RN
- Native UI components
- Faster scrolling, animation
- Smaller binary
- Best perceived performance

## Testing

### PWA
- Browser DevTools (mobile emulation)
- Real devices via remote debugging
- BrowserStack / Sauce Labs for matrix testing

### Native (Capacitor)
- Xcode simulator (iOS)
- Android Studio emulator
- Test on physical devices (essential)
- TestFlight (iOS beta)
- Google Play Internal Testing

### Things to test specifically on native
- App launch (cold start, warm start)
- Background → foreground transition
- Push notification receipt + tap
- Deep link handling
- Network changes (cell → WiFi)
- Memory pressure (low-memory warnings)
- App version updates
- Logout and re-login

## Crash reporting & monitoring

- **Sentry** — works for web + native
- **Bugsnag** — comprehensive crash reporting
- **Firebase Crashlytics** — free, good for native

Capture:
- JS errors
- Native crashes
- Performance metrics
- User flows (breadcrumbs)

## App size

Keep native app under 50MB for download:
- Strip unused assets
- Compress images (AVIF, WebP)
- Use App Thinning (iOS) and Bundle (Android) — deliver only what user's device needs
- Lazy-load heavy assets from CDN

## Updating

### Web/PWA
- Instant — next visit gets new code
- Service worker manages updates

### Native via App Store
- Submit update, wait for review (1-3 days iOS)
- Users must manually update (or auto-update if enabled)
- Some users stuck on old versions

### Native with web content
- Capacitor with web bundle: web part updates instantly via fetch
- Use CodePush / Capgo for over-the-air updates
- Critical bug fixes can ship without App Store review

```ts
// CodePush example
import { CodePush } from '@code-push-next/capacitor-code-push';

CodePush.sync({
  installMode: 'IMMEDIATE',
});
```

## Privacy & permissions

### iOS

Required Info.plist entries:
- `NSCameraUsageDescription` — Why camera?
- `NSLocationWhenInUseUsageDescription` — Why location?
- `NSPhotoLibraryUsageDescription` — Why photo library?
- `NSFaceIDUsageDescription` — Why Face ID?

Each must clearly explain WHY the app needs access. Apple rejects vague reasons.

### Android

In `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

Request runtime permissions at moment of use, not on app start.

### Best practice

Ask for permission with context:

```
[User taps "Find my address" in checkout]

Allow location access?
We'll use your location to suggest 
your nearest delivery address.

[ Not now ] [ Allow ]
```

Don't ask for location/notifications/camera on app launch.

## Anti-patterns

- ❌ Force-redirect web visitors to App Store ("download our app to continue")
- ❌ Show app store banner on every page
- ❌ Make web a degraded experience to push native (drives users away entirely)
- ❌ Build native first before validating PWA works
- ❌ Different content/features on web vs app (creates confusion)
- ❌ Cart not syncing between web and app
- ❌ Login state not shared
- ❌ Deep links that 404 in the app
- ❌ Permission requests on first launch (no context)
- ❌ Apple/Google IAP for physical goods (loses 30%, against rules anyway)
- ❌ No way to use website on mobile (forced to download app)
- ❌ App that's just a WebView with no native value-add
- ❌ Native push notifications too frequent (uninstall trigger)
- ❌ Updates that require full re-login or re-setup
- ❌ Background tracking without disclosure
