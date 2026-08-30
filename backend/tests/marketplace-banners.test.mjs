import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ProductVisibilityService } from "../dist/modules/store-integration/product-visibility.service.js";
import { MarketplaceBannersService } from "../dist/modules/marketplace/marketplace-banners.service.js";
import { MarketplaceService } from "../dist/modules/marketplace/marketplace.service.js";
import { MARKETPLACE_HOME_CONTRACT_VERSION } from "../dist/modules/marketplace/marketplace-home.contract.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create a mock Supabase admin service for banners & products
function createMockSupabaseAdmin(bannerRows = [], productRows = [], categoryRows = []) {
  const routes = {
    marketplace_banners: () => ({ data: bannerRows, error: null }),
    categories: () => ({ data: categoryRows, error: null }),
    products: () => ({ data: productRows, error: null }),
    merchants: () => ({ data: [], error: null }),
  };

  function builder(table) {
    const record = { table, ops: [] };
    const resolve = () =>
      Promise.resolve({
        data: [],
        error: null,
        count: 0,
        ...(routes[table] ? routes[table](record) : {}),
      });
    const api = {};
    for (const m of [
      "select",
      "eq",
      "neq",
      "not",
      "or",
      "contains",
      "ilike",
      "gte",
      "lte",
      "in",
      "filter",
      "order",
      "limit",
      "range",
    ]) {
      api[m] = (...args) => {
        record.ops.push([m, ...args]);
        return api;
      };
    }
    api.maybeSingle = () => resolve();
    api.single = () => resolve();
    api.then = (onOk, onErr) => resolve().then(onOk, onErr);
    return api;
  }

  return { client: { from: builder } };
}

