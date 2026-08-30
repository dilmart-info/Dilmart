# API & Backend Performance

The fastest frontend optimization can't save a slow API. If `getProductsForCategory` takes 800ms, the page takes 800ms+ to render. Backend performance is the foundation. This doc covers the patterns that matter for a marketplace.

## TTFB target

Time to First Byte (TTFB) target: **<600ms** for HTML pages, **<300ms** for API responses.

If TTFB is bad, fix the backend before anything else.

## Database query optimization

### Indexes

The single biggest impact on query performance.

```sql
-- Products by category: needs index
CREATE INDEX idx_products_category ON products(category_id);

-- Products by category + status: composite
CREATE INDEX idx_products_cat_status ON products(category_id, status) WHERE status = 'active';

-- Search by name
CREATE INDEX idx_products_name_search ON products USING GIN (to_tsvector('english', name));

-- Multi-column sorting
CREATE INDEX idx_products_cat_popularity ON products(category_id, popularity_score DESC);
```

Audit queries with `EXPLAIN ANALYZE`:

```sql
EXPLAIN ANALYZE 
SELECT * FROM products 
WHERE category_id = 'abc' 
ORDER BY popularity_score DESC 
LIMIT 24;
```

Look for:
- `Seq Scan` (sequential scan) — bad on large tables; add index
- `Index Scan` — good
- Long execution time on small tables — query plan issue

### N+1 problems

Classic bug:

```ts
// Bad: 1 query for products, then N queries for vendors
const products = await db.product.findMany({ take: 24 });
for (const p of products) {
  p.vendor = await db.vendor.findUnique({ where: { id: p.vendorId } });
}
// 25 queries total
```

Fix: join or batch:

```ts
// Good: 1 query with join
const products = await db.product.findMany({
  take: 24,
  include: { vendor: true },
});
// 1 query total

// Or batch:
const products = await db.product.findMany({ take: 24 });
const vendorIds = products.map(p => p.vendorId);
const vendors = await db.vendor.findMany({ where: { id: { in: vendorIds } } });
const vendorMap = new Map(vendors.map(v => [v.id, v]));
products.forEach(p => p.vendor = vendorMap.get(p.vendorId));
// 2 queries total
```

### DataLoader pattern (GraphQL)

