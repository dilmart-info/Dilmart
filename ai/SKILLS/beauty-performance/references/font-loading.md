# Font Loading

Web fonts are non-negotiable for brand identity but they're also one of the most common performance killers. A mishandled font can add a second to LCP, cause FOIT/FOUT, and create CLS. Done right, web fonts are nearly free.

## The fundamental tradeoffs

1. **FOIT** (Flash of Invisible Text): browser hides text until font loads → bad LCP, poor accessibility
2. **FOUT** (Flash of Unstyled Text): browser shows fallback, swaps when ready → potential CLS
3. **FOFT** (Flash of Faux Text): browser fakes bold/italic with fallback → looks ugly
4. **Decision-by-default** (FOIT for 3s): browsers behave inconsistently without explicit control

You must choose explicitly. Default is bad.

## `font-display`

This single CSS property controls font loading behavior:

```css
@font-face {
  font-family: 'Tajawal';
  src: url('/fonts/tajawal-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap; /* THIS */
}
```

Values:
- `block` — hide text up to 3s, then swap (default-ish, FOIT)
- `swap` — show fallback, swap when ready (FOUT, no FOIT)
- `fallback` — brief invisible (~100ms), then fallback, swap if quick
- `optional` — brief invisible, then fallback. Never swap (no CLS)
- `auto` — browser decides

### Which to use

| Font | font-display |
|---|---|
| Brand display (rarely needed for LCP) | `optional` |
| Body text (Latin) | `swap` with `size-adjust` |
| Body text (Arabic) | `swap` with `size-adjust` |
| Headings | `swap` with `size-adjust` |
| Decorative / non-critical | `optional` |

`optional` is best for LCP. `swap` + `size-adjust` is best for visual quality.

## Preload critical fonts

```html
<link rel="preload" 
      as="font" 
      type="font/woff2" 
      href="/fonts/tajawal-400.woff2" 
      crossorigin>
```

Critical fonts (used above the fold) are preloaded:
- Body font, regular weight
- Heading font, bold weight
- Arabic equivalents (if RTL)

Don't preload all weights — 100KB of fonts upfront hurts LCP.

`crossorigin` is required for fonts (always).

## Modern font formats

| Format | Size | Browser support |
|---|---|---|
| WOFF2 | smallest | 97%+ (use this) |
| WOFF | ~30% larger than WOFF2 | universal fallback |
| TTF | ~80KB+ | legacy |
| EOT | legacy IE | not needed |

Just ship WOFF2. WOFF fallback only if your audience includes very old browsers.

## Variable fonts

A variable font = one file, multiple weights / styles.

```css
@font-face {
  font-family: 'Inter Tight';
  src: url('/fonts/inter-tight-variable.woff2') format('woff2-variations');
  font-weight: 100 900; /* range */
  font-style: normal;
  font-display: swap;
}

.bold { font-weight: 700; }
.semi-bold { font-weight: 600; }
.regular { font-weight: 400; }
```

Pros:
- One file (often smaller than 4 separate weights)
- Flexible (any weight 100-900)
- Better consistency

Cons:
- Slightly larger than single weight
- Some font features locked in variations

For Inter, Tajawal, Roboto — variable fonts are excellent choice.

## Font subsetting

Most fonts include glyphs for many languages. You only need a subset.

### Latin

```css
@font-face {
  font-family: 'Inter Tight';
  src: url('/fonts/inter-latin.woff2') format('woff2');
  font-weight: 400;
  unicode-range: U+0020-007F, U+00A0-00FF; /* Basic Latin + Latin-1 */
  font-display: swap;
}
```

Tells browser: "This font only has Latin chars."

### Arabic

```css
@font-face {
  font-family: 'Tajawal';
  src: url('/fonts/tajawal-arabic.woff2') format('woff2');
  font-weight: 400;
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF;
  font-display: swap;
}
```

Arabic Unicode ranges:
- U+0600-06FF: Arabic
- U+0750-077F: Arabic Supplement
- U+08A0-08FF: Arabic Extended-A
- U+FB50-FDFF: Arabic Presentation Forms-A
- U+FE70-FEFF: Arabic Presentation Forms-B

### Multiple subset files

Per language:

```css
@font-face {
  font-family: 'WebFont';
  src: url('/fonts/font-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF;
}

@font-face {
  font-family: 'WebFont';
  src: url('/fonts/font-arabic.woff2') format('woff2');
  unicode-range: U+0600-06FF;
}
```

Browser downloads ONLY the subsets matching characters used on the page. For Latin-only page, no Arabic font downloaded.

### Google Fonts handles this

```html
<link href="https://fonts.googleapis.com/css2?family=Tajawal&display=swap" rel="stylesheet">
```

The generated CSS file from Google Fonts already uses `unicode-range` subsets. Browser downloads only what's needed.

## Self-host vs Google Fonts

