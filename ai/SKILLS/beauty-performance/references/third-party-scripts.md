# Third-Party Scripts

Every third-party script is a tax on performance. Analytics, chat widgets, ad networks, A/B test tools, marketing tags — each adds bytes, blocks rendering, fires network requests, and runs JS. They're necessary, but disciplined integration is non-negotiable.

## The cost of third parties

A "free" pixel that adds 5KB of JS:
- 5KB download (every visitor)
- 10-30ms parse + compile time
- 50-200ms execution (fetches own resources)
- Triggers more requests (typical: 3-10 per tag)
- Often blocks main thread (long task)
- Sometimes blocks rendering

10 third-party scripts at 5KB each = 50KB + 500ms+ of main-thread time. LCP slips by a second.

## Audit existing scripts

Run a third-party audit:

```bash
# WebPageTest "Third-party" view shows all third-party requests
# Lighthouse "Third-party usage" section shows time spent
```

For each, document:
- What it does
- Business value
- Performance cost (KB, MS blocked)
- Can it be removed?
- Can it be deferred?
- Can it be server-side?

Remove anything without clear ROI. Defer everything else.

## Common third parties and their cost

| Script | Typical size | Strategy |
|---|---|---|
| Google Analytics 4 | 50KB + tags | Defer, or use server-side GA4 |
| Google Tag Manager | 100KB + tags loaded inside | Defer; audit what GTM loads |
| Facebook Pixel | 80KB | Defer until after interactive |
| Hotjar | 70-150KB | Sample (5-10% of users), defer |
| FullStory | 150KB+ | Sample, defer |
| Intercom / Drift chat | 200-400KB | Defer, lazy load on click |
| Sentry | 30-80KB | Initialize after critical content |
| LinkedIn Insight | 30KB | Defer |
| Twitter conversion | 30KB | Defer |
| Klaviyo / email capture | 40KB+ | Defer |
| Live chat widget | Heavy | Lazy load on user interaction |
| Recaptcha | 100KB+ | Load only on forms |
| Stripe.js | 30KB | Load only on checkout |

## Loading strategies

### 1. Don't load it

Easiest perf win. Every script you don't load saves time.

Ask:
- Are we using this data?
- Could it be server-side instead?
- Is this critical or "nice to have"?

### 2. Server-side analytics

For GA, Mixpanel, Segment, etc., send events server-side:

```ts
// Server endpoint
app.post('/api/track', async (req, res) => {
  await fetch('https://www.google-analytics.com/mp/collect?...', {
    method: 'POST',
    body: JSON.stringify(req.body),
  });
  res.status(204).end();
});

// Client (no GA script needed)
fetch('/api/track', {
  method: 'POST',
  body: JSON.stringify({ event: 'page_view', ...data }),
});
```

Pros:
- No third-party JS
- No ad-blocker interference
- Less data leakage

Cons:
- Lose client-side automatic enrichment (user agent, etc.)
- Need to capture data manually

### 3. Defer with `async` / `defer`

```html
<!-- Bad: blocks parsing -->
<script src="https://analytics.example.com/script.js"></script>

<!-- Better: async (loads parallel, runs ASAP) -->
<script async src="https://analytics.example.com/script.js"></script>

<!-- Best: defer (loads parallel, runs after parsing) -->
<script defer src="https://analytics.example.com/script.js"></script>
```

`async` for independent scripts (analytics).
`defer` for scripts that depend on DOM.

### 4. Load after interaction

Don't load on initial page load:

```js
let loaded = false;
function loadAnalytics() {
  if (loaded) return;
  loaded = true;
  
  const script = document.createElement('script');
  script.src = 'https://analytics.example.com/script.js';
  script.async = true;
  document.body.appendChild(script);
}

// Trigger on first user interaction
['click', 'scroll', 'keydown', 'touchstart', 'mousemove'].forEach(event => {
  window.addEventListener(event, loadAnalytics, { once: true, passive: true });
});

// Or after a delay (analytics catches even bounced users)
setTimeout(loadAnalytics, 3000);
```

Hybrid: defer load by 2-3 seconds OR until interaction (whichever first).

### 5. Load on idle

```js
if ('requestIdleCallback' in window) {
  requestIdleCallback(loadAnalytics, { timeout: 3000 });
} else {
  setTimeout(loadAnalytics, 2000);
}
```

When browser is idle, load. Doesn't compete with critical work.

