# Bidirectional Text Handling

When Arabic (RTL) text mixes with English/numbers/code (LTR) in the same flow, the Unicode Bidirectional Algorithm (bidi) decides how to display it. Usually it works. Sometimes it breaks. This document covers when and how to intervene.

## The bidi algorithm in 60 seconds

Each character has a "strong" or "weak" directionality:
- **Strong LTR**: Latin letters, most CJK
- **Strong RTL**: Arabic letters, Hebrew letters
- **Weak**: Numbers, punctuation, spaces, brackets

Strong characters establish direction. Weak characters take the direction of nearby strong characters or the surrounding context.

When mixed text is rendered:
1. Identify the **base direction** (from `dir` attribute or `direction` CSS)
2. Strong runs are kept in their natural order
3. Weak chars (numbers, punctuation) attach to nearest strong run

In practice: 95% of the time, browser does the right thing. Edge cases require manual intervention.

## When bidi works automatically

```html
<p dir="rtl">
  اشتر هذا المنتج بسعر 89.50 درهم
</p>
```

Rendered correctly: Arabic flows right-to-left, "89.50" stays as `89.50` (not "50.98"), surrounded properly by Arabic text.

```html
<p dir="ltr">
  Buy this product for AED 89.50
</p>
```

Also correct: standard LTR.

## When bidi breaks

### Embedded Latin in Arabic

```html
<p dir="rtl">
  أنصح بمنتج Tresemmé Anti-Dandruff Shampoo
</p>
```

Usually fine. But if a sentence ends with the Latin name:

```html
<p dir="rtl">
  منتجنا المفضل هو Tresemmé.
</p>
```

Where does the period go? Depends on bidi resolution. Visually you might see:

```
.منتجنا المفضل هو Tresemmé
```

The period attached to the wrong side. Fix:

```html
<p dir="rtl">
  منتجنا المفضل هو <bdi>Tresemmé</bdi>.
</p>
```

### Mixed numbers and Arabic

```html
<p dir="rtl">
  9 - 5 = 4
</p>
```

Might render confusingly. The Arabic-direction context can make the equation parse weirdly. Use `<bdi>` or force LTR for the math:

```html
<p dir="rtl">
  المعادلة: <span dir="ltr">9 - 5 = 4</span>
</p>
```

### User-generated content

User types in either language. You don't know what they'll mix. Wrap UGC in `<bdi>`:

```html
<p>قال <bdi>{username}</bdi>: <bdi>{review_text}</bdi></p>
```

`<bdi>` (Bidirectional Isolate) treats its contents as an independent bidi context. The outer text isn't affected by inner directionality.

## Bidi control characters and elements

### `<bdi>` element

Best for: variable content where direction is unknown.

```html
<li>User: <bdi>{name}</bdi></li>
```

`<bdi>` adds:
- `unicode-bidi: isolate`
- A neutral container for bidi

### `<bdo>` element

Best for: forcing direction:

```html
<bdo dir="ltr">phone: 0501234567</bdo>
```

`<bdo>` is rare; `<bdi>` covers most cases.

### CSS `unicode-bidi`

```css
.isolate {
  unicode-bidi: isolate;
}

.embed {
  unicode-bidi: embed;
}

.override {
  unicode-bidi: bidi-override;
}
```

Usually you don't need these; HTML elements suffice.

### Unicode control characters (rare)

- U+202A LEFT-TO-RIGHT EMBEDDING
- U+202B RIGHT-TO-LEFT EMBEDDING
- U+202C POP DIRECTIONAL FORMATTING
- U+2066 LEFT-TO-RIGHT ISOLATE
- U+2067 RIGHT-TO-LEFT ISOLATE
- U+2068 FIRST STRONG ISOLATE
- U+2069 POP DIRECTIONAL ISOLATE

Prefer HTML/CSS solutions over raw Unicode characters.

## Common scenarios

### Name in mixed languages

```html
<p>المتجر: <bdi>Salon Beautiful Cosmetics</bdi></p>
```

The brand name might mix scripts ("سالون Beautiful بيوتيفول") — `<bdi>` ensures it displays as written.

### Email addresses

Always LTR, even in Arabic text:

```html
<p>راسلنا على <bdi dir="ltr">support@beauty.com</bdi></p>
```

### URLs

Always LTR:

```html
<a href="https://beauty.com/p/123" dir="ltr">https://beauty.com/p/123</a>
```

### Phone numbers

Always LTR:

```html
<p>اتصل بنا على <bdi dir="ltr">+971 50 123 4567</bdi></p>
```