### Google Fonts CDN

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
```

Pros:
- Easy setup
- Cached cross-site (sometimes)
- Auto-subsetting

Cons:
- Extra DNS lookup + TLS
- Subject to Google's privacy policies (GDPR concern)
- Less control over caching

### Self-hosting

Download fonts, serve from your CDN:

```css
@font-face {
  font-family: 'Tajawal';
  src: url('/fonts/tajawal-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
```

Pros:
- Same origin (no extra DNS/TLS)
- Full control
- Better caching headers
- GDPR-friendly

Cons:
- Manual subsetting
- Manual updates
- Slightly more work

**Recommend self-host** for production. Use Google Fonts in dev only.

Tools to download: `next/font/google`, [google-webfonts-helper](https://gwfh.mranftl.com/fonts).

## `size-adjust` (advanced)

Prevents CLS when font swaps:

```css
@font-face {
  font-family: 'TajawalFallback';
  src: local('Arial');
  size-adjust: 105%;
  ascent-override: 90%;
  descent-override: 25%;
  line-gap-override: 0%;
}

body {
  font-family: 'Tajawal', 'TajawalFallback', sans-serif;
}
```

Concept:
- Fallback font's metrics are adjusted to match the web font
- When web font loads and swaps in, layout stays the same → no CLS

Tools:
- **Fontaine** (https://github.com/unjs/fontaine) — auto-generates fallback metrics
- **next/font** — does this automatically for Next.js

## next/font (Next.js)

```tsx
// app/layout.tsx
import { Inter_Tight, Tajawal } from 'next/font/google';

const interTight = Inter_Tight({ 
  subsets: ['latin'],
  display: 'swap',
});

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

export default function RootLayout({ children }) {
  return (
    <html className={`${interTight.className} ${tajawal.className}`}>
      <body>{children}</body>
    </html>
  );
}
```

next/font:
- Self-hosts fonts (downloads at build time)
- Generates fallback with correct metrics (no CLS)
- Subsets by language
- Preloads
- Zero runtime cost

Use it for new Next.js projects.

## Font stacks

Always provide fallbacks:

```css
:root {
  --font-sans: 'Inter Tight', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-arabic: 'Tajawal', system-ui, sans-serif;
  --font-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-mono: 'JetBrains Mono', 'Courier New', monospace;
}
```

`system-ui` is the OS's UI font (San Francisco on macOS/iOS, Segoe UI on Windows, Roboto on Android). Usually a good fallback.

## Loading strategies

### Strategy 1: Critical font preload + swap (recommended)

```html
<link rel="preload" as="font" href="/fonts/main-400.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="font" href="/fonts/main-700.woff2" type="font/woff2" crossorigin>
```

```css
@font-face {
  font-family: 'MainFont';
  src: url('/fonts/main-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

body {
  font-family: 'MainFont', system-ui, sans-serif;
}
```

Result: Font requested early, shown ASAP. Fallback during the (usually brief) load.

### Strategy 2: System font first, web font on idle

```css
body {
  font-family: system-ui, sans-serif;
}

body.fonts-loaded {
  font-family: 'MainFont', system-ui, sans-serif;
}
```

```js
if ('fonts' in document) {
  Promise.all([
    document.fonts.load('400 16px "MainFont"'),
    document.fonts.load('700 16px "MainFont"'),
  ]).then(() => {
    document.body.classList.add('fonts-loaded');
  });
}
```

System font shown immediately (instant LCP). Web font swapped after load.

Trade-off: visual brand identity less immediate.

### Strategy 3: `font-display: optional`

```css
@font-face {
  font-family: 'MainFont';
  src: url('/fonts/main.woff2') format('woff2');
  font-display: optional;
}
```

Browser tries for ~100ms. If font ready, use it. Otherwise, use fallback for entire session.

Result: zero CLS, sometimes no web font. Best LCP. Use only if web font is "nice to have."

## Preventing FOFT (faux bold/italic)

When you use a weight that isn't loaded, browser fakes it (FOFT):

```css
.foo {
  font-family: 'Tajawal';
  font-weight: 600; /* "bold" but weight 600 not loaded */
}
```

Result: Browser stretches 400 into ugly faux bold.

Fix: load the weights you use. Or use a variable font.

## Async font loading

```js
// Load all fonts on idle, then activate
const fontsToLoad = [
  new FontFace('MainFont', 'url(/fonts/main-400.woff2)', { weight: '400' }),
  new FontFace('MainFont', 'url(/fonts/main-700.woff2)', { weight: '700' }),
];

Promise.all(fontsToLoad.map(f => f.load()))
  .then(loaded => {
    loaded.forEach(f => document.fonts.add(f));
    document.body.classList.add('fonts-loaded');
  });
```

Programmatic loading lets you defer non-critical fonts to after main content paints.

## Bundle CSS includes font-face

CSS file with `@font-face`:

```css
/* fonts.css */
@font-face {
  font-family: 'Tajawal';
  src: url('/fonts/tajawal-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
```

This CSS file becomes a dependency. Browser must:
1. Download HTML
2. Parse CSS link
3. Download fonts.css
4. Parse @font-face
5. Download font

Each step adds latency. For critical fonts, inline `@font-face` in `<head>`:

```html
<style>
  @font-face {
    font-family: 'Tajawal';
    src: url('/fonts/tajawal-400.woff2') format('woff2');
    font-weight: 400;
    font-display: swap;
  }
</style>
```

Now font request starts immediately on HTML parse.

## Multilingual fonts

For RTL pages, load both Latin and Arabic:

```css
@font-face {
  font-family: 'Inter Tight';
  src: url('/fonts/inter-tight-400.woff2') format('woff2');
  unicode-range: U+0020-024F; /* Latin Extended */
  font-display: swap;
}

@font-face {
  font-family: 'Inter Tight';
  src: url('/fonts/tajawal-400.woff2') format('woff2');
  unicode-range: U+0600-06FF; /* Arabic */
  font-display: swap;
}

body {
  font-family: 'Inter Tight', system-ui, sans-serif;
}
```

Browser uses the right subset per character. Mixed Arabic + Latin text in one paragraph: each character rendered from appropriate font.

Result: only the needed font downloaded.

## Per-route font usage

Different routes use different fonts:

- Homepage: Display font (Fraunces)
- PDP: Body font only
- Account: Body font only

Per-route CSS imports only what's needed:

```css
/* homepage.css */
@font-face {
  font-family: 'Fraunces';
  src: url('/fonts/fraunces-700.woff2') format('woff2');
  font-display: optional;
}

.hero h1 { font-family: 'Fraunces'; }
```

Other routes don't import this; Fraunces isn't downloaded.

## CDN configuration

Serve fonts from CDN with:

```
Cache-Control: public, max-age=31536000, immutable
Access-Control-Allow-Origin: * (for cross-origin font loading)
Content-Type: font/woff2
```

`crossorigin` required for fonts even when same-origin. Always set CORS.

## Audit checklist

- [ ] Use WOFF2 only (skip TTF, EOT)
- [ ] `font-display: swap` or `optional` on every @font-face
- [ ] Preload critical fonts in `<head>`
- [ ] Subset to needed languages (use unicode-range)
- [ ] No more than 4-5 font files loaded initially
- [ ] Total font weight <150KB initial
- [ ] Variable fonts where supported
- [ ] Fallback fonts with `size-adjust` (Fontaine, next/font)
- [ ] Self-hosted (not Google Fonts CDN)
- [ ] Cache headers: forever
- [ ] CORS: allow

## Testing

### Chrome DevTools

1. Network tab → filter "Font"
2. See: how many fonts? what size? what timing?

### WebFontLoader

```js
import WebFont from 'webfontloader';

WebFont.load({
  custom: {
    families: ['Tajawal'],
    urls: ['/fonts.css'],
  },
  active: () => console.log('Fonts loaded'),
  inactive: () => console.log('Fonts failed'),
});
```

For complex font orchestration. Most projects don't need this.

### Visual test

Block the font URL in DevTools (right-click → Block request URL). See if site is usable / fallback acceptable.

If unusable: fallback strategy needs work.

## Common bugs

### CORS errors on fonts

```
Access to font at '...' from origin '...' has been blocked by CORS policy
```

Fix: serve fonts with `Access-Control-Allow-Origin` header.

Also: `crossorigin` attribute on `<link rel="preload" as="font">`.

### Font flickers on every page load

Cache headers wrong, or font URL changes per build.

Fix: long cache + stable URL with hash.

### Mobile loads desktop-sized fonts

Mobile might still load the full font even if it's a desktop-only weight.

Fix: media queries on font-face, or load conditionally:

```js
if (window.innerWidth >= 768) {
  // Load display fonts only on desktop
  loadFonts(['display-font.woff2']);
}
```

Or simpler: don't worry about it for typical sites.

### Arabic users see fallback font flicker

Arabic fonts are larger; FOUT more noticeable.

Fix:
- Preload Arabic fonts on Arabic pages (`<html lang="ar">`)
- Use `font-display: optional` for Arabic if subtle differences are OK

## Performance impact

Real-world examples:

- Average page font budget: 75-150KB
- Adding 2 extra weights: +60-80KB
- Adding extra language subsets: +30-50KB each
- Variable font instead of 4 weights: often saves 30-50KB

Every font file is a request. Every request has overhead. Minimize.

## Anti-patterns

- ❌ Loading 8+ font weights (you probably use 2-3)
- ❌ FOIT (block) — bad LCP, looks broken
- ❌ No `font-display` (browser default = FOIT)
- ❌ No subsetting (shipping every language's glyphs)
- ❌ Multiple font formats (woff2 alone is enough for 97%+)
- ❌ Google Fonts in production with multiple weights (slow)
- ❌ Fonts loaded async without fallback (FOUT looks bad without size-adjust)
- ❌ Display fonts on every page (waste)
- ❌ No preload on critical fonts (extra latency)
- ❌ Preloading 8 fonts (defeats LCP)
- ❌ Different font stacks per browser (inconsistent)
- ❌ Web fonts on emails (most clients don't render them)
- ❌ Web fonts on printed pages (use print-friendly system fonts)
- ❌ Forgetting `crossorigin` attribute (CORS errors)
- ❌ Latin font trying to render Arabic glyphs (squares appear)
- ❌ FOFT (faux bold) — load the weights you use