### 6. Lazy-load chat widget on click

Chat widgets are heavy. Don't load on page load. Show a button that loads the widget when clicked:

```jsx
function ChatButton() {
  const [loading, setLoading] = useState(false);
  
  async function openChat() {
    setLoading(true);
    
    // Load Intercom or similar script
    if (!window.Intercom) {
      await loadScript('https://widget.intercom.io/widget/APP_ID');
      window.Intercom('boot', { app_id: 'APP_ID' });
    }
    window.Intercom('show');
  }
  
  return (
    <button onClick={openChat} className="chat-button">
      {loading ? <Spinner /> : <ChatIcon />}
      Chat with us
    </button>
  );
}
```

Saves 200-400KB for users who never chat.

### 7. Partytown (run third parties in Web Worker)

[Partytown](https://partytown.builder.io/) runs third-party scripts in a Web Worker, off the main thread:

```html
<script type="text/partytown" src="https://gtm.com/gtm.js"></script>
```

Pros:
- Third-party JS doesn't block main thread
- INP improves dramatically

Cons:
- Some third-parties don't work in workers (need DOM access)
- Adds complexity

For commerce, try Partytown on GTM and FB Pixel. Major INP win.

### 8. Tag management — be careful

Google Tag Manager (GTM) is a script that loads other scripts. It compounds the problem.

Tactics:
- Audit ruthlessly what's inside GTM
- Remove unused tags
- Set trigger conditions tightly (don't fire on every page)
- Use GTM Server-Side (server hosts the tags, client just sends events)

## Per-page restrictions

Different scripts have different criticality per page:

| Script | Homepage | PDP | Cart | Checkout |
|---|---|---|---|---|
| GA | Yes | Yes | Yes | Yes (minimal) |
| FB Pixel | Yes | Yes | Yes | Conversion only |
| Hotjar | Sampled | Sampled | No | No |
| Chat widget | Yes | Yes | Yes | NO |
| A/B testing | Yes | Yes | No | NO |
| Recommendation engine | Yes | Yes | Maybe | NO |
| Ad pixels | Yes | Yes | Yes | Conversion |
| Stripe.js | No | No | Preload | Load |

**Checkout especially**: Minimize third-party scripts. They can break payments, slow conversion, and leak PII.

Configure GTM rules:
```
Trigger: Page Path != /checkout
```

## Self-hosted analytics

For privacy and performance, consider:

- **Plausible** (lightweight, EU-based, ~1KB)
- **Fathom** (similar)
- **PostHog** (self-hostable, comprehensive)
- **Umami** (open source, self-hostable)

These send much less data than GA but cover the basics for most marketplaces.

Plausible script:
```html
<script defer data-domain="example.com" src="https://plausible.io/js/script.js"></script>
```

1KB. No cookies. GDPR-friendly. Replace GA where possible.

## Specific guidance per script type

### Google Analytics 4

```html
<!-- Defer -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXX');
</script>
```

Or via GTM. Or server-side.

### Facebook Pixel

```html
<script>
!function(f,b,e,v,n,t,s){
  // ... standard FB code
}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR_PIXEL_ID');
fbq('track', 'PageView');
</script>
```

Defer:

```js
// Don't fire fbq until idle
window.fbAsyncInit = function() { /* load when ready */ };
```

Or use [Facebook Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/) (server-side).

### Hotjar / FullStory / Session recording

These are heavy. Sample down:

```js
// Only record 10% of users
const shouldRecord = Math.random() < 0.1;
const userId = getUserId();

// Or always record specific user IDs (debugging)
const debugUsers = ['user_abc', 'user_xyz'];
const isDebugUser = debugUsers.includes(userId);

if (shouldRecord || isDebugUser) {
  loadHotjar();
}
```

Don't record checkout (PII concerns) or if user has opted out.

### Live chat (Intercom, Crisp, etc.)

Lazy load on click (as shown above).

If you must auto-load, defer significantly:

```js
setTimeout(() => loadChatWidget(), 5000);
```

5 seconds in, most users are done with critical interactions.

### Stripe / Payment SDKs

Load only on checkout:

```jsx
// In checkout page
useEffect(() => {
  const script = document.createElement('script');
  script.src = 'https://js.stripe.com/v3/';
  script.async = true;
  document.body.appendChild(script);
}, []);
```

Or use Next.js Script:

```jsx
import Script from 'next/script';

<Script src="https://js.stripe.com/v3/" strategy="lazyOnload" />
```

### Recaptcha

```html
<!-- Don't auto-load -->
<!-- Load when user focuses the form -->
<form onfocus="loadRecaptcha()">
  ...
</form>
```

```js
function loadRecaptcha() {
  if (window.grecaptcha) return;
  const script = document.createElement('script');
  script.src = 'https://www.google.com/recaptcha/api.js';
  script.async = true;
  script.defer = true;
  document.body.appendChild(script);
}
```

### A/B testing tools

Optimizely, VWO, Google Optimize (deprecated) — these inject CSS/JS before render, causing FOUC (flash of unstyled content) or flicker.

If you must use one:
- Use server-side variant selection where possible
- Pre-render variants from CDN edge functions
- Minimize CSS in the experiment

Better: build A/B testing into your own framework (server-side):

```ts
// At edge
const variant = hashUserId(userId) % 2 === 0 ? 'A' : 'B';
return renderPage(variant);
```

No flicker, no third-party JS.

## Content Security Policy (CSP)

CSP restricts where scripts can load from. Helps prevent XSS and limits third-party damage:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://www.googletagmanager.com https://js.stripe.com;
  img-src 'self' https://cdn.example.com data:;
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  connect-src 'self' https://api.example.com;
```

Reject scripts from un-allowlisted origins. Catches malicious injections AND noisy third parties.

## Preconnect to third-party domains

For scripts you ARE loading, preconnect:

```html
<link rel="preconnect" href="https://www.googletagmanager.com">
<link rel="preconnect" href="https://www.google-analytics.com">
<link rel="preconnect" href="https://connect.facebook.net">
<link rel="dns-prefetch" href="https://www.googletagmanager.com">
```

Saves DNS + TCP + TLS handshake. ~100-200ms saved per script.

Don't preconnect to more than 3-4 origins — too many hurts.

## Server-Side Tagging (GTM Server-Side)

Run GTM on YOUR server, not the client. Pages send simple events; your server enriches and forwards to providers.

```
[Client] → [Your GTM Server] → [GA, FB, etc.]
```

Pros:
- One client-side script (your server)
- Full control over what's sent
- Bypass ad-blockers (technically; ethically debatable)
- Privacy controls

Cons:
- Operational overhead
- Server costs

Worth it for medium+ commerce sites.

## Cookie consent

GDPR / Saudi PDPL / UAE / Egypt laws require consent for non-essential tracking. Consent banner adds JS.

Strategies:
- Don't load tracking until consent granted
- Use minimal cookie banner library (~5KB, e.g., klaro, cookieconsent)
- For users who decline: use server-side analytics or none

```js
window.addEventListener('cookieConsent:accepted', () => {
  loadAnalytics();
});
```

For MENA:
- UAE Data Protection Law: applies
- Saudi PDPL: explicit consent required
- Egyptian Data Protection Law: applies

## Measurement

Track impact of third parties:

```js
// Performance Observer
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach(entry => {
    if (entry.entryType === 'longtask') {
      // attribution.containerType, attribution.containerSrc
      if (entry.attribution?.[0]?.containerSrc?.includes('googletagmanager')) {
        console.log('GTM long task:', entry.duration);
      }
    }
  });
});
observer.observe({ entryTypes: ['longtask'] });
```

Identify which third parties cause long tasks. Lighthouse "third-party usage" also lists this.

## Anti-patterns

- ❌ Loading 15+ third-party scripts (you're guaranteed slow)
- ❌ Synchronous third-party scripts (blocking render)
- ❌ Third parties on checkout page (high PII risk + slow)
- ❌ Trusting GTM to "handle it" without auditing what's inside
- ❌ Loading chat widget on every page load
- ❌ Multiple analytics tools (just one — usually GA + your own analytics)
- ❌ Recording 100% of sessions (massive cost, sample 1-10%)
- ❌ Loading payment SDKs on homepage
- ❌ A/B testing scripts that cause visual flicker
- ❌ Third parties without preconnect (extra latency)
- ❌ No CSP (no protection against rogue scripts)
- ❌ Ignoring cookie consent (legal risk)
- ❌ "Just in case" tracking (load only what you analyze)
- ❌ Loading retargeting pixels on pages with no commercial intent
- ❌ Trusting third parties not to break — they will; circuit-break around them