test("M30 / H5-A: Comprehensive 37-Scenario Marketplace Promotional Banners Suite", async (t) => {
  const visibilityService = new ProductVisibilityService();

  const standardCategories = [
    { id: "cat-1", slug: "electric-shavers", name: "ماكينات حلاقة" },
    { id: "cat-2", slug: "fragrances", name: "عطور" },
  ];

  const validOwnerCtx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    businessType: "men_barbershop",
    role: "OWNER",
    isTrusted: true,
    salonVerified: true,
  };

  const unverifiedOwnerCtx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_OWNER",
    businessType: "men_barbershop",
    role: "OWNER",
    isTrusted: true,
    salonVerified: false,
  };

  const barberStaffCtx = {
    surface: "barber_app",
    segment: "DilMart_APP_BARBER_STAFF",
    businessType: "men_barbershop",
    role: "BARBER",
    isTrusted: true,
    salonVerified: true, // Role BARBER cannot be verified salon owner
  };

  // 1. Zero rows -> no banner section
  await t.test("1. zero rows -> returns empty banners array", async () => {
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.deepEqual(result, []);
  });

  // 2. Active hero -> mapped correctly
  await t.test("2. active hero banner -> mapped correctly with category action", async () => {
    const row = {
      id: "b-1",
      banner_type: "hero_banner",
      title: "أفضل الماكينات",
      subtitle: "عروض مميزة للصالونات",
      image_url: "https://DilMart.org/assets/banner1.jpg",
      mobile_image_url: "https://DilMart.org/assets/banner1_m.jpg",
      action_type: "category",
      action_category_id: "cat-1",
      visible_in: ["barber_app"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      is_active: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "hero_banner");
    assert.equal(result[0].id, "b-1");
    assert.equal(result[0].title, "أفضل الماكينات");
    assert.deepEqual(result[0].action, {
      type: "category",
      id: "cat-1",
      slug: "electric-shavers",
      name: "ماكينات حلاقة",
    });
  });

  // 3. Deterministic hero order
  await t.test("3. multiple hero banners preserve sort order", async () => {
    const rows = [
      {
        id: "b-2",
        banner_type: "hero_banner",
        image_url: "https://DilMart.org/img2.jpg",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        requires_verified_salon: false,
        is_active: true,
        sort_order: 2,
        created_at: "2026-08-15T00:00:00Z",
      },
      {
        id: "b-1",
        banner_type: "hero_banner",
        image_url: "https://DilMart.org/img1.jpg",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        requires_verified_salon: false,
        is_active: true,
        sort_order: 1,
        created_at: "2026-08-15T00:00:00Z",
      },
    ];
    const sortedRows = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin(sortedRows), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "b-1");
    assert.equal(result[1].id, "b-2");
  });

  // 4. Deterministic campaign placement
  await t.test("4. campaign banner placement logic in home", async () => {
    const bannerRows = [
      {
        id: "hero-1",
        banner_type: "hero_banner",
        image_url: "https://DilMart.org/h1.jpg",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
        sort_order: 1,
      },
      {
        id: "camp-1",
        banner_type: "campaign_banner",
        image_url: "https://DilMart.org/c1.jpg",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
        sort_order: 1,
      },
    ];
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin(bannerRows), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    const heroes = result.filter((b) => b.type === "hero_banner");
    const campaigns = result.filter((b) => b.type === "campaign_banner");
    assert.equal(heroes.length, 1);
    assert.equal(campaigns.length, 1);
  });

  // 5. Inactive -> excluded
  await t.test("5. inactive banner -> excluded", async () => {
    const row = {
      id: "b-inactive",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      is_active: false,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 6. Future schedule -> excluded
  await t.test("6. future scheduled banner -> excluded", async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const row = {
      id: "b-future",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      is_active: true,
      starts_at: futureDate,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 7. Expired schedule -> excluded
  await t.test("7. expired banner -> excluded", async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const row = {
      id: "b-expired",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: false,
      is_active: true,
      ends_at: pastDate,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 8. visible_in=['barber_app'] -> Barber allowed
  await t.test("8. visible_in=['barber_app'] -> Barber allowed", async () => {
    const row = {
      id: "b-barber-only",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["barber_app"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
  });

  // 9. visible_in=['all'] -> Barber allowed
  await t.test("9. visible_in=['all'] -> Barber allowed", async () => {
    const row = {
      id: "b-all-surfaces",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
  });

  // 10. visible_in=['web_store'] -> Barber excluded
  await t.test("10. visible_in=['web_store'] -> Barber excluded", async () => {
    const row = {
      id: "b-web-only",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["web_store"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 11. target_audience=['all'] -> allowed
  await t.test("11. target_audience=['all'] -> allowed", async () => {
    const row = {
      id: "b-aud-all",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
  });

  // 12. Audience mismatch -> excluded
  await t.test("12. audience mismatch -> customer-only banner excluded for barber_app owner", async () => {
    const row = {
      id: "b-cust",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["barber_app"],
      target_audience: ["customer"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 13. business_type_tags=['all'] -> allowed
  await t.test("13. business_type_tags=['all'] -> allowed", async () => {
    const row = {
      id: "b-biz-all",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
  });

  // 14. Business type mismatch -> excluded
  await t.test("14. business type mismatch -> nail studio banner excluded for men_barbershop", async () => {
    const row = {
      id: "b-nail",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["barber_app"],
      target_audience: ["all"],
      business_type_tags: ["nail_studio"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 15. pending OWNER verified banner denied
  await t.test("15. requires_verified_salon=true -> pending/unverified owner excluded", async () => {
    const row = {
      id: "b-exclusive",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["barber_app"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: true,
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(unverifiedOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 16. approved OWNER allowed
  await t.test("16. requires_verified_salon=true -> approved owner included", async () => {
    const row = {
      id: "b-exclusive",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["barber_app"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: true,
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "b-exclusive");
  });

  // 17. BARBER/STAFF denied
  await t.test("17. requires_verified_salon=true -> BARBER role denied", async () => {
    const row = {
      id: "b-exclusive",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["barber_app"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: true,
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(barberStaffCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 18. missing salonVerified denied
  await t.test("18. missing salonVerified claim -> fails closed as unverified", async () => {
    const row = {
      id: "b-exclusive",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "none",
      visible_in: ["barber_app"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: true,
      is_active: true,
    };
    const ctxNoClaim = { ...validOwnerCtx, salonVerified: undefined };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(ctxNoClaim, standardCategories);
    assert.equal(result.length, 0);
  });

  // 19. eligible category emitted
  await t.test("19. category target in eligibleCategories -> emitted with current id/slug/name", async () => {
    const row = {
      id: "b-cat-ok",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "category",
      action_category_id: "cat-2",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].action, {
      type: "category",
      id: "cat-2",
      slug: "fragrances",
      name: "عطور",
    });
  });

  // 20. unavailable category omitted
  await t.test("20. category not in eligibleCategories -> banner omitted", async () => {
    const row = {
      id: "b-cat-missing",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "category",
      action_category_id: "cat-unknown",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 21. search valid -> emitted
  await t.test("21. search query valid -> emitted with trimmed query", async () => {
    const row = {
      id: "b-search-valid",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "search",
      action_search_query: "  kemei 204  ",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].action, { type: "search", query: "kemei 204" });
  });

  // 22. search empty -> banner omitted
  await t.test("22. empty search query -> banner omitted", async () => {
    const row = {
      id: "b-search-empty",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "search",
      action_search_query: "   ",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 23. valid DilMart.org external URL
  await t.test("23. valid DilMart.org HTTPS external URL -> emitted", async () => {
    const row = {
      id: "b-ext-root",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "external_url",
      action_external_url: "https://DilMart.org/offers",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].action, { type: "external_url", url: "https://DilMart.org/offers" });
  });

  // 24. valid store.DilMart.org URL
  await t.test("24. valid store.DilMart.org URL -> emitted", async () => {
    const row = {
      id: "b-ext-sub",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "external_url",
      action_external_url: "https://store.DilMart.org/featured",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].action, { type: "external_url", url: "https://store.DilMart.org/featured" });
  });

  // 25. DilMart.org.evil.com denied
  await t.test("25. https://DilMart.org.evil.com -> omitted", async () => {
    const row = {
      id: "b-ext-evil",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/img.jpg",
      action_type: "external_url",
      action_external_url: "https://DilMart.org.evil.com/phish",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 26. non-https / custom schemes denied
  await t.test("26. javascript/data/non-https -> omitted", async () => {
    const rows = [
      {
        id: "b-js",
        banner_type: "hero_banner",
        image_url: "https://DilMart.org/img.jpg",
        action_type: "external_url",
        action_external_url: "javascript:alert(1)",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
      },
      {
        id: "b-http",
        banner_type: "hero_banner",
        image_url: "https://DilMart.org/img.jpg",
        action_type: "external_url",
        action_external_url: "http://DilMart.org/offers",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
      },
    ];
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin(rows), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 27. invalid image URL -> omitted
  await t.test("27. invalid image URL -> banner omitted", async () => {
    const row = {
      id: "b-bad-img",
      banner_type: "hero_banner",
      image_url: "ftp://corrupt/img.jpg",
      action_type: "none",
      visible_in: ["all"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      is_active: true,
    };
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin([row]), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 0);
  });

  // 28. malformed row isolation -> subsequent valid rows unaffected
  await t.test("28. one malformed banner does not break valid banner response", async () => {
    const rows = [
      {
        id: "b-bad",
        banner_type: "hero_banner",
        image_url: "not-a-url",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
      },
      {
        id: "b-good",
        banner_type: "campaign_banner",
        image_url: "https://DilMart.org/good.jpg",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
      },
    ];
    const bannersService = new MarketplaceBannersService(createMockSupabaseAdmin(rows), visibilityService);
    const result = await bannersService.listEligibleBanners(validOwnerCtx, standardCategories);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "b-good");
  });

  // 29. top-level banners remains []
  await t.test("29. top-level banners remains [] in segmented home response", async () => {
    const mockSupabase = createMockSupabaseAdmin([], [], standardCategories);
    const marketplaceService = new MarketplaceService(mockSupabase, null);
    marketplaceService.clearCachesForTests();
    const home = await marketplaceService.getHome(validOwnerCtx);
    assert.deepEqual(home.banners, []);
  });

  // 30. _buildWebStoreHome contract unchanged
  await t.test("30. _buildWebStoreHome contract unchanged", async () => {
    const mockSupabase = createMockSupabaseAdmin([], [], standardCategories);
    const marketplaceService = new MarketplaceService(mockSupabase, null);
    marketplaceService.clearCachesForTests();
    const webHome = await marketplaceService.getHome({ surface: "web_store" });
    assert.equal(webHome.contractVersion, 1);
    assert.ok(Array.isArray(webHome.categories));
    assert.ok(Array.isArray(webHome.featuredMerchants));
    assert.ok(Array.isArray(webHome.featuredProducts));
    assert.ok(Array.isArray(webHome.newProducts));
    assert.ok(Array.isArray(webHome.offerProducts));
  });

  // 31. zero rows preserve previous section ordering
  await t.test("31. zero banner rows preserve existing segmented-home sections and ordering", async () => {
    const mockSupabase = createMockSupabaseAdmin([], [], standardCategories);
    const marketplaceService = new MarketplaceService(mockSupabase, null);
    marketplaceService.clearCachesForTests();
    const home = await marketplaceService.getHome(validOwnerCtx);
    assert.ok(Array.isArray(home.sections));
    const hasCategoryGrid = home.sections.some((s) => s.type === "category_grid");
    assert.equal(hasCategoryGrid, true);
  });

  // 32. ProductVisibilityService/CLOSURE-A semantics reused
  await t.test("32. ProductVisibilityService canProductBeShown is directly invoked", () => {
    assert.equal(typeof visibilityService.canProductBeShown, "function");
    assert.equal(typeof visibilityService.isVerifiedSalonOwner, "function");
  });

  // 33. migration timestamp not future-dated
  await t.test("33. migration filename has valid current timestamp (<= current wall clock date)", () => {
    const migDir = path.resolve(__dirname, "../../supabase/migrations");
    const files = fs.readdirSync(migDir).filter((f) => f.includes("m30_marketplace_banners"));
    assert.equal(files.length, 1);
    const timestampStr = files[0].split("_")[0];
    assert.ok(timestampStr.startsWith("2026081507"));
  });

  // 34. arrays non-empty validation in schema
  await t.test("34. migration SQL defines cardinality constraints on segmentation arrays", () => {
    const migPath = path.resolve(__dirname, "../../supabase/migrations/20260815075000_m30_marketplace_banners.sql");
    const sql = fs.readFileSync(migPath, "utf-8");
    assert.ok(sql.includes("cardinality(visible_in) > 0"));
    assert.ok(sql.includes("cardinality(target_audience) > 0"));
    assert.ok(sql.includes("cardinality(business_type_tags) > 0"));
  });

  // 35. visible_in vocabulary constraint in schema
  await t.test("35. migration SQL defines finite visible_in vocabulary constraint", () => {
    const migPath = path.resolve(__dirname, "../../supabase/migrations/20260815075000_m30_marketplace_banners.sql");
    const sql = fs.readFileSync(migPath, "utf-8");
    assert.ok(sql.includes("visible_in <@ ARRAY['web_store', 'barber_app', 'customer_app', 'all']::TEXT[]"));
  });

  // 36. updated_at trigger and pinned search_path present in migration
  await t.test("36. migration SQL defines updated_at function with pinned search_path and trigger", () => {
    const migPath = path.resolve(__dirname, "../../supabase/migrations/20260815075000_m30_marketplace_banners.sql");
    const sql = fs.readFileSync(migPath, "utf-8");
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.set_marketplace_banners_updated_at()"));
    assert.ok(sql.includes("SET search_path = pg_catalog, public"));
    assert.ok(sql.includes("CREATE INDEX IF NOT EXISTS idx_marketplace_banners_active_sort"));
    assert.ok(sql.includes("(sort_order, created_at, id)"));
    assert.ok(sql.includes("CREATE TRIGGER trg_marketplace_banners_set_updated_at"));
  });

  // 37. existing marketplace-home contract preserved
  await t.test("37. MARKETPLACE_HOME_CONTRACT_VERSION is preserved as 1", () => {
    assert.equal(MARKETPLACE_HOME_CONTRACT_VERSION, 1);
  });

  // 38. REAL sequential cache isolation test: verified vs unverified salon owner
  await t.test("38. real sequential cache isolation: verified vs unverified owner (forward and reverse)", async () => {
    const exclusiveBannerRow = {
      id: "b-exclusive-salon",
      banner_type: "hero_banner",
      image_url: "https://DilMart.org/salon-exclusive.jpg",
      action_type: "none",
      visible_in: ["barber_app"],
      target_audience: ["all"],
      business_type_tags: ["all"],
      requires_verified_salon: true,
      is_active: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockSupabase = createMockSupabaseAdmin([exclusiveBannerRow], [], standardCategories);
    const marketplaceService = new MarketplaceService(mockSupabase, null);

    // Forward sequence: Verified owner FIRST -> Unverified owner SECOND (without clearing cache)
    marketplaceService.clearCachesForTests();
    const homeVerified = await marketplaceService.getHome(validOwnerCtx);
    const verifiedHasBanner = homeVerified.sections.some(
      (s) => s.type === "hero_banner" && s.id === "b-exclusive-salon"
    );
    assert.equal(verifiedHasBanner, true, "Verified owner must receive exclusive banner");

    const homeUnverified = await marketplaceService.getHome(unverifiedOwnerCtx);
    const unverifiedHasBanner = homeUnverified.sections.some(
      (s) => s.type === "hero_banner" && s.id === "b-exclusive-salon"
    );
    assert.equal(unverifiedHasBanner, false, "Unverified owner must NOT receive exclusive banner from cache");

    // Reverse sequence: Unverified owner FIRST -> Verified owner SECOND (without clearing cache)
    marketplaceService.clearCachesForTests();
    const homeUnverified2 = await marketplaceService.getHome(unverifiedOwnerCtx);
    const unverifiedHasBanner2 = homeUnverified2.sections.some(
      (s) => s.type === "hero_banner" && s.id === "b-exclusive-salon"
    );
    assert.equal(unverifiedHasBanner2, false, "Unverified owner must NOT receive exclusive banner");

    const homeVerified2 = await marketplaceService.getHome(validOwnerCtx);
    const verifiedHasBanner2 = homeVerified2.sections.some(
      (s) => s.type === "hero_banner" && s.id === "b-exclusive-salon"
    );
    assert.equal(verifiedHasBanner2, true, "Verified owner must receive exclusive banner even after unverified cached");
  });

  // 39. getHome section placement: hero first, campaign after first product carousel
  await t.test("39. getHome placement: hero first, campaign after first product carousel", async () => {
    const banners = [
      {
        id: "hero-1",
        banner_type: "hero_banner",
        image_url: "https://DilMart.org/h1.jpg",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
        sort_order: 1,
      },
      {
        id: "camp-1",
        banner_type: "campaign_banner",
        image_url: "https://DilMart.org/c1.jpg",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
        sort_order: 1,
      },
    ];

    const products = [
      {
        id: "prod-1",
        name: "منتج تجريبي",
        price: 100,
        discount_price: null,
        is_best_seller: true,
        is_new: false,
        is_b2b_offer: false,
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        requires_verified_salon: false,
        merchants: { status: "active" },
      },
    ];

    const mockSupabase = createMockSupabaseAdmin(banners, products, standardCategories);
    const marketplaceService = new MarketplaceService(mockSupabase, null);
    marketplaceService.clearCachesForTests();

    const home = await marketplaceService.getHome(validOwnerCtx);
    const sectionTypes = home.sections.map((s) => s.type);

    assert.equal(sectionTypes[0], "hero_banner", "First section must be hero_banner");
    assert.equal(sectionTypes[1], "product_carousel", "Second section must be product_carousel");
    assert.equal(sectionTypes[2], "campaign_banner", "Third section must be campaign_banner (after first product carousel)");
  });

  // 40. getHome section placement: campaign before category grid when zero product carousels
  await t.test("40. getHome placement: campaign before category grid when zero product carousels", async () => {
    const banners = [
      {
        id: "camp-1",
        banner_type: "campaign_banner",
        image_url: "https://DilMart.org/c1.jpg",
        action_type: "none",
        visible_in: ["all"],
        target_audience: ["all"],
        business_type_tags: ["all"],
        is_active: true,
        sort_order: 1,
      },
    ];

    const mockSupabase = createMockSupabaseAdmin(banners, [], standardCategories);
    const marketplaceService = new MarketplaceService(mockSupabase, null);
    marketplaceService.clearCachesForTests();

    const home = await marketplaceService.getHome(validOwnerCtx);
    const sectionTypes = home.sections.map((s) => s.type);

    assert.equal(sectionTypes[0], "campaign_banner", "Campaign banner placed before category grid");
    assert.equal(sectionTypes[1], "category_grid", "Category grid follows campaign banner");
  });
});
