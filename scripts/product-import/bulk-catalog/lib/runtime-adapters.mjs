import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  assertProductionSupabaseUrl,
  classifyAuthFailure,
  classifyKeyKind,
  createBatch100StorageClient,
  probeServerKeyAcceptance,
  resolveServerKey,
  scrubSecrets,
} from "../../lib/batch100-storage-auth.mjs";
import { validateAdminJwtForReadOnly } from "../../lib/private-catalog-fix-safety.mjs";
import { PUBLIC_BASE, STORAGE_BUCKET, TARGET_MERCHANT_ID } from "./constants.mjs";

export const EXPECTED_BACKEND_API = "https://DilMart-store-backend.onrender.com/api";
const PRODUCTION_RUNTIME_ADAPTER = Symbol("production-runtime-adapter");

export function isProductionReadOnlyRuntimeAdapter(adapters) {
  return Boolean(
    adapters?.[PRODUCTION_RUNTIME_ADAPTER] === true &&
      adapters.kind === "production_readonly" &&
      adapters.readOnly === true,
  );
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
}

function asList(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.data) ? value.data : [];
}

function sanitizedBackendCode(data) {
  const candidates = [data?.code, data?.error?.code, data?.response?.code];
  for (const candidate of candidates) {
    const code = String(candidate || "").trim().toUpperCase();
    if (/^[A-Z][A-Z0-9_]{1,79}$/.test(code)) return code;
  }
  return null;
}

export function resolveBulkRuntimeEnv(env = process.env) {
  const key = resolveServerKey(env);
  return {
    supabaseUrl: env.SUPABASE_URL || "https://ztplxqlthuqkuktbznbo.supabase.co",
    key,
    adminJwt: env.BULK2200_ADMIN_JWT || env.FIX_EXEC_ADMIN_JWT || env.ADMIN_JWT || "",
    backendApi: (env.BULK2200_BACKEND_API || EXPECTED_BACKEND_API).replace(/\/$/, ""),
  };
}

