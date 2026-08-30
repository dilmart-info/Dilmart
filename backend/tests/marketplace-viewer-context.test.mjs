/**
 * STORE-PR2 closure — MarketplaceService ViewerContext helper, featured filter,
 * and context-aware category occupancy + cache isolation. No DB: a fake Supabase
 * records every query op so we can assert the exact filters and route occupancy
 * results by the visibility filter that was applied.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { MarketplaceService } = await import('../dist/modules/marketplace/marketplace.service.js');

/** Fake Supabase: records ops per `.from(table)` call; `routes[table](record)` yields the result. */
function makeSupabase(routes = {}) {
  const allCalls = [];
  function builder(table) {
    const record = { table, ops: [] };
    allCalls.push(record);
    const resolve = () => Promise.resolve({ data: [], error: null, count: 0, ...(routes[table] ? routes[table](record) : {}) });
    const api = {};
    for (const m of ['select', 'eq', 'neq', 'not', 'or', 'contains', 'ilike', 'gte', 'lte', 'in', 'filter', 'order', 'limit', 'range']) {
      api[m] = (...args) => { record.ops.push([m, ...args]); return api; };
    }
    api.maybeSingle = () => resolve();
    api.single = () => resolve();
    api.then = (onOk, onErr) => resolve().then(onOk, onErr);
    return api;
  }
  return { client: { from: builder }, allCalls };
}
const fakeWhatsApp = { getComplianceMultiplierMap: async () => new Map() };
const hasOp = (ops, m, col, val) => ops.some((o) => o[0] === m && o[1] === col && (val === undefined || o[2] === val));
const productsCalls = (calls) => calls.filter((c) => c.table === 'products');

const customerCtx = { surface: 'customer_app', segment: 'DilMart_APP_CUSTOMER', sourceApp: 'customer_app', isTrusted: true, requiresVerifiedSalonCheck: true };
const barberCtx = { surface: 'barber_app', segment: 'DilMart_APP_BARBER_OWNER', sourceApp: 'barber_app', isTrusted: true, requiresVerifiedSalonCheck: true };

test("filter='featured' applies is_best_seller=true (with customer visibility)", async () => {
  const { client, allCalls } = makeSupabase({ products: () => ({ data: [], count: 0 }) });
  const svc = new MarketplaceService({ client }, fakeWhatsApp);
  await svc.listProducts({ offset: 0, limit: 8, filter: 'featured', viewerContext: customerCtx });
  const call = productsCalls(allCalls)[0];
  assert.ok(hasOp(call.ops, 'eq', 'is_best_seller', true), 'featured => is_best_seller=true');
  assert.ok(call.ops.some((o) => o[0] === 'or' && String(o[1]).includes('visible_in.cs.{customer_app}')), 'customer visibility applied');
});

test("filter='new' and 'offers' still work", async () => {
  {
    const { client, allCalls } = makeSupabase({ products: () => ({ data: [], count: 0 }) });
    await new MarketplaceService({ client }, fakeWhatsApp).listProducts({ offset: 0, limit: 8, filter: 'new' });
    assert.ok(hasOp(productsCalls(allCalls)[0].ops, 'eq', 'is_new', true));
  }
  {
    const { client, allCalls } = makeSupabase({ products: () => ({ data: [], count: 0 }) });
    await new MarketplaceService({ client }, fakeWhatsApp).listProducts({ offset: 0, limit: 8, filter: 'offers' });
    const ops = productsCalls(allCalls)[0].ops;
    assert.ok(hasOp(ops, 'not', 'discount_price') && hasOp(ops, 'filter', 'discount_price'), 'offers => discount filter');
  }
});

test('web_store listProducts applies NO segmentation filters (backward compatible)', async () => {
  const { client, allCalls } = makeSupabase({ products: () => ({ data: [], count: 0 }) });
  await new MarketplaceService({ client }, fakeWhatsApp).listProducts({ offset: 0, limit: 8 });
  const ops = productsCalls(allCalls)[0].ops;
  assert.ok(!ops.some((o) => o[0] === 'or' && String(o[1]).includes('visible_in')), 'no visible_in filter for web_store');
});

