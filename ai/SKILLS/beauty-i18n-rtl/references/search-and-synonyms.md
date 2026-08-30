# Arabic Search & Synonyms

Search is where multilingual marketplaces succeed or fail. A user types "شامبو" expecting to see shampoo. They type "shampoo" expecting the same results. They type "shampo" (typo) expecting forgiveness. They type "Tresemmé" or "تريسمى" — both should work. Arabic search needs deliberate engineering, not "translate the UI and hope."

## The challenge

Arabic search is harder than English because:

1. **Two scripts in one query** — Latin and Arabic mixed
2. **Letter form variations** — same word written differently
3. **Diacritics inconsistency** — users may or may not include tashkīl
4. **Common letter confusions** — alif variations, ya/alif maksura, hamza
5. **Brand names** — transliterated multiple ways
6. **No standardized spelling** for many products
7. **English loanwords** — "كريم" (cream) vs "cream"

A search that handles only one variation feels broken.

## Indexing strategy

Index each product with multiple text fields:

```json
{
  "id": "SKU-123",
  "name_en": "Anti-dandruff Shampoo",
  "name_ar": "شامبو ضد القشرة",
  "name_ar_normalized": "شامبو ضد قشره",  // normalized
  "brand_en": "Head & Shoulders",
  "brand_ar": "هيد آند شولدرز",
  "brand_normalized": "هيد اند شولدرز",
  "description_en": "...",
  "description_ar": "...",
  "category_path_en": ["Hair Care", "Shampoo", "Anti-dandruff"],
  "category_path_ar": ["العناية بالشعر", "شامبو", "ضد القشرة"],
  "tags_en": ["dandruff", "scalp", "itchy"],
  "tags_ar": ["قشرة", "فروة الرأس", "حكة"],
  "synonyms": [
    "shampoo", "shampo", "شامبو", "شامبوه",
    "anti-dandruff", "anti dandruff", "antidandruff",
    "ضد القشرة", "مضاد للقشرة"
  ]
}
```

## Arabic text normalization

Normalize Arabic text BEFORE indexing AND before querying. This makes variations match:

### 1. Remove diacritics (tashkīl)

```js
function removeDiacritics(text) {
  return text.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
}

removeDiacritics('كَتَبَ');  // "كتب"
```

Unicode ranges:
- U+064B - U+0652: Arabic short vowels and shadda
- U+0670: Superscript alef
- U+0640: Tatweel (kashida)

### 2. Normalize alif variations

Multiple alif forms exist; users mix them:

| Letter | Unicode | Note |
|---|---|---|
| ا | U+0627 | Plain alif |
| أ | U+0623 | Alif with hamza above |
| إ | U+0625 | Alif with hamza below |
| آ | U+0622 | Alif with madda |

Normalize all to plain alif for search:

```js
function normalizeAlif(text) {
  return text.replace(/[أإآ]/g, 'ا');
}

normalizeAlif('أحمد');  // "احمد"
normalizeAlif('إيمان'); // "ايمان"
```

### 3. Normalize ya / alif maksura

```js
function normalizeYa(text) {
  return text
    .replace(/ى/g, 'ي')   // alif maksura → ya
    .replace(/ئ/g, 'ي');  // ya with hamza → ya (sometimes)
}

normalizeYa('على');  // "علي"
```

### 4. Normalize ta marbuta / ha

```js
function normalizeTaMarbuta(text) {
  return text.replace(/ة/g, 'ه'); // ta marbuta → ha
}

normalizeTaMarbuta('قشرة');  // "قشره"
```

This handles cases where users type ه instead of ة (common typing shortcut).

### 5. Remove tatweel

```js
function removeTatweel(text) {
  return text.replace(/ـ/g, '');
}

removeTatweel('شـــــامبو');  // "شامبو"
```

### 6. Normalize hamza

```js
function normalizeHamza(text) {
  return text
    .replace(/ؤ/g, 'و')   // waw with hamza
    .replace(/ئ/g, 'ي'); // ya with hamza
}
```

### Complete normalizer

```js
function normalizeArabic(text) {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')  // diacritics
    .replace(/[أإآ]/g, 'ا')                       // alif
    .replace(/[ى]/g, 'ي')                          // ya
    .replace(/[ة]/g, 'ه')                          // ta marbuta
    .replace(/[ؤ]/g, 'و')                          // waw hamza
    .replace(/[ئ]/g, 'ي')                          // ya hamza
    .trim();
}

normalizeArabic('قَشْرَة');     // "قشره"
normalizeArabic('قشرة');       // "قشره"
normalizeArabic('قشره');       // "قشره"  ← all match!
```

