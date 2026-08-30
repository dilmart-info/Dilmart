/**
 * Storage + Admin adapters for private-catalog FIX EXECUTION.
 * Exact SKU resolution via full-catalog Map — never name search.
 */
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  TARGET_MERCHANT_ID,
  EXPECTED_BACKEND_API,
  EXPECTED_SUPABASE_HOST,
  rejectPublishableOrAnonAdminToken,
} from "./private-catalog-fix-gates.mjs";
import { scrubSecrets, BUCKET, PUBLIC_BASE } from "./private-catalog-fix-execution.mjs";
import {
  classifyKeyKind,
  resolveServerKey,
  assertProductionSupabaseUrl,
  createBatch100StorageClient,
  probeServerKeyAcceptance,
  classifyAuthFailure,
  scrubSecrets as scrubAuthSecrets,
} from "./batch100-storage-auth.mjs";
import {
  buildExactSkuMap,
  requireExactSku,
  buildCategoryIndex,
  enrichCatalogProducts,
  enrichProductWithCategorySlug,
  filterProductsByNameSearch,
  PRODUCT_LIST_SEARCH_FIELD,
} from "./private-catalog-fix-catalog.mjs";

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
}

export function assertFakeAdaptersAllowedForWrites(env = process.env) {
  if (env.NODE_ENV === "test" && String(env.FIX_EXEC_TEST_MODE) === "1") {
    return { ok: true };
  }
  return {
    ok: false,
    code: "FAKE_ADAPTERS_FORBIDDEN_IN_WRITE_MODE",
    message: "Fake adapters require NODE_ENV=test and FIX_EXEC_TEST_MODE=1 for write modes",
  };
}

