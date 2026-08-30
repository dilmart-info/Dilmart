# Search Bar with Autocomplete

Search drives 30–40% of marketplace conversions. The search bar must do its job in three places: the header, the mobile drawer, and the dedicated search results page.

## Visual structure

```
┌──────────────────┬────────────────────────────────────────┬──────┐
│ All categories ▾ │ Search for shampoo, clippers, foundation│  🔍  │
└──────────────────┴────────────────────────────────────────┴──────┘
   160px              flex                                     56px
```

Total height: 44–48px. 12px radius on outer wrapper. 1px ink-300 border that becomes primary-500 on focus-within.

The category dropdown is **optional but recommended** — lets users scope search to "All", "Hair Care", "Brands", etc. Default value: "All categories".

## Placeholder behavior

Rotating placeholder, cycles every 3 seconds:
1. "Search for shampoo, clippers, foundation..."
2. "Try 'Wahl Magic Clip' or 'Olaplex No.3'"
3. "Find your favorite brand or product"

Stop rotation on focus. Resume on blur if input is empty.

## Autocomplete dropdown

Opens immediately on focus (showing recent + popular). Updates on input with debounce of 150ms. Min 2 characters to trigger search query.

### Layout (when query is empty)

```
┌──────────────────────────────────────────────────┐
│ RECENT SEARCHES                                   │  ← if logged in or local history
│  🔍 wahl clipper                            ×    │
│  🔍 olaplex no 3                            ×    │
│  🔍 hair color brown                        ×    │
├──────────────────────────────────────────────────┤
│ TRENDING NOW                                      │
│  📈 BaByliss Pro FX clippers                     │
│  📈 Loreal Vitamino                              │
│  📈 Beard oil                                    │
│  📈 Salon chair                                  │
│  📈 Nail polish                                  │
├──────────────────────────────────────────────────┤
│ POPULAR CATEGORIES                                │
│  Hair Tools  ·  Skin Care  ·  Barber Supplies   │
└──────────────────────────────────────────────────┘
```

### Layout (when query has results)

```
┌────────────────────────────────────────────────────────┐
│ "wahl"                                                  │
├────────────────────────────────────────────────────────┤
│ Did you mean: WAHL Professional?                       │  ← typo correction if applicable
├────────────────────────────────────────────────────────┤
│ SUGGESTIONS                                             │
│  🔍 wahl clipper                                       │
│  🔍 wahl magic clip                                    │
│  🔍 wahl five star                                     │
│  🔍 wahl detailer                                      │
├────────────────────────────────────────────────────────┤
│ PRODUCTS                                                │
│  ┌──┐ Wahl Professional Magic Clip Cordless           │
│  │📷│ Hair Clipper                                     │
│  └──┘ ★ 4.8 (3,241)              $169.99               │
│                                                         │
│  ┌──┐ Wahl Professional Senior Cordless               │
│  │📷│ Clipper                                          │
│  └──┘ ★ 4.7 (1,892)              $249.99               │
│                                                         │
│  ┌──┐ Wahl Professional Detailer Trimmer              │
│  │📷│ Black                                            │
│  └──┘ ★ 4.6 (892)                 $99.99               │
├────────────────────────────────────────────────────────┤
│ BRANDS                                                  │
│  Wahl Professional · Wahl Home                         │
├────────────────────────────────────────────────────────┤
│ CATEGORIES                                              │
│  Clippers in Barbering & Shaving                       │
├────────────────────────────────────────────────────────┤
│  → See all results for "wahl"                          │
└────────────────────────────────────────────────────────┘
```

### Section caps

- Recent searches: max 5
- Trending: max 5
- Typo suggestions: max 1
- Query suggestions: max 6
- Products: max 4 (show enough to be useful, not so many that users scroll inside the autocomplete)
- Brands: max 3
- Categories: max 2

## Interaction

