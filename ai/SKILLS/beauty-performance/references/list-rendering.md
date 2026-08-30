# List Rendering & Grid Performance

Product grids are the most-rendered surface on a marketplace. A category page might show 48 cards initially, with 1000+ available via infinite scroll. Each card has multiple images, prices, badges, hover states. If rendering isn't efficient, scrolling jank, slow input response, and battery drain follow.

## Rendering strategies

### Strategy 1: All-at-once

Render all items as DOM nodes:

```jsx
{products.map(p => <ProductCard key={p.id} product={p} />)}
```

Works for <50 items. Beyond that:
- DOM size balloons
- Memory usage grows
- Scrolling gets janky
- Initial render takes long

### Strategy 2: Pagination

Load N items per page, user clicks "Next":

```jsx
<ProductGrid products={products.slice(offset, offset + pageSize)} />
<Button onClick={() => setOffset(offset + pageSize)}>Next page</Button>
```

Pros: predictable DOM size, easy URLs.
Cons: extra clicks, "what was on the previous page" friction.

### Strategy 3: Infinite scroll

Auto-load more as user scrolls:

```jsx
<ProductGrid products={loadedProducts} />
{hasMore && <IntersectionObserver onEnter={loadMore} />}
```

Pros: seamless browsing.
Cons: DOM grows indefinitely, footer becomes unreachable.

### Strategy 4: Virtualization (windowing)

Render only visible items + small buffer:

```jsx
import { useVirtualizer } from '@tanstack/react-virtual';

function ProductGrid({ products }) {
  const parentRef = useRef();
  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 400,
    overscan: 6,
  });
  
  return (
    <div ref={parentRef} style={{ overflow: 'auto', height: '100vh' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: virtualItem.start,
              left: 0,
              width: '100%',
            }}
          >
            <ProductCard product={products[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

Pros: scales to millions of items, constant memory.
Cons: more complex, breaks browser Ctrl+F search, harder accessibility.

## Recommended hybrid

For commerce, the best pattern is usually:

1. **Initial load**: 24 products (server-rendered)
2. **Infinite scroll**: Load 24 more on scroll near bottom
3. **Pagination footer**: Also show page numbers (for SEO + accessibility + reaching footer)
4. **Cap**: Stop infinite scroll at 200-300 items; require explicit "next page" click

This gives best of both: seamless browsing, eventual structure.

## Initial render

Server-render the first batch:

```jsx
// Next.js
export async function generateMetadata({ params }) {
  const products = await getProductsForCategory(params.slug, { limit: 24 });
  return { ... };
}

export default async function CategoryPage({ params }) {
  const products = await getProductsForCategory(params.slug, { limit: 24 });
  return <ProductGrid products={products} />;
}
```

HTML arrives with products inside. No layout shift, no skeleton flicker, instant LCP.

## Infinite scroll implementation

```jsx
import { useInView } from 'react-intersection-observer';

function ProductGrid({ initialProducts, fetchMore }) {
  const [products, setProducts] = useState(initialProducts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px', // load before reaching the end
  });
  
  useEffect(() => {
    if (!inView || !hasMore || loading) return;
    
    setLoading(true);
    fetchMore({ page: page + 1 }).then(newProducts => {
      if (newProducts.length === 0) {
        setHasMore(false);
      } else {
        setProducts(prev => [...prev, ...newProducts]);
        setPage(prev => prev + 1);
      }
      setLoading(false);
    });
  }, [inView, hasMore, loading, page, fetchMore]);
  
  return (
    <>
      <div className="grid">
        {products.map(p => <ProductCard key={p.id} product={p} />)}
      </div>
      
      {hasMore && (
        <div ref={loadMoreRef} className="load-more-trigger">
          {loading ? <Spinner /> : null}
        </div>
      )}
      
      {!hasMore && page > 5 && (
        <button onClick={() => loadPage(page + 1)}>Load more</button>
      )}
    </>
  );
}
```

Key behaviors:
- Pre-fetch 400px before reaching end (smoother feel)
- Stop auto-loading after several pages (don't run forever)
- Manual "Load more" button takes over for explicit control

## Grid CSS

```css
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4);
}