function isIndeterminateHttpStatus(status) {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function applyPayloadLocal(p, payload, categoryById) {
  const next = { ...p };
  next.name = payload.name;
  next.slug = payload.slug;
  next.brand = payload.brand;
  next.short_description = payload.short_description;
  next.description = payload.description ?? next.description;
  next.category_id = payload.category_id;
  const cat = categoryById.get(payload.category_id);
  next.category_slug = cat?.slug ?? null;
  if (Array.isArray(payload.sizes)) {
    next.sizes = payload.sizes.length === 1 ? payload.sizes[0] : payload.sizes;
  }
  if (Array.isArray(payload.images) && payload.images[0]) {
    next.images = payload.images;
    next.image_url = payload.images[0];
  }
  return next;
}

/**
 * In-memory fake adapters for unit/integration tests.
 */
export function createFakeAdapters(state = {}) {
  const store = {
    objects: new Map(Object.entries(state.objects || {})),
    products: structuredClone(state.products || []),
    merchant: structuredClone(
      state.merchant || {
        id: TARGET_MERCHANT_ID,
        slug: "arth-al-khaleg",
        status: "draft",
      },
    ),
    categories: structuredClone(
      state.categories || [
        { id: "cat-perfumes-leaf", slug: "perfumes", is_active: true, parent_id: null },
      ],
    ),
    uploadCalls: [],
    updateCalls: [],
    searchCalls: [],
    failUploadSku: state.failUploadSku || null,
    failCanary: state.failCanary || false,
    shaMismatchSku: state.shaMismatchSku || null,
    timeoutSku: state.timeoutSku || null,
    http500Sku: state.http500Sku || null,
    unknownSku: state.unknownSku || null,
    pathExistsOverride: state.pathExistsOverride || null,
    applyOnIndeterminate: state.applyOnIndeterminate === true,
    pathProbeCalls: [],
    storageAuthProbeCalls: 0,
  };

  // Simulated Storage server-key acceptance probe (mirrors the production adapter's
  // read-only gateway probe) so probe-failure gating is provable without any network.
  const simulatedProbe = state.storageServerKeyProbe || { ok: true, status: 200, code: null };
  const storageAuthMeta = {
    storage_key_kind: state.storageKeyKind ?? null,
    storage_key_source: state.storageKeySource ?? null,
    storage_server_key_probe: "NOT_RUN",
    storage_server_key_probe_status: null,
    storage_auth_flow: "compatibility_client",
  };

  async function ensureStorageAuth() {
    if (storageAuthMeta.storage_server_key_probe === "NOT_RUN") {
      store.storageAuthProbeCalls += 1;
      storageAuthMeta.storage_server_key_probe = simulatedProbe.ok ? "PASS" : "FAIL";
      storageAuthMeta.storage_server_key_probe_status = simulatedProbe.status ?? null;
    }
    if (storageAuthMeta.storage_server_key_probe !== "PASS") {
      const code = simulatedProbe.code || "KEY_INVALID_DISABLED_OR_WRONG_PROJECT";
      const err = new Error(`STORAGE_SERVER_KEY_PROBE_FAILED:${code}`);
      err.code = "STORAGE_SERVER_KEY_PROBE_FAILED";
      err.storage_auth_code = code;
      throw err;
    }
    return { ok: true, status: storageAuthMeta.storage_server_key_probe_status };
  }

  const categoryById = () => buildCategoryIndex(store.categories);

  function refreshSkuMap() {
    const enriched = enrichCatalogProducts(store.products, categoryById());
    store.products = enriched;
    return buildExactSkuMap(enriched);
  }

  let skuMap = refreshSkuMap();

  return {
    _state: store,
    _refreshSkuMap: () => {
      skuMap = refreshSkuMap();
      return skuMap;
    },
    kind: "fake",
    ensureStorageAuth,
    storageAuthMeta: () => ({ ...storageAuthMeta }),
    async fetchLiveCatalog() {
      if (state.fetchFails) throw new Error("FETCH_UNAVAILABLE");
      skuMap = refreshSkuMap();
      return {
        merchant: store.merchant,
        products: store.products.map((p) => ({ ...p })),
        categories: store.categories.map((c) => ({ ...c })),
        categoryById: categoryById(),
        skuMap,
      };
    },
    storage: {
      async pathExists(objectPath) {
        await ensureStorageAuth();
        store.pathProbeCalls.push(objectPath);
        if (state.pathProbeError && state.pathProbeError.path === objectPath) {
          const code = state.pathProbeError.code || "KEY_NOT_RECOGNIZED_OR_WRONG_AUTH_FLOW";
          const err = new Error(`STORAGE_AUTH_FAILED:${code}`);
          err.code = "STORAGE_AUTH_FAILED";
          err.storage_auth_code = code;
          throw err;
        }
        if (store.pathExistsOverride && objectPath in store.pathExistsOverride) {
          return store.pathExistsOverride[objectPath];
        }
        return store.objects.has(objectPath);
      },
      async upload({ path: objectPath, body, contentType, upsert }) {
        await ensureStorageAuth();
        store.uploadCalls.push({ path: objectPath, contentType, upsert, bytes: body?.length });
        if (upsert !== false) return { ok: false, error: "UPSERT_FORBIDDEN" };
        const m = objectPath.match(/(ARD-\d+)-/);
        const skuFromPath = m?.[1];
        if (store.failCanary && skuFromPath === "ARD-2793") {
          return { ok: false, error: "CANARY_UPLOAD_FAILED" };
        }
        if (store.failUploadSku && skuFromPath === store.failUploadSku) {
          return { ok: false, error: "UPLOAD_FAILED" };
        }
        if (store.objects.has(objectPath)) {
          return { ok: false, error: "ALREADY_EXISTS" };
        }
        let buf = Buffer.from(body);
        let sha = sha256(buf);
        if (store.shaMismatchSku && skuFromPath === store.shaMismatchSku) {
          buf = Buffer.from("tampered");
          sha = sha256(buf);
        }
        store.objects.set(objectPath, { buf, sha, contentType });
        return { ok: true };
      },
      async verifyObject(objectPath, expectedSha) {
        const obj = store.objects.get(objectPath);
        if (!obj) return { ok: false, remoteSha: null, publicGetStatus: 404, mime: null };
        const ok = obj.sha === String(expectedSha).toUpperCase();
        return {
          ok,
          remoteSha: obj.sha,
          publicGetStatus: 200,
          mime: "image/webp",
          decodedOk: true,
        };
      },
      async countObjects(prefix) {
        let n = 0;
        for (const k of store.objects.keys()) {
          if (String(k).startsWith(prefix)) n += 1;
        }
        return n;
      },
    },
    admin: {
      async listCategories() {
        return store.categories.map((c) => ({ ...c }));
      },
      async getProductByExactSku(sku) {
        skuMap = refreshSkuMap();
        const r = requireExactSku(skuMap, sku);
        if (!r.ok) return null;
        return { ...r.product };
      },
      async searchProductsByName(search) {
        store.searchCalls.push({ search, field: PRODUCT_LIST_SEARCH_FIELD });
        return filterProductsByNameSearch(store.products, search);
      },
      async getProductById(id) {
        const p = store.products.find((x) => x.id === id);
        if (!p) return null;
        return enrichProductWithCategorySlug({ ...p }, categoryById());
      },
      async updateProduct(id, payload) {
        const p = store.products.find((x) => x.id === id);
        if (!p) throw new Error("NOT_FOUND");
        if (store.timeoutSku && p.merchant_sku === store.timeoutSku) {
          if (store.applyOnIndeterminate) {
            Object.assign(p, applyPayloadLocal(p, payload, categoryById()));
          }
          const e = new Error("TIMEOUT");
          e.indeterminate = true;
          e.code = "ETIMEDOUT";
          throw e;
        }
        if (store.http500Sku && p.merchant_sku === store.http500Sku) {
          if (store.applyOnIndeterminate) {
            Object.assign(p, applyPayloadLocal(p, payload, categoryById()));
          }
          const e = new Error("ADMIN_HTTP_500");
          e.status = 500;
          e.indeterminate = true;
          throw e;
        }
        if (store.unknownSku && p.merchant_sku === store.unknownSku) {
          const e = new Error("UNKNOWN_RESPONSE");
          e.indeterminate = true;
          throw e;
        }
        store.updateCalls.push({ id, merchant_sku: p.merchant_sku, fields: Object.keys(payload) });
        Object.assign(p, applyPayloadLocal(p, payload, categoryById()));
        return { ok: true };
      },
    },
  };
}

/**
 * HTTP-mocked admin layer matching Backend controller contracts.
 * listProducts?search= → name ilike only (not merchant_sku).
 */
export function createHttpContractAdapters(state = {}) {
  const fake = createFakeAdapters(state);
  const store = fake._state;
  const backendApi = (state.backendApi || EXPECTED_BACKEND_API).replace(/\/$/, "");
  const fetchLog = [];

  async function adminFetch(pathname, { method = "GET", body } = {}) {
    const url = `${backendApi}${pathname}`;
    fetchLog.push({ method, url, pathname });
    const u = new URL(url);
    const pathOnly = u.pathname.replace(/^\/api/, "") || u.pathname;

    if (method === "GET" && pathOnly === "/products") {
      const merchantId = u.searchParams.get("merchant_id");
      const search = u.searchParams.get("search");
      let list = store.products.filter((p) => !merchantId || p.merchant_id === merchantId);
      if (search) {
        list = filterProductsByNameSearch(list, search);
        store.searchCalls.push({ search, field: PRODUCT_LIST_SEARCH_FIELD, via: "http" });
      }
      return list.map((p) => ({ ...p }));
    }

    if (method === "GET" && pathOnly.startsWith("/products/")) {
      const id = pathOnly.slice("/products/".length);
      const p = store.products.find((x) => x.id === id);
      if (!p) {
        const e = new Error("ADMIN_HTTP_404");
        e.status = 404;
        throw e;
      }
      const raw = { ...p };
      delete raw.category_slug;
      return raw;
    }

    if (method === "GET" && pathOnly === "/categories/admin-list") {
      return store.categories.map((c) => ({ ...c }));
    }

    if (method === "GET" && pathOnly.startsWith("/merchants/")) {
      return { ...store.merchant };
    }

    if (method === "POST" && pathOnly.startsWith("/products/")) {
      const id = pathOnly.slice("/products/".length).split("?")[0];
      return fake.admin.updateProduct(id, body);
    }

    throw new Error(`UNMOCKED_HTTP:${method} ${pathOnly}`);
  }

  return {
    ...fake,
    kind: "http_contract",
    _fetchLog: fetchLog,
    async fetchLiveCatalog() {
      const merchant = await adminFetch(`/merchants/${TARGET_MERCHANT_ID}`);
      const productsRaw = await adminFetch(`/products?merchant_id=${TARGET_MERCHANT_ID}`);
      const categories = await adminFetch("/categories/admin-list");
      const categoryById = buildCategoryIndex(categories);
      const products = enrichCatalogProducts(productsRaw, categoryById);
      store.products = products;
      const skuMap = buildExactSkuMap(products);
      return { merchant, products, categories, categoryById, skuMap };
    },
    admin: {
      ...fake.admin,
      async listCategories() {
        return adminFetch("/categories/admin-list");
      },
      async getProductById(id) {
        const raw = await adminFetch(`/products/${id}?merchant_id=${TARGET_MERCHANT_ID}`);
        const cats = await adminFetch("/categories/admin-list");
        return enrichProductWithCategorySlug(raw, buildCategoryIndex(cats));
      },
      async updateProduct(id, payload) {
        return adminFetch(`/products/${id}?merchant_id=${TARGET_MERCHANT_ID}`, {
          method: "POST",
          body: payload,
        });
      },
      async resolveSkuViaNameSearch(sku) {
        const list = await adminFetch(
          `/products?merchant_id=${TARGET_MERCHANT_ID}&search=${encodeURIComponent(sku)}`,
        );
        return Array.isArray(list) ? list.find((p) => p.merchant_sku === sku) || null : null;
      },
    },
  };
}

/**
 * Production adapters — usable for read-only preflight/postflight and gated writes.
 */
export function createProductionAdapters({
  supabaseUrl,
  serverKey,
  serverKeySource = null,
  adminJwt,
  backendApi = EXPECTED_BACKEND_API,
  readOnly = false,
  supabaseJs = { createClient },
  probeFetch,
} = {}) {
  const urlGuard = assertProductionSupabaseUrl(supabaseUrl);
  if (!urlGuard.ok) throw new Error(urlGuard.code || "WRONG_SUPABASE_PROJECT");

  const kind = classifyKeyKind(serverKey);
  if (kind !== "sb_secret" && kind !== "legacy_service_role") {
    throw new Error("UNSUPPORTED_SERVER_KEY");
  }
  // The key source/kind/value are frozen for the lifetime of this adapter — the acceptance
  // probe and every later Storage call use exactly the same credential, and no fallback key
  // is ever selected after the first probe.
  const frozenKey = Object.freeze({ source: serverKeySource, kind, key: String(serverKey) });

  let jwtPayload;
  try {
    jwtPayload = JSON.parse(
      Buffer.from(String(adminJwt).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    );
  } catch {
    throw new Error("ADMIN_JWT_MALFORMED");
  }
  const jwtGate = rejectPublishableOrAnonAdminToken(jwtPayload);
  if (!jwtGate.ok) throw new Error(jwtGate.code);

  // Single Supabase client for the whole process, built with the proven Batch100 Storage
  // auth compatibility flow (`apikey` credential for the gateway; Bearer handling that new
  // `sb_secret_` keys and legacy service_role JWTs both survive). Constructing a plain
  // createClient(url, sb_secret_...) client instead makes production Storage reject the
  // request with "Invalid Compact JWS".
  const supabase = createBatch100StorageClient(supabaseJs, supabaseUrl, frozenKey.key, frozenKey.kind);

  const storageAuthMeta = {
    storage_key_kind: frozenKey.kind,
    storage_key_source: frozenKey.source,
    storage_server_key_probe: "NOT_RUN",
    storage_server_key_probe_status: null,
    storage_auth_flow: "compatibility_client",
  };

  let serverKeyProbe = null;
  /**
   * Read-only gateway acceptance probe for the frozen server key. Runs at most once and
   * must succeed before ANY Storage list/download/upload call. Failures surface as scrubbed
   * codes only — never the key, its prefix, a fingerprint, or the raw gateway body.
   */
  async function ensureStorageAuth() {
    if (!serverKeyProbe) {
      serverKeyProbe = probeServerKeyAcceptance({
        url: supabaseUrl,
        key: frozenKey.key,
        kind: frozenKey.kind,
        fetchImpl: probeFetch,
      }).then((r) => {
        storageAuthMeta.storage_server_key_probe = r.ok ? "PASS" : "FAIL";
        storageAuthMeta.storage_server_key_probe_status = r.status ?? null;
        return r;
      });
    }
    const result = await serverKeyProbe;
    if (!result.ok) {
      const code = result.code || "KEY_INVALID_DISABLED_OR_WRONG_PROJECT";
      const err = new Error(`STORAGE_SERVER_KEY_PROBE_FAILED:${code}`);
      err.code = "STORAGE_SERVER_KEY_PROBE_FAILED";
      err.storage_auth_code = code;
      err.status = result.status ?? null;
      throw err;
    }
    return result;
  }

  /** Convert a Storage error into a scrubbed, classified error (never echoes credentials). */
  function toStorageError(e, fallback) {
    const message = scrubAuthSecrets(String(e?.message || e), [frozenKey.key]);
    const classified = classifyAuthFailure(e?.status ?? e?.statusCode ?? null, message);
    if (classified.isAuth) {
      const err = new Error(`STORAGE_AUTH_FAILED:${classified.code}`);
      err.code = "STORAGE_AUTH_FAILED";
      err.storage_auth_code = classified.code;
      return err;
    }
    const err = new Error(`${fallback}:${message.slice(0, 120)}`);
    err.code = fallback;
    return err;
  }

  async function adminFetch(pathname, { method = "GET", body } = {}) {
    if (readOnly && method !== "GET") {
      const e = new Error("READ_ONLY_ADAPTER_WRITE_BLOCKED");
      e.code = "READ_ONLY_ADAPTER_WRITE_BLOCKED";
      throw e;
    }
    let res;
    try {
      res = await fetch(`${backendApi}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${adminJwt}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const e = new Error(`NETWORK:${err.message || err}`);
      e.indeterminate = true;
      e.code = err.code || "NETWORK";
      throw e;
    }

    let text = "";
    let data = null;
    try {
      text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      if (method === "POST") {
        const e = new Error("RESPONSE_PARSE_FAILURE");
        e.indeterminate = true;
        e.status = res.status;
        throw e;
      }
      data = { raw: text?.slice(0, 200) };
    }

    if (!res.ok) {
      const e = new Error(`ADMIN_HTTP_${res.status}`);
      e.status = res.status;
      e.data = data;
      if (method === "POST" && isIndeterminateHttpStatus(res.status)) {
        e.indeterminate = true;
      }
      throw e;
    }
    return data;
  }

  return {
    kind: readOnly ? "production_readonly" : "production",
    readOnly: Boolean(readOnly),
    ensureStorageAuth,
    storageAuthMeta: () => ({ ...storageAuthMeta }),
    async fetchLiveCatalog() {
      const merchant = await adminFetch(`/merchants/${TARGET_MERCHANT_ID}`);
      const productsRaw = await adminFetch(`/products?merchant_id=${TARGET_MERCHANT_ID}`);
      const list = Array.isArray(productsRaw) ? productsRaw : productsRaw?.data || [];
      const categories = await adminFetch("/categories/admin-list");
      const catList = Array.isArray(categories) ? categories : [];
      const categoryById = buildCategoryIndex(catList);
      const products = enrichCatalogProducts(list, categoryById);
      const skuMap = buildExactSkuMap(products);
      return {
        merchant: {
          id: merchant.id || TARGET_MERCHANT_ID,
          slug: merchant.slug,
          status: merchant.status,
        },
        products,
        categories: catList,
        categoryById,
        skuMap,
      };
    },
    storage: {
      async pathExists(objectPath) {
        await ensureStorageAuth();
        // LIST only — never download, sign, copy, move, remove or upsert during a probe.
        const { data, error } = await supabase.storage.from(BUCKET).list(
          objectPath.split("/").slice(0, -1).join("/"),
          { search: objectPath.split("/").pop(), limit: 10 },
        );
        if (error) throw toStorageError(error, "STORAGE_LIST_FAILED");
        const name = objectPath.split("/").pop();
        return (data || []).some((f) => f.name === name);
      },
      async upload({ path: objectPath, body, contentType, upsert }) {
        if (readOnly) return { ok: false, error: "READ_ONLY_ADAPTER_WRITE_BLOCKED" };
        if (upsert !== false) return { ok: false, error: "UPSERT_FORBIDDEN" };
        await ensureStorageAuth();
        const { error } = await supabase.storage.from(BUCKET).upload(objectPath, body, {
          contentType,
          upsert: false,
          cacheControl: "31536000",
        });
        if (error) return { ok: false, error: scrubSecrets(error.message || String(error)) };
        return { ok: true };
      },
      async verifyObject(objectPath, expectedSha) {
        await ensureStorageAuth();
        const { data, error } = await supabase.storage.from(BUCKET).download(objectPath);
        if (error || !data) {
          return { ok: false, remoteSha: null, publicGetStatus: 404, mime: null };
        }
        const buf = Buffer.from(await data.arrayBuffer());
        const remoteSha = sha256(buf);
        const publicUrl = `${PUBLIC_BASE}/${objectPath}`;
        let publicGetStatus = 0;
        let mime = null;
        try {
          const res = await fetch(publicUrl, { method: "GET" });
          publicGetStatus = res.status;
          mime = res.headers.get("content-type");
        } catch {
          publicGetStatus = 0;
        }
        const ok =
          remoteSha === String(expectedSha).toUpperCase() &&
          publicGetStatus === 200 &&
          String(mime || "").includes("image/webp");
        return { ok, remoteSha, publicGetStatus, mime, decodedOk: buf.length > 100 };
      },
      async countObjects(prefix) {
        await ensureStorageAuth();
        const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
        if (error) throw toStorageError(error, "STORAGE_LIST_FAILED");
        const { data: rem } = await supabase.storage
          .from(BUCKET)
          .list(`${prefix}/remediation-20260804`, { limit: 100 });
        const rootFiles = (data || []).filter((f) => f.name?.endsWith?.(".webp")).length;
        const remFiles = (rem || []).filter((f) => f.name?.endsWith?.(".webp")).length;
        return rootFiles + remFiles;
      },
    },
    admin: {
      async listCategories() {
        return adminFetch("/categories/admin-list");
      },
      async getProductById(id) {
        const raw = await adminFetch(`/products/${id}?merchant_id=${TARGET_MERCHANT_ID}`);
        const cats = await adminFetch("/categories/admin-list");
        return enrichProductWithCategorySlug(raw, buildCategoryIndex(cats));
      },
      async updateProduct(id, payload) {
        return adminFetch(`/products/${id}?merchant_id=${TARGET_MERCHANT_ID}`, {
          method: "POST",
          body: payload,
        });
      },
    },
  };
}

export function resolveProductionAdapterEnv(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL || env.FIX_EXEC_SUPABASE_URL || `https://${EXPECTED_SUPABASE_HOST}`;
  const key = resolveServerKey(env);
  const adminJwt = env.FIX_EXEC_ADMIN_JWT || env.ADMIN_JWT || "";
  const backendApi = (env.FIX_EXEC_BACKEND_API || EXPECTED_BACKEND_API).replace(/\/$/, "");
  return { supabaseUrl, key, adminJwt, backendApi };
}

export function canBuildProductionAdapters(env = process.env) {
  const cfg = resolveProductionAdapterEnv(env);
  return Boolean(cfg.key?.ok && cfg.adminJwt);
}
