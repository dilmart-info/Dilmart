# Locale Formatting

Numbers, dates, currencies, addresses, phone numbers — every locale has its own conventions. Getting these wrong looks unprofessional at best, breaks user trust at worst. This document covers the formatting standards for every locale the marketplace supports.

## Use `Intl` APIs

The browser's `Intl` namespace handles most formatting. Don't roll your own:

```js
new Intl.NumberFormat(...)
new Intl.DateTimeFormat(...)
new Intl.RelativeTimeFormat(...)
new Intl.ListFormat(...)
new Intl.PluralRules(...)
```

Or use libraries:
- `date-fns/locale` — date formatting per locale
- `dayjs` — lightweight alternative
- `@formatjs/intl` — polyfill for Node

## Numbers

### Basic number

```js
new Intl.NumberFormat('en-AE').format(1234.5);
// "1,234.5"

new Intl.NumberFormat('ar-AE').format(1234.5);
// "١٬٢٣٤٫٥"  (Eastern Arabic numerals by default)

new Intl.NumberFormat('ar-AE-u-nu-latn').format(1234.5);
// "1,234.5"  (Latin digits in Arabic locale — preferred for commerce)
```

### Grouping (thousands separator)

| Locale | Separator | Decimal |
|---|---|---|
| en-AE, en-US, en-GB | , | . |
| ar-AE, ar-SA, ar-EG | , (sometimes ٬) | . (sometimes ٫) |
| fr-FR, fr-MA | space (or .) | , |
| de-DE | . | , |
| Indian (en-IN) | uses lakh (1,23,456) | . |

For commerce in MENA, use:
- Group: ","
- Decimal: "."

This matches user expectations regardless of language.

### Specific decimals

```js
new Intl.NumberFormat('en-AE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(89.5);
// "89.50"
```

For prices, always show 2 decimal places.

### Percentage

```js
new Intl.NumberFormat('en-AE', {
  style: 'percent',
  minimumFractionDigits: 0,
}).format(0.15);
// "15%"

new Intl.NumberFormat('ar-AE-u-nu-latn', {
  style: 'percent',
}).format(0.15);
// "15%"
```

### Compact (large numbers)

```js
new Intl.NumberFormat('en-AE', { notation: 'compact' }).format(12500);
// "13K"

new Intl.NumberFormat('ar-AE-u-nu-latn', { notation: 'compact' }).format(12500);
// "12 ألف"
```

Useful for reviews count, follower counts.

## Currency

### Format currency

```js
function formatCurrency(amount, currency = 'AED', locale = 'en-AE') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code', // or 'symbol' or 'name'
  }).format(amount);
}

formatCurrency(89.50, 'AED', 'en-AE');
// "AED 89.50"

formatCurrency(89.50, 'AED', 'ar-AE-u-nu-latn');
// "89.50 AED"

formatCurrency(89.50, 'SAR', 'en-SA');
// "SAR 89.50"

formatCurrency(89.50, 'SAR', 'ar-SA-u-nu-latn');
// "89.50 SAR"
```

### Currency display options

| Option | Output (AED 89.50) |
|---|---|
| `'code'` | "AED 89.50" — preferred for clarity |
| `'symbol'` | "د.إ 89.50" — locale-specific symbol |
| `'narrowSymbol'` | "د.إ 89.50" — shortest symbol |
| `'name'` | "89.50 UAE dirhams" |

Recommend `code` everywhere for unambiguous display.

### Storage

Always store in MINOR UNITS (integer):

```ts
// Bad
price: 89.5 // floating point — rounding errors

// Good
price_minor: 8950 // integer fils
```

Display:
```ts
function toDisplay(minor: number, currency: string) {
  const divisor = currency === 'KWD' || currency === 'BHD' ? 1000 : 100;
  return (minor / divisor).toFixed(2);
}
```

Note: KWD and BHD have 3 decimal places (1 dinar = 1000 fils).

### Per-country currency

| Country | Currency | Code | Symbol | Decimals |
|---|---|---|---|---|
| UAE | Dirham | AED | د.إ. | 2 |
| Saudi Arabia | Riyal | SAR | ر.س | 2 |
| Egypt | Pound | EGP | ج.م | 2 |
| Kuwait | Dinar | KWD | د.ك | 3 (!) |
| Bahrain | Dinar | BHD | د.ب | 3 (!) |
| Qatar | Riyal | QAR | ر.ق | 2 |
| Oman | Rial | OMR | ر.ع. | 3 (!) |
| Jordan | Dinar | JOD | د.أ | 3 (!) |
| Lebanon | Pound | LBP | ل.ل | 2 |
| Iraq | Dinar | IQD | د.ع | 3 |
| Morocco | Dirham | MAD | د.م. | 2 |
| Tunisia | Dinar | TND | د.ت | 3 |
| US | Dollar | USD | $ | 2 |
| EU | Euro | EUR | € | 2 |