test('getCategories occupancy is ViewerContext-aware and cache-isolated per surface', async () => {
  // The occupancy products query returns a different category_id depending on the
  // visibility filter that was applied — proving per-context occupancy + that a
  // customer result is never served from a barber/web cache entry.
  const categories = [
    { id: 'cust-cat', slug: 'cust', name: 'cust', parent_id: null, is_active: true },
    { id: 'barb-cat', slug: 'barb', name: 'barb', parent_id: null, is_active: true },
    { id: 'web-cat', slug: 'web', name: 'web', parent_id: null, is_active: true },
  ];
  const routes = {
    categories: () => ({ data: categories }),
    products: (rec) => {
      const orExprs = rec.ops.filter((o) => o[0] === 'or').map((o) => String(o[1])).join('|');
      if (orExprs.includes('customer_app')) return { data: [{ category_id: 'cust-cat' }] };
      if (orExprs.includes('barber_app')) return { data: [{ category_id: 'barb-cat' }] };
      return { data: [{ category_id: 'web-cat' }] };
    },
  };
  const { client } = makeSupabase(routes);
  const svc = new MarketplaceService({ client }, fakeWhatsApp);

  const cust = await svc.getCategories(customerCtx);
  const barb = await svc.getCategories(barberCtx);
  const web = await svc.getCategories(); // no ctx => classic public

  const occupied = (rows, id) => rows.find((c) => c.id === id)?.has_public_products;
  // Customer context: only the customer-occupied category is occupied.
  assert.equal(occupied(cust, 'cust-cat'), true);
  assert.equal(occupied(cust, 'barb-cat'), false);
  assert.equal(occupied(cust, 'web-cat'), false);
  // Barber context: different result (proves no cross-surface cache serving).
  assert.equal(occupied(barb, 'barb-cat'), true);
  assert.equal(occupied(barb, 'cust-cat'), false);
  // Public/no-ctx: classic behavior.
  assert.equal(occupied(web, 'web-cat'), true);
  assert.equal(occupied(web, 'cust-cat'), false);
});

/** Occupancy products query selects "category_id, ..." — distinguishes it from section queries. */
const isOccupancyCall = (c) => {
  const sel = c.ops.find((o) => o[0] === 'select')?.[1] ?? '';
  return c.table === 'products' && String(sel).startsWith('category_id');
};



test('segmented home uses ViewerContext-aware categories (response.categories === category_grid)', async () => {
  const categories = [
    { id: 'barber-cat', slug: 'b', name: 'b', parent_id: null, is_active: true },
    { id: 'cust-only-cat', slug: 'co', name: 'co', parent_id: null, is_active: true },
  ];
  const routes = {
    categories: () => ({ data: categories }),
    products: (rec) => {
      const sel = rec.ops.find((o) => o[0] === 'select')?.[1] ?? '';
      if (!String(sel).startsWith('category_id')) return { data: [], count: 0 }; // section product lists
      const orExprs = rec.ops.filter((o) => o[0] === 'or').map((o) => String(o[1])).join('|');
      // For a barber_app viewer, only the barber category is occupied.
      if (orExprs.includes('visible_in.cs.{barber_app}')) return { data: [{ category_id: 'barber-cat' }] };
      return { data: [] };
    },
  };
  const { client } = makeSupabase(routes);
  const svc = new MarketplaceService({ client }, fakeWhatsApp);

  const home = await svc.getHome(barberCtx);

  const gridSection = (home.sections ?? []).find((s) => s.type === 'category_grid');
  assert.ok(gridSection, 'segmented home has a category_grid section');
  // Same context-aware category result feeds both response.categories and the grid.
  assert.deepEqual(home.categories, gridSection.categories);

  const occ = (id) => home.categories.find((c) => c.id === id)?.has_public_products;
  assert.equal(occ('barber-cat'), true, 'barber-visible category is occupied for the barber viewer');
  assert.equal(occ('cust-only-cat'), false, 'customer-only category is NOT occupied for the barber viewer');
});
