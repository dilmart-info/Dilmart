---
name: beauty-i18n-rtl
description: Comprehensive guide to Arabic RTL (right-to-left) layout, multilingual support, locale-specific formatting, mixed-direction text handling, and Arabic typography for the beauty marketplace. Use this skill whenever building any UI that must support Arabic alongside English, or any other RTL language. Arabic users in MENA are the primary audience — RTL is not an afterthought, it's a first-class requirement equal to LTR. Trigger keywords include Arabic, RTL, right-to-left, العربية, اللغة العربية, dir, bidirectional, locale, internationalization, i18n, translation, multilingual, Tajawal, Cairo, Noto Arabic, mirroring, logical properties.
---

# Beauty Marketplace i18n & RTL

The marketplace must work flawlessly in Arabic. Not "supports Arabic as a translation" — be **Arabic-native**. Layout, typography, numbers, dates, currency, icons, and motion all flip or adapt. The Arabic user experience must be as polished as the English one — or better, since most competitors get it wrong.

## Hard rules

1. **Use logical CSS properties.** Never use `left`/`right` directly. Use `inline-start`/`inline-end`. The CSS engine flips them automatically based on `dir` attribute.
2. **Apply `dir="rtl"` at `<html>` level.** Don't sprinkle it through components.
3. **Numbers stay LTR within Arabic text.** Prices, quantities, dates use Western digits within Arabic body (per modern convention).
4. **Test BOTH directions for every screen.** Every PR includes RTL screenshots.
5. **Mirror icons that have direction.** Arrows, chevrons, back buttons. Don't mirror logos or directional content that retains meaning (e.g., a "5 stars" rating).
6. **Translate, don't translate-and-pray.** Use professional translators familiar with beauty/cosmetics terminology and MENA dialects.
7. **Locale-aware everything.** Numbers, dates, currency, plurals, sorting all respect locale.
8. **Font fallback for Arabic.** Latin fonts don't include Arabic glyphs — must pair Latin + Arabic fonts deliberately.

## Languages to support

| Priority | Language | Locale | Direction | Notes |
|---|---|---|---|---|
| P0 | English | en | LTR | Default for global audience |
| P0 | Arabic | ar | RTL | Primary MENA language |
| P1 | Arabic (Egyptian) | ar-EG | RTL | Egypt-specific tweaks |
| P1 | Arabic (Saudi) | ar-SA | RTL | KSA-specific |
| P2 | French | fr | LTR | Morocco, Lebanon, Algeria |
| P2 | Urdu | ur | RTL | Indian/Pakistani diaspora in Gulf |
| P3 | Persian/Farsi | fa | RTL | Iran-bordering markets |
| P3 | Hindi | hi | LTR | Indian diaspora |
| P3 | Tagalog | tl | LTR | Filipino diaspora |

P0 launches with both English and Arabic. Others added based on market data.

## Reference files

| File | Purpose |
|---|---|
| `references/logical-css.md` | Logical properties, RTL CSS patterns |
| `references/arabic-typography.md` | Fonts, sizing, line-height, mixed text |
| `references/translation-workflow.md` | How to translate, what to translate, glossary |
| `references/locale-formatting.md` | Numbers, dates, currency, addresses per locale |
| `references/bidi-text-handling.md` | Mixed-direction text, names, addresses, code |
| `references/icons-and-mirroring.md` | Which icons flip, which don't, asset organization |
| `references/search-and-synonyms.md` | Arabic search, transliteration, brand names |

## Language detection & switching

### Default language

```js
function getDefaultLocale() {
  // 1. URL has /ar/ or /en/ prefix
  const urlLocale = window.location.pathname.match(/^\/(ar|en)\//)?.[1];
  if (urlLocale) return urlLocale;
  
  // 2. User cookie/preference
  const stored = localStorage.getItem('locale');
  if (stored) return stored;
  
  // 3. Browser language
  const browser = navigator.language.split('-')[0];
  if (['ar', 'en'].includes(browser)) return browser;
  
  // 4. Country-based default (use IP-detected country)
  const country = getCountryFromIP();
  const arabCountries = ['AE', 'SA', 'EG', 'KW', 'QA', 'BH', 'OM', 'JO', 'LB', 'IQ', 'MA', 'TN', 'DZ'];
  return arabCountries.includes(country) ? 'ar' : 'en';
}
```