3-decimal currencies (KWD, BHD, OMR, JOD, TND, IQD) are easy to forget. Always check.

### Multi-currency display

When user is in country with different currency than displayed:

```
Product price: AED 89.50
≈ SAR 90 (estimated)
```

Use estimated exchange rate (refresh hourly). Don't pretend to give real-time rates unless you actually have a forex feed.

## Dates

### Format date

```js
new Intl.DateTimeFormat('en-AE', {
  dateStyle: 'long',
}).format(new Date());
// "May 16, 2026"

new Intl.DateTimeFormat('ar-AE-u-nu-latn', {
  dateStyle: 'long',
}).format(new Date());
// "16 مايو 2026"

new Intl.DateTimeFormat('ar-AE', {
  dateStyle: 'long',
}).format(new Date());
// "١٦ مايو ٢٠٢٦"  (Arabic numerals — usually not preferred for commerce)
```

### Date style options

| `dateStyle` | Output (en-AE) | Output (ar-AE-u-nu-latn) |
|---|---|---|
| `'full'` | "Saturday, May 16, 2026" | "السبت، 16 مايو 2026" |
| `'long'` | "May 16, 2026" | "16 مايو 2026" |
| `'medium'` | "May 16, 2026" | "16 مايو 2026" |
| `'short'` | "5/16/26" | "16/05/2026" |

### Custom format

```js
new Intl.DateTimeFormat('en-AE', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  weekday: 'short',
}).format(new Date());
// "Sat, May 16, 2026"
```

### Times

```js
new Intl.DateTimeFormat('en-AE', {
  timeStyle: 'short',
}).format(new Date());
// "10:34 AM"

new Intl.DateTimeFormat('ar-AE-u-nu-latn', {
  timeStyle: 'short',
}).format(new Date());
// "10:34 ص" (ص = morning, م = evening)
```

### Date + time

```js
new Intl.DateTimeFormat('en-AE', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date());
// "May 16, 2026, 10:34 AM"
```

### Relative time

"3 days ago", "in 2 hours" — useful for reviews, order timestamps:

```js
const rtf = new Intl.RelativeTimeFormat('en-AE', { numeric: 'auto' });

rtf.format(-1, 'day');       // "yesterday"
rtf.format(-3, 'day');       // "3 days ago"
rtf.format(2, 'hour');       // "in 2 hours"
rtf.format(-1, 'minute');    // "1 minute ago"

const rtfAr = new Intl.RelativeTimeFormat('ar-AE-u-nu-latn', { numeric: 'auto' });
rtfAr.format(-3, 'day');  // "قبل 3 أيام"
```

For commerce, use relative time for recency:
- "Posted 2 hours ago"
- "Last login 3 days ago"

Use absolute date for important events:
- "Order placed May 14, 2026"

### Time zones

MENA region time zones:

| Country | Time zone | UTC offset |
|---|---|---|
| UAE | Asia/Dubai | UTC+4 |
| Saudi Arabia | Asia/Riyadh | UTC+3 |
| Egypt | Africa/Cairo | UTC+2 |
| Kuwait | Asia/Kuwait | UTC+3 |
| Qatar | Asia/Qatar | UTC+3 |
| Bahrain | Asia/Bahrain | UTC+3 |
| Oman | Asia/Muscat | UTC+4 |
| Jordan | Asia/Amman | UTC+3 |
| Lebanon | Asia/Beirut | UTC+2 |
| Iraq | Asia/Baghdad | UTC+3 |
| Morocco | Africa/Casablanca | UTC+0 / UTC+1 (DST) |

Store all timestamps as UTC. Display in user's local time:

```js
new Intl.DateTimeFormat('en-AE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Dubai', // explicit for cross-border orders
}).format(new Date('2026-05-16T06:34:00Z'));
// "May 16, 2026, 10:34 AM"
```

### Hijri calendar

In KSA particularly, the Hijri (Islamic) calendar is significant. Some users prefer dates in Hijri:

```js
new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  dateStyle: 'long',
}).format(new Date());
// "٢٨ شوال ١٤٤٧"
```

Offer in user preferences:
- Gregorian (default for commerce)
- Hijri (option, especially for SA users)

## Addresses

Address fields vary per country.

### UAE address

```
Sarah Mohammed
+971 50 123 4567
Villa 42
Al Wasl Road
Jumeirah
Dubai
United Arab Emirates
```

Fields:
- Recipient name
- Phone (with country code)
- Building / Villa / Apartment
- Street / Road
- Area / Neighborhood
- Emirate (Dubai, Abu Dhabi, Sharjah, etc.)
- Country
- (No postal code commonly used; PO Box sometimes)
- Landmark (optional, very useful)

### Saudi Arabia address

```
Ahmed Al-Saud
+966 50 123 4567
House 42
Olaya Street
Al Wurud District
Riyadh
12345
Saudi Arabia
```

Fields:
- Recipient
- Phone
- Building / House
- Street
- District (حي)
- City
- Postal code (5 digits, becoming more common)
- Country
- Additional address (optional, e.g., compound name)

### Egypt address

```
Layla Hassan
+20 100 123 4567
Building 12, Apt 4
El-Tahrir Street
Maadi
Cairo
11431
Egypt
```

Fields:
- Recipient
- Phone
- Building / Apt
- Street
- District
- Governorate (Cairo, Giza, Alexandria, etc.)
- Postal code
- Country

### Address formatter

```js
function formatAddress(address, locale = 'en-AE') {
  const lines = [];
  if (address.name) lines.push(address.name);
  if (address.phone) lines.push(address.phone);
  
  const streetParts = [address.building, address.street, address.area].filter(Boolean);
  if (streetParts.length) lines.push(streetParts.join(', '));
  
  const cityParts = [address.city, address.postalCode].filter(Boolean);
  if (cityParts.length) lines.push(cityParts.join(' '));
  
  if (address.country) lines.push(address.country);
  
  return lines.join('\n');
}
```

For Arabic, the order is the same but text right-aligned.

## Phone numbers

### Format

Use E.164 for storage:

```
+971501234567
+966501234567
+201001234567
```

Display:
- International: `+971 50 123 4567`
- National: `050 123 4567`

```js
import { parsePhoneNumber } from 'libphonenumber-js';

const phone = parsePhoneNumber('+971501234567');
phone.formatInternational(); // "+971 50 123 4567"
phone.formatNational();       // "050 123 4567"
```

### Per-country phone

| Country | Country code | Mobile prefix | Length |
|---|---|---|---|
| UAE | +971 | 50, 52, 54, 55, 56, 58 | 9 digits |
| Saudi Arabia | +966 | 50, 53, 54, 55, 56, 57, 58, 59 | 9 |
| Egypt | +20 | 10, 11, 12, 15 | 10 |
| Kuwait | +965 | 5, 6, 9 | 8 |
| Qatar | +974 | 3, 5, 6, 7 | 8 |
| Bahrain | +973 | 3 | 8 |
| Oman | +968 | 7, 9 | 8 |
| Jordan | +962 | 7 | 9 |

Use a phone input component that:
- Auto-detects country from IP
- Allows manual selection
- Validates format per country
- Strips formatting characters before storage

### Phone in RTL context

Phone numbers are always LTR:

```html
<p>اتصل بنا على <bdi>+971 50 123 4567</bdi></p>
```

`<bdi>` prevents the surrounding Arabic from breaking the phone format.

## Names

Arab names often have multiple parts:

```
First name: Sarah
Middle/father's name: Mohammed
Family/tribal name: Al-Mansoori
Display: "Sarah Mohammed Al-Mansoori"
```

For UI:
- "Full name" field: single field for the whole name
- Don't insist on splitting first/middle/last (alienates users)
- For salutation: use first name only

```
Welcome, Sarah!
أهلاً سارة!
```

Avoid "Mr. / Ms." prefixes — they don't translate cleanly to Arabic etiquette.

### Display order

Arabic name in Arabic UI: same order as written:

```
سارة محمد المنصوري
```

Same order in English:

```
Sarah Mohammed Al-Mansoori
```

(Some Western contexts put last name first: "Al-Mansoori, Sarah Mohammed" — avoid this in casual UI.)

## Postal codes

