/**
 * Production connection + authorization gates for private-catalog FIX EXECUTION.
 */
export const EXECUTION_AUTH_TOKEN = "PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED";
export const EXPECTED_PROJECT_REF = "ztplxqlthuqkuktbznbo";
export const REJECTED_STAGING_REF = "zlmdwhuphuxppxznsgso";
export const EXPECTED_SUPABASE_HOST = `${EXPECTED_PROJECT_REF}.supabase.co`;
export const EXPECTED_BACKEND_API = "https://DilMart-store-backend.onrender.com/api";
export const TARGET_MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
export const TARGET_MERCHANT_SLUG = "arth-al-khaleg";
export const EXPECTED_MERCHANT_STATUS = "draft";
export const EXPECTED_PRODUCT_COUNT = 110;
export const EXPECTED_MANIFEST_SHA =
  "9431016FCADE9BB7E4743639D2F2685DBB12DDEABCCDF2F0328B38BD25822728";
export const EXPECTED_CATEGORY_DISTRIBUTION = Object.freeze({
  perfumes: 98,
  "home-linen-air": 8,
  "mini-travel-perfume": 3,
  "musk-oils-mukhammaria": 1,
});
export const PERFUMES_CATEGORY_SLUG = "perfumes";

/**
 * Write authorization: env only. Never self-assign from bare --auth.
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function assertWriteAuthorization(env = process.env) {
  const auth = env.FIX_EXEC_AUTHORIZATION;
  const allow = env.FIX_EXEC_ALLOW_WRITES;
  if (auth == null || String(auth).trim() === "") {
    return {
      ok: false,
      code: "MISSING_AUTHORIZATION",
      message: "FIX_EXEC_AUTHORIZATION required for --execute/--resume",
    };
  }
  if (String(auth) !== EXECUTION_AUTH_TOKEN) {
    return {
      ok: false,
      code: "WRONG_AUTHORIZATION",
      message: "FIX_EXEC_AUTHORIZATION does not match required execution token",
    };
  }
  if (String(allow) !== "1") {
    return {
      ok: false,
      code: "WRITES_FLAG_MISSING",
      message: "FIX_EXEC_ALLOW_WRITES=1 required for --execute/--resume",
    };
  }
  return { ok: true };
}

export function assertProductionConnection({
  supabaseUrl,
  backendApi,
  merchantId,
  merchantSlug,
  merchantStatus,
  productCount,
} = {}) {
  const errors = [];
  let hostname = null;
  try {
    hostname = new URL(String(supabaseUrl || "")).hostname;
  } catch {
    errors.push("INVALID_SUPABASE_URL");
  }
  if (hostname === `${REJECTED_STAGING_REF}.supabase.co`) {
    errors.push("STAGING_PROJECT_REJECTED");
  }
  if (hostname !== EXPECTED_SUPABASE_HOST) {
    errors.push(`WRONG_SUPABASE_PROJECT:${hostname || "null"}`);
  }
  const api = String(backendApi || "").replace(/\/$/, "");
  if (api !== EXPECTED_BACKEND_API) {
    errors.push(`WRONG_BACKEND_API:${api || "null"}`);
  }
  if (merchantId !== TARGET_MERCHANT_ID) {
    errors.push(`WRONG_MERCHANT_ID:${merchantId || "null"}`);
  }
  if (merchantSlug != null && merchantSlug !== TARGET_MERCHANT_SLUG) {
    errors.push(`WRONG_MERCHANT_SLUG:${merchantSlug}`);
  }
  if (merchantStatus != null && merchantStatus !== EXPECTED_MERCHANT_STATUS) {
    errors.push(`WRONG_MERCHANT_STATUS:${merchantStatus}`);
  }
  if (productCount != null && Number(productCount) !== EXPECTED_PRODUCT_COUNT) {
    errors.push(`WRONG_PRODUCT_COUNT:${productCount}`);
  }
  return { ok: errors.length === 0, errors };
}

export function rejectPublishableOrAnonAdminToken(jwtPayload) {
  const role = jwtPayload?.role || jwtPayload?.app_metadata?.role || null;
  if (role === "anon" || role === "service_role") {
    return { ok: false, code: `API_KEY_REJECTED:${role}` };
  }
  if (!jwtPayload?.sub) return { ok: false, code: "MISSING_SUB" };
  return { ok: true, role };
}