### Keyboard
- Arrow Down: move focus into the dropdown, then between items
- Arrow Up: move back. Up from the first item returns focus to input.
- Enter: navigate to highlighted item; if no item highlighted, submit the search query
- Escape: close dropdown, keep input value
- Tab: close dropdown, move focus out of search

### Mouse
- Hover an item: highlight with bg `--color-surface-3`
- Click: navigate to item
- Click outside: close dropdown

### Touch / Mobile
- The autocomplete dropdown expands to full screen on mobile
- A close (×) button appears in the search input
- Tapping a suggestion immediately navigates

## Recent searches behavior

- Store the last 10 searches in `localStorage` under key `bm.recentSearches`
- Show max 5 in autocomplete
- Each has an × to remove individually
- Below the list: small text "Clear all recent searches" link

For logged-in users, sync to server so recent searches follow across devices.

## Search results page

The dedicated `/search?q=` page uses the same product grid + filters layout as a category page (covered in `beauty-search-filters` skill). Above the grid:

```
Search results for "wahl"                              Sort: Most popular ▾

42 products found                                       [view: grid] [list]
```

If 0 results:
```
😕 We couldn't find anything for "wahlx"

Try:
 • Checking your spelling
 • Using more general terms
 • Browsing a category instead

Popular searches:  Wahl  ·  BaByliss Pro  ·  Andis  ·  Clipper
```

## Search ranking signals (specify to backend)

When working on the data layer, the autocomplete API should rank by:
1. Exact match on product name (highest)
2. Match on brand name
3. Match in category name
4. Match in description / tags
5. Popularity (sales velocity, views)
6. Stock available
7. Personalization (user's purchase history, viewed categories)

Boost: products in stock, products on sale, in-language matches (English/Arabic).
Penalize: out of stock, low-rated (<3 stars).

## Voice search (optional, mobile)

Mic icon inside the search bar on mobile. Tap → Web Speech API recognition. Show animated waveform during listening. On complete: populate input + auto-submit after 800ms.

Skip implementing this unless explicitly asked — adds complexity without huge gain.

## Accessibility

```html
<form role="search" action="/search" method="get">
  <label for="search-input" class="sr-only">Search products</label>

  <div class="search-scope">
    <label for="search-category" class="sr-only">Limit search to category</label>
    <select id="search-category" name="cat">...</select>
  </div>

  <input id="search-input"
         name="q"
         type="search"
         autocomplete="off"
         aria-expanded="false"
         aria-controls="search-listbox"
         aria-haspopup="listbox"
         placeholder="Search...">

  <ul id="search-listbox"
      role="listbox"
      aria-label="Search suggestions"
      hidden>
    <li role="option">...</li>
  </ul>

  <button type="submit" aria-label="Search">
    <svg aria-hidden="true">...</svg>
  </button>
</form>
```

- `aria-activedescendant` on input points to currently highlighted listbox item
- Screen reader announces "{n} suggestions available" when results load
- Recent searches × buttons have `aria-label="Remove {query} from history"`

## Performance

- Debounce input: 150ms (tested sweet spot for marketplaces)
- Cache results in memory for the session (Map keyed by normalized query)
- Use `AbortController` to cancel in-flight requests when user types again
- Preload most-popular search terms list at page load (5 KB JSON)
- Show skeleton suggestions during fetch if it exceeds 200ms

## What NOT to do

1. **No client-side fuzzy search** as the only mechanism — server-side typo tolerance (Algolia, Meilisearch, Typesense) is mandatory.
2. **No autocomplete that fetches on every keystroke** — debounce.
3. **No autocomplete that shows ONLY products** — keyword suggestions help more than product cards for top-of-funnel.
4. **No closing the dropdown when user clicks the × on a recent search** — keep dropdown open.
5. **No autocomplete that hijacks the browser's native autofill** — `autocomplete="off"` on the input.
6. **No more than 12 suggestions total** — bigger lists overwhelm.