## Latin transliteration (for brand search)

Users search for Arabic brands in Latin or transliterate Latin brands to Arabic:

```
"Tresemmé"   = "تريسمي" = "تريسيمي" = "تريسمى"
"L'Oréal"    = "لوريال" = "لوريل"
"Garnier"    = "غارنييه" = "غارنير"
"Head & Shoulders" = "هيد اند شولدرز" = "هد اند شولدرز"
```

Maintain a brand synonym table:

```sql
CREATE TABLE brand_aliases (
  brand_id UUID NOT NULL REFERENCES brands(id),
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  language TEXT, -- 'en' | 'ar' | 'both'
  weight FLOAT DEFAULT 1.0,
  PRIMARY KEY (brand_id, alias_normalized)
);

INSERT INTO brand_aliases (brand_id, alias, alias_normalized, language) VALUES
('brand-uuid-001', 'L''Oréal', 'loreal', 'en'),
('brand-uuid-001', 'L Oreal', 'l oreal', 'en'),
('brand-uuid-001', 'Loreal', 'loreal', 'en'),
('brand-uuid-001', 'لوريال', 'لوريال', 'ar'),
('brand-uuid-001', 'لوريل', 'لوريل', 'ar');
```

When user searches, normalize their query, then match against all aliases.

## Common synonym groups

Beauty marketplace specific:

### Product types

```
shampoo, shampo, شامبو, شامبوه
conditioner, balsam, بلسم, كونديشنر
serum, سيروم, سيرم
mask, ماسك, قناع, ماسكات
oil, oils, زيت, زيوت
cream, kream, كريم
toner, تونر, تونيك
makeup, ميك اب, مكياج, ماك اب
lipstick, ruj, روج, أحمر شفاه, احمر شفاه
foundation, kream asas, فاونديشن, كريم اساس
mascara, ماسكارا
eyeliner, kohl, كحل, آي لاينر
perfume, parfum, عطر, برفان
deodorant, ديو, مزيل عرق, ديودرنت
```

### Hair types / concerns

```
curly, kinky, مجعد, كيرلي
straight, naem, ناعم, مستقيم
oily, دهني
dry, jaff, جاف
dandruff, qishra, قشرة, قشره
hair loss, ساقط, تساقط, sa3r, تساقط الشعر
gray hair, شيب, شعر ابيض
```

### Skin concerns

```
acne, حب الشباب, بثور, pimples
oily skin, بشره دهنيه, بشرة دهنية
dry skin, بشره جافه
sensitive, hasas, حساسة, حساسه
anti-aging, مضاد للتجاعيد, anti-wrinkle, تجاعيد
hyperpigmentation, تصبغات, kalaf, كلف
dark spots, بقع داكنه, بقع
```

### Categories

```
hair care, العناية بالشعر, شعر, hair
skin care, العناية بالبشرة, بشره, skincare
makeup, مكياج, ميك اب, makeup
body care, العناية بالجسم, جسم, body
nails, اظافر, اظافر, manicure, nail care
men's, للرجال, رجالي
women's, للنساء, نسائي
kids, اطفال, أطفال
```

### Format

```
50ml, 50 مل, 50ml, 50 ml
travel size, مقاس السفر, سفر, travel
family pack, عبوه عائليه, عائلية, family
trial, تجربه, sample, عينه
```

## Storage in DB

### Synonyms table

```sql
CREATE TABLE search_synonyms (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL,
  term TEXT NOT NULL,
  term_normalized TEXT NOT NULL,
  language TEXT NOT NULL, -- 'en' | 'ar' | 'transliteration'
  weight FLOAT DEFAULT 1.0,
  is_canonical BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_synonyms_normalized ON search_synonyms(term_normalized);
CREATE INDEX idx_synonyms_group ON search_synonyms(group_id);
```

Group ID links all synonyms for one concept:

```sql
INSERT INTO search_synonyms (group_id, term, term_normalized, language, is_canonical) VALUES
('group-shampoo', 'shampoo', 'shampoo', 'en', true),
('group-shampoo', 'shampo', 'shampo', 'en', false),
('group-shampoo', 'shampu', 'shampu', 'en', false),
('group-shampoo', 'شامبو', 'شامبو', 'ar', true),
('group-shampoo', 'شامبوه', 'شامبوه', 'ar', false),
('group-shampoo', 'شمبو', 'شمبو', 'ar', false);
```

### Query expansion

When user types `"شامبو"`:

1. Normalize: `"شامبو"`
2. Look up in synonyms table: find group_id
3. Expand query to include all synonyms in that group:
   - "شامبو" OR "شامبوه" OR "شمبو" OR "shampoo" OR "shampo" OR "shampu"