[DataLoader](https://github.com/graphql/dataloader) batches and caches loads within a request:

```ts
const vendorLoader = new DataLoader(async (vendorIds) => {
  const vendors = await db.vendor.findMany({ where: { id: { in: vendorIds } } });
  return vendorIds.map(id => vendors.find(v => v.id === id));
});

// In resolvers:
function Product_vendor(product) {
  return vendorLoader.load(product.vendorId);
}
```

DataLoader batches all `vendor` loads in one tick → one query.

### Limit columns

Don't `SELECT *`:

```ts
// Bad: fetches every column (including heavy JSON, descriptions)
const products = await db.product.findMany();

// Good: only what you need
const products = await db.product.findMany({
  select: {
    id: true,
    name: true,
    price: true,
    image: true,
    rating: true,
    // Skip descriptions, ingredients JSON, etc.
  },
});
```

For lists, only the display fields. For detail pages, more.

### Pagination

For large result sets:

#### Offset pagination (simple but slow for deep pages)

```sql
SELECT * FROM products ORDER BY created_at DESC LIMIT 24 OFFSET 1000;
```

Database must scan and discard 1000 rows. Slow.

#### Cursor pagination (fast at any depth)

```sql
SELECT * FROM products
WHERE created_at < $cursor_timestamp
ORDER BY created_at DESC
LIMIT 24;
```

Cursor is the value of the sort column from the last item. Database uses index to seek directly.

```ts
async function getProductsPaginated(cursor: Date | null, limit = 24) {
  const products = await db.product.findMany({
    where: cursor ? { createdAt: { lt: cursor } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // fetch one extra to determine hasNextPage
  });
  
  const hasNextPage = products.length > limit;
  const items = products.slice(0, limit);
  const nextCursor = hasNextPage ? items[items.length - 1].createdAt : null;
  
  return { items, nextCursor, hasNextPage };
}
```

For commerce, cursor pagination is better.

### Denormalization

Sometimes joins are too expensive. Denormalize for read performance:

```sql
-- Product table includes pre-computed vendor name and category path
ALTER TABLE products ADD COLUMN vendor_name TEXT;
ALTER TABLE products ADD COLUMN vendor_logo_url TEXT;
ALTER TABLE products ADD COLUMN category_path TEXT;

-- Update via trigger or scheduled job when source changes
```

Now product list query needs no joins.

Trade-off: extra storage, must sync on vendor/category change.

For high-traffic read paths, worth it.

### Materialized views

For complex aggregations (e.g., "best-selling products this week"):

```sql
CREATE MATERIALIZED VIEW best_sellers AS
SELECT product_id, SUM(quantity) as units_sold
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE o.created_at > NOW() - INTERVAL '7 days'
GROUP BY product_id
ORDER BY units_sold DESC;

REFRESH MATERIALIZED VIEW best_sellers; -- run hourly
```

Querying `best_sellers` is now O(1) (just read the view), vs. the original aggregation which scans many orders.

### Connection pooling

Each DB connection has overhead. Pool them:

```ts
// PostgreSQL with pg
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // adjust based on load
  idleTimeoutMillis: 30000,
});

const result = await pool.query('SELECT ...');
```

For serverless: use a connection pooler (PgBouncer, AWS RDS Proxy, Supavisor) — each function invocation can't open its own pool.

## Query caching

### Application-level

Cache query results in Redis / Memcached:

```ts
async function getProductsForCategory(categoryId: string) {
  const cacheKey = `category:${categoryId}:products`;
  
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  const products = await db.product.findMany({ where: { categoryId } });
  
  await redis.set(cacheKey, JSON.stringify(products), 'EX', 300); // 5 min
  
  return products;
}
```

Invalidation:
- TTL-based (5 min): products auto-refresh
- Event-based: invalidate when products change

```ts
// Webhook fires when product updates
await redis.del(`category:${product.categoryId}:products`);
```

### CDN-level

Server can set `Cache-Control` so CDN caches API responses:

```ts
app.get('/api/products', async (req, res) => {
  const products = await getProductsForCategory(req.query.category);
  
  res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.json(products);
});
```

CDN caches for 5 min. Origin sees ~1 request per category per 5 min. Massive scale gain.

### Cache key includes user dimensions

If responses vary per user, include user in cache key (or skip cache):

```ts
const cacheKey = `category:${categoryId}:user:${userId}:products`;
```

Better: split data into public (cacheable) + per-user (not cached).

## API response shape

### Match frontend needs

Don't return giant nested objects when the page needs a flat list.

```json
// Bad: too much detail
{
  "products": [
    {
      "id": "...",
      "name": "...",
      "fullDescription": "...long text...",
      "ingredients": [...],
      "allReviews": [...],
      "vendor": { "fullDetails": {...}, "allProducts": [...] }
    }
  ]
}

// Good: list view shape
{
  "products": [
    {
      "id": "...",
      "name": "...",
      "price_minor": 8900,
      "image": "...",
      "rating": 4.5,
      "vendor_name": "...",
      "vendor_id": "..."
    }
  ],
  "next_cursor": "..."
}
```

Detail page makes a separate request for full data.

### Sparse fieldsets (REST)

Let client specify fields:

```
GET /api/products?fields=id,name,price,image
```

Server returns only those fields. Reduces bandwidth.

### GraphQL pitfalls

GraphQL is flexible but can over-fetch deeply:

```graphql
query {
  category(id: "...") {
    products(limit: 24) {
      id
      name
      vendor {
        name
        products {  # uh oh — N+1 nested
          id
          name
        }
      }
    }
  }
}
```

Mitigations:
- DataLoader (batching)
- Query depth limits
- Query complexity analysis
- Persisted queries (server-allowlisted)
- Per-field rate limits

## Edge functions

Move read-heavy endpoints to the edge:

```ts
// Vercel / Cloudflare Workers / Deno Deploy
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  
  // Fetch from origin (which is closer to edge than user)
  const response = await fetch(`${ORIGIN}/api/products?category=${category}`, {
    cf: { cacheTtl: 300 }, // CDN-level cache
  });
  
  return new Response(response.body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
```

Edge functions:
- Run close to user
- Often have built-in caching
- Lighter runtime (no full Node.js)

Good for:
- Read APIs
- Authentication checks
- A/B test variant selection
- Geolocation routing

Not good for:
- Heavy computation
- Persistent connections (some platforms)
- Database writes (depending on platform)

## Read replicas

For read-heavy workloads, use database read replicas:

```ts
const writeDb = createClient({ url: WRITE_DB_URL });
const readDb = createClient({ url: READ_REPLICA_URL });

// Writes go to primary
await writeDb.product.update(...);

// Reads from replica
const products = await readDb.product.findMany(...);
```

Replication lag: writes may take 100ms-2s to appear on replicas. For commerce reads, usually fine. For "user just updated cart, show updated cart" — use primary.

## Background jobs

Don't do slow work in request handlers:

```ts
// Bad: vendor uploads product, response waits for image processing
app.post('/api/products', async (req, res) => {
  const product = await createProduct(req.body);
  await processImages(product); // 10-30 seconds
  res.json(product);
});

// Good: queue the work, respond immediately
app.post('/api/products', async (req, res) => {
  const product = await createProduct(req.body);
  await jobQueue.enqueue('processImages', { productId: product.id });
  res.json(product);
});
```

Job queues:
- **BullMQ** (Node, Redis)
- **Sidekiq** (Ruby)
- **Celery** (Python)
- **AWS SQS / EventBridge**
- **GCP Pub/Sub**

Workers process jobs asynchronously. Users get fast responses.

## Streaming responses

For large responses, stream:

```ts
app.get('/api/export', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  res.write('id,name,price\n');
  
  const stream = db.product.findStream();
  stream.on('data', (product) => {
    res.write(`${product.id},${product.name},${product.price}\n`);
  });
  stream.on('end', () => res.end());
});
```

User sees data immediately, not after entire response is built.

For HTML, Suspense + streaming (React 18, Next.js App Router):

```jsx
export default function Page() {
  return (
    <>
      <Header /> {/* renders immediately */}
      <Suspense fallback={<ProductsSkeleton />}>
        <ProductsList /> {/* streams when ready */}
      </Suspense>
      <Suspense fallback={<ReviewsSkeleton />}>
        <ReviewsList /> {/* streams later */}
      </Suspense>
    </>
  );
}
```

HTML streams as data becomes available. User sees fast initial paint, content arrives progressively.

## Compression

Compress responses (most servers do automatically):

```ts
// Express + compression
import compression from 'compression';
app.use(compression({ threshold: 1024 }));
```

Brotli > gzip for static, but most servers do gzip for dynamic responses (Brotli has more CPU cost).

## Avoid blocking I/O

```ts
// Bad: synchronous file read in handler
import fs from 'fs';
app.get('/data', (req, res) => {
  const data = fs.readFileSync('large.json');
  res.json(JSON.parse(data));
});

// Good: async
app.get('/data', async (req, res) => {
  const data = await fs.promises.readFile('large.json');
  res.json(JSON.parse(data));
});
```

Synchronous I/O blocks the event loop. Async lets the server handle other requests during the wait.

## Rate limiting

Protect APIs from overload:

```ts
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many requests',
});

app.use('/api/', limiter);
```

For finer control:
- Per-user rate limits (vs per-IP)
- Different limits per endpoint
- Sliding windows

Tools: `express-rate-limit`, `next-rate-limit`, Cloudflare Rate Limiting, Upstash Ratelimit.

## Connection limits per service

External services have rate limits too. Respect them:

```ts
// Use a queue / semaphore to limit concurrent calls
import pLimit from 'p-limit';

const limit = pLimit(5); // max 5 concurrent
const promises = items.map(item => limit(() => fetchExternalApi(item)));
await Promise.all(promises);
```

Bursty traffic to a partner API can get you blocked. Throttle.

## Circuit breaker

If a downstream service is failing, stop trying:

```ts
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(fetchPaymentService, {
  errorThresholdPercentage: 50,
  timeout: 3000,
  resetTimeout: 30000,
});

breaker.fallback(() => ({ status: 'pending' }));

const result = await breaker.fire(paymentData);
```

When service is failing > 50% requests, breaker "opens" → all calls return fallback immediately. After 30s, tries again.

Prevents cascading failures.

## Timeouts

Every external call needs a timeout:

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 3000);