### Language switcher in UI

```
┌──────────────────────────┐
│  EN | عربي                │  ← in header
└──────────────────────────┘
```

Always show:
- "Switch to English" in Arabic-named link: "English"
- "Switch to Arabic" in Arabic-named link: "العربية"

Never just two flags (flags ≠ languages: Saudi flag for Arabic excludes Egyptians).

### URL structure

```
beautymarketplace.com/en/p/anti-dandruff-shampoo
beautymarketplace.com/ar/p/anti-dandruff-shampoo

OR (newer convention):
beautymarketplace.com/p/anti-dandruff-shampoo?lang=ar
```

URL prefix is preferred:
- Better SEO (separate URLs per language)
- Easier to share
- hreflang tags work cleanly

### hreflang tags

```html
<link rel="alternate" hreflang="en" href="https://beautymkt.com/en/p/shampoo">
<link rel="alternate" hreflang="ar" href="https://beautymkt.com/ar/p/shampoo">
<link rel="alternate" hreflang="x-default" href="https://beautymkt.com/en/p/shampoo">
```

`x-default` is for users whose language isn't matched.

## Document-level direction

```html
<html lang="ar" dir="rtl">
  <head>...</head>
  <body>...</body>
</html>
```

OR for English:

```html
<html lang="en" dir="ltr">
```

This single attribute flips the entire layout when using logical CSS properties. Don't set `dir` on inner elements unless mixing directions intentionally (e.g., embedding English in Arabic prose).

## Core CSS patterns

### Use logical properties

```css
/* BAD — direction-specific */
.card {
  padding-left: 16px;
  margin-right: 8px;
  border-left: 1px solid;
  text-align: left;
}

/* GOOD — logical */
.card {
  padding-inline-start: 16px;
  margin-inline-end: 8px;
  border-inline-start: 1px solid;
  text-align: start;
}
```

| Physical | Logical |
|---|---|
| `left` | `inline-start` |
| `right` | `inline-end` |
| `top` | `block-start` |
| `bottom` | `block-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `border-left` | `border-inline-start` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |
| `float: left` | `float: inline-start` |

### Flexbox/Grid (already direction-aware)

Flex and Grid honor `direction` automatically:

```css
.flex-row {
  display: flex;
  flex-direction: row;
  gap: 16px;
}
```

In LTR, items go left → right. In RTL, items go right → left. No code changes needed.

### When you DO need direction-specific

For genuinely physical/absolute elements:

```css
/* Tooltip positioned absolutely */
.tooltip {
  inset-block-start: 100%;
  inset-inline-start: 0; /* aligns to start side */
  /* Could also use start/end shorthand */
}

[dir="rtl"] .arrow {
  transform: scaleX(-1); /* mirror arrow icon */
}
```

## Component-level flips

### Header

```
LTR:                              RTL:
┌──────────────────────────┐     ┌──────────────────────────┐
│ [Logo] [Search] [Cart]   │     │   [Cart] [Search] [Logo] │
└──────────────────────────┘     └──────────────────────────┘
```

Flex automatically. No code change.

### Product card

```
LTR:                              RTL:
┌─────────────┐                  ┌─────────────┐
│ [image]     │                  │     [image] │
│             │                  │             │
│ Product     │                  │     Product │
│ AED 89  ❤️   │                  │   ❤️  89 AED │
└─────────────┘                  └─────────────┘
```

Text aligns to start (right in RTL). Heart icon stays on the corner away from text (use `inset-inline-end`).

### Breadcrumb

```
LTR:  Home > Hair > Shampoo > Anti-dandruff
RTL:  مضاد القشرة < شامبو < شعر < الرئيسية
```

Note the chevron direction flips. In CSS:

```css
.breadcrumb-separator::before {
  content: '>';
}