4. Send expanded query to search engine

## Search engine choice

| Engine | Arabic support |
|---|---|
| **Elasticsearch / OpenSearch** | Excellent — Arabic analyzer, stemmer |
| **Meilisearch** | Good — handles Arabic, fast |
| **Typesense** | Good — multilingual support |
| **Algolia** | Excellent — production Arabic support |
| **Postgres full-text** | Limited Arabic — no stemmer; need custom config |

### Elasticsearch Arabic analyzer

Built-in `arabic` analyzer:

```json
{
  "settings": {
    "analysis": {
      "analyzer": {
        "custom_arabic": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "decimal_digit",
            "arabic_stop",
            "arabic_normalization",
            "arabic_stemmer"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "name_ar": {
        "type": "text",
        "analyzer": "custom_arabic"
      },
      "name_en": {
        "type": "text",
        "analyzer": "english"
      },
      "name_all": {
        "type": "text",
        "analyzer": "standard"
      }
    }
  }
}
```

### Algolia

Algolia handles Arabic with default settings. Add custom synonyms via dashboard or API:

```js
await index.saveSynonyms([
  {
    objectID: 'shampoo-group',
    type: 'synonym',
    synonyms: ['shampoo', 'shampo', 'شامبو', 'شامبوه']
  }
]);
```

## Query workflow

```js
async function search(rawQuery, locale = 'en') {
  // 1. Detect script
  const isArabic = /[\u0600-\u06FF]/.test(rawQuery);
  
  // 2. Normalize
  const normalized = isArabic 
    ? normalizeArabic(rawQuery)
    : rawQuery.toLowerCase().trim();
  
  // 3. Expand synonyms
  const synonyms = await getSynonymsForQuery(normalized);
  const expandedQuery = [normalized, ...synonyms].join(' OR ');
  
  // 4. Search
  const results = await searchEngine.search({
    query: expandedQuery,
    fields: ['name_ar^3', 'name_en^3', 'brand_ar^2', 'brand_en^2', 'description_ar', 'description_en', 'tags_ar', 'tags_en'],
    filters: { locale_visible: [locale, 'both'] },
    limit: 20,
  });
  
  // 5. Re-rank
  const ranked = rerank(results, { 
    preferredLanguage: locale,
    userHistory: await getUserHistory(),
  });
  
  return ranked;
}
```

## Typo tolerance

Users typo often. Edit distance forgiveness is critical.

### Levenshtein distance

```
"shampo" → "shampoo" (distance 1) → match
"shamp"  → "shampoo" (distance 2) → match
"sham"   → "shampoo" (distance 3) → maybe (depends on length)
```

Typical rules:
- 1-4 character word: 0 typos allowed
- 5-8 character: 1 typo allowed
- 9+ character: 2 typos allowed

Most search engines have built-in fuzzy matching. Configure:

```json
{
  "query": {
    "match": {
      "name_ar": {
        "query": "شامبوه",
        "fuzziness": "AUTO"
      }
    }
  }
}
```

### Arabic-specific typo handling

Common Arabic typos:
- ت ↔ ة (ta vs ta marbuta)
- ي ↔ ى (ya vs alif maksura)
- ا ↔ أ ↔ إ ↔ آ (alif variations)
- ه ↔ ة

Normalization (above) handles these as identical.

### Phonetic matching (optional)

For brand transliterations, phonetic similarity:

```
"Tresemmé" sounds like "Tre-sem-may"
Arabic transliteration: تريسمي

Phonetic codes (Soundex/Metaphone for Latin; less standard for Arabic):
"Tresemmé" → "T625" (Soundex)
"Trsm"     → "T625" (same code, matches)
```

Tools: Soundex (English), Metaphone (English), Caverphone, NYSIIS. Arabic phonetic algorithms are research-grade; usually synonym tables are more reliable.

## Autocomplete

Type-ahead suggestions should:
- Update on every keystroke (debounced 100-200ms)
- Show suggestions in both languages
- Highlight matching part of suggestion
- Include category, brand suggestions
- Personalize to user's history

### Example

User types "شام":

```
Suggestions:
1. شامبو                          ← popular search
2. شامبو ضد القشرة                 ← popular search
3. شامبو للأطفال                   ← user has viewed before
4. Anti-dandruff Shampoo          ← match in EN
5. Head & Shoulders Shampoo       ← brand match
```

### Implementation