try {
  const response = await fetch(url, { signal: controller.signal });
  return response.json();
} catch (err) {
  if (err.name === 'AbortError') {
    // Timeout
  }
} finally {
  clearTimeout(timeout);
}
```

Without timeouts, a slow downstream service can hang requests indefinitely → all your threads blocked → your service goes down.

## Monitoring

Track per-endpoint:
- p50, p95, p99 latency
- Error rate
- Request volume
- Cache hit ratio (if applicable)
- Database query count
- Memory / CPU usage

Tools: Datadog, New Relic, Grafana, Sentry, AWS CloudWatch.

Set alerts:
- p95 > 1s
- Error rate > 1%
- Cache hit ratio < 80%

## Slow query log

Database keeps a slow query log:

```sql
-- PostgreSQL
SET log_min_duration_statement = 100; -- log queries >100ms
```

Review weekly. Optimize top offenders.

## API design for performance

### Bulk endpoints

Instead of:
```
GET /api/products/123
GET /api/products/456
GET /api/products/789
```

Provide:
```
GET /api/products?ids=123,456,789
```

One request, one response. Massive saving on round-trips.

### Field expansion

```
GET /api/products/123              ← basic
GET /api/products/123?expand=vendor,reviews  ← detail
```

Same endpoint, customizable depth. Avoid making clients chain requests.

### Conditional requests

```
GET /api/products/123
Headers: If-None-Match: "abc123"

