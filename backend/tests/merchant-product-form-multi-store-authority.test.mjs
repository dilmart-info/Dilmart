import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import {
  ValidationPipe,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ProductsController } from "../dist/modules/products/products.controller.js";
import { ProductsService } from "../dist/modules/products/products.service.js";
import { ScopeResolverService } from "../dist/modules/scope-resolver/scope-resolver.service.js";
import { CategoriesService } from "../dist/modules/categories/categories.service.js";
import { RolesGuard } from "../dist/common/authz/roles.guard.js";
import { SupabaseActorResolverService } from "../dist/common/authz/supabase-actor-resolver.service.js";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const STORE_INACTIVE = "44444444-4444-4444-8444-444444444444";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";

const PROD_A_1 = "aaaaaaaa-1111-4111-8111-111111111111";
const PROD_B_1 = "bbbbbbbb-2222-4222-8222-222222222222";

const USER_STORE_A_OWNER = "user-store-a-owner";
const USER_STORE_A_MANAGER = "user-store-a-manager";
const USER_STORE_A_STAFF = "user-store-a-staff";
const USER_STORE_B_OWNER = "user-store-b-owner";
const USER_ADMIN = "user-admin";

function makeHarness() {
  const state = {
    merchants: [
      { id: STORE_A, status: "active", display_name: "متجر بغداد" },
      { id: STORE_B, status: "active", display_name: "متجر البصرة" },
      { id: STORE_INACTIVE, status: "suspended", display_name: "متجر موقوف" },
    ],
    merchant_users: [
      { user_id: USER_STORE_A_OWNER, merchant_id: STORE_A, role: "owner" },
      { user_id: USER_STORE_A_MANAGER, merchant_id: STORE_A, role: "manager" },
      { user_id: USER_STORE_A_STAFF, merchant_id: STORE_A, role: "staff" },
      { user_id: USER_STORE_B_OWNER, merchant_id: STORE_B, role: "owner" },
    ],
    products: [
      {
        id: PROD_A_1,
        merchant_id: STORE_A,
        name: "منتج متجر بغداد 1",
        slug: "baghdad-product-1",
        description: "وصف كامل للمنتج",
        short_description: "وصف مختصر يحتوي على تفاصيل كافية ومطابقة للجاهزية.",
        price: 25000,
        discount_price: null,
        category_id: CATEGORY_ID,
        stock: 10,
        purchase_price: 15000,
        low_stock_threshold: 2,
        is_active: false,
        is_published: false,
        visibility_status: "private",
        is_featured: false,
        is_new: false,
        is_best_seller: false,
        images: ["https://example.com/p1.jpg"],
        loyalty_points_enabled: true,
        merchant_sku: "BAG-001",
      },
      {
        id: PROD_B_1,
        merchant_id: STORE_B,
        name: "منتج متجر البصرة 1",
        slug: "basra-product-1",
        description: "وصف كامل لمنتج البصرة",
        short_description: "وصف مختصر يحتوي على تفاصيل كافية ومطابقة للجاهزية.",
        price: 30000,
        discount_price: null,
        category_id: CATEGORY_ID,
        stock: 5,
        purchase_price: 20000,
        low_stock_threshold: 1,
        is_active: false,
        is_published: false,
        visibility_status: "private",
        is_featured: false,
        is_new: false,
        is_best_seller: false,
        images: ["https://example.com/p2.jpg"],
        loyalty_points_enabled: true,
        merchant_sku: "BAS-001",
      },
    ],
  };

  const supabaseMock = {
    from: (table) => {
      let filters = [];
      let updatePayload = null;
      let insertPayload = null;

      const builder = {
        select: () => builder,
        eq: (col, val) => {
          filters.push({ col, val, op: "eq" });
          return builder;
        },
        neq: (col, val) => {
          filters.push({ col, val, op: "neq" });
          return builder;
        },
        limit: () => builder,
        in: (col, vals) => {
          filters.push({ col, vals, op: "in" });
          return builder;
        },
        insert: (payload) => {
          insertPayload = payload;
          return builder;
        },
        update: (payload) => {
          updatePayload = payload;
          return builder;
        },
        maybeSingle: async () => {
          const list = state[table] ?? [];
          const match = list.find((item) =>
            filters.every((f) => {
              if (f.op === "eq") return item[f.col] === f.val;
              if (f.op === "neq") return item[f.col] !== f.val;
              return true;
            })
          );
          return { data: match || null, error: null };
        },
        single: async () => {
          if (insertPayload) {
            const row = { id: `created-${Date.now()}`, ...insertPayload };
            state[table].push(row);
            return { data: row, error: null };
          }
          const list = state[table] ?? [];
          const match = list.find((item) =>
            filters.every((f) => {
              if (f.op === "eq") return item[f.col] === f.val;
              if (f.op === "neq") return item[f.col] !== f.val;
              return true;
            })
          );
          if (!match) {
            return { data: null, error: { message: "Row not found", code: "PGRST116" } };
          }
          return { data: match, error: null };
        },
        then: (resolve) => {
          if (updatePayload) {
            const list = state[table] ?? [];
            for (const item of list) {
              const matched = filters.every((f) => {
                if (f.op === "eq") return item[f.col] === f.val;
                if (f.op === "neq") return item[f.col] !== f.val;
                return true;
              });
              if (matched) {
                Object.assign(item, updatePayload);
              }
            }
          }
          resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };

  const supabaseAdmin = { client: supabaseMock };
  const scopeResolver = new ScopeResolverService(supabaseAdmin);
  const categoriesService = {
    assertAssignableCategoryId: async () => undefined,
  };
  const productsService = new ProductsService(supabaseAdmin, scopeResolver, categoriesService);

  return { state, productsService, scopeResolver };
}

function validCreatePayload(overrides = {}) {
  return {
    name: "منتج تجريبي جديد",
    slug: `test-prod-${Date.now()}`,
    description: "وصف تجريبي مفصل",
    short_description: "وصف مختصر يحتوي على تفاصيل كافية ومطابقة للجاهزية المطلوبة.",
    price: 15000,
    discount_price: null,
    category_id: CATEGORY_ID,
    stock: 20,
    purchase_price: 10000,
    low_stock_threshold: 3,
    is_active: false,
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    images: ["https://example.com/image.jpg"],
    loyalty_points_enabled: true,
    merchant_id: STORE_A,
    merchant_sku: `SKU-${Date.now()}`,
    ...overrides,
  };
}

// ─── Direct Service Unit / Logic Tests ──────────────────────────────────────────

test("1. Store A Owner retrieves Store A product successfully", async () => {
  const { productsService } = makeHarness();
  const res = await productsService.getProductById(PROD_A_1, {
    merchant_id: STORE_A,
    actor_role: "merchant_owner",
    actor_id: USER_STORE_A_OWNER,
  });
  assert.equal(res.id, PROD_A_1);
  assert.equal(res.merchant_id, STORE_A);
  assert.ok(res.readiness);
});

test("2. Store A Staff can read Store A product", async () => {
  const { productsService } = makeHarness();
  const res = await productsService.getProductById(PROD_A_1, {
    merchant_id: STORE_A,
    actor_role: "merchant_staff",
    actor_id: USER_STORE_A_STAFF,
  });
  assert.equal(res.id, PROD_A_1);
  assert.equal(res.merchant_id, STORE_A);
});

test("3. getProductById fails closed if merchant_id is missing for merchant actor (no silent fallback)", async () => {
  const { productsService } = makeHarness();
  await assert.rejects(
    () =>
      productsService.getProductById(PROD_A_1, {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof BadRequestException && err.message.includes("merchant_id is required")
  );
});

test("4. Cross-Store IDOR blocked: Store A Owner cannot view Store B product", async () => {
  const { productsService } = makeHarness();
  // Store A Owner requests Store B product while scoped to Store A
  await assert.rejects(
    () =>
      productsService.getProductById(PROD_B_1, {
        merchant_id: STORE_A,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Product not found in actor scope")
  );
});

test("5. Mismatched merchant_id: Store A Owner spoofing Store B merchant_id is rejected", async () => {
  const { productsService } = makeHarness();
  await assert.rejects(
    () =>
      productsService.getProductById(PROD_B_1, {
        merchant_id: STORE_B,
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Merchant scope is not allowed for this actor")
  );
});

test("6. Inactive store product read is rejected with 403", async () => {
  const { productsService, state } = makeHarness();
  state.merchant_users.push({ user_id: "user-inactive", merchant_id: STORE_INACTIVE, role: "owner" });
  await assert.rejects(
    () =>
      productsService.getProductById(PROD_A_1, {
        merchant_id: STORE_INACTIVE,
        actor_role: "merchant_owner",
        actor_id: "user-inactive",
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Merchant is pending approval or not active")
  );
});

test("7. Store A Owner creates product successfully with explicit merchant_id", async () => {
  const { productsService } = makeHarness();
  const created = await productsService.createProduct(validCreatePayload({ merchant_id: STORE_A }), {
    actor_role: "merchant_owner",
    actor_id: USER_STORE_A_OWNER,
  });
  assert.equal(created.merchant_id, STORE_A);
  assert.equal(created.visibility_status, "private");
});

test("8. Store A Staff cannot create products (403 Forbidden)", async () => {
  const { productsService } = makeHarness();
  await assert.rejects(
    () =>
      productsService.createProduct(validCreatePayload({ merchant_id: STORE_A }), {
        actor_role: "merchant_staff",
        actor_id: USER_STORE_A_STAFF,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Staff role has read-only access to catalog")
  );
});

test("9. createProduct fails closed if merchant_id is missing for merchant actor", async () => {
  const { productsService } = makeHarness();
  await assert.rejects(
    () =>
      productsService.createProduct(validCreatePayload({ merchant_id: undefined }), {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof BadRequestException && err.message.includes("merchant_id is required")
  );
});

test("10. Cross-Store create IDOR: Store A Owner cannot create product for Store B", async () => {
  const { productsService } = makeHarness();
  await assert.rejects(
    () =>
      productsService.createProduct(validCreatePayload({ merchant_id: STORE_B }), {
        actor_role: "merchant_owner",
        actor_id: USER_STORE_A_OWNER,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Merchant scope is not allowed for this actor")
  );
});

test("11. Store A Owner updates product with canonical response", async () => {
  const { productsService } = makeHarness();
  const res = await productsService.updateProduct(
    PROD_A_1,
    validCreatePayload({ merchant_id: STORE_A, price: 28000, merchant_sku: "BAG-001" }),
    {
      merchant_id: STORE_A,
      actor_role: "merchant_owner",
      actor_id: USER_STORE_A_OWNER,
    }
  );
  assert.deepEqual(res, { ok: true });
});

test("12. Store A Staff cannot update products (403 Forbidden)", async () => {
  const { productsService } = makeHarness();
  await assert.rejects(
    () =>
      productsService.updateProduct(
        PROD_A_1,
        validCreatePayload({ merchant_id: STORE_A, price: 28000, merchant_sku: "BAG-001" }),
        {
          merchant_id: STORE_A,
          actor_role: "merchant_staff",
          actor_id: USER_STORE_A_STAFF,
        }
      ),
    (err) => err instanceof ForbiddenException && err.message.includes("Staff role has read-only access to catalog")
  );
});

test("13. Cross-Store update IDOR: Store A Owner cannot update Store B product", async () => {
  const { productsService } = makeHarness();
  await assert.rejects(
    () =>
      productsService.updateProduct(
        PROD_B_1,
        validCreatePayload({ merchant_id: STORE_A, price: 35000, merchant_sku: "BAS-001" }),
        {
          merchant_id: STORE_A,
          actor_role: "merchant_owner",
          actor_id: USER_STORE_A_OWNER,
        }
      ),
    (err) => err instanceof ForbiddenException && err.message.includes("Product not found in actor scope")
  );
});

test("14. updateProductStatus rejects merchant staff with 403", async () => {
  const { productsService } = makeHarness();
  await assert.rejects(
    () =>
      productsService.updateProductStatus(PROD_A_1, {
        is_active: false,
        merchant_id: STORE_A,
        actor_role: "merchant_staff",
        actor_id: USER_STORE_A_STAFF,
      }),
    (err) => err instanceof ForbiddenException && err.message.includes("Staff role has read-only access to catalog")
  );
});

// ─── Real NestJS HTTP Boundary / Pipe Tests ─────────────────────────────────────

let app;
let baseUrl;

before(async () => {
  const { productsService } = makeHarness();

  const tokenMap = {
    "token-store-a-owner": { ok: true, actorRole: "merchant_owner", actorId: USER_STORE_A_OWNER },
    "token-store-a-staff": { ok: true, actorRole: "merchant_staff", actorId: USER_STORE_A_STAFF },
    "token-admin": { ok: true, actorRole: "admin", actorId: USER_ADMIN },
  };

  const mockActorResolver = {
    resolve: async (token) => {
      const mapped = tokenMap[token];
      if (mapped) return { ...mapped, actorToken: token };
      return { ok: false, reason: "invalid_token" };
    },
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [ProductsController],
    providers: [
      { provide: ProductsService, useValue: productsService },
      { provide: SupabaseActorResolverService, useValue: mockActorResolver },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (app) await app.close();
});

test("15. Real NestJS HTTP Boundary: ParseUUIDPipe rejects malformed product ID on GET with 400", async () => {
  const res = await fetch(`${baseUrl}/products/invalid-uuid-123`, {
    headers: { Authorization: "Bearer token-store-a-owner" },
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.message.includes("Validation failed") || body.message.includes("UUID"));
});

test("16. Real NestJS HTTP Boundary: ParseUUIDPipe rejects malformed product ID on POST update with 400", async () => {
  const res = await fetch(`${baseUrl}/products/not-a-uuid`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-store-a-owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validCreatePayload()),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.message.includes("Validation failed") || body.message.includes("UUID"));
});

test("17. Real NestJS HTTP Boundary: ParseUUIDPipe rejects malformed product ID on status update with 400", async () => {
  const res = await fetch(`${baseUrl}/products/invalid-uuid/status`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-store-a-owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ is_active: false, merchant_id: STORE_A }),
  });
  assert.equal(res.status, 400);
});

test("18. Real NestJS HTTP Boundary: Valid GET returns 200 with product", async () => {
  const res = await fetch(`${baseUrl}/products/${PROD_A_1}?merchant_id=${STORE_A}`, {
    headers: { Authorization: "Bearer token-store-a-owner" },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, PROD_A_1);
  assert.equal(body.merchant_id, STORE_A);
});

test("19. Real NestJS HTTP Boundary: Staff role rejected on POST create with 403", async () => {
  const res = await fetch(`${baseUrl}/products`, {
    method: "POST",
    headers: {
      Authorization: "Bearer token-store-a-staff",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validCreatePayload()),
  });
  assert.equal(res.status, 403);
});