| Country | Format | Required? |
|---|---|---|
| UAE | — | Optional (PO Box) |
| Saudi Arabia | 5 digits | Increasing adoption |
| Egypt | 5 digits | Yes |
| Kuwait | 5 digits | Yes |
| Qatar | 5 digits | Optional |
| Bahrain | 4 digits | Yes |
| Oman | 3 digits | Yes |
| Jordan | 5 digits | Yes |
| Morocco | 5 digits | Yes |
| US | 5 digits or 5+4 | Yes |
| UK | varies (e.g., "EC1A 1BB") | Yes |

Validation per country.

## Lists

```js
const list = ['Shampoo', 'Conditioner', 'Hair mask'];

new Intl.ListFormat('en-AE', { style: 'long' }).format(list);
// "Shampoo, Conditioner, and Hair mask"

new Intl.ListFormat('ar-AE', { style: 'long' }).format(list);
// "Shampoo و Conditioner و Hair mask"
```

For prose like "Available in red, blue, and green."

## Time-of-day phrases

```
Good morning  → صباح الخير
Good evening  → مساء الخير
Good night    → ليلة سعيدة (less common in UI)
```

If you greet users by time of day, translate per locale.

## Calendar

### First day of week

- Saturday: many MENA countries (work week is Sun-Thu)
- Sunday: KSA traditional
- Monday: ISO standard, used in West

In date pickers:

```js
new Intl.Locale('ar-AE').weekInfo;
// { firstDay: 6 (Saturday), weekend: [5, 6 (Friday, Saturday)] }
```

### Weekend

- Most MENA: Friday-Saturday weekend
- Some businesses: Saturday-Sunday weekend (post-Westernization)

Note this for:
- Delivery estimates ("1-3 business days")
- Order processing windows
- Customer service hours

## Measurement units

### Volume

Most beauty products use ml (milliliters) and oz (fluid ounces).

```js
new Intl.NumberFormat('en-AE', {
  style: 'unit',
  unit: 'milliliter',
  unitDisplay: 'short',
}).format(250);
// "250 mL"

new Intl.NumberFormat('ar-AE-u-nu-latn', {
  style: 'unit',
  unit: 'milliliter',
}).format(250);
// "250 ملل"
```

Show both for international brands:
"250 mL (8.4 fl oz)"

### Weight

```js
new Intl.NumberFormat('en-AE', {
  style: 'unit',
  unit: 'gram',
}).format(50);
// "50 g"
```

### Length

```js
new Intl.NumberFormat('en-AE', {
  style: 'unit',
  unit: 'centimeter',
}).format(15);
// "15 cm"
```

## Sorting

### Alphabetical sort

Use locale-aware sort:

```js
const arr = ['Banana', 'apple', 'Cherry', 'cantaloupe'];
arr.sort((a, b) => a.localeCompare(b, 'en'));
// ['apple', 'Banana', 'cantaloupe', 'Cherry']

const arrAr = ['تفاح', 'موز', 'كرز', 'برتقال'];
arrAr.sort((a, b) => a.localeCompare(b, 'ar'));
// ['برتقال', 'تفاح', 'كرز', 'موز']  (Arabic alphabetical order)
```

### Numeric-aware sort

```js
const arr = ['Item 2', 'Item 10', 'Item 1'];
arr.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
// ['Item 1', 'Item 2', 'Item 10']  (instead of "Item 1", "Item 10", "Item 2")
```

## Search

Use locale-aware search:

```js
function searchMatches(query, text, locale = 'en') {
  return text.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale));
}
```

In Arabic, additional considerations: see `search-and-synonyms.md`.

## Anti-patterns

- ❌ Hardcoded `${value.toLocaleString()}` without locale parameter
- ❌ Floating-point math for currency (use integers)
- ❌ Date strings as `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`
- ❌ Forgetting 3-decimal currencies (KWD, BHD, OMR)
- ❌ Using KSA conventions for UAE (different postal, phone, etc.)
- ❌ Showing UTC times without local conversion
- ❌ Forcing English date format on Arabic users
- ❌ Phone number stored with formatting characters (`+971-50-123-4567`)
- ❌ Storing address as a single string (can't restructure for display)
- ❌ Currency symbols only (use ISO code)
- ❌ Ignoring DST changes (some MENA countries don't observe DST; Egypt does seasonally)
- ❌ Assuming all Arabic users are in same country (a Saudi user sees SAR, an Egyptian user sees EGP)
- ❌ Postal code required but not standard in country (e.g., UAE)
