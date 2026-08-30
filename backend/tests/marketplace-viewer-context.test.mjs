/**
 * DILMART MarketplaceService ViewerContext helper, featured filter,
 * and context-aware category occupancy + cache isolation.
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

const customerCtx = { surface: 'customer_app', segment: 'customer', isTrusted: true };
const businessCtx = { surface: 'customer_app', segment: 'business', isTrusted: true };

test("filter='featured' applies is_best_seller=true (with customer visibility)", async () => {
  const { client, allCalls } = makeSupabase({ products: () => ({ data: [], count: 0 }) });
  const svc = new MarketplaceService({ client }, fakeWhatsApp);
  await svc.listProducts({ offset: 0, limit: 8, filter: 'featured', viewerContext: customerCtx });
  const call = productsCalls(allCalls)[0];
  assert.ok(hasOp(call.ops, 'eq', 'is_best_seller', true), 'featured => is_best_seller=true');
  assert.ok(call.ops.some((o) => o[0] === 'or' && String(o[1]).includes('visible_in.cs.{customer_app}')), 'customer visibility applied');
});

test("filter='new' and 'offers' work as expected", async () => {
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
  const categories = [
    { id: 'cust-cat', slug: 'cust', name: 'cust', parent_id: null, is_active: true },
    { id: 'biz-cat', slug: 'biz', name: 'biz', parent_id: null, is_active: true },
    { id: 'web-cat', slug: 'web', name: 'web', parent_id: null, is_active: true },
  ];
  const routes = {
    categories: () => ({ data: categories }),
    products: (rec) => {
      const orExprs = rec.ops.filter((o) => o[0] === 'or').map((o) => String(o[1])).join('|');
      if (orExprs.includes('customer_app')) return { data: [{ category_id: 'cust-cat' }] };
      if (orExprs.includes('business')) return { data: [{ category_id: 'biz-cat' }] };
      return { data: [{ category_id: 'web-cat' }] };
    },
  };
  const { client } = makeSupabase(routes);
  const svc = new MarketplaceService({ client }, fakeWhatsApp);

  const cust = await svc.getCategories(customerCtx);
  const web = await svc.getCategories(); // no ctx => classic public

  const occupied = (rows, id) => rows.find((c) => c.id === id)?.has_public_products;
  assert.equal(occupied(cust, 'cust-cat'), true);
  assert.equal(occupied(cust, 'web-cat'), false);
  assert.equal(occupied(web, 'web-cat'), true);
  assert.equal(occupied(web, 'cust-cat'), false);
});

test('segmented home uses ViewerContext-aware categories (response.categories === category_grid)', async () => {
  const categories = [
    { id: 'app-cat', slug: 'a', name: 'a', parent_id: null, is_active: true },
    { id: 'web-only-cat', slug: 'w', name: 'w', parent_id: null, is_active: true },
  ];
  const routes = {
    categories: () => ({ data: categories }),
    products: (rec) => {
      const sel = rec.ops.find((o) => o[0] === 'select')?.[1] ?? '';
      if (!String(sel).startsWith('category_id')) return { data: [], count: 0 };
      const orExprs = rec.ops.filter((o) => o[0] === 'or').map((o) => String(o[1])).join('|');
      if (orExprs.includes('visible_in.cs.{customer_app}')) return { data: [{ category_id: 'app-cat' }] };
      return { data: [] };
    },
  };
  const { client } = makeSupabase(routes);
  const svc = new MarketplaceService({ client }, fakeWhatsApp);

  const home = await svc.getHome(customerCtx);

  const gridSection = (home.sections ?? []).find((s) => s.type === 'category_grid');
  assert.ok(gridSection, 'segmented home has a category_grid section');
  assert.deepEqual(home.categories, gridSection.categories);

  const occ = (id) => home.categories.find((c) => c.id === id)?.has_public_products;
  assert.equal(occ('app-cat'), true, 'app-visible category is occupied for the customer_app viewer');
  assert.equal(occ('web-only-cat'), false, 'web-only category is NOT occupied for customer_app');
});
