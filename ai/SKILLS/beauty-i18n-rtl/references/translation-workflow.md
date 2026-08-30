# Translation Workflow

How translation actually gets done determines whether the Arabic experience is excellent or embarrassing. This document covers the operational playbook: tools, processes, what to translate, what NOT to, how to maintain quality at scale.

## Principles

1. **Native speakers only** for production strings — no Google Translate for UI
2. **In-context translation** — translators see screenshots, not just spreadsheet rows
3. **Glossary-driven** — beauty/cosmetics terms standardized across all content
4. **Single source of truth** — translation management system, not scattered files
5. **Versioned and reviewed** — translations go through same QA as code
6. **Locale-aware tooling** — variables, plurals, dates, currencies handled correctly
7. **Performance-conscious** — translations don't bloat bundles
8. **Continuous, not one-time** — new strings translated weekly, not annually

## Translation management

### TMS options

| Tool | Pros | Cons |
|---|---|---|
| **Crowdin** | Industry standard, great UI, automation | Expensive at scale |
| **Lokalise** | Modern UI, good API, designer-friendly | Mid-tier price |
| **Phrase** | Enterprise features, strong workflow | Steeper learning curve |
| **POEditor** | Affordable, decent features | Less polished |
| **Weblate** | Open source, self-hostable | Setup overhead |
| **GitHub + JSON** | Free, dev-friendly | Manual workflow, no context for translators |

**Recommend Crowdin or Lokalise** for production. They support:
- In-context screenshots
- Translation memory (reuse past translations)
- Glossary
- Pluralization rules per language
- Quality checks (placeholders, length, terminology)
- API for automation

### File formats

| Format | Use |
|---|---|
| JSON | Web frontends (React, Vue, etc.) |
| YAML | Server-side (Ruby, Python) |
| .strings | iOS native |
| .xml | Android native |
| .po / .pot | gettext |
| Custom | Avoid; standardize on JSON |

```json
// en.json
{
  "cart.title": "Your Cart",
  "cart.empty": "Your cart is empty.",
  "cart.checkout": "Proceed to Checkout",
  "cart.items": "{count, plural, one {# item} other {# items}}"
}
```

```json
// ar.json
{
  "cart.title": "سلة التسوق",
  "cart.empty": "سلة التسوق فارغة.",
  "cart.checkout": "متابعة الدفع",
  "cart.items": "{count, plural, zero {لا منتجات} one {منتج واحد} two {منتجان} few {# منتجات} many {# منتجاً} other {# منتج}}"
}
```

### Key naming convention

Use namespaced dot notation:

```
{namespace}.{component}.{purpose}
```

Examples:
- `cart.title`
- `pdp.add_to_cart_button`
- `checkout.shipping.estimated_delivery`
- `nav.bottom.home_tab_label`

Avoid sentence-as-key (`"your_cart_is_empty"`); use semantic keys (`cart.empty`).

### Variable interpolation

Use ICU MessageFormat for variables:

```json
{
  "greeting": "Hello, {name}!",
  "order_total": "Total: {amount, number, currency}",
  "delivery": "Arrives by {date, date, long}"
}
```

Tools: `messageformat`, `react-intl`, `formatjs`, `i18next`.

### Pluralization

Arabic has SIX plural forms: zero, one, two, few, many, other.

```
0:    لا منتجات       (zero)
1:    منتج واحد        (one)
2:    منتجان           (two)
3-10: # منتجات          (few)
11-99: # منتجاً          (many)
100+: # منتج             (other)
```

ICU MessageFormat handles this:

```json
{
  "cart.items": "{count, plural, zero {لا منتجات} one {منتج واحد} two {منتجان} few {# منتجات} many {# منتجاً} other {# منتج}}"
}
```

Library evaluates `count` against Arabic plural rules automatically.

DO NOT do this manually:
```js
// BAD — works for English but breaks Arabic
const text = `${count} ${count === 1 ? 'item' : 'items'}`;
```

### Gender (where applicable)

Arabic has masculine/feminine variants. For UI directed at a user, this matters in some phrases:

```
English: "Welcome back!"
Arabic to male: "مرحباً بعودتك!"
Arabic to female: "مرحباً بعودتكِ!"
```

