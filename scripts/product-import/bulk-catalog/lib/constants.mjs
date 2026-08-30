/**
 * Bulk-catalog pipeline statuses and safe defaults.
 * Every row must end in exactly one of these statuses.
 */
export const ROW_STATUSES = Object.freeze([
  "READY",
  "SKIP_EXISTING_SKU",
  "REJECT_DUPLICATE",
  "REJECT_REQUIRED_FIELD",
  "REJECT_CATEGORY",
  "REJECT_IMAGE",
  "HOLD_REVIEW",
]);

export const DEFAULT_PRODUCT_STATE = Object.freeze({
  visibility_status: "private",
  is_active: false,
  is_published: false,
  stock: 0,
});

export const BULK_EXEC_AUTHORIZATION = "BULK2200_PIPELINE_EXECUTION_APPROVED";

export const TARGET_MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
export const TARGET_MERCHANT_SLUG = "arth-al-khaleg";
export const TARGET_MERCHANT_STATUS = "draft";
export const FROZEN_BATCH_ID = "batch001";
export const FROZEN_MANIFEST_SHA256 =
  "D5AC84F0FA39F5C962AF882E08EE2C4F8EB9007C2EACCD745C2E3F96D1EE0CDB";
export const FROZEN_SOURCE_SHA256 =
  "36B33F70E0B7FC22142C5DE56A4D841913762C94BBEDB59665499E374B56055F";
export const FROZEN_SELECTED_COUNT = 200;
export const EXPECTED_PREFLIGHT_PRODUCT_COUNT = 110;
export const EXPECTED_POSTFLIGHT_PRODUCT_COUNT = 310;
export const BULK_CANARY_COUNT = 5;

export const FROZEN_BATCH_CONTRACTS = Object.freeze({
  batch001: Object.freeze({
    batchId: "batch001",
    manifestSha: "D5AC84F0FA39F5C962AF882E08EE2C4F8EB9007C2EACCD745C2E3F96D1EE0CDB",
    sourceSha: "36B33F70E0B7FC22142C5DE56A4D841913762C94BBEDB59665499E374B56055F",
    selectedCount: 200,
    currentProductCount: 110,
    postflightProductCount: 310,
    canaryCount: 5,
    /** Merchant status verified at Batch001 preflight time (merchant was in draft). */
    expectedMerchantStatus: "draft",
  }),
  batch002: Object.freeze({
    batchId: "batch002",
    manifestSha: "6A4C5E375316150741F1C9D06E1A035752F6462AB2FB79936C39178F9C4EB191",
    sourceSha: "36B33F70E0B7FC22142C5DE56A4D841913762C94BBEDB59665499E374B56055F",
    selectedCount: 200,
    currentProductCount: 310,
    postflightProductCount: 510,
    canaryCount: 5,
    /**
     * Merchant status verified live at Batch002 operator-credential-closure-002
     * (2026-08-14). Merchant was activated in production between Batch001 and Batch002.
     * This binding is OBSERVATIONAL only — it does NOT authorize merchant activation.
     */
    expectedMerchantStatus: "active",
  }),
  batch003: Object.freeze({
    batchId: "batch003",
    manifestSha: "74E63B66567FC7B4D93AE6A249DE84CD9F0DEEF3965F2E56C9993CEB467F0901",
    sourceSha: "36B33F70E0B7FC22142C5DE56A4D841913762C94BBEDB59665499E374B56055F",
    selectedCount: 300,
    currentProductCount: 510,
    postflightProductCount: 810,
    canaryCount: 5,
    expectedMerchantStatus: "active",
  }),
  batch004: Object.freeze({
    batchId: "batch004",
    manifestSha: "A9896FC2D13B3AFC0F708CF2A8C60D806A3028F3317B287DF72C1EB8DA78E911",
    sourceSha: "36B33F70E0B7FC22142C5DE56A4D841913762C94BBEDB59665499E374B56055F",
    selectedCount: 300,
    currentProductCount: 810,
    postflightProductCount: 1110,
    canaryCount: 5,
    expectedMerchantStatus: "active",
  }),
  batch005: Object.freeze({
    batchId: "batch005",
    manifestSha: "FC88C0BC84F1F4C53CE5175EA2F65AD1A47F967045CFC70B3FA74D0148B6EB4D",
    sourceSha: "36B33F70E0B7FC22142C5DE56A4D841913762C94BBEDB59665499E374B56055F",
    selectedCount: 300,
    currentProductCount: 1110,
    postflightProductCount: 1410,
    canaryCount: 5,
    expectedMerchantStatus: "active",
  }),
  batch006: Object.freeze({
    batchId: "batch006",
    manifestSha: "F395142ED7335E1B4045A3ED3C30EDCBB64D5507A44DE53937ACFF3B0CA80DB7",
    sourceSha: "36B33F70E0B7FC22142C5DE56A4D841913762C94BBEDB59665499E374B56055F",
    selectedCount: 300,
    currentProductCount: 1410,
    postflightProductCount: 1710,
    canaryCount: 5,
    expectedMerchantStatus: "active",
  }),
});

export function resolveBatchContract(batchId = FROZEN_BATCH_ID) {
  const id = String(batchId || "").trim();
  const contract = FROZEN_BATCH_CONTRACTS[id];
  if (!contract) {
    throw new Error(`UNKNOWN_BATCH_ID:${id}`);
  }
  return { ...contract };
}
export const STORAGE_BUCKET = "products";
export const PUBLIC_BASE =
  "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products";

/**
 * Write modes require an explicit later authorization. Inventory/prepare/dry-run never set this.
 */
export function assertBulkExecuteAuthorized(env = process.env) {
  const token = env.BULK2200_EXEC_AUTHORIZATION || env.FIX_EXEC_AUTHORIZATION;
  const allow = String(env.BULK2200_ALLOW_WRITES || env.FIX_EXEC_ALLOW_WRITES || "") === "1";
  if (!token || token !== BULK_EXEC_AUTHORIZATION) {
    return {
      ok: false,
      code: "BULK_EXEC_AUTHORIZATION_REQUIRED",
      message: `execute/resume require BULK2200_EXEC_AUTHORIZATION=${BULK_EXEC_AUTHORIZATION}`,
    };
  }
  if (!allow) {
    return {
      ok: false,
      code: "BULK_EXEC_WRITES_NOT_ALLOWED",
      message: "execute/resume require BULK2200_ALLOW_WRITES=1",
    };
  }
  return { ok: true };
}
