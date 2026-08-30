/**
 * STORE-PR2 — customer-entry DB eligibility (Database Integration Suite).
 *
 * Drives the REAL CustomerEntryService over the REAL MarketplaceService against the
 * live local Postgres and proves, for a trusted Customer context:
 *   - categories: customer-occupied appear; barber-only / private / draft do not;
 *   - hierarchy: a root inherits an eligible descendant's occupancy (customer root
 *     with an eligible child appears; barber root with a barber-only child does not);
 *   - featured: featuredProducts use is_best_seller=true AND ViewerContext eligibility
 *     (customer best-seller included; newest non-best-seller, barber best-seller and
 *     private best-seller excluded).
 * Skips gracefully when no service-role DB is available. try/finally cleanup.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import { getTestClient } from './db-client-helper.mjs';

const { MarketplaceService } = await import('../../dist/modules/marketplace/marketplace.service.js');
const { CustomerEntryService } = await import('../../dist/modules/marketplace/customer-entry/customer-entry.service.js');

const fakeWhatsApp = { getComplianceMultiplierMap: async () => new Map() };
const enabledConfig = { get: (k) => (k === 'STORE_CUSTOMER_APP_SURFACE_ENABLED' ? 'true' : undefined) };
const CUSTOMER_CTX = {
  surface: 'customer_app',
  segment: 'customer',
  sourceApp: 'customer_app',
  isTrusted: true,
};

test('customer-entry categories + featured respect ViewerContext eligibility (DB integration)', async (t) => {
  let supabase;
  try {
    supabase = getTestClient();
  } catch {
    t.skip('no service-role DB available (set SUPABASE_SERVICE_ROLE_KEY / supabase_status.json)');
    return;
  }

  const merchantId = crypto.randomUUID();
  const categoryIds = [];

  const mkMerchant = async () => {
    const { error } = await supabase.from('merchants').insert({
      id: merchantId,
      slug: `ce-${crypto.randomBytes(6).toString('hex')}`,
      name_ar: 'تاجر فحص مدخل الزبون',
      name_en: 'CE Test Merchant',
      display_name: 'CE Test Merchant',
      status: 'active',
    });
    if (error) throw error;
  };
  const mkCategory = async (parent = null) => {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('categories').insert({
      id,
      name: `CE-${crypto.randomBytes(4).toString('hex')}`,
      slug: `ce-cat-${crypto.randomBytes(5).toString('hex')}`,
      is_active: true,
      parent_id: parent,
    });
    if (error) throw error;
    categoryIds.push(id);
    return id;
  };
  const mkProduct = async (categoryId, cols = {}) => {
    const id = crypto.randomUUID();
    const slug = `ce-${crypto.randomBytes(6).toString('hex')}`;
    const { error } = await supabase.from('products').insert({
      id,
      merchant_id: merchantId,
      category_id: categoryId,
      name: 'CE product',
      slug,
      price: 25000,
      merchant_sku: `CE-${crypto.randomBytes(4).toString('hex')}`,
      is_active: true,
      is_published: true,
      visibility_status: 'public',
      visible_in: ['customer_app'],
      business_type_tags: ['all'],
      target_audience: ['all'],
      requires_verified_salon: false,
      is_best_seller: false,
      ...cols,
    });
    if (error) throw error;
    return slug;
  };

  try {
    await mkMerchant();

    // ── Category cases (each a distinct root) ──────────────────────────────
    const customerCat = await mkCategory();
    await mkProduct(customerCat, { visible_in: ['customer_app'] });
    const customerCatSlug = (await supabase.from('categories').select('slug').eq('id', customerCat).single()).data.slug;

    const barberCat = await mkCategory();
    await mkProduct(barberCat, { visible_in: ['barber_app'] });
    const barberCatSlug = (await supabase.from('categories').select('slug').eq('id', barberCat).single()).data.slug;

    const privateCat = await mkCategory();
    await mkProduct(privateCat, { visibility_status: 'private' });
    const privateCatSlug = (await supabase.from('categories').select('slug').eq('id', privateCat).single()).data.slug;

    const draftCat = await mkCategory();
    await mkProduct(draftCat, { is_published: false });
    const draftCatSlug = (await supabase.from('categories').select('slug').eq('id', draftCat).single()).data.slug;

    // ── Hierarchy: customer root (no direct product) with eligible child ─────
    const custRoot = await mkCategory();
    const custChild = await mkCategory(custRoot);
    await mkProduct(custChild, { visible_in: ['customer_app'] });
    const custRootSlug = (await supabase.from('categories').select('slug').eq('id', custRoot).single()).data.slug;

    // ── Hierarchy: barber root with barber-only child ──────────────────────
    const barbRoot = await mkCategory();
    const barbChild = await mkCategory(barbRoot);
    await mkProduct(barbChild, { visible_in: ['barber_app'] });
    const barbRootSlug = (await supabase.from('categories').select('slug').eq('id', barbRoot).single()).data.slug;

    // ── Featured / best-seller cases (in the customer category) ─────────────
    // Insert the best-seller FIRST and the non-best-seller SECOND so the
    // non-best-seller has a strictly newer created_at: if featured used "newest"
    // it would appear; because featured uses is_best_seller it must not.
    const eligibleBestSeller = await mkProduct(customerCat, { visible_in: ['customer_app'], is_best_seller: true });
    const newestNotBestSeller = await mkProduct(customerCat, { visible_in: ['customer_app'], is_best_seller: false });
    const barberBestSeller = await mkProduct(customerCat, { visible_in: ['barber_app'], is_best_seller: true });
    const privateBestSeller = await mkProduct(customerCat, { visibility_status: 'private', is_best_seller: true });

    const marketplace = new MarketplaceService({ client: supabase }, fakeWhatsApp);
    const service = new CustomerEntryService(enabledConfig, marketplace);
    const res = await service.build(CUSTOMER_CTX);

    const catSlugs = new Set(res.categories.map((c) => c.slug));
    // Category eligibility.
    assert.ok(catSlugs.has(customerCatSlug), 'customer-occupied category appears');
    assert.ok(!catSlugs.has(barberCatSlug), 'barber-only category excluded');
    assert.ok(!catSlugs.has(privateCatSlug), 'private-only category excluded');
    assert.ok(!catSlugs.has(draftCatSlug), 'draft-only category excluded');
    // Hierarchy occupancy.
    assert.ok(catSlugs.has(custRootSlug), 'customer root inherits eligible descendant occupancy');
    assert.ok(!catSlugs.has(barbRootSlug), 'barber root (barber-only child) excluded for customer');
    // Category targets internal.
    for (const c of res.categories) assert.match(c.target, /^\/category\/[a-z0-9؀-ۿ-]+$/);

    const featSlugs = new Set(res.featuredProducts.map((p) => p.slug));
    // Featured = is_best_seller AND customer-eligible.
    assert.ok(featSlugs.has(eligibleBestSeller), 'customer best-seller is featured');
    assert.ok(!featSlugs.has(newestNotBestSeller), 'newer non-best-seller is NOT featured');
    assert.ok(!featSlugs.has(barberBestSeller), 'barber-only best-seller excluded');
    assert.ok(!featSlugs.has(privateBestSeller), 'private best-seller excluded');
  } finally {
    await supabase.from('products').delete().eq('merchant_id', merchantId);
    if (categoryIds.length) {
      // Delete child categories before roots (self-referencing parent_id FK).
      await supabase.from('categories').delete().in('id', categoryIds).not('parent_id', 'is', null);
      await supabase.from('categories').delete().in('id', categoryIds);
    }
    await supabase.from('merchants').delete().eq('id', merchantId);
  }
});