export function createProductionRuntimeAdapters({
  supabaseUrl,
  serverKey,
  serverKeySource = null,
  adminJwt,
  backendApi = EXPECTED_BACKEND_API,
  readOnly = false,
  fetchImpl = globalThis.fetch,
  probeFetch,
  supabaseJs = { createClient },
} = {}) {
  const project = assertProductionSupabaseUrl(supabaseUrl);
  if (!project.ok) throw new Error(project.code || "WRONG_SUPABASE_PROJECT");
  if (backendApi.replace(/\/$/, "") !== EXPECTED_BACKEND_API) throw new Error("WRONG_BACKEND_API");
  const kind = classifyKeyKind(serverKey);
  if (!["sb_secret", "legacy_service_role"].includes(kind)) throw new Error("UNSUPPORTED_SERVER_KEY");
  const jwt = validateAdminJwtForReadOnly(adminJwt);
  if (!jwt.ok) throw new Error(jwt.code);

  const READ_MAX_ATTEMPTS = 5;
  const READ_RETRY_DELAYS = [0, 1000, 2500, 5000, 10000];

  function isRetryableNetworkError(err) {
    const msg = String(err?.message || err);
    return /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|network/i.test(msg);
  }

  function isRetryableHttpStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  const frozen = Object.freeze({ key: String(serverKey), kind, source: serverKeySource });
  const supabase = createBatch100StorageClient(supabaseJs, supabaseUrl, frozen.key, frozen.kind, fetchImpl);
  let probePromise = null;
  const authMeta = {
    storage_key_kind: frozen.kind,
    storage_key_source: frozen.source,
    storage_key_probe: "NOT_RUN",
    storage_key_probe_status: null,
    storage_auth_flow: "compatibility_client",
  };
  const calls = {
    storageReads: 0,
    storageWrites: 0,
    adminReads: 0,
    adminWrites: 0,
    backendReadRetries: 0,
    storageReadRetries: 0,
    storageProbeRetries: 0,
  };

  async function ensureStorageAuth() {
    if (!probePromise) {
      probePromise = (async () => {
        let lastResult = null;
        for (let attempt = 1; attempt <= READ_MAX_ATTEMPTS; attempt++) {
          if (attempt > 1) {
            calls.storageProbeRetries += 1;
            const delay = READ_RETRY_DELAYS[attempt - 1] || 10000;
            await new Promise((r) => setTimeout(r, delay));
          }
          const result = await probeServerKeyAcceptance({
            url: supabaseUrl,
            key: frozen.key,
            kind: frozen.kind,
            fetchImpl: probeFetch || fetchImpl,
          });
          lastResult = result;
          if (result.ok) {
            authMeta.storage_key_probe = "PASS";
            authMeta.storage_key_probe_status = result.status ?? 200;
            return result;
          }
          // Only retry transient network transport failures
          if (result.code === "SERVER_KEY_PROBE_NETWORK_FAILED" && attempt < READ_MAX_ATTEMPTS) {
            continue;
          }
          // Immediate fail on auth errors (401, 403, wrong project, etc.)
          break;
        }
        authMeta.storage_key_probe = "FAIL";
        authMeta.storage_key_probe_status = lastResult?.status ?? null;
        return lastResult || { ok: false, code: "STORAGE_SERVER_KEY_PROBE_FAILED" };
      })();
    }
    const result = await probePromise;
    if (!result.ok) {
      const error = new Error(`STORAGE_SERVER_KEY_PROBE_FAILED:${result.code || "UNKNOWN"}`);
      error.code = "STORAGE_SERVER_KEY_PROBE_FAILED";
      error.probeCode = result.code;
      throw error;
    }
    return result;
  }

  function storageError(error, fallback) {
    const message = scrubSecrets(String(error?.message || error), [frozen.key, adminJwt]);
    const classified = classifyAuthFailure(error?.status || error?.statusCode, message);
    const safe = new Error(classified.isAuth ? `STORAGE_AUTH_FAILED:${classified.code}` : `${fallback}:${message.slice(0, 160)}`);
    safe.code = classified.isAuth ? "STORAGE_AUTH_FAILED" : fallback;
    return safe;
  }

  async function adminFetch(pathname, { method = "GET", body } = {}) {
    if (readOnly && method !== "GET") throw new Error("READ_ONLY_ADAPTER_WRITE_BLOCKED");
    method === "GET" ? (calls.adminReads += 1) : (calls.adminWrites += 1);

    const isRead = method === "GET" || method === "HEAD";
    const maxAttempts = isRead ? READ_MAX_ATTEMPTS : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        calls.backendReadRetries += 1;
        const delay = READ_RETRY_DELAYS[attempt - 1] || 10000;
        await new Promise((r) => setTimeout(r, delay));
      }

      let response;
      try {
        response = await fetchImpl(`${backendApi}${pathname}`, {
          method,
          headers: {
            Authorization: `Bearer ${adminJwt}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: body == null ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (isRead && isRetryableNetworkError(error) && attempt < maxAttempts) {
          continue;
        }
        const e = new Error(`ADMIN_NETWORK:${scrubSecrets(String(error?.message || error), [adminJwt])}`);
        e.indeterminate = method !== "GET";
        throw e;
      }

      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        if (isRead && isRetryableHttpStatus(response.status) && attempt < maxAttempts) {
          continue;
        }
        const e = new Error(`ADMIN_RESPONSE_PARSE:${response.status}`);
        e.status = response.status;
        e.indeterminate = method !== "GET";
        throw e;
      }

      if (!response.ok) {
        if (isRead && isRetryableHttpStatus(response.status) && attempt < maxAttempts) {
          continue;
        }
        const backendCode = sanitizedBackendCode(data);
        const e = new Error(`ADMIN_HTTP_${response.status}${backendCode ? `:${backendCode}` : ""}`);
        e.status = response.status;
        e.code = backendCode || `ADMIN_HTTP_${response.status}`;
        e.backendCode = backendCode;
        e.indeterminate = method !== "GET" && response.status >= 500;
        throw e;
      }

      return data;
    }
  }

  const BULK_READ_PAGE_SIZE = 500;

  async function fetchAllProducts({ merchantId = null, pageSize = BULK_READ_PAGE_SIZE } = {}) {
    const products = [];
    const seenIds = new Set();
    let offset = 0;

    while (true) {
      const query = new URLSearchParams();
      if (merchantId) query.set("merchant_id", merchantId);
      query.set("offset", String(offset));
      query.set("limit", String(pageSize));

      const raw = await adminFetch(`/products?${query.toString()}`);
      if (!Array.isArray(raw) && !Array.isArray(raw?.data)) {
        throw new Error("MALFORMED_PAGINATED_PRODUCT_RESPONSE");
      }
      const page = asList(raw);

      for (const item of page) {
        if (item?.id) {
          if (seenIds.has(item.id)) {
            continue;
          }
          seenIds.add(item.id);
        }
        products.push(item);
      }

      if (page.length < pageSize) {
        break;
      }
      offset += page.length;
    }

    return products;
  }

  return {
    [PRODUCTION_RUNTIME_ADAPTER]: true,
    kind: readOnly ? "production_readonly" : "production",
    readOnly,
    _calls: calls,
    ensureStorageAuth,
    storageAuthMeta: () => ({ ...authMeta }),
    fetchAllProducts,
    async fetchLiveCatalog() {
      const [merchant, merchantProducts, allProducts, categoriesRaw] = await Promise.all([
        adminFetch(`/merchants/${TARGET_MERCHANT_ID}`),
        fetchAllProducts({ merchantId: TARGET_MERCHANT_ID }),
        fetchAllProducts(),
        adminFetch("/categories/admin-list"),
      ]);
      return {
        merchant,
        products: merchantProducts,
        allProducts: allProducts,
        categories: asList(categoriesRaw),
      };
    },
    storage: {
      async pathExists(objectPath) {
        await ensureStorageAuth();
        calls.storageReads += 1;
        const parts = objectPath.split("/");
        const name = parts.pop();

        for (let attempt = 1; attempt <= READ_MAX_ATTEMPTS; attempt++) {
          if (attempt > 1) {
            calls.storageReadRetries += 1;
            const delay = READ_RETRY_DELAYS[attempt - 1] || 10000;
            await new Promise((r) => setTimeout(r, delay));
          }
          const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(parts.join("/"), {
            search: name,
            limit: 10,
          });
          if (!error) {
            return (data || []).some((row) => row.name === name);
          }
          const isTransient = isRetryableNetworkError(error) || isRetryableHttpStatus(error?.status || error?.statusCode);
          if (!isTransient || attempt === READ_MAX_ATTEMPTS) {
            throw storageError(error, "STORAGE_LIST_FAILED");
          }
        }
      },
      async upload({ path, body, contentType, upsert }) {
        if (readOnly) return { ok: false, error: "READ_ONLY_ADAPTER_WRITE_BLOCKED" };
        if (upsert !== false) return { ok: false, error: "UPSERT_FORBIDDEN" };
        await ensureStorageAuth();
        calls.storageWrites += 1;
        const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, body, {
          contentType,
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) return { ok: false, error: storageError(error, "STORAGE_UPLOAD_FAILED").message };
        return { ok: true };
      },
      async verifyObject(objectPath, expectedSha, expectedMime = null) {
        await ensureStorageAuth();
        calls.storageReads += 1;

        for (let attempt = 1; attempt <= READ_MAX_ATTEMPTS; attempt++) {
          if (attempt > 1) {
            calls.storageReadRetries += 1;
            const delay = READ_RETRY_DELAYS[attempt - 1] || 10000;
            await new Promise((r) => setTimeout(r, delay));
          }
          const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(objectPath);
          if (error || !data) {
            if (attempt < READ_MAX_ATTEMPTS) {
              continue;
            }
            return { ok: false, remoteSha: null };
          }
          const body = Buffer.from(await data.arrayBuffer());
          const remoteSha = sha256(body);
          const mime = data.type || null;
          return {
            ok: remoteSha === expectedSha && (!expectedMime || !mime || mime === expectedMime),
            remoteSha,
            bytes: body.length,
            mime,
          };
        }
        return { ok: false, remoteSha: null };
      },
    },
    admin: {
      createProduct(payload) {
        return adminFetch("/products", { method: "POST", body: payload });
      },
      getProductById(id) {
        return adminFetch(`/products/${id}?merchant_id=${TARGET_MERCHANT_ID}`);
      },
      async lookupProductBySku(sku) {
        const products = await fetchAllProducts({ merchantId: TARGET_MERCHANT_ID });
        const matches = products.filter(
          (p) => String(p.merchant_sku || "").toUpperCase() === String(sku).toUpperCase(),
        );
        return {
          count: matches.length,
          product: matches.length === 1 ? matches[0] : null,
          ambiguous: matches.length > 1,
          products: matches,
        };
      },
      async getProductBySku(sku) {
        const lookup = await this.lookupProductBySku(sku);
        if (lookup.ambiguous) {
          const error = new Error("SKU_AMBIGUOUS");
          error.code = "SKU_AMBIGUOUS";
          error.count = lookup.count;
          throw error;
        }
        return lookup.product;
      },
      async getProductBySlug(slug) {
        const products = await fetchAllProducts();
        const matches = products.filter((product) => String(product.slug || "") === String(slug));
        if (matches.length > 1) {
          const error = new Error("SLUG_AMBIGUOUS");
          error.code = "SLUG_AMBIGUOUS";
          error.count = matches.length;
          throw error;
        }
        return matches[0] || null;
      },
    },
  };
}

export function createFakeRuntimeAdapters(state = {}) {
  const store = {
    merchant: structuredClone(
      state.merchant || { id: TARGET_MERCHANT_ID, slug: "arth-al-khaleg", status: "draft" },
    ),
    products: structuredClone(state.products || []),
    allProducts: structuredClone(state.allProducts || state.products || []),
    categories: structuredClone(state.categories || []),
    objects: new Map(Object.entries(state.objects || {})),
    calls: {
      storageReads: 0,
      storageWrites: 0,
      adminReads: 0,
      adminWrites: 0,
      upload: [],
      create: [],
      update: [],
    },
    failCreateSku: state.failCreateSku || null,
    indeterminateSku: state.indeterminateSku || null,
    createConflictSku: state.createConflictSku || null,
    createConflictCode: state.createConflictCode || null,
  };
  let nextId = 1;
  const adapters = {
    kind: "fake",
    readOnly: Boolean(state.readOnly),
    _state: store,
    _calls: store.calls,
    async ensureStorageAuth() {
      store.calls.storageReads += 1;
      if (state.storageProbePass === false) throw new Error("STORAGE_SERVER_KEY_PROBE_FAILED");
      return { ok: true, status: 200 };
    },
    storageAuthMeta: () => ({
      storage_key_kind: "fake",
      storage_key_source: "test",
      storage_key_probe: state.storageProbePass === false ? "FAIL" : "PASS",
      storage_key_probe_status: state.storageProbePass === false ? 401 : 200,
      storage_auth_flow: "compatibility_client",
    }),
    async fetchLiveCatalog() {
      store.calls.adminReads += 1;
      return {
        merchant: structuredClone(store.merchant),
        products: structuredClone(store.products),
        allProducts: structuredClone(store.allProducts),
        categories: structuredClone(store.categories),
      };
    },
    storage: {
      async pathExists(objectPath) {
        store.calls.storageReads += 1;
        return store.objects.has(objectPath) || Boolean(state.existingPaths?.includes(objectPath));
      },
      async upload({ path, body, contentType, upsert }) {
        if (adapters.readOnly) return { ok: false, error: "READ_ONLY_ADAPTER_WRITE_BLOCKED" };
        store.calls.storageWrites += 1;
        store.calls.upload.push({ path, contentType, upsert });
        if (upsert !== false) return { ok: false, error: "UPSERT_FORBIDDEN" };
        if (store.objects.has(path)) return { ok: false, error: "ALREADY_EXISTS" };
        const buf = Buffer.from(body);
        store.objects.set(path, { body: buf, sha: sha256(buf), contentType });
        return { ok: true };
      },
      async verifyObject(objectPath, expectedSha, expectedMime = null) {
        store.calls.storageReads += 1;
        const object = store.objects.get(objectPath);
        return {
          ok: Boolean(
            object &&
              object.sha === expectedSha &&
              (!expectedMime || object.contentType === expectedMime),
          ),
          remoteSha: object?.sha || null,
          mime: object?.contentType || null,
        };
      },
    },
    admin: {
      async createProduct(payload) {
        if (adapters.readOnly) throw new Error("READ_ONLY_ADAPTER_WRITE_BLOCKED");
        store.calls.adminWrites += 1;
        store.calls.create.push(structuredClone(payload));
        if (payload.merchant_sku === store.failCreateSku) {
          const e = new Error("ADMIN_HTTP_422");
          e.status = 422;
          throw e;
        }
        if (payload.merchant_sku === store.indeterminateSku) {
          const e = new Error("ADMIN_NETWORK");
          e.indeterminate = true;
          throw e;
        }
        if (payload.merchant_sku === store.createConflictSku) {
          const code = store.createConflictCode || "PRODUCT_MERCHANT_SKU_EXISTS";
          const e = new Error(`ADMIN_HTTP_409:${code}`);
          e.status = 409;
          e.code = code;
          e.backendCode = code;
          throw e;
        }
        // Mirror DB defaults when omitted so tests catch missing private/unpublished wire fields.
        const product = {
          id: `created-${nextId++}`,
          ...structuredClone(payload),
          is_published: payload.is_published ?? true,
          visibility_status: payload.visibility_status ?? "public",
        };
        store.products.push(product);
        store.allProducts.push(product);
        return structuredClone(product);
      },
      async getProductById(id) {
        store.calls.adminReads += 1;
        return structuredClone(store.products.find((p) => p.id === id) || null);
      },
      async lookupProductBySku(sku) {
        store.calls.adminReads += 1;
        const matches = store.products.filter((p) => p.merchant_sku === sku);
        return {
          count: matches.length,
          product: matches.length === 1 ? structuredClone(matches[0]) : null,
          ambiguous: matches.length > 1,
          products: matches.map((product) => structuredClone(product)),
        };
      },
      async getProductBySku(sku) {
        const lookup = await this.lookupProductBySku(sku);
        if (lookup.ambiguous) {
          const error = new Error("SKU_AMBIGUOUS");
          error.code = "SKU_AMBIGUOUS";
          error.count = lookup.count;
          throw error;
        }
        return lookup.product;
      },
      async getProductBySlug(slug) {
        store.calls.adminReads += 1;
        const matches = store.allProducts.filter((product) => product.slug === slug);
        if (matches.length > 1) {
          const error = new Error("SLUG_AMBIGUOUS");
          error.code = "SLUG_AMBIGUOUS";
          error.count = matches.length;
          throw error;
        }
        return matches[0] ? structuredClone(matches[0]) : null;
      },
    },
  };
  return adapters;
}

export { sha256 };
