# Arabic Typography

Arabic typography is its own design discipline. The script's cursive nature, contextual letter forms, vertical proportions, and baseline differ fundamentally from Latin scripts. Treating Arabic as "Latin in RTL" is the most common — and worst — mistake. Beautiful Arabic UI takes deliberate font choices, careful sizing, and attention to mixed-text contexts.

## Why Arabic typography is different

### Letterforms vary by position

A single Arabic letter has up to 4 different shapes based on position in a word:
- Isolated (alone)
- Initial (start of word)
- Medial (middle of word)
- Final (end of word)

```
ع   (isolated)
عـ  (initial)
ـعـ (medial)
ـع  (final)
```

The font must support all forms. Bad fonts produce disconnected letters.

### Letters connect

Most Arabic letters connect to the next letter. A few don't (called "non-joining"): ا، د، ذ، ر، ز، و

The flow of connected letters is part of the script's beauty.

### Diacritics (tashkīl)

Short vowels and other markings appear above and below letters:

```
كَتَبَ  (kataba — "he wrote", with vowels)
كتب    (without vowels — context determines reading)
```

Modern UI usually omits diacritics (cleaner, expected by Arab readers). Religious or educational contexts may include them.

### No uppercase/lowercase

Arabic has no case distinction. UI elements designed around uppercase (like ALL CAPS button labels) lose visual hierarchy in Arabic.

```
LTR: ADD TO CART (caps for emphasis)
RTL: أضف إلى السلة (no caps to differentiate)
```

Use weight, color, size, or background to create hierarchy instead of capitalization.

### Numbers within Arabic text are LTR

The Unicode bidirectional algorithm flips just the numbers, leaving the surrounding text RTL:

```
المنتج بسعر 89.50 درهم
                ↑
              reads LTR
```

This is handled automatically by browsers.

### Punctuation

Arabic uses different punctuation marks:
- Comma: ، (Unicode 060C, "Arabic comma")
- Semicolon: ؛ (Unicode 061B)
- Question mark: ؟ (Unicode 061F, mirrored)
- Period: . (same as Latin)
- Quotation marks: « » (often used in Arabic)

Punctuation appears at the start of the text (visually right in RTL):

```
ما هو هذا المنتج؟
                ↑ question mark on visual left (end in RTL)
```

Modern UI text usually mixes Latin and Arabic punctuation pragmatically. Don't worry too much about specific Unicode punctuation in casual content.

## Font selection

### Criteria for marketplace Arabic font

1. **Full character coverage** — all Arabic letters, diacritics, MENA-specific glyphs
2. **Readable at small sizes** — 14px Arabic must be clear
3. **Multiple weights** — at least 400 (regular), 500 (medium), 700 (bold)
4. **Good pairing with Latin font** — vertical proportions match
5. **License allows commercial use** — preferably OFL or commercial license

### Recommended Arabic fonts

#### Tajawal (preferred for body)

- **License**: OFL (free for commercial use)
- **Weights**: 200, 300, 400, 500, 700, 800, 900
- **Style**: Modern, geometric, highly legible
- **Best for**: Body, UI labels, headings
- **Latin pair**: Also includes Latin glyphs, but pair with Inter Tight for consistency

```css
@font-face {
  font-family: 'Tajawal';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/tajawal-regular.woff2') format('woff2');
}
```

#### Cairo

- **License**: OFL
- **Weights**: 200-900
- **Style**: Modern with subtle curves
- **Best for**: Body text, slightly softer feel than Tajawal
- **Latin pair**: Inter, Roboto, system fonts

#### Noto Sans Arabic

- **License**: OFL
- **Weights**: 100-900
- **Style**: Google's universal "designed to look harmonious"
- **Best for**: Multilingual UI where Arabic is one of many
- **Pros**: Consistent metrics with other Noto fonts

#### IBM Plex Sans Arabic

- **License**: OFL
- **Weights**: 100-700
- **Style**: Geometric, professional
- **Best for**: Corporate, modern aesthetic
- **Pairs naturally with IBM Plex Sans (Latin)

#### Aref Ruqaa (display)

- **License**: OFL
- **Style**: Classical, calligraphic
- **Best for**: Headings, premium feel, NOT body
- **Use sparingly**: decorative use only

#### Frutiger Arabic, Adobe Arabic, Neue Helvetica Arabic

- **License**: Commercial (paid)
- **Premium quality**: high typographic standard
- **Best for**: Brands willing to invest in distinctive identity

### Recommended pairing

**For Beauty Marketplace:**