For most commerce UI, use gender-neutral phrasing. If user has selected gender in profile, optionally tailor.

```json
{
  "welcome_back.male": "مرحباً بعودتك!",
  "welcome_back.female": "مرحباً بعودتكِ!",
  "welcome_back.neutral": "أهلاً بك مجدداً!"
}
```

Default to neutral; switch if user has explicitly chosen.

## What to translate

### Yes — translate

- All UI labels (buttons, headers, navigation, form labels)
- Error messages
- Empty states
- Loading messages
- Tooltips
- Help text
- Onboarding screens
- Email templates (transactional)
- SMS templates
- Push notifications
- SEO meta titles and descriptions
- Image alt text (where meaningful)
- Legal pages (Terms, Privacy)

### Maybe — case by case

- Product titles: depends on whether vendor supplies Arabic title
- Product descriptions: ideally vendor supplies; otherwise leave English with note
- Brand names: usually keep transliterated (لوريال = L'Oréal)
- Reviews: user-generated, don't auto-translate; offer Google translate option
- Category names: definitely translate
- Vendor names: keep original; transliterate optionally

### No — don't translate

- SKU codes
- Order IDs (ORD-...-A7F9 stays the same)
- Brand logos with text (use Arabic logo if brand has one; otherwise keep)
- Email addresses
- URLs
- Phone numbers
- Country codes
- Currency codes (AED, SAR — these are universal)
- HTML/code in content

## Translation memory

After translating a phrase once, store it. Next time it appears (or similar), translator sees the previous match:

```
String: "Add to cart"
Previous translation: "أضف إلى السلة"
Match: 100% — auto-apply

String: "Add to cart now"
Previous translation: "أضف إلى السلة" (Add to cart)
Match: 75% — suggest with edit
```

TM tools (Crowdin, Lokalise, SDL Trados) do this automatically. Result: consistency across the site and faster work.

## Glossary

Maintain authoritative glossary of beauty/marketplace terms:

```
| English          | Arabic              | Notes                  |
|------------------|---------------------|------------------------|
| Cart             | السلة                | Use throughout         |
| Wishlist         | المفضلة              | "favorites" works too  |
| Checkout         | الدفع                | Verb form              |
| Shampoo          | شامبو                | Transliteration        |
| Conditioner      | بلسم                 | Local term             |
| Serum            | سيروم                | Transliteration        |
| Moisturizer      | مرطّب                |                        |
| Anti-aging       | مضاد للشيخوخة         |                        |
| Hyaluronic acid  | حمض الهيالورونيك      |                        |
| Volumizing       | مكثّف للشعر           |                        |
| Hair color       | صبغة شعر              |                        |
| Wholesale        | بالجملة               |                        |
| Free shipping    | شحن مجاني             |                        |
| Bestseller       | الأكثر مبيعاً          |                        |
| New arrival      | جديد                  |                        |
| Verified buyer   | مشترٍ موثّق           |                        |
| 5-star rating    | تقييم ٥ نجوم           | Numbers Latin in commerce |
```

Translators consult glossary first; if a term isn't there, they propose and team approves.

## Quality assurance

### Automated checks

TMS tools run these on every translation:
- Placeholder consistency (`{name}` exists in both source and target)
- HTML tag balance
- Number agreement
- Length warnings (Arabic can be 20-40% longer than English)
- Common typos
- Glossary adherence

### Manual review

Before merging translations:
- Native speaker reviews in context (live preview or screenshots)
- Check for tone consistency
- Check for cultural appropriateness
- Catch idioms that don't translate

### User testing

- A/B test new translations against existing
- Survey Arab users on clarity
- Monitor support tickets for confusion ("I don't understand this label")

## Translator profile

For beauty marketplace, you want:
- Native Arabic speaker (preferably MENA-resident)
- Experienced in commerce/marketing copy
- Familiar with beauty industry vocabulary
- Comfortable with MSA (Modern Standard Arabic)
- Available for ongoing work (not one-time)

Avoid:
- Generic agency translators with no domain knowledge
- Translators only available for occasional projects
- Anyone whose first answer is "I'll use Google Translate"

Pay rate: $0.06-0.12 per word for MENA-based translators. Premium quality: $0.15-0.20. Worth it for high-volume content.

## Engineering integration

### React (i18next)

```jsx
import { useTranslation } from 'react-i18next';

function CartButton() {
  const { t } = useTranslation();
  return <button>{t('cart.add_to_cart')}</button>;
}
```

Switch locale:
```jsx
i18n.changeLanguage('ar');
document.documentElement.dir = 'rtl';
document.documentElement.lang = 'ar';
```

### Next.js (next-intl)

```jsx
import { useTranslations } from 'next-intl';

export default function Page() {
  const t = useTranslations('cart');
  return <button>{t('add_to_cart')}</button>;
}
```

With routing:
```
app/
  [locale]/
    page.tsx          ← uses translations
    products/
      [slug]/
        page.tsx
```

URLs: `/en/products/shampoo` and `/ar/products/shampoo`.

### Vue (vue-i18n)

```vue
<template>
  <button>{{ $t('cart.add_to_cart') }}</button>
</template>
```

### Server-side

For email templates, server-rendered pages:

```python
# Python with babel
from babel.support import Translations

translations = Translations.load('locale', locale='ar')
text = translations.gettext('cart.add_to_cart')
```

```ruby
# Ruby with i18n
I18n.locale = 'ar'
I18n.t('cart.add_to_cart')
```

## Loading strategy

### Lazy load translations

Don't ship all locales in main bundle:

```js
// Load only the current locale
const messages = await import(`./locales/${locale}.json`);
```

### Code split by route

Some pages have unique strings. Split per-route:

```
locales/
  ar/
    common.json        ← always loaded
    cart.json          ← loaded for cart page
    checkout.json      ← loaded for checkout page
    pdp.json           ← loaded for product page
```

### Cache aggressively

Locale files rarely change. Long cache headers:

```
Cache-Control: public, max-age=86400, immutable
```

Bust on deployment via versioned filenames: `locales-ar-v3.json`.

## Continuous translation

### Workflow

1. Developer writes feature with English strings
2. Tool extracts new keys → uploads to Crowdin
3. Crowdin notifies translators of new content
4. Translators translate (within SLA: e.g., 48h)
5. Reviewer approves
6. CI pulls latest translations daily
7. Deploys with all translations updated

Automate as much as possible. Manual processes break down.

### Source of truth

English is canonical (or whatever your primary language is). Never let translators "fix" English; if they spot an issue, flag it for product team.

### Version control

Translation files in git? OR managed by TMS?

Option A: TMS as source of truth, CI pulls daily
- Pros: translators work in their tool
- Cons: developers can't see latest translations locally

Option B: git as source of truth, TMS pulls from git
- Pros: standard PR review
- Cons: TMS lag

Option C: both, with TMS authoritative
- Most flexible
- Use CI to sync

## Handling translation gaps

What happens if a new English key isn't yet translated to Arabic?

### Fallback to English

```js
i18next.init({
  fallbackLng: 'en',
  saveMissing: true, // log missing keys to dashboard
});
```

User sees English text instead of broken UI. Logs alert translation team.

### Show key name (dev only)

In development, show the raw key so devs spot missing translations:

```
[cart.add_to_cart]  ← visible in dev
```

Production never shows raw keys.

### Pseudo-localization (testing)

Generate "fake Arabic" to test layout without waiting for real translations:

```
"Add to cart" → "أ‐أد‐أد‐تو‐کا‐رت"
```

Validates RTL, font, length issues without translator involvement.

## Email and notification translation

### Transactional emails

Each email template needs translation:

```
Order confirmation
Order shipped
Order delivered
Payment failed
Password reset
Welcome
Account verification
```

Templates have placeholders for dynamic content:

```
Subject: تأكيد طلبك رقم {order_id}

مرحباً {name}،

شكراً لطلبك! تم استلام طلبك بقيمة {total}.

[CTA button: تتبع الطلب]
```

### Push notifications

```
Title: تم شحن طلبك ✓
Body: طلبك ORD-...-A7F9 في الطريق
```

Keep short. Limit: ~50 chars title, ~100 chars body.

### SMS

Even shorter. ~70 chars total (Arabic chars take 2 bytes each in some encodings).

```
"تم شحن طلبك. تتبع: bma.io/o/A7F9"
```

## Cultural localization

Beyond literal translation, adapt:

### Imagery

- Use models that reflect MENA diversity
- Avoid imagery offensive in religious context
- Consider regional preferences (Gulf vs. Levant vs. North Africa have different aesthetic preferences)

### Holidays

- Eid al-Fitr / Eid al-Adha: major sales windows
- Ramadan: nighttime shopping spike, modest content during day
- White Friday (not Black Friday — culturally translated)
- Saudi National Day, UAE National Day
- New Year (less prominent than in West for many)

### Tone

- Slightly more formal than English commerce
- Respect-laden phrases (شكراً جزيلاً for "thanks", not just شكراً)
- Avoid overly casual ("Hey there!" → don't use Arabic equivalent unless brand is youth-targeted)

### Calls to action

```
Aggressive (Western): "BUY NOW!!! LIMITED TIME!!!"
Modest (MENA-appropriate): "اكتشف عرضنا المحدود"

Aggressive: "Don't miss out!"
MENA: "فرصة لا تفوّت"
```

Marketing tone in MENA tends to favor invitation over urgency.

## Number / Date / Currency

See `locale-formatting.md` for full details. Highlights:

- Numbers: Latin digits (0-9) for commerce
- Dates: `DD/MM/YYYY` or `DD month YYYY`
- Currency: 3-letter code (AED, SAR, EGP)
- Phone: international format with country code

## Address translation

Address fields:

```
LTR labels:           RTL labels:
- Full Name          - الاسم الكامل
- Phone              - رقم الهاتف
- Country            - الدولة
- City               - المدينة
- Building/Apt       - المبنى/الشقة
- Street             - الشارع
- Postcode           - الرمز البريدي
- Landmark           - معلم
- Delivery notes     - ملاحظات التوصيل
```

Values themselves may be in either script (user types in their preferred language).

## Testing translations

### Manual

- View every screen in Arabic
- Have a native speaker review
- Note: layout issues (text overflow), tone issues, mistranslations

### Automated

- Detect English strings in Arabic locale (indicates missing translation)
- Detect Arabic strings in English locale (probably wrong)
- Length warnings (X% longer than English)
- Placeholder validation

### Visual regression

- Snapshot each screen in both languages
- Compare per release; flag layout regressions

## Quality metrics

Track:
- **Coverage**: % of keys translated
- **Freshness**: # of keys translated in last 7 days
- **Issues**: # of bug reports tagged "translation"
- **Length variance**: avg length ratio (Arabic ÷ English)
- **Translator activity**: turnaround time

## Cost estimate

Rough planning for a marketplace with ~3,000 unique UI strings:

- Initial translation (one-time): $1,800-3,000
- Ongoing (~200 new strings/month): $120-200/month
- TMS subscription: $50-300/month
- Reviewer/QA: included in TMS or $100-300/month

Total launch: ~$3,000. Total ongoing: ~$300-500/month. Trivial vs. marketing budget.

## Anti-patterns

- ❌ Google Translate for production strings
- ❌ Same key reused with different meanings (`button.submit` for "Submit", "Send", "Save")
- ❌ Translating with no context (translators need screenshots)
- ❌ Hardcoded strings in code (`<button>Add to cart</button>`)
- ❌ String concatenation: `"You have " + count + " items"` (breaks grammar in many languages)
- ❌ Date strings written as `${day}/${month}/${year}` instead of using `Intl.DateTimeFormat`
- ❌ Ignoring pluralization rules
- ❌ Missing locale fallback (broken UI when string is missing)
- ❌ Translating brand names that should stay original
- ❌ Auto-translating user-generated content (results are unreadable)
- ❌ Different translation per platform (web says X, app says Y — confusing)
- ❌ Forgetting to translate emails / push notifications
- ❌ Mixing dialects ("درهم" UAE vs "ريال" Saudi inconsistently)
- ❌ Updating English without informing translation team (Arabic becomes stale)
- ❌ Letting translation drift over months (build it into release process)