```js
async function autocomplete(prefix, locale) {
  const normalized = locale === 'ar' ? normalizeArabic(prefix) : prefix.toLowerCase();
  
  const [popular, brands, categories, history] = await Promise.all([
    getPopularSearches({ prefix: normalized, limit: 5 }),
    getBrandMatches({ prefix: normalized, limit: 3 }),
    getCategoryMatches({ prefix: normalized, limit: 2 }),
    getUserHistoryMatches({ prefix: normalized, limit: 5 }),
  ]);
  
  return mergeAndDedupe([history, popular, brands, categories]);
}
```

## Did-you-mean / spell correction

When zero results, suggest corrections:

```
You searched: شمابو
Did you mean: شامبو?  ← clickable

[show "شامبو" results below]
```

Algorithm:
1. Check if query matches anything (zero results threshold)
2. Find similar terms in the synonym table
3. Highest-frequency similar term = "did you mean"

### Implementation

```js
async function searchWithCorrection(query) {
  const results = await search(query);
  
  if (results.length === 0) {
    const corrections = await findClosestTerms(query, { maxDistance: 2 });
    if (corrections.length > 0) {
      const correctedQuery = corrections[0].term;
      const correctedResults = await search(correctedQuery);
      return {
        results: correctedResults,
        didYouMean: correctedQuery,
        original: query,
      };
    }
  }
  
  return { results, original: query };
}
```

## Cross-language search

User types in English but most relevant products are Arabic-only — and vice versa:

```
Query: "shampoo for dry hair"

Match: 
- "شامبو للشعر الجاف" (Arabic, perfect match)
- "Anti-dryness shampoo" (English, partial match)
```

To enable, index products with both languages, even if vendor only provided one:

```js
// During product indexing
async function indexProduct(product) {
  let nameAr = product.name_ar;
  let nameEn = product.name_en;
  
  // Auto-translate if missing (for search index only, not display)
  if (!nameAr && nameEn) {
    nameAr = await machineTranslate(nameEn, 'en', 'ar');
  }
  if (!nameEn && nameAr) {
    nameEn = await machineTranslate(nameAr, 'ar', 'en');
  }
  
  await searchIndex.add({
    id: product.id,
    name_ar: nameAr,
    name_en: nameEn,
    name_ar_normalized: normalizeArabic(nameAr || ''),
    ...
  });
}
```

Note: machine translation here is for search relevance ONLY. Display uses vendor-provided text.

## Filter labels in search

Filters should be translated:

```
LTR:
- Brand: L'Oréal, Tresemmé, ...
- Price: AED 0 - 50, AED 50 - 100, ...
- Hair Type: Curly, Straight, ...

RTL:
- العلامة التجارية: لوريال، تريسمي، ...
- السعر: 0 - 50 درهم، 50 - 100 درهم، ...
- نوع الشعر: مجعد، مستقيم، ...
```

Filter VALUES (brand names) might stay in original language or be translated; depends on vendor data quality.

## Sorting in Arabic

Sort by relevance: default, works.

Sort by name A-Z: locale-aware:

```js
products.sort((a, b) => a.name.localeCompare(b.name, locale));
```

In Arabic, this sorts ب before ت before ث, etc.

Sort by price: same regardless of language.

## Voice search

Web Speech API supports Arabic:

```js
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'ar-AE'; // Arabic (UAE) - or 'ar-SA', 'ar-EG'
recognition.continuous = false;
recognition.interimResults = false;

recognition.onresult = (event) => {
  const query = event.results[0][0].transcript;
  performSearch(query);
};

recognition.start();
```

Dialect support varies:
- `ar-EG` — Egyptian Arabic recognition
- `ar-SA` — MSA / Saudi
- `ar-AE` — Gulf

Default to user's country's locale.

## Visual search

User uploads/takes photo of product → find similar:

- AWS Rekognition
- Google Cloud Vision
- Clarifai

Match against product image embeddings.

In Arabic UI: button labeled "بحث بالصورة" (Search by image).

## Search analytics

Track:
- **Top queries** (per language)
- **Zero-result queries** (gaps in inventory or synonym needs)
- **Did-you-mean clicks** (validates corrections)
- **Click-through rate** (query relevance)
- **Conversion from search** (revenue per query)

Per-language:
- Identify Arabic queries with high zero-result rates → add synonyms
- Identify mismatches: "user searched Arabic, clicked on English-only product" — translation gap

## Indexing pipeline

When a product is added/updated:

```js
async function indexProduct(product) {
  const indexableContent = {
    id: product.id,
    
    // Latin
    name_en: product.name_en,
    name_en_normalized: product.name_en.toLowerCase(),
    
    // Arabic
    name_ar: product.name_ar,
    name_ar_normalized: normalizeArabic(product.name_ar || ''),
    
    // Brand (both languages)
    brand_en: product.brand.name_en,
    brand_ar: product.brand.name_ar,
    brand_normalized_en: product.brand.name_en.toLowerCase(),
    brand_normalized_ar: normalizeArabic(product.brand.name_ar || ''),
    
    // Synonyms
    all_synonyms: await getProductSynonyms(product),
    
    // Categories
    categories_en: product.categoryPath.map(c => c.name_en).join(' '),
    categories_ar: product.categoryPath.map(c => c.name_ar).join(' '),
    
    // Tags
    tags_en: product.tags.map(t => t.label_en).join(' '),
    tags_ar: product.tags.map(t => t.label_ar).join(' '),
    
    // Attributes
    attributes_en: stringifyAttributes(product.attributes, 'en'),
    attributes_ar: stringifyAttributes(product.attributes, 'ar'),
    
    // Boosts
    boost_score: calculateBoostScore(product), // best-seller, etc.
    
    // Filters
    in_stock: product.stockCount > 0,
    price_minor: product.priceMinor,
    rating: product.rating,
    categories: product.categories.map(c => c.id),
  };
  
  await searchEngine.upsert(indexableContent);
}
```

## Performance

- **Indexing**: bulk update nightly + real-time stream for new/changed products
- **Query latency**: <200ms p95 (autocomplete <100ms)
- **Synonym lookup**: cache in Redis (1-hour TTL)
- **Result count**: limit 24 per page, paginate

## Localized boosting

Search results boost based on locale:

```js
function rankResults(results, locale) {
  return results.map(r => ({
    ...r,
    score: r.score 
      + (r.has_locale_content[locale] ? 0.5 : 0)
      + (r.locale_buyers_pct[locale] * 0.3),
  })).sort((a, b) => b.score - a.score);
}
```

If a user is in Saudi Arabia and the product has Arabic content AND ships to KSA → boost.

## Indexing brand variations

For each brand, index ALL known transliterations:

```js
async function indexBrand(brand) {
  const allNames = await getBrandAliases(brand.id);
  
  await searchEngine.upsert({
    id: brand.id,
    type: 'brand',
    primary_name_en: brand.canonicalName,
    primary_name_ar: brand.canonicalNameAr,
    all_names: allNames.map(a => a.alias).join(' '),
    all_names_normalized: allNames.map(a => a.alias_normalized).join(' '),
  });
}
```

## Common tricky cases

### Names with apostrophes

```
"L'Oréal" 
Variations: L'Oreal, LOreal, L Oreal, loreal
```

In search, normalize: remove `'` and other punctuation.

### Hyphenated terms

```
"Anti-dandruff"
Variations: Anti dandruff, antidandruff, anti-dandruff
```

Index with both, hyphens stripped and preserved.

### Accents

```
"Crème"
Variations: Creme, Crême, Crème
```

Normalize accented Latin characters:

```js
function removeAccents(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

removeAccents('Crème'); // "Creme"
```

### Trade names with numbers

```
"Pantene Pro-V"
Variations: Pantene ProV, Pantene Pro V, Pantine Pro-V
```

Synonym table handles these.

### Common misspellings

Track 404 / zero-result queries and add common misspellings as synonyms:

```sql
SELECT query, COUNT(*) as freq
FROM search_log
WHERE result_count = 0
GROUP BY query
ORDER BY freq DESC
LIMIT 50;
```

Manually review weekly; add synonyms for high-frequency misspellings.

## Anti-patterns

- ❌ Indexing only one language per product (cross-language searches fail)
- ❌ Not normalizing Arabic before search (1 query, 6 ways to write it, only 1 matches)
- ❌ Ignoring transliteration (Arabic user types brand in Latin, finds nothing)
- ❌ No typo tolerance (one wrong character = no results)
- ❌ Auto-translating user-provided product descriptions for display (looks wrong)
- ❌ Returning zero results without suggestions (dead-end UX)
- ❌ Synonyms maintained as one giant flat file (un-maintainable)
- ❌ Same synonym list for all categories (haircare "soft" ≠ skincare "soft")
- ❌ Not tracking what users search for (no visibility into search gaps)
- ❌ Boosting brand "best match" by exact name only (Arabic users type Latin brand names roughly)
- ❌ Autocomplete only in one language at a time (Arabic input, only Arabic suggestions even if relevant English)
- ❌ Voice search in English only (Arabic voice queries are common)
- ❌ Forgetting category translations (filter says "Hair Care" in Arabic UI)
- ❌ Numbers in Arabic queries treated differently than in English (digits should match identically)