| Use | English | Arabic |
|---|---|---|
| Body | Inter Tight | Tajawal |
| Headings | Fraunces | Tajawal Medium/Bold |
| Display | Fraunces | Aref Ruqaa (sparingly) or Tajawal Black |
| Monospace | JetBrains Mono | system Arabic mono |
| Numbers | Inter Tight (tabular) | Inter Tight (use Latin digits in Arabic too) |

### Font loading

```css
/* Preload critical Arabic font weights */
<link rel="preload" 
      href="/fonts/tajawal-regular.woff2" 
      as="font" 
      type="font/woff2" 
      crossorigin>

<link rel="preload" 
      href="/fonts/tajawal-bold.woff2" 
      as="font" 
      type="font/woff2" 
      crossorigin>
```

```css
@font-face {
  font-family: 'Tajawal';
  font-weight: 400;
  src: url('/fonts/tajawal-regular.woff2') format('woff2');
  font-display: swap;
  unicode-range: U+0600-06FF, U+0750-077F; /* Arabic Unicode ranges */
}
```

`unicode-range` lets browser download Arabic font ONLY when Arabic characters appear. Combined with Latin font, you serve both efficiently.

## Font stacks

```css
:root {
  --font-sans: 'Inter Tight', system-ui, -apple-system, sans-serif;
  --font-arabic: 'Tajawal', system-ui, sans-serif;
  --font-serif: 'Fraunces', Georgia, serif;
}

body {
  font-family: var(--font-sans), var(--font-arabic);
}

[lang="ar"] {
  font-family: var(--font-arabic), var(--font-sans);
}
```

`font-family` with multiple values: browser picks first one that supports the glyph being rendered. So mixed Arabic + Latin text uses Tajawal for Arabic chars, Inter Tight for Latin chars — automatically.

Listing Arabic font second in the Latin stack catches edge cases.

## Sizing

Arabic glyphs have different vertical metrics than Latin. For visual harmony, you sometimes need to size them differently.

### Default

```css
body {
  font-size: 16px;
  line-height: 1.5;
}

[lang="ar"] {
  font-size: 16px;     /* same px */
  line-height: 1.7;    /* but more line height */
}
```

Arabic letters extend higher AND lower than Latin (ascenders + descenders bigger). 1.5 line-height feels cramped. Use 1.65-1.8 for Arabic body.

### Heading sizes

Arabic words tend to be shorter than English equivalents (often 1 word in Arabic = 2-3 in English). But individual letters take more vertical space.

```css
h1 {
  font-size: 32px;
  line-height: 1.2;
}

[lang="ar"] h1 {
  font-size: 32px;
  line-height: 1.4;
}
```

### Small text

Arabic at 12px is hard to read because dot diacritics merge. Use 14px minimum for Arabic body. 12px Arabic only for incidental labels.

### Optical adjustments

Sometimes Arabic at the same nominal size LOOKS smaller than Latin (or vice versa). Designers sometimes set Arabic 1-2px larger:

```css
[lang="ar"] body {
  font-size: 17px; /* Arabic 1px larger feels visually balanced */
}
```

Test side-by-side with native Arabic readers to calibrate.

## Weight

Arabic fonts have different "weight" perception than Latin. Tajawal 400 is closer to Latin 350-400 in visual weight. To match Inter Tight 500 (semi-bold), you might need Tajawal 600.

```css
.button {
  font-weight: 500;
}

[lang="ar"] .button {
  font-weight: 600; /* matches the visual weight */
}
```

Test combinations and pick what looks balanced.

## Line height

Arabic needs MORE line height than Latin:

| Context | LTR (Latin) | RTL (Arabic) |
|---|---|---|
| Headings | 1.1-1.3 | 1.3-1.5 |
| Body | 1.4-1.6 | 1.6-1.8 |
| Small/captions | 1.3-1.4 | 1.5-1.6 |

The descenders and ascenders of Arabic letters need breathing room.

## Letter spacing (tracking)

Don't apply `letter-spacing` to Arabic. It breaks the connected nature of the script:

```css
/* Bad — Arabic letters disconnect */
.label {
  letter-spacing: 0.1em;
}

/* Good — only for Latin */
[lang="en"] .label {
  letter-spacing: 0.1em;
}
[lang="ar"] .label {
  letter-spacing: 0;
}
```

For all caps Latin labels, use `letter-spacing: 0.05em`; for Arabic equivalents, use bold weight instead.

## Mixed-script text

Mixing Latin and Arabic in the same paragraph is COMMON in MENA UI:

```
اشترِ Anti-dandruff Shampoo بسعر AED 89.50
```

Issues:
- Latin chars need Latin font
- Arabic chars need Arabic font
- Numbers should be Latin

Use a font stack that includes both:

```css
.mixed {
  font-family: 'Inter Tight', 'Tajawal', sans-serif;
}
```

The browser picks per-character. With `unicode-range` it's seamless.

### Forcing direction for embedded text

If a Latin word is embedded in Arabic, the bidi algorithm usually handles it. For edge cases:

```html
<p>اشتر <bdi>Anti-dandruff Shampoo</bdi> بسعر <bdi>89.50</bdi> درهم</p>
```

`<bdi>` (bidirectional isolate) prevents the embedded LTR text from confusing the bidi algorithm. Especially useful for user-generated content (names, brand names).

### Forcing direction with CSS

```css
.ltr-content {
  direction: ltr;
  unicode-bidi: embed;
}
```

For programmatic content (URLs, code, version numbers) — keep LTR even in RTL context.

## Numbers in Arabic

### Western Arabic numerals (preferred for commerce)

Use 0-9 (Western Arabic numerals). This is standard for modern Arabic UI, especially commerce.

```html
<p>السعر: 89.50 درهم</p>
```

### Eastern Arabic numerals (rare)

Some users in specific contexts (older audiences, religious materials) prefer ٠-٩.

Use `Intl.NumberFormat` with `nu` extension:

```js
new Intl.NumberFormat('ar-AE', { /* default uses Latin */ }).format(89.50);
// "89.50"

new Intl.NumberFormat('ar-AE-u-nu-arab', {}).format(89.50);
// "٨٩٫٥٠"  (Eastern Arabic numerals)
```

Default for marketplace: Latin. Provide setting to switch.

### Decimal separator

| Locale | Separator |
|---|---|
| Most Arabic (UAE, KSA, Egypt, Kuwait) | Period (.) — anglophone convention |
| Some traditional Arabic | Decimal comma |

For commerce, use period consistently. Aligns with how customers think about prices.

## Currency typography

```
LTR style: AED 89.50    or    $89.50
RTL style: 89.50 د.إ.   or    AED 89.50
```

### Best practice

Use 3-letter ISO code (AED, SAR, EGP) — universally recognized:

```
LTR: AED 89.50
RTL: 89.50 AED
```

Don't use currency SYMBOLS exclusively:
- د.إ. (UAE dirham symbol) — not universally recognized outside UAE
- ر.س (Saudi riyal symbol) — same issue
- £ symbol means different things in different regions

Stick with codes for clarity. Symbols OK in display but always accompanied by code.

### Tabular numbers

For prices in lists/tables, use tabular figures so digits align:

```css
.price {
  font-variant-numeric: tabular-nums;
}
```

Without this, "1" is narrower than "0", and price columns look misaligned.

## Common UI Arabic

### Labels

| English | Arabic |
|---|---|
| Add to cart | أضف إلى السلة |
| Buy now | اشترِ الآن |
| Wishlist | المفضلة |
| Search | بحث |
| My account | حسابي |
| Sign in | تسجيل الدخول |
| Sign up | إنشاء حساب |
| Checkout | الدفع |
| Delivery | التوصيل |
| Free shipping | شحن مجاني |
| In stock | متوفر |
| Out of stock | غير متوفر |
| New | جديد |
| Sale | تخفيض |
| Best seller | الأكثر مبيعاً |
| Reviews | التقييمات |
| 4.5 stars | ٤٫٥ نجوم — or 4.5 نجوم |
| Verified buyer | مشترٍ موثّق |
| Hair care | العناية بالشعر |
| Skin care | العناية بالبشرة |
| Makeup | المكياج |
| Fragrance | العطور |
| Men | للرجال |
| Women | للنساء |
| Apply | تطبيق |
| Cancel | إلغاء |
| Filter | تصفية |
| Sort | ترتيب |
| Loading | جاري التحميل |
| Error | خطأ |

These are starting points. Get final translations from native Arabic speakers familiar with MENA dialects.

### Dialects

Arabic has many dialects but writing is largely uniform (Modern Standard Arabic for formal/written; colloquial for spoken).

For marketplace UI:
- **Use MSA (Modern Standard Arabic)** — understood everywhere
- Don't use Egyptian or Gulf colloquial in UI labels (would alienate other regions)
- Brand voice can be slightly conversational MSA
- Marketing copy can incorporate dialect for specific regional campaigns