@media (min-width: 768px) {
  .product-grid {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
}

@media (min-width: 1280px) {
  .product-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
}
```

`auto-fill` adapts column count based on available width. No JS needed.

For RTL: grid flips automatically with `direction: rtl` on parent.

### Avoid layout thrash

Don't change grid layout while scrolling. Each layout recalculation is expensive.

If column count changes on resize, debounce:

```js
const handleResize = debounce(() => {
  // recalculate
}, 100);
window.addEventListener('resize', handleResize);
```

## CLS prevention

```css
.product-card {
  /* Reserve space — even before image loads */
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 380px;
}

.product-card-image {
  aspect-ratio: 1 / 1;
  background: var(--color-neutral-100);
}

.product-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

Card has fixed dimensions from start. Image area reserved. No shift when image loads.

## Image optimization in grids

Each product card has an image. With 24 cards, that's 24 image requests.

### Aggressive lazy loading

```html
<img loading="lazy" 
     decoding="async"
     srcset="..."
     sizes="(max-width: 640px) 50vw, 25vw"
     width="400"
     height="400"
     alt="...">
```

`loading="lazy"` is critical here. Above-the-fold cards (first ~6) might be `eager`.

### Image priority for above-fold

```jsx
{products.map((p, i) => (
  <ProductCard 
    key={p.id} 
    product={p} 
    priority={i < 6} // first row eager, rest lazy
  />
))}
```

```jsx
function ProductCard({ product, priority }) {
  return (
    <img 
      src={product.image}
      loading={priority ? 'eager' : 'lazy'}
      fetchpriority={priority ? 'high' : 'auto'}
      // ...
    />
  );
}
```

## Memoization

React re-renders cards unnecessarily on parent updates:

```jsx
const ProductCard = React.memo(function ProductCard({ product }) {
  // Won't re-render unless `product` reference changes
  return <article>...</article>;
});
```

For deep equality:

```jsx
const ProductCard = React.memo(
  function ProductCard({ product }) { ... },
  (prev, next) => prev.product.id === next.product.id
);
```

For Vue, use `shallowRef` for product lists, immutable updates.

## Click handlers

```jsx
// Bad: new function every render
{products.map(p => (
  <ProductCard 
    product={p}
    onAddToCart={() => addToCart(p.id)} // new function!
  />
))}
```

Each render passes a new function → React.memo doesn't help.

```jsx
// Better: stable handler, ID passed
function ProductGrid({ products, onAddToCart }) {
  return (
    <>
      {products.map(p => (
        <ProductCard 
          key={p.id}
          product={p}
          onAddToCart={onAddToCart} // stable
        />
      ))}
    </>
  );
}

function ProductCard({ product, onAddToCart }) {
  return <button onClick={() => onAddToCart(product.id)}>Add</button>;
}
```

Or use event delegation (one handler on the parent):

```jsx
function ProductGrid({ products }) {
  function handleClick(e) {
    const productId = e.target.closest('[data-product-id]')?.dataset.productId;
    if (productId && e.target.matches('.add-to-cart')) {
      addToCart(productId);
    }
  }
  
  return (
    <div onClick={handleClick}>
      {products.map(p => (
        <article key={p.id} data-product-id={p.id}>
          <button className="add-to-cart">Add to cart</button>
        </article>
      ))}
    </div>
  );
}
```

One event listener instead of N.

## Scroll performance

### Use `transform` for sticky / fixed positioning

```css
.sticky-filter {
  position: sticky;
  top: 0;
}
```

`position: sticky` is GPU-accelerated. Don't use JS to track scroll and reposition.

### CSS containment

Tell browser this element is independent — paint/layout changes don't affect outside:

```css
.product-card {
  contain: layout style paint;
}
```

For long grids, significant scroll perf improvement.

`content-visibility: auto` is even more aggressive:

```css
.product-card {
  content-visibility: auto;
  contain-intrinsic-size: 380px;
}
```

Off-screen cards are NOT rendered. Massive savings, esp. for long lists.

Trade-off: browser support is Chromium-based (good), Safari recent.

### Avoid scroll handlers

```js
// Bad
window.addEventListener('scroll', () => {
  // expensive computation
});
```

Scroll fires constantly. Use:

```js
let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      // do work
      ticking = false;
    });
    ticking = true;
  }
});
```

Or use IntersectionObserver / scroll-snap CSS instead of JS.

### Will-change

```css
.card:hover {
  transform: scale(1.02);
}

.card {
  /* Tell browser to prepare for transform */
  will-change: transform;
}
```

Use sparingly — `will-change` on every card hurts more than helps. Apply only to elements about to animate (e.g., on hover).

## Skeleton loading

While loading initial data:

```jsx
function ProductGridLoading() {
  return (
    <div className="product-grid">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="product-card-skeleton">
          <div className="skeleton-image" />
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-subtitle" />
          <div className="skeleton-line skeleton-price" />
        </div>
      ))}
    </div>
  );
}
```

```css
.skeleton-image,
.skeleton-line {
  background: linear-gradient(
    90deg,
    var(--color-neutral-200) 0%,
    var(--color-neutral-100) 50%,
    var(--color-neutral-200) 100%
  );
  background-size: 200% 100%;
  animation: skeleton 1.5s ease-in-out infinite;
}

@keyframes skeleton {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

Skeleton matches actual card dimensions → no CLS when data arrives.

## URL state for filters

When user changes filter, update URL:

```
/c/hair?brand=loreal&price=0-100&page=2
```

Pros:
- Shareable
- Back button works
- SEO indexable
- Cacheable at CDN

```jsx
import { useSearchParams } from 'next/navigation';

function CategoryPage() {
  const params = useSearchParams();
  const brand = params.get('brand');
  const price = params.get('price');
  
  const products = await getProducts({ brand, price });
  return <ProductGrid products={products} />;
}
```

## Page-level caching

Server-render and cache different filter combinations:

```
/c/hair?sort=popular         → cache 5 min
/c/hair?brand=loreal         → cache 5 min
/c/hair?brand=loreal&page=2  → cache 5 min
```

ISR or CDN with stale-while-revalidate works well.

For highly-variable filters, cache only common combinations; route uncommon ones to dynamic rendering.

## Filter changes

When user changes a filter, options:

### Option A: Full page reload

User clicks filter → URL changes → page reloads with new filters.

Pros: simple, SEO-friendly.
Cons: slow.

### Option B: Client-side update (SPA)

User clicks filter → JS updates URL → fetches new data → re-renders grid.

```jsx
function FilterPanel({ onChange }) {
  return (
    <button onClick={() => onChange('brand', 'loreal')}>L'Oréal</button>
  );
}

function CategoryPage() {
  const [filters, setFilters] = useState({});
  const { data: products } = useSWR(['/api/products', filters], fetcher);
  
  return (
    <>
      <FilterPanel onChange={(k, v) => setFilters({ ...filters, [k]: v })} />
      {products && <ProductGrid products={products} />}
    </>
  );
}
```

Pros: instant.
Cons: requires JS, more complex state.

Best: hybrid. SSR initial render; client-side updates for subsequent filter changes.

## Optimistic UI for filters

When user clicks filter:

1. Show selected state immediately (visual feedback)
2. Show loading skeleton on grid (fade old products)
3. Fetch new data
4. Replace grid with new products

```jsx
function CategoryPage() {
  const [pendingFilters, setPendingFilters] = useState(filters);
  const [committedFilters, setCommittedFilters] = useState(filters);
  
  function handleFilterChange(key, value) {
    const next = { ...pendingFilters, [key]: value };
    setPendingFilters(next);
    
    // Debounce commit
    debounce(() => {
      setCommittedFilters(next);
    }, 100)();
  }
  
  const { data } = useSWR(['/api/products', committedFilters], fetcher);
  
  return (
    <>
      <FilterPanel selected={pendingFilters} onChange={handleFilterChange} />
      {data ? <ProductGrid products={data} /> : <ProductGridLoading />}
    </>
  );
}
```

User feedback is instant; data fetches in background.

## Animation when grid changes

When sorting/filtering changes order:

```jsx
import { motion, AnimatePresence } from 'framer-motion';

<AnimatePresence>
  {products.map(p => (
    <motion.div
      key={p.id}
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <ProductCard product={p} />
    </motion.div>
  ))}
</AnimatePresence>
```

`layout` prop animates position changes smoothly (cards slide into new positions).

Don't overdo — animating 48 cards at once can be janky. Cap to first 12 or use a stagger.

## Scroll restoration

When user navigates away from a list (clicks a product) then returns:

```jsx
// Save scroll position on leave
useEffect(() => {
  return () => {
    sessionStorage.setItem('list-scroll', window.scrollY);
  };
}, []);

// Restore on enter
useEffect(() => {
  const saved = sessionStorage.getItem('list-scroll');
  if (saved) {
    window.scrollTo(0, parseInt(saved));
  }
}, []);
```

Next.js does this automatically with `scroll: false` on Link, but most setups need manual handling.

## Persistent results when navigating back

```jsx
// Save products + filters when leaving
function CategoryPage() {
  useEffect(() => {
    return () => {
      sessionStorage.setItem('category-state', JSON.stringify({
        products,
        filters,
        scrollY: window.scrollY,
      }));
    };
  });
  
  // Hydrate on return
  useEffect(() => {
    const saved = sessionStorage.getItem('category-state');
    if (saved) {
      const { products, filters, scrollY } = JSON.parse(saved);
      setProducts(products);
      setFilters(filters);
      window.scrollTo(0, scrollY);
    }
  }, []);
}
```

Critical UX: users hate scrolling back to find their place.

## Accessibility

Lists must be:
- Keyboard navigable
- Screen-reader-friendly

```html
<div role="region" aria-label="Products">
  <ul class="product-grid">
    <li>
      <article aria-labelledby="product-1-name">
        <h3 id="product-1-name">Product name</h3>
        ...
      </article>
    </li>
    ...
  </ul>
</div>
```

For infinite scroll, announce updates:

```html
<div aria-live="polite" aria-atomic="false">
  <span class="visually-hidden" key={products.length}>
    Showing {products.length} of {total} products
  </span>
</div>
```

When new products load, screen reader announces.

## Hover effects (desktop only)

```css
.product-card {
  transition: transform 0.2s, box-shadow 0.2s;
}

@media (hover: hover) {
  .product-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }
}
```

`@media (hover: hover)` ensures hover effects only apply where hover exists (desktop). On touch, no hover trigger.

## Stock indicators

Each card shows stock status. Don't fetch stock per card (N+1 disaster):

Server-side: include stock in the product data:

```json
{
  "id": "...",
  "name": "...",
  "price_minor": 8900,
  "stock_status": "in_stock", // or "low_stock", "out_of_stock"
  "stock_count": 47
}
```

Display:

```jsx
function StockBadge({ status, count }) {
  if (status === 'out_of_stock') return <Badge color="red">Out of stock</Badge>;
  if (status === 'low_stock') return <Badge color="orange">Only {count} left</Badge>;
  return null; // in stock = no badge
}
```

## Wishlist / save buttons

Per-card "save" action:

```jsx
function WishlistButton({ productId }) {
  const [saved, setSaved] = useState(false);
  
  function toggle() {
    setSaved(!saved); // optimistic
    fetch('/api/wishlist/toggle', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    }).catch(() => setSaved(saved)); // revert on error
  }
  
  return (
    <button onClick={toggle} aria-pressed={saved}>
      <HeartIcon filled={saved} />
    </button>
  );
}
```

Pre-fill from server-rendered state (which products user has wishlisted).

## Empty states

When no products match filters:

```jsx
{products.length === 0 && !loading && (
  <div className="empty-state">
    <Illustration />
    <h2>No products match your filters</h2>
    <p>Try removing some filters or browse all products.</p>
    <button onClick={clearFilters}>Clear filters</button>
  </div>
)}
```

Don't show empty grid. Don't show "0 results" without explanation or action.

## Filter chips

Active filters shown as removable chips above the grid:

```jsx
function FilterChips({ filters, onRemove }) {
  return (
    <div className="filter-chips">
      {Object.entries(filters).map(([key, value]) => (
        <button 
          key={key}
          className="filter-chip"
          onClick={() => onRemove(key)}
        >
          {labels[key]}: {value}
          <CloseIcon />
        </button>
      ))}
      {Object.keys(filters).length > 0 && (
        <button onClick={clearAll}>Clear all</button>
      )}
    </div>
  );
}
```

See `beauty-search-filters/references/applied-filter-chips.md` for details.

## Anti-patterns

- ❌ Rendering 1000 cards as DOM nodes (use virtualization or pagination)
- ❌ No `key` on list items (React reconciliation breaks)
- ❌ Using array index as key (breaks on reorder)
- ❌ New event handlers on every render
- ❌ Re-fetching all data on every filter change (delta-fetch where possible)
- ❌ Loading all images eagerly (massive bandwidth)
- ❌ No skeleton (blank screen feels broken)
- ❌ Layout shifts when images load
- ❌ Hover effects that work on touch (sticky hover state)
- ❌ Scroll handlers that run on every scroll event
- ❌ Animations on 48 cards simultaneously (janky)
- ❌ Forgetting RTL (grid items go wrong direction)
- ❌ Fetching stock per card (N+1)
- ❌ Empty state that's just "0 results" (no path forward)
- ❌ Filter changes that scroll to top (lose user's context)
- ❌ Pagination but no URL state (back button broken)
- ❌ Infinite scroll with no end (footer never reachable)
- ❌ Wishlist toggle that doesn't show optimistic state