[dir="rtl"] .breadcrumb-separator::before {
  content: '<';
}
```

Or use a CSS rotated chevron.

### Bottom navigation

5 tabs:
```
LTR: Home | Shop | Search | Wishlist | Me
RTL:   Me | Wishlist | Search | Shop | Home
```

Grid handles this automatically.

### Carousel arrows

```
LTR:  ← Previous     Next →
RTL:  → Previous     Next ←
```

Wait — Arabic users may read carousels right-to-left, so "Next" goes left? No: the concept of "next slide" depends on the writing direction.

In Arabic:
- "Next" carousel slide should be the one revealed by swiping LEFT (i.e., user swipes right-to-left to see what's "next")
- "Next" button has a LEFT-pointing arrow (in RTL convention)

Implement:
```jsx
<button className="next-btn">
  <span>التالي</span>
  <ArrowLeft /> {/* arrow points in "forward" direction = left in RTL */}
</button>
```

### Modals, drawers, popovers

Drawers slide from start side:
- LTR: from left
- RTL: from right

```css
.drawer {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  transform: translateX(-100%); /* would be -100% in LTR */
}
```

In RTL, `translateX(-100%)` actually moves the drawer in the WRONG direction (still toward physical left). Use:

```css
.drawer {
  inset-inline-start: 0;
  transform: translateX(-100%);
}

[dir="rtl"] .drawer {
  transform: translateX(100%);
}
```

Or use logical-aware libraries (Tailwind has `rtl:` variant; CSS-in-JS often handles automatically).

## Tailwind CSS for RTL

Tailwind v3+ supports logical properties:

```html
<div class="ps-4 pe-2 ms-4 me-2 start-0 text-start">
  <!-- ps = padding-inline-start, pe = padding-inline-end -->
</div>
```

And RTL variants:

```html
<div class="ltr:pl-4 rtl:pr-4">
```

Most cases: use logical properties. Rare cases: use `ltr:`/`rtl:` variants.

## Numbers in Arabic

### Modern convention

Modern Arabic (especially in commerce and tech) uses **Western Arabic numerals (0-9)**, NOT Eastern Arabic numerals (٠-٩):

- Western: 0 1 2 3 4 5 6 7 8 9
- Eastern: ٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩

Prices, quantities, dates, phone numbers: Western numerals.

Exception: some regions and contexts (religious, traditional) use Eastern. Offer a toggle in settings if needed.

### Number flow

Numbers within Arabic text always read LTR (even though the surrounding text is RTL):

```
المنتج بسعر 89.00 درهم
```

Reads (visually right-to-left): "المنتج بسعر" then number "89.00" reads left-to-right, then "درهم".

The browser handles this automatically via Unicode bidirectional algorithm.

### Decimal separator

| Locale | Separator |
|---|---|
| ar-SA, ar-AE, ar-EG | Period (.) or comma (,) — varies |
| en-US, en-AE | Period (.) |
| fr-FR, fr-MA | Comma (,) |

Use `Intl.NumberFormat`:

```js
new Intl.NumberFormat('ar-AE', {
  style: 'currency',
  currency: 'AED'
}).format(89.50);
// "د.إ. 89.50" or "89.50 AED" depending on settings
```

## Currency display

### Format options

```js
// English
"AED 89.50"
"AED89.50"
"89.50 AED"

// Arabic
"٨٩٫٥٠ د.إ"  // with Arabic numerals
"89.50 د.إ"  // with Western numerals (preferred)
"درهم 89.50"  // with full word
```

Recommend: Western numerals + 3-letter code, position before or after:
- "AED 89.50" (English)
- "89.50 د.إ" (Arabic, currency code before number)

The marketplace's currency display should be consistent across the site.

## Date formats

```
LTR (en):  May 16, 2026
            16/05/2026
            2026-05-16

RTL (ar):  ١٦ مايو ٢٠٢٦   ← rarely used in modern apps
            16 مايو 2026   ← common
            2026/05/16    ← common
```

Use `Intl.DateTimeFormat`:

```js
new Intl.DateTimeFormat('ar-AE', {
  dateStyle: 'long'
}).format(new Date());
// "١٦ مايو ٢٠٢٦" — Arabic numerals