## Headings and display

Display fonts (Fraunces for Latin) often don't have Arabic equivalents. Pair Latin display with bold Arabic:

```
LTR: [Fraunces 48px Bold]
RTL: [Tajawal 48px Black]
```

Aref Ruqaa is a classical Arabic display font — gorgeous but very ornate. Use sparingly:

```
RTL hero heading: استكشف عالم الجمال
                  (Aref Ruqaa, large)

RTL subheading:  منتجات أصلية من أفضل العلامات التجارية
                 (Tajawal, smaller)
```

## Accessibility

### Font size

Don't force users below 14px in Arabic. Honor user-zoom preferences.

### Contrast

Arabic letters with thin strokes need MORE contrast than thick Latin letters. Aim for 5:1 minimum (vs 4.5:1 minimum for Latin).

### Diacritics

If users need diacritics (religious texts, education), offer toggle. Default to no diacritics for commerce UI.

### Reading direction announcement

Screen readers handle `dir="rtl"` and `lang="ar"` correctly. Test with NVDA + Arabic synth, VoiceOver in Arabic, TalkBack.

## Vertical rhythm

When mixing Arabic and Latin sections, ensure consistent baseline:

```css
/* Define rhythm in rem */
:root {
  --rhythm: 1.5rem; /* 24px at 16px base */
}

p {
  font-size: 1rem;
  line-height: var(--rhythm);
  margin-block: var(--rhythm);
}

[lang="ar"] p {
  font-size: 1.0625rem; /* slightly larger */
  line-height: 1.7;
  /* recompute rhythm to align */
}
```

Test by overlaying both versions; baselines should align.

## Special characters

### Quotation marks

```
Latin: " " or ' '
Arabic: « » or " "  (Arabic uses straight quotes commonly)
```

### Question mark

Arabic question mark is mirrored: ؟ (U+061F)

When typing on Arabic keyboard, ؟ is produced. UI should accept both ؟ and ?.

### Comma

Arabic comma is مقلوبة: ، (U+060C) — visually different from Latin comma.

### Dashes

Em dash and en dash work cross-script.

### Quotes around brand names

```
LTR: 'L'Oréal' or "L'Oréal"
RTL: «لوريال» or "لوريال"
```

## Text rendering issues

### Subscript Arabic in some browsers

Some browsers historically had issues with Arabic ligatures. Test in Chrome, Safari, Firefox on macOS, Windows, iOS, Android.

### Font fallback failures

If browser falls back to a system font lacking Arabic, you'll see squares (□□□). Always include Arabic-supporting font in fallback chain.

### Mixed font in single word

If `font-family: 'Inter Tight', 'Tajawal'` and a word has both Latin and Arabic chars (rare but possible with names), each character uses the appropriate font — but visual coherence can suffer. Acceptable trade-off for marketplace.

## Test text

Use these as test strings:

```
Short label: "أضف إلى السلة"
Medium phrase: "اكتشف أحدث منتجات العناية بالشعر"
Long body: "تستخدم هذه الصيغة المتقدمة مكونات طبيعية لإصلاح الشعر التالف وإعادة بنائه من الجذور إلى الأطراف، مما يمنحك شعراً صحياً ولامعاً."
With numbers: "اشترِ بسعر 89.50 درهم — توفير 15%"
Mixed: "Use L'Oréal Elvive for soft hair الشعر الناعم"
```

## Anti-patterns

- ❌ Latin font trying to render Arabic (square boxes)
- ❌ Same line-height for both languages (Arabic looks cramped)
- ❌ Letter-spacing on Arabic (breaks letter connections)
- ❌ All-caps treatment in Arabic (no case in Arabic)
- ❌ Tiny Arabic text below 14px (diacritics merge)
- ❌ Arabic text in italic (Arabic doesn't have italic equivalent; just slants distort letters)
- ❌ Decorative Arabic font for body (Aref Ruqaa for paragraphs is unreadable)
- ❌ Forcing Eastern Arabic numerals (٠-٩) for commerce
- ❌ Hard-coded text direction breaking bidi handling
- ❌ Arabic text without `lang="ar"` attribute (loses semantic, accessibility, font selection)
- ❌ Mixing different Arabic fonts inconsistently within UI
- ❌ Translated UI but English placeholder text in inputs
- ❌ Latin punctuation surrounded by Arabic (looks wrong; use Arabic punctuation when text is purely Arabic)
- ❌ Arabic buttons styled the same as Latin (often need slight padding adjustment for visual weight)
