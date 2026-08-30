/**
 * STORE-PR2 — CustomerEntryService composition.
 * Pure unit test; fake MarketplaceService + fake ConfigService (no DB). Proves
 * eligibility-correct reuse, minimal DTO mapping, bounded/deterministic output,
 * optional-section resilience, and the feature flag.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { CustomerEntryService } = await import(
  '../dist/modules/marketplace/customer-entry/customer-entry.service.js'
);

const customerCtx = {
  surface: 'customer_app',
  segment: 'DilMart_APP_CUSTOMER',
  sourceApp: 'customer_app',
  isTrusted: true,
  requiresVerifiedSalonCheck: true,
};

function makeMarketplace(overrides = {}) {
  const calls = { listProducts: [], getBrands: [], getCategories: [] };
  const base = {
    getCategories: async (ctx) => (calls.getCategories.push(ctx), [
      { id: 'c1', slug: 'fragrance', name: 'العطور', parent_id: null, has_public_products: true, image_url: 'https://img/f.jpg', stock: 9, visibility_status: 'public' },
      { id: 'c2', slug: 'child', name: 'child', parent_id: 'c1', has_public_products: true }, // excluded: not root
      { id: 'c3', slug: 'empty', name: 'empty', parent_id: null, has_public_products: false }, // excluded: no public products
    ]),
    listProducts: async (params) => {
      calls.listProducts.push(params);
      return {
        items: [
          { id: 'p1', slug: 'argan-oil', name: 'Argan Oil', price: 25000, discount_price: 20000, images: ['https://img/p1.jpg'], merchant_id: 'm1', visibility_status: 'public', stock: 3 },
          { id: 'p2', slug: 'bad slug', name: 'Bad', price: 1000, images: [] }, // dropped: invalid slug
          { id: 'p3', slug: 'no-price', name: 'NoPrice', price: null, images: [] }, // dropped: no price
          { id: 'p4', slug: 'no-discount', name: 'Full', price: 5000, discount_price: 6000, images: [] }, // discount >= price -> null
        ],
        total: 4, offset: 0, limit: params.limit,
      };
    },
    getBrands: async (ctx) => {
      calls.getBrands.push(ctx);
      return { brands: [{ name: 'Bioderma', count: 4, imageUrl: 'https://img/b1.jpg' }, { name: 'CeraVe', count: 2, imageUrl: null }] };
    },
  };
  return { svc: { ...base, ...overrides }, calls };
}

const enabledConfig = { get: (k) => (k === 'STORE_CUSTOMER_APP_SURFACE_ENABLED' ? 'true' : undefined) };

test('feature flag: isEnabled reflects STORE_CUSTOMER_APP_SURFACE_ENABLED', () => {
  const { svc } = makeMarketplace();
  assert.equal(new CustomerEntryService(enabledConfig, svc).isEnabled(), true);
  assert.equal(new CustomerEntryService({ get: () => undefined }, svc).isEnabled(), false);
  assert.equal(new CustomerEntryService({ get: () => 'false' }, svc).isEnabled(), false);
});

test('passes the trusted customer_app ViewerContext through to listProducts and getBrands', async () => {
  const { svc, calls } = makeMarketplace();
  await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  // featured + offers => two listProducts calls, both with the customer_app ctx.
  assert.equal(calls.listProducts.length, 2);
  for (const p of calls.listProducts) assert.equal(p.viewerContext.surface, 'customer_app');
  assert.ok(calls.listProducts.some((p) => p.filter === 'featured'), 'featured uses filter=featured (is_best_seller)');
  assert.ok(calls.listProducts.some((p) => p.filter === 'offers'), 'offers uses filter=offers');
  assert.equal(calls.getBrands[0].surface, 'customer_app');
  // Categories are fetched WITH the trusted customer_app context (context-aware occupancy).
  assert.equal(calls.getCategories.length, 1);
  assert.equal(calls.getCategories[0].surface, 'customer_app');
  assert.equal(calls.getCategories[0].isTrusted, true);
});

test('composes a minimal, DTO-only response (no raw DB fields leak)', async () => {
  const { svc } = makeMarketplace();
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);

  assert.equal(r.version, 1);
  assert.deepEqual(Object.keys(r).sort(), ['brands', 'categories', 'featuredProducts', 'hero', 'offers', 'updatedAt', 'version']);
  assert.ok(!Number.isNaN(Date.parse(r.updatedAt)));
  assert.equal(r.hero.target, '/');

  // Categories: only root + has_public_products.
  assert.equal(r.categories.length, 1);
  assert.deepEqual(Object.keys(r.categories[0]).sort(), ['id', 'imageUrl', 'name', 'slug', 'target']);
  assert.equal(r.categories[0].target, '/category/fragrance');

  // Products: invalid-slug and no-price rows dropped; DTO keys only.
  const p1 = r.featuredProducts.find((p) => p.id === 'p1');
  assert.ok(p1, 'valid product present');
  assert.deepEqual(Object.keys(p1).sort(), ['currency', 'discountPrice', 'id', 'imageUrl', 'name', 'price', 'slug', 'target']);
  assert.equal(p1.currency, 'IQD');
  assert.equal(p1.price, 25000);
  assert.equal(p1.discountPrice, 20000);
  assert.equal(p1.target, '/product/argan-oil');
  assert.equal(p1.imageUrl, 'https://img/p1.jpg');
  assert.ok(!r.featuredProducts.some((p) => p.slug === 'bad slug'), 'invalid slug dropped');
  assert.ok(!r.featuredProducts.some((p) => p.id === 'p3'), 'no-price dropped');
  // discount >= price => null.
  const p4 = r.featuredProducts.find((p) => p.id === 'p4');
  assert.equal(p4.discountPrice, null);
  // No leaked columns.
  for (const p of r.featuredProducts) {
    assert.equal(p.merchant_id, undefined);
    assert.equal(p.visibility_status, undefined);
    assert.equal(p.stock, undefined);
  }
  for (const c of r.categories) {
    assert.equal(c.stock, undefined);
    assert.equal(c.visibility_status, undefined);
    assert.equal(c.parent_id, undefined);
  }

  // Every target is an internal discovery-safe path.
  for (const item of [...r.categories, ...r.featuredProducts, ...r.offers]) {
    assert.match(item.target, /^\/(products|offers|stores|category\/|product\/|store\/|$)/);
  }
  // Brands: {name, productCount, imageUrl, target} only.
  assert.deepEqual(Object.keys(r.brands[0]).sort(), ['imageUrl', 'name', 'productCount', 'target']);
  assert.equal(r.brands[0].productCount, 4);
});

test('empty sources produce valid empty arrays', async () => {
  const empty = {
    getCategories: async () => [],
    listProducts: async () => ({ items: [], total: 0, offset: 0, limit: 8 }),
    getBrands: async () => ({ brands: [] }),
  };
  const r = await new CustomerEntryService(enabledConfig, empty).build(customerCtx);
  assert.deepEqual(r.categories, []);
  assert.deepEqual(r.featuredProducts, []);
  assert.deepEqual(r.offers, []);
  assert.deepEqual(r.brands, []);
});

test('an optional section failure does not fail the whole response or leak errors', async () => {
  const { svc } = makeMarketplace({
    getBrands: async () => { throw new Error('brands boom with secret 12345'); },
  });
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  assert.deepEqual(r.brands, []); // failed section => empty
  assert.ok(r.featuredProducts.length >= 1, 'other sections still populated');
  assert.equal(r.version, 1);
});

test('bounded result limits (deterministic caps)', async () => {
  const many = {
    getCategories: async () => Array.from({ length: 50 }, (_, i) => ({ id: 'c' + i, slug: 'cat-' + i, name: 'n' + i, parent_id: null, has_public_products: true })),
    listProducts: async (p) => ({ items: Array.from({ length: 50 }, (_, i) => ({ id: 'p' + i, slug: 'prod-' + i, name: 'n' + i, price: 100 + i, images: [] })), total: 50, offset: 0, limit: p.limit }),
    getBrands: async () => ({ brands: Array.from({ length: 50 }, (_, i) => ({ name: 'b' + i, count: 1 })) }),
  };
  const captured = [];
  const wrapped = { ...many, listProducts: async (p) => { captured.push(p.limit); return many.listProducts(p); } };
  const r = await new CustomerEntryService(enabledConfig, wrapped).build(customerCtx);
  assert.equal(r.categories.length, 12);
  assert.ok(r.brands.length <= 20);
  for (const lim of captured) assert.ok(lim <= 8, 'product limit bounded');
});

// ── hero image (presentation-only derivation) ────────────────────────────────────────────────────
// The Store has no editorial hero asset. Rather than shipping a blank banner, the hero reuses an image
// ALREADY present in this payload (featured → offers → categories). No new query, no new field, no new
// visibility rule — every candidate already passed its own section's eligibility checks.

test('hero.imageUrl reuses a featured-product image when one exists', async () => {
  const { svc } = makeMarketplace();
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  assert.equal(r.hero.imageUrl, 'https://img/p1.jpg');
  assert.equal(r.hero.target, '/', 'hero target is unchanged');
});

test('hero.imageUrl falls back to a category image when no product has one', async () => {
  const { svc } = makeMarketplace({
    listProducts: async (params) => ({
      items: [{ id: 'p9', slug: 'no-image', name: 'NoImage', price: 1000, images: [] }],
      total: 1, offset: 0, limit: params.limit,
    }),
  });
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  assert.equal(r.hero.imageUrl, 'https://img/f.jpg', 'category image used');
});

test('hero.imageUrl stays null when the whole payload carries no image', async () => {
  const { svc } = makeMarketplace({
    getCategories: async () => [{ id: 'c1', slug: 'fragrance', name: 'العطور', parent_id: null, has_public_products: true, image_url: null }],
    listProducts: async (params) => ({
      items: [{ id: 'p9', slug: 'no-image', name: 'NoImage', price: 1000, images: [] }],
      total: 1, offset: 0, limit: params.limit,
    }),
  });
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  assert.equal(r.hero.imageUrl, null);
});

// ── brand imagery ───────────────────────────────────────────────────────────────────────────────
// The Store has no brand LOGO source (a brand is only the free-text products.brand column), so a brand
// carries a representative image of one of its OWN eligible products, or null. Clients fall back to a
// non-image treatment when it is null.

test('brands expose the Store-supplied representative image, or null', async () => {
  const { svc } = makeMarketplace();
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  const bioderma = r.brands.find((b) => b.name === 'Bioderma');
  const cerave = r.brands.find((b) => b.name === 'CeraVe');
  assert.equal(bioderma.imageUrl, 'https://img/b1.jpg');
  assert.equal(cerave.imageUrl, null, 'no image -> null (never a fabricated logo URL)');
});

test('a blank / non-string brand image is normalised to null', async () => {
  const { svc } = makeMarketplace({
    getBrands: async () => ({ brands: [{ name: 'Blank', count: 1, imageUrl: '   ' }, { name: 'Weird', count: 1, imageUrl: 42 }] }),
  });
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  for (const b of r.brands) assert.equal(b.imageUrl, null, b.name);
});

// ── discovery targets ───────────────────────────────────────────────────────────────────────────
// Hero opens the FULL Store home; brands carry a Store-authored, validated brand-filter target.
// The Customer App never constructs a target itself.

test('hero.target is the Store home', async () => {
  const { svc } = makeMarketplace();
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  assert.equal(r.hero.target, '/');
});

test('brands carry a canonical /products?brand= target', async () => {
  const { svc } = makeMarketplace({
    getBrands: async () => ({ brands: [{ name: 'Big Roc', count: 2, imageUrl: null }, { name: 'عطور', count: 1, imageUrl: null }] }),
  });
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  assert.equal(r.brands.find((b) => b.name === 'Big Roc').target, '/products?brand=Big%20Roc');
  assert.equal(r.brands.find((b) => b.name === 'عطور').target, '/products?brand=%D8%B9%D8%B7%D9%88%D8%B1');
});

test('a brand that cannot produce a safe target is DROPPED, never shipped unchecked', async () => {
  const { svc } = makeMarketplace({
    getBrands: async () => ({
      brands: [
        { name: 'Good', count: 1, imageUrl: null },
        { name: '<script>', count: 9, imageUrl: null },
        { name: '   ', count: 3, imageUrl: null },
        { name: 'x'.repeat(200), count: 4, imageUrl: null },
      ],
    }),
  });
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  assert.deepEqual(r.brands.map((b) => b.name), ['Good']);
  for (const b of r.brands) assert.match(b.target, /^\/products\?brand=/);
});

test('every emitted target stays inside the discovery allowlist', async () => {
  const { svc } = makeMarketplace();
  const r = await new CustomerEntryService(enabledConfig, svc).build(customerCtx);
  const targets = [r.hero.target, ...r.categories.map((c) => c.target), ...r.brands.map((b) => b.target),
    ...r.featuredProducts.map((p) => p.target), ...r.offers.map((p) => p.target)];
  for (const t of targets) {
    assert.match(t, /^\/(products(\?brand=[^&]+)?|offers|stores|category\/[^?]+|product\/[^?]+|store\/[^?]+)?$/, `unexpected target ${t}`);
    assert.ok(!t.includes('..') && !t.startsWith('//'), `unsafe target ${t}`);
  }
});