### Order IDs / SKUs

LTR:

```html
<p>رقم الطلب: <bdi dir="ltr">ORD-20260516-A7F9K2</bdi></p>
```

### File paths / code

LTR:

```html
<code dir="ltr">/path/to/file.txt</code>
```

### Currency mixed with Arabic

```html
<p dir="rtl">السعر: <bdi>89.50 AED</bdi></p>
```

Or:

```html
<p dir="rtl">السعر: <bdi>AED 89.50</bdi></p>
```

Bidi might place AED on either side without isolation — `<bdi>` fixes the order.

### Addresses (mixed scripts)

```html
<address>
  Sarah Mohammed<br>
  <bdi>+971 50 123 4567</bdi><br>
  Villa 42, <bdi>Al Wasl Road</bdi><br>
  Dubai, UAE
</address>
```

Even in Arabic UI, English address fields don't need full reformatting if vendor's prefered. Use `<bdi>` for each line.

### Form input fields

The `dir="auto"` attribute on inputs is useful:

```html
<input type="text" dir="auto" placeholder="الاسم">
```

`dir="auto"` lets the browser detect direction based on first strong character:
- User types "Sarah" → field stays LTR
- User types "سارة" → field switches to RTL

Useful for inputs where users might type in either language.

## Pseudo-bidi for testing

Generate fake bidi text to test layout without translations:

```js
function pseudoBidi(text) {
  // Replace Latin chars with similar-looking RTL chars or wrap in markers
  return text.split('').map(c => {
    if (/[a-z]/i.test(c)) return c + '\u202E' + c + '\u202C';
    return c;
  }).join('');
}
```

More commonly: use `pseudolocalize` libraries that generate test strings.

## Bidirectional issues in lists

### List items

```html
<ul dir="rtl">
  <li>تنظيف الشعر</li>
  <li>ترطيب الشعر</li>
  <li>تصفيف الشعر</li>
</ul>
```

Bullet appears at the start (right in RTL). Browsers handle this automatically.

### Mixed-direction list

```html
<ul dir="rtl">
  <li>تنظيف الشعر</li>
  <li>Massage scalp gently</li>
  <li>Rinse with cold water</li>
  <li>تصفيف الشعر</li>
</ul>
```

Each item is independent. Bullet on start side (right). Text alignment auto-detects.

For mixed items, use `dir="auto"` on each `<li>`:

```html
<ul dir="rtl">
  <li dir="auto">تنظيف الشعر</li>
  <li dir="auto">Massage scalp gently</li>
</ul>
```

Items align to their own direction.

## Forms with bidi content

### Input alignment

```css
input, textarea {
  text-align: start; /* logical */
}

[dir="rtl"] input,
[dir="rtl"] textarea {
  text-align: right;
}
```

Or use `dir="auto"`:

```html
<input dir="auto" type="text">
```

### Placeholder text

If form is in Arabic, placeholder in Arabic:

```html
<input placeholder="اكتب بريدك الإلكتروني" type="email" dir="auto">
```

When user starts typing in Latin (email), the field switches to LTR.

### Email/URL inputs

```html
<input type="email" dir="ltr">
<input type="url" dir="ltr">
```

Force LTR for technical fields.

## Number formatting in bidi

Numbers within Arabic text take direction from surrounding context BUT digits themselves don't flip:

```
Arabic context: "السعر هو 89.50 درهم"
                            ↑
                       reads "89.50" — not "05.98"
```

If you want a number in clear LTR context:

```html
<p dir="rtl">السعر: <span dir="ltr">89.50</span> درهم</p>
```

Usually unnecessary; bidi algorithm handles it.

### Negative numbers

```
-89.50  in LTR
-89.50  in RTL (same characters, same order)
```

Minus sign attaches correctly because it's adjacent to the digits.

But for math:
```
89.50 - 25.00 = 64.50
```

In RTL context, the equation might rearrange visually:
```
89.50 - 25.00 = 64.50  (LTR — correct)
50.46 = 00.52 - 05.98  (might display wrong if bidi misreads)
```

Use `<bdi>` or `dir="ltr"`:

```html
<p>الحساب: <span dir="ltr">89.50 - 25.00 = 64.50</span></p>
```

## Code samples in Arabic content

Code is always LTR:

```html
<p>استخدم الأمر التالي:</p>
<pre dir="ltr"><code>npm install package-name</code></pre>
```

```css
pre, code, kbd, samp {
  direction: ltr;
  text-align: left;
  unicode-bidi: isolate;
}
```