Response: 304 Not Modified (empty body)
```

Server returns 304 if content hasn't changed. Client uses cached version.

```ts
app.get('/api/products/:id', async (req, res) => {
  const product = await getProduct(req.params.id);
  const etag = generateEtag(product);
  
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  
  res.setHeader('ETag', etag);
  res.json(product);
});
```

## Pre-rendering

For static-ish content, generate at build time:

```ts
// Next.js
export async function generateStaticParams() {
  const products = await db.product.findMany({ where: { featured: true } });
  return products.map(p => ({ slug: p.slug }));
}
```

Featured products pre-rendered at build. Zero runtime cost.

For dynamic + static, ISR (Incremental Static Regeneration) gives both.

## Database connection in serverless

Serverless functions can spawn many concurrent instances. Each opening its own DB connection = exhausting connection pool.

Solutions:
- Use a connection pooler (PgBouncer, RDS Proxy, Supavisor)
- Use database with HTTP API (Vercel Postgres, Neon, PlanetScale, Turso)
- Pool connections at the function level (not always possible)

## Anti-patterns

- ❌ `SELECT *` on tables with many columns
- ❌ N+1 queries (most common DB performance bug)
- ❌ No indexes on filter/sort columns
- ❌ Joins on un-indexed foreign keys
- ❌ Offset pagination on deep pages
- ❌ Blocking I/O in async handlers
- ❌ No timeouts on external calls
- ❌ Same DB for reads and writes (use replicas)
- ❌ Caching personalized data without user-scoped keys
- ❌ Caching forever without invalidation
- ❌ No cache at all (origin overloaded)
- ❌ Synchronous email sending in request handler
- ❌ Synchronous image processing in upload handler
- ❌ No connection pooling (or pool too small/large)
- ❌ One giant API endpoint that does everything (split for cacheability)
- ❌ GraphQL without query depth limits or persisted queries
- ❌ Tightly coupled services (one slow → all slow; use circuit breakers)
- ❌ No monitoring (can't fix what you don't measure)
- ❌ No slow query log review
- ❌ Database in different region than application servers (network latency)
- ❌ Trusting third-party APIs to be fast and reliable (they're not)