new Intl.DateTimeFormat('ar-AE-u-nu-latn', {
  dateStyle: 'long'
}).format(new Date());
// "16 مايو 2026" — Latin numerals (preferred for commerce)
```

`-u-nu-latn` extension forces Latin numerals in Arabic locale.

## Translation workflow

See `translation-workflow.md` for full details.

Key principles:
- Use a TMS (Translation Management System): Crowdin, Lokalise, Phrase
- Translate WITH context (string keys, descriptions, screenshots)
- Native speakers, ideally MENA-based, ideally with beauty/commerce experience
- Don't auto-translate user-generated content (reviews, vendor descriptions)
- Maintain a glossary of brand terms, beauty terminology

## RTL-specific UI patterns

### Trust indicators

Some patterns differ in MENA:
- Star ratings: 5 stars on the right (LTR), 5 stars on the left (RTL flip)
- BUT the "filled" stars start from the start side
- Stars are not directional (don't mirror the shape)

### Forms

Labels above fields (preferred for RTL — clear association):

```
الاسم الكامل *
[                                          ]

البريد الإلكتروني *
[                                          ]
```

Inline labels (label inside field) work but check Arabic font alignment.

### Phone numbers

Phone numbers are LTR even in RTL text:

```
+971 50 123 4567
```

Wrap in `<bdi>` or `<span dir="ltr">` to prevent the surrounding RTL from breaking it:

```html
<p>اتصل بنا على <bdi>+971 50 123 4567</bdi></p>
```

### Addresses

Mixed-script addresses common:

```
شارع الشيخ زايد، برج المكتب 42
Dubai, UAE
```

Don't force one direction. Use `<bdi>` for parts that mix directions.

### Code / technical strings

Always LTR (programming languages are LTR):

```css
code { direction: ltr; text-align: start; }
```

## Performance considerations

- RTL doesn't slow down rendering
- BUT loading Arabic fonts is extra (~150KB for Tajawal)
- Use `font-display: swap` to avoid FOIT
- Preload critical Arabic font weights
- Subset Arabic fonts to common characters if budget tight

## Testing

- View every page in both languages
- Use device language switcher to verify
- Check edge cases:
  - Long Arabic text (typically 20-40% longer than English)
  - Names mixing scripts ("Sarah Mohammed محمد")
  - Form validation messages
  - Email addresses (always LTR in any language)
  - URLs (always LTR)
  - Dates and times
  - Lists with mixed-language content
- Test with VoiceOver in Arabic (NVDA supports Arabic)
- Print mode (PDF generation)
- Email templates (don't forget the transactional emails)

## SEO for Arabic

- Separate Arabic URLs (`/ar/...`)
- Arabic-localized meta titles and descriptions
- hreflang tags
- Arabic structured data
- Arabic site links in Google Search
- Submit Arabic sitemap to Google Search Console
- Use Arabic anchor text for internal links

## Anti-patterns

- ❌ Using `right`/`left` instead of `start`/`end`
- ❌ Mirroring logos, brand names, or proper nouns
- ❌ Mirroring icons that have inherent direction (e.g., a microscope)
- ❌ Forcing Eastern Arabic numerals on commerce (most users prefer Western)
- ❌ Untranslated UI strings (worst: half-translated screens)
- ❌ Machine-translated brand/product descriptions
- ❌ Latin fonts trying to render Arabic (causes ugly square boxes)
- ❌ RTL CSS hacks like `.rtl .button { left: auto; right: 16px; }` everywhere (use logical properties)
- ❌ Different feature set per language (same site, different functionality)
- ❌ Date format inconsistency within a session
- ❌ Forgetting RTL for emails, PDFs, exported documents
- ❌ Logging the user's language but not respecting it on return visits
- ❌ Search that only works in one language
- ❌ Country code for currency that's culturally insensitive (use neutral codes like "AED" not flag-icons that exclude regions)
- ❌ Mixing English content in Arabic descriptions without `<bdi>` markup (breaks reading)