## File names

File names can be in either script:

```html
<p>الملف: <bdi>my-file.txt</bdi></p>
<p>الملف: <bdi>ملفي.txt</bdi></p>
```

`<bdi>` handles both.

## SVG with text

Text in SVG also needs direction:

```html
<svg viewBox="0 0 200 100">
  <text x="100" y="50" text-anchor="middle" direction="rtl">
    مرحباً بالعالم
  </text>
</svg>
```

For mixed-direction SVG text, isolate parts:

```html
<text>
  <tspan>Hello</tspan>
  <tspan direction="rtl">مرحباً</tspan>
</text>
```

## CSS pseudo-elements

```css
.before-arrow::before {
  content: '←';
}

[dir="rtl"] .before-arrow::before {
  content: '→';
}
```

Or use logical direction in content:

```css
.next-arrow::after {
  content: '→';
}

[dir="rtl"] .next-arrow::after {
  content: '←';
}
```

Pseudo-element content inherits direction from element.

## Common bugs

### Punctuation on wrong side

```
Wrong: !مرحباً
Right: مرحباً!
```

If you generate strings dynamically:

```js
// BAD
const greeting = '!' + 'مرحباً'; // wrong

// GOOD
const greeting = 'مرحباً' + '!'; // correct in LTR storage; bidi renders correctly
```

Store strings in their natural reading order; bidi renders correctly.

### Mixed phone numbers

```html
<!-- Wrong -->
<p dir="rtl">رقم الهاتف هو +971 50 123 4567 للاتصال</p>
```

Without isolation, the phone might display weirdly when between Arabic phrases.

```html
<!-- Right -->
<p dir="rtl">
  رقم الهاتف هو <bdi>+971 50 123 4567</bdi> للاتصال
</p>
```

### Search results with mixed content

When showing search results with both Arabic and English product names:

```html
<ul dir="auto">
  <li dir="auto">Shampoo - شامبو فاخر</li>
  <li dir="auto">شامبو ضد القشرة</li>
  <li dir="auto">Anti-Dandruff Conditioner</li>
</ul>
```

`dir="auto"` on each item lets browser decide based on first strong char.

### Strings concatenated in code

```js
// BAD
const greeting = `Hello, ${userName}!`;
```

If userName is Arabic, "!" might attach wrong:

```
Hello, سارة!     (might display correctly)
Hello, !سارة     (might display incorrectly)
```

Better:

```jsx
<p>Hello, <bdi>{userName}</bdi>!</p>
```

### Logging / debugging

Console output of bidi strings can be confusing — what you see in the console may differ from what renders in HTML. Test rendering, not console.

## ARIA and bidi

Screen readers handle bidi correctly when:
- `lang` attribute is set
- `dir` attribute is set
- `<bdi>` is used appropriately

```html
<p lang="ar" dir="rtl">
  راسلنا على <bdi lang="en" dir="ltr">support@beauty.com</bdi>
</p>
```

Screen reader switches voice/pronunciation for the English email.

## Testing bidi

### Visual

Render side-by-side with native speakers:
- Punctuation correct?
- Names display correctly?
- Numbers read correctly?
- Emails/URLs intact?

### Automated

Use Chromium with `--lang=ar` for headless testing.

Visual regression: snapshot pages in both directions, compare.

### Edge cases to test

- Empty strings
- Strings with only LTR content
- Strings with only RTL content
- Mixed at start, middle, end
- Punctuation at start/end
- Numbers at start/end
- Multiple language switches in one string

## Performance

`<bdi>` and bidi handling have negligible performance cost. Use them liberally.

## Anti-patterns

- ❌ Concatenating user input directly into strings without `<bdi>`
- ❌ Trusting CSS-only solutions for bidi (use HTML semantics)
- ❌ Hardcoding direction on inputs that might receive either script
- ❌ Stripping `<bdi>` from translation output (translator might add them)
- ❌ Using raw Unicode bidi control characters in source code (unreadable)
- ❌ Testing only with English; not testing mixed-direction strings
- ❌ Manual character reversal (`text.split('').reverse().join('')`) — never do this
- ❌ Database storage that strips bidi markers
- ❌ Email subject lines that don't isolate variables (display order looks wrong in inbox)
- ❌ JSON content with formatting baked in (use semantic structure)
- ❌ SVG charts where labels don't isolate (chart text mixes weird)
- ❌ Forgetting to use `<bdi>` for usernames, product names, brand names in mixed contexts
