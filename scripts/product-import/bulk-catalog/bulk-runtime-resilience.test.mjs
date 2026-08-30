/**
 * DilMart-BULK2200-RUNTIME-READ-RESILIENCE-AND-LOOKUP-EFFICIENCY-001
 * Comprehensive unit tests for read resilience, lookup efficiency, and write safety.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  createProductionRuntimeAdapters,
  EXPECTED_BACKEND_API,
} from "./lib/runtime-adapters.mjs";
import {
  TARGET_MERCHANT_ID,
} from "./lib/constants.mjs";
import {
  buildCatalogIndexes,
} from "./lib/runtime.mjs";

const VALID_PROD_URL = "https://ztplxqlthuqkuktbznbo.supabase.co";
const VALID_SB_SECRET = ["sb", "secret", "valid_test_key_0123456789abcdef"].join("_");

function makeAdminJwt(sub = "admin-1", expSec = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + expSec,
    }),
  ).toString("base64url");
  return `${header}.${payload}.mockSignature`;
}

const VALID_JWT = makeAdminJwt();

test("1. adminFetch GET performs bounded retry on network failure and succeeds", async () => {
  let attempts = 0;
  const customFetch = async (url, opts = {}) => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("fetch failed");
    }
    return new Response(JSON.stringify([{ id: "prod-1", name: "Test" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    fetchImpl: customFetch,
  });

  const res = await adapters.admin.getProductById("prod-1");
  assert.equal(attempts, 3);
  assert.equal(adapters._calls.backendReadRetries, 2);
  assert.equal(res[0].id, "prod-1");
});

test("2. adminFetch GET performs bounded retry on 503 and succeeds", async () => {
  let attempts = 0;
  const customFetch = async (url, opts = {}) => {
    attempts += 1;
    if (attempts < 2) {
      return new Response("Service Unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({ id: "prod-2" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    fetchImpl: customFetch,
  });

  const res = await adapters.admin.getProductById("prod-2");
  assert.equal(attempts, 2);
  assert.equal(adapters._calls.backendReadRetries, 1);
  assert.equal(res.id, "prod-2");
});

test("3. adminFetch GET does NOT retry non-retryable 404/401/409 errors", async () => {
  let attempts = 0;
  const customFetch = async (url, opts = {}) => {
    attempts += 1;
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    fetchImpl: customFetch,
  });

  await assert.rejects(
    () => adapters.admin.getProductById("prod-missing"),
    (err) => {
      assert.equal(err.status, 404);
      return true;
    },
  );
  assert.equal(attempts, 1);
  assert.equal(adapters._calls.backendReadRetries, 0);
});

test("4. admin.createProduct (POST) is strictly single-attempt and never retried on network failure", async () => {
  let attempts = 0;
  const customFetch = async (url, opts = {}) => {
    attempts += 1;
    throw new Error("read ECONNRESET");
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    fetchImpl: customFetch,
  });

  await assert.rejects(
    () => adapters.admin.createProduct({ name: "Product" }),
    (err) => {
      assert.equal(err.indeterminate, true);
      assert.match(err.message, /ADMIN_NETWORK/);
      return true;
    },
  );
  assert.equal(attempts, 1); // Strictly single attempt!
  assert.equal(adapters._calls.adminWrites, 1);
  assert.equal(adapters._calls.backendReadRetries, 0);
});

test("5. ensureStorageAuth performs bounded retry on probe network failure and succeeds", async () => {
  let probeAttempts = 0;
  const customProbeFetch = async () => {
    probeAttempts += 1;
    if (probeAttempts < 3) {
      throw new Error("fetch failed");
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    probeFetch: customProbeFetch,
  });

  const auth = await adapters.ensureStorageAuth();
  assert.equal(auth.ok, true);
  assert.equal(probeAttempts, 3);
  assert.equal(adapters._calls.storageProbeRetries, 2);
  assert.equal(adapters.storageAuthMeta().storage_key_probe, "PASS");
});

test("6. ensureStorageAuth fails immediately with zero retry on 401 invalid key", async () => {
  let probeAttempts = 0;
  const customProbeFetch = async () => {
    probeAttempts += 1;
    return new Response(JSON.stringify({ message: "Invalid API key" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    probeFetch: customProbeFetch,
  });

  await assert.rejects(
    () => adapters.ensureStorageAuth(),
    (err) => {
      assert.equal(err.code, "STORAGE_SERVER_KEY_PROBE_FAILED");
      assert.equal(err.probeCode, "KEY_INVALID_DISABLED_OR_WRONG_PROJECT");
      return true;
    },
  );
  assert.equal(probeAttempts, 1); // Zero retries on auth rejection
  assert.equal(adapters._calls.storageProbeRetries, 0);
});

test("7. storage.upload is strictly single-attempt with zero automated retries", async () => {
  let uploadCalls = 0;
  const mockSupabaseJs = {
    createClient: () => ({
      storage: {
        from: () => ({
          upload: async () => {
            uploadCalls += 1;
            return { error: new Error("Network timeout during upload") };
          },
        }),
      },
    }),
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    probeFetch: async () => new Response("{}", { status: 200 }),
    supabaseJs: mockSupabaseJs,
  });

  const res = await adapters.storage.upload({
    path: "test/path.webp",
    body: Buffer.from("image"),
    contentType: "image/webp",
    upsert: false,
  });

  assert.equal(res.ok, false);
  assert.equal(uploadCalls, 1); // Strictly single attempt!
  assert.equal(adapters._calls.storageWrites, 1);
  assert.equal(adapters._calls.storageReadRetries, 0);
});

test("8. buildCatalogIndexes provides instant SKU & slug lookups preserving multiplicity", () => {
  const live = {
    products: [
      { id: "p1", merchant_sku: "ARD-001", slug: "ard-oud-1" },
      { id: "p2", merchant_sku: "ARD-002", slug: "ard-oud-2" },
      { id: "p3", merchant_sku: "ARD-DUP", slug: "ard-dup-1" },
      { id: "p4", merchant_sku: "ARD-DUP", slug: "ard-dup-2" },
    ],
    allProducts: [
      { id: "p1", merchant_sku: "ARD-001", slug: "ard-oud-1" },
      { id: "p5", merchant_sku: "OTHER-001", slug: "other-brand-slug" },
      { id: "p6", merchant_sku: "OTHER-DUP", slug: "global-duplicate-slug" },
      { id: "p7", merchant_sku: "OTHER-DUP2", slug: "global-duplicate-slug" },
    ],
  };

  const index = buildCatalogIndexes(live);

  // SKU absent
  assert.equal(index.getProductBySku("ARD-999"), null);
  assert.equal(index.lookupProductBySku("ARD-999").count, 0);

  // SKU single match
  assert.equal(index.getProductBySku("ARD-001")?.id, "p1");
  assert.equal(index.lookupProductBySku("ARD-001").count, 1);

  // SKU ambiguous (>1 match)
  assert.throws(
    () => index.getProductBySku("ARD-DUP"),
    (err) => {
      assert.equal(err.code, "SKU_AMBIGUOUS");
      assert.equal(err.count, 2);
      return true;
    },
  );

  // Slug absent
  assert.equal(index.getProductBySlug("non-existent-slug"), null);

  // Slug single match
  assert.equal(index.getProductBySlug("ard-oud-1")?.id, "p1");
  assert.equal(index.getProductBySlug("other-brand-slug")?.id, "p5");

  // Slug ambiguous (>1 match)
  assert.throws(
    () => index.getProductBySlug("global-duplicate-slug"),
    (err) => {
      assert.equal(err.code, "SLUG_AMBIGUOUS");
      assert.equal(err.count, 2);
      return true;
    },
  );

  // Dynamic index update after create
  index.indexProduct({ id: "p8", merchant_sku: "ARD-NEW", slug: "ard-new-product" });
  assert.equal(index.getProductBySku("ARD-NEW")?.id, "p8");
  assert.equal(index.getProductBySlug("ard-new-product")?.id, "p8");
});

test("9. storage.pathExists performs bounded retry on transient failure and returns boolean", async () => {
  let listCalls = 0;
  const mockSupabaseJs = {
    createClient: () => ({
      storage: {
        from: () => ({
          list: async () => {
            listCalls += 1;
            if (listCalls < 2) {
              return { error: new Error("fetch failed") };
            }
            return { data: [{ name: "item.webp" }], error: null };
          },
        }),
      },
    }),
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    probeFetch: async () => new Response("{}", { status: 200 }),
    supabaseJs: mockSupabaseJs,
  });

  const exists = await adapters.storage.pathExists("merchant/batch/item.webp");
  assert.equal(exists, true);
  assert.equal(listCalls, 2);
  assert.equal(adapters._calls.storageReadRetries, 1);
});

test("10. storage.verifyObject performs bounded retry on download error, but does NOT retry on SHA mismatch", async () => {
  let downloadCalls = 0;
  const mockBody = Buffer.from("correct_image_content");
  const correctSha = crypto.createHash("sha256").update(mockBody).digest("hex").toUpperCase();

  const mockSupabaseJs = {
    createClient: () => ({
      storage: {
        from: () => ({
          download: async () => {
            downloadCalls += 1;
            if (downloadCalls < 2) {
              return { data: null, error: new Error("fetch failed") };
            }
            return {
              data: {
                arrayBuffer: async () => mockBody,
                type: "image/webp",
              },
              error: null,
            };
          },
        }),
      },
    }),
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    probeFetch: async () => new Response("{}", { status: 200 }),
    supabaseJs: mockSupabaseJs,
  });

  const verified = await adapters.storage.verifyObject("merchant/batch/item.webp", correctSha, "image/webp");
  assert.equal(verified.ok, true);
  assert.equal(downloadCalls, 2);
  assert.equal(adapters._calls.storageReadRetries, 1);

  // Now test deterministic SHA mismatch with zero retries
  let mismatchCalls = 0;
  const mismatchSupabaseJs = {
    createClient: () => ({
      storage: {
        from: () => ({
          download: async () => {
            mismatchCalls += 1;
            return {
              data: {
                arrayBuffer: async () => Buffer.from("other_image_content"),
                type: "image/webp",
              },
              error: null,
            };
          },
        }),
      },
    }),
  };

  const mismatchAdapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    probeFetch: async () => new Response("{}", { status: 200 }),
    supabaseJs: mismatchSupabaseJs,
  });

  const mismatchResult = await mismatchAdapters.storage.verifyObject("merchant/batch/item.webp", "WRONG_SHA", "image/webp");
  assert.equal(mismatchResult.ok, false);
  assert.equal(mismatchCalls, 1); // Exact 1 call, zero retry on SHA mismatch!
  assert.equal(mismatchAdapters._calls.storageReadRetries, 0);
});

test("11. adminFetch GET exhausts all 5 retries on sustained network failure and throws", async () => {
  let attempts = 0;
  const customFetch = async () => {
    attempts += 1;
    throw new Error("fetch failed");
  };

  const adapters = createProductionRuntimeAdapters({
    supabaseUrl: VALID_PROD_URL,
    serverKey: VALID_SB_SECRET,
    adminJwt: VALID_JWT,
    fetchImpl: customFetch,
  });

  await assert.rejects(
    () => adapters.admin.getProductById("prod-fail"),
    (err) => {
      assert.match(err.message, /ADMIN_NETWORK/);
      assert.equal(err.indeterminate, false);
      return true;
    },
  );
  assert.equal(attempts, 5); // 5 max attempts
  assert.equal(adapters._calls.backendReadRetries, 4);
});

