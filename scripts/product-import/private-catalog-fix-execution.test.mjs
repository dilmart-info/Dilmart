/**
 * Private-catalog FIX EXECUTION runtime contract tests (injected fake adapters + CLI spawn).
 *
 * Coverage groups:
 *  - Authorization / gate tests (CLI spawn) — must keep passing.
 *  - Fake-adapter gating for write modes (NODE_ENV=test && FIX_EXEC_TEST_MODE=1 only).
 *  - Backend search-by-name contract proof (createHttpContractAdapters) — SKU never matches.
 *  - First-execute / resume preflight contract (exact SKU cardinality, category enrichment,
 *    full-catalog baseline SHA, resolved-id persistence, indeterminate reconciliation A/B/C,
 *    storage/journal corroboration).
 *  - Storage upload write accounting + canary + resume no re-upload.
 *  - DB update contract: GET-by-id only, collateral-diff protection, stop after
 *    indeterminate/4xx, non-target field verification.
 *  - Postflight exact reconciliation (unaffected 80, HOLD, ARD-1191, category distribution).
 *  - Production read-only adapters buildable without execution authorization.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { spawnSync, execSync } from "node:child_process";
import {
  assertWriteAuthorization,
  EXECUTION_AUTH_TOKEN,
  EXPECTED_SUPABASE_HOST,
} from "./lib/private-catalog-fix-gates.mjs";
import {
  loadResolvedFromDocs,
  runFirstExecutePreflight,
  runResumePreflight,
  runLivePreflight,
  runStorageUploads,
  runDbUpdates,
  runPostflight,
  buildAdminUpdatePayload,
  matchFrozenAgainstProduct,
  matchProposedAgainstProduct,
  classifyIndeterminateLive,
  createJournalSkeleton,
  requireExactSku,
  assertOnlyAllowedPayloadDiffs,
  assertNoPreWriteCollateral,
  summarizeJournalCompletion,
  getActualGitHead,
  BASELINE_FIELDS,
  SEGMENTATION_FIELDS,
  MERCHANDISING_FIELDS,
  EXPECTED_MANIFEST_SHA,
  TARGET_MERCHANT_ID,
  CANARY_SKU,
  QA_HEAD_SHA,
} from "./lib/private-catalog-fix-runtime.mjs";
import {
  createFakeAdapters,
  createHttpContractAdapters,
  createProductionAdapters,
  assertFakeAdaptersAllowedForWrites,
} from "./lib/private-catalog-fix-adapters.mjs";
import { groupUpdatesBySku } from "./lib/private-catalog-fix-execution.mjs";
import { classifyAuthFailure } from "./lib/batch100-storage-auth.mjs";
import {
  validateApprovedHead,
  validateAdminJwtForReadOnly,
  assertCleanWorktreeForExecution,
  writeTmpPreflightEvidence,
} from "./lib/private-catalog-fix-safety.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-fix-plan");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-fix-plan");
const EXEC = path.join(__dirname, "execute-private-catalog-fix.mjs");
const VERIFY = path.join(__dirname, "verify-private-catalog-fix-postflight.mjs");
const GEN = path.join(__dirname, "generate-fix-exec-fake-catalog.mjs");

function spawnExec(args, env = {}) {
  const merged = { ...process.env, ...env };
  for (const key of [
    "FIX_EXEC_FAKE_ADAPTERS_JSON",
    "FIX_EXEC_AUTHORIZATION",
    "FIX_EXEC_ALLOW_WRITES",
    "NODE_ENV",
    "FIX_EXEC_TEST_MODE",
    "FIX_EXEC_APPROVED_HEAD_SHA",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) delete merged[key];
    else if (!env[key]) delete merged[key];
  }
  return spawnSync(process.execPath, [EXEC, ...args], { cwd: ROOT, env: merged, encoding: "utf8" });
}

function spawnVerify(env = {}) {
  const merged = { ...process.env, ...env };
  for (const key of ["FIX_EXEC_FAKE_ADAPTERS_JSON"]) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) delete merged[key];
    else if (!env[key]) delete merged[key];
  }
  return spawnSync(process.execPath, [VERIFY], { cwd: ROOT, env: merged, encoding: "utf8" });
}

function loadFakeState() {
  const out = path.join(TMP, "fake-adapters.json");
  spawnSync(process.execPath, [GEN, out], { cwd: ROOT, encoding: "utf8" });
  return { path: out, state: JSON.parse(fs.readFileSync(out, "utf8")) };
}

// Real Git HEAD of this checkout — CLI-spawned --execute/--resume now bind to it via
// FIX_EXEC_APPROVED_HEAD_SHA (never the frozen QA_HEAD_SHA constant).
const ACTUAL_HEAD_SHA = getActualGitHead(ROOT);

function writeAuthEnv(extra = {}) {
  return {
    FIX_EXEC_AUTHORIZATION: EXECUTION_AUTH_TOKEN,
    FIX_EXEC_ALLOW_WRITES: "1",
    NODE_ENV: "test",
    FIX_EXEC_TEST_MODE: "1",
    FIX_EXEC_APPROVED_HEAD_SHA: ACTUAL_HEAD_SHA,
    ...extra,
  };
}

/** Run first-execute preflight against a fresh journal for direct-function tests. */
async function prepareFirstExecuteJournal(adapters, connection) {
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  journal.head_sha = QA_HEAD_SHA;
  const pre = await runFirstExecutePreflight({ resolved, adapters, connection, journal });
  return { journal, pre };
}

function fakeJwt(payload) {
  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

/** Isolated one-commit temp Git repo for worktree/head-binding helper tests. */
function makeTempGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fix-safety-git-"));
  execSync("git init -q", { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
  execSync("git add -A", { cwd: dir });
  execSync('git commit -q -m "seed"', { cwd: dir });
  const head = execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf8" }).trim();
  return { dir, head };
}

// Hermetic runs: never let a completed journal from a prior run leak into this run's
// --execute/--resume CLI-gating tests.
{
  const journalPath = path.join(TMP, "execution-journal.json");
  if (fs.existsSync(journalPath)) fs.rmSync(journalPath);
}

const resolved = loadResolvedFromDocs(DOCS, ROOT);

test("resolved manifest SHA locked", () => {
  assert.equal(resolved.ok, true, resolved.errors?.join("; "));
  assert.equal(resolved.manifestSha, EXPECTED_MANIFEST_SHA);
  assert.equal(resolved.counts.affected_products, 30);
  assert.equal(resolved.counts.field_changes, 38);
  assert.equal(resolved.counts.replacement_images, 9);
});

// ---------------------------------------------------------------------------
// Authorization / gate tests (CLI spawn) — must keep passing.
// ---------------------------------------------------------------------------

test("1. bare --auth does not authorize (CLI spawn)", () => {
  const r = spawnExec(["--execute", "--auth"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /BARE_AUTH_REJECTED/);
});

test("2. missing env authorization blocks (CLI spawn)", () => {
  const fake = loadFakeState();
  const r = spawnExec(["--execute"], {
    FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path,
    FIX_EXEC_ALLOW_WRITES: "1",
    FIX_EXEC_AUTHORIZATION: "",
    NODE_ENV: "test",
    FIX_EXEC_TEST_MODE: "1",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /MISSING_AUTHORIZATION/);
});

test("3. wrong env authorization blocks (CLI spawn)", () => {
  const fake = loadFakeState();
  const r = spawnExec(["--execute"], {
    FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path,
    FIX_EXEC_ALLOW_WRITES: "1",
    FIX_EXEC_AUTHORIZATION: "PRIVATE_CATALOG_QA_FIX_PLAN_APPROVED",
    NODE_ENV: "test",
    FIX_EXEC_TEST_MODE: "1",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /WRONG_AUTHORIZATION/);
});

test("4. writes flag missing blocks (CLI spawn)", () => {
  const fake = loadFakeState();
  const r = spawnExec(["--execute"], {
    FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path,
    FIX_EXEC_AUTHORIZATION: EXECUTION_AUTH_TOKEN,
    NODE_ENV: "test",
    FIX_EXEC_TEST_MODE: "1",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /WRITES_FLAG_MISSING/);
});

test("5. live preflight unavailable fails (no adapters)", async () => {
  const pre = await runLivePreflight({ resolved, adapters: null, connection: {} });
  assert.equal(pre.ok, false);
  assert.equal(pre.judgment, "LIVE_PREFLIGHT_UNAVAILABLE");
});

test("6. stale/offline products JSON cannot authorize execution (CLI, no adapters)", () => {
  const r = spawnExec(["--execute"], writeAuthEnv({ FIX_EXEC_FAKE_ADAPTERS_JSON: "" }));
  assert.notEqual(r.status, 0);
});

test("assertWriteAuthorization gates", () => {
  assert.equal(assertWriteAuthorization({}).ok, false);
  assert.equal(assertWriteAuthorization({ FIX_EXEC_AUTHORIZATION: EXECUTION_AUTH_TOKEN }).ok, false);
  assert.equal(
    assertWriteAuthorization({ FIX_EXEC_AUTHORIZATION: EXECUTION_AUTH_TOKEN, FIX_EXEC_ALLOW_WRITES: "1" }).ok,
    true,
  );
});

// ---------------------------------------------------------------------------
// Fake-adapter gating for write modes.
// ---------------------------------------------------------------------------

test("7. fake adapters forbidden for --execute without NODE_ENV=test && FIX_EXEC_TEST_MODE=1", () => {
  const fake = loadFakeState();
  const r = spawnExec(["--execute"], {
    FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path,
    FIX_EXEC_AUTHORIZATION: EXECUTION_AUTH_TOKEN,
    FIX_EXEC_ALLOW_WRITES: "1",
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /FAKE_ADAPTERS_FORBIDDEN_IN_WRITE_MODE/);
});

test("8. fake adapters allowed for --preflight without NODE_ENV=test/FIX_EXEC_TEST_MODE", () => {
  const fake = loadFakeState();
  const r = spawnExec(["--preflight"], { FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /LIVE_PREFLIGHT_PASS/);
});

test("assertFakeAdaptersAllowedForWrites unit gate", () => {
  assert.equal(assertFakeAdaptersAllowedForWrites({}).ok, false);
  assert.equal(assertFakeAdaptersAllowedForWrites({ NODE_ENV: "test" }).ok, false);
  assert.equal(assertFakeAdaptersAllowedForWrites({ NODE_ENV: "test", FIX_EXEC_TEST_MODE: "1" }).ok, true);
});

// ---------------------------------------------------------------------------
// Backend search-by-name contract proof — SKU resolution must never use search.
// ---------------------------------------------------------------------------

test("9. Backend search filters name only — merchant_sku never matches via search (contract proof)", async () => {
  // Deliberately minimal, hand-built state: the product's name text does NOT contain its
  // own SKU code, proving that `search=<SKU>` (name ILIKE) cannot be relied on for SKU
  // resolution — GET-by-id (via the exact merchant_sku map) is the only safe path.
  const state = {
    merchant: { id: TARGET_MERCHANT_ID, slug: "arth-al-khaleg", status: "draft" },
    products: [
      {
        id: "id-canary-1",
        merchant_id: TARGET_MERCHANT_ID,
        merchant_sku: CANARY_SKU,
        name: "عطر مميز للاختبار",
        category_id: "cat-perfumes-leaf",
        is_active: false,
        is_published: false,
        visibility_status: "private",
        stock: 0,
      },
    ],
    categories: [{ id: "cat-perfumes-leaf", slug: "perfumes", is_active: true, parent_id: null }],
  };
  const adapters = createHttpContractAdapters(state);
  const bySkuViaSearch = await adapters.admin.resolveSkuViaNameSearch(CANARY_SKU);
  assert.equal(bySkuViaSearch, null, "search=<SKU> must never resolve a product by merchant_sku");

  const catalog = await adapters.fetchLiveCatalog();
  const r = requireExactSku(catalog.skuMap, CANARY_SKU);
  assert.equal(r.ok, true);
  const byId = await adapters.admin.getProductById(r.product.id);
  assert.equal(byId.merchant_sku, CANARY_SKU);
  assert.ok(adapters._fetchLog.some((l) => l.pathname.startsWith("/products/") && l.method === "GET"));
});

// ---------------------------------------------------------------------------
// First-execute preflight contract.
// ---------------------------------------------------------------------------

test("10. Storage path already exists blocks first execution", async () => {
  const fake = loadFakeState();
  const state = fake.state;
  const asset = resolved.assets[0];
  state.pathExistsOverride = { [asset.storage_path]: true };
  const adapters = createFakeAdapters(state);
  const { pre } = await prepareFirstExecuteJournal(adapters, state.connection);
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some((e) => /TARGET_PATH_EXISTS/.test(e)));
});

test("11. exact SKU cardinality 1 resolved for all 30 affected SKUs; ids + baselines persisted", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  assert.equal(Object.keys(pre.resolved_products).length, 30);
  assert.equal(Object.keys(journal.resolved_products).length, 30);
  assert.equal(Object.keys(journal.frozen_baselines).length, 110);
  assert.ok(journal.full_catalog_baseline_sha256);
  assert.ok(journal.perfumes_category_id);
  for (const sku of resolved.skus) {
    assert.ok(journal.resolved_products[sku].id, `missing resolved id for ${sku}`);
    assert.ok(journal.resolved_products[sku].frozen_baseline, `missing frozen baseline for ${sku}`);
  }
});

test("12. first-execute preflight refuses a journal that already has completed entries", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const journal = createJournalSkeleton(resolved.skus);
  journal.entries[0].status = "completed";
  const pre = await runFirstExecutePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some((e) => /JOURNAL_ALREADY_HAS_COMPLETED_ENTRIES/.test(e)));
});

test("13. ARD-775 category resolves to the single active perfumes Leaf", () => {
  const g = groupUpdatesBySku(resolved.fieldRows).find((x) => x.merchant_sku === "ARD-775");
  assert.ok(g.fields.category_slug);
  const live = {
    id: "x",
    name: g.fields.name.current_value,
    slug: g.fields.slug.current_value,
    brand: g.fields.brand.current_value,
    short_description: g.fields.short_description.current_value,
    category_id: "cat-musk",
    category_slug: "musk-oils-mukhammaria",
    sizes: "100 مل",
    images: [g.fields.image_url.current_value],
    image_url: g.fields.image_url.current_value,
    price: 15000,
    stock: 0,
    purchase_price: 0,
    low_stock_threshold: 5,
    is_active: false,
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    loyalty_points_enabled: false,
    merchant_id: TARGET_MERCHANT_ID,
  };
  const payload = buildAdminUpdatePayload(live, g.fields, { perfumesCategoryId: "cat-perfumes-leaf" });
  assert.equal(payload.category_id, "cat-perfumes-leaf");
  assert.equal(payload.brand, "Asdaaf");
  assert.equal(payload.slug, "عطر-سلامة-اسداف-100-مل-ard-775");
});

test("14. safe-state regression fails first-execute preflight", async () => {
  const fake = loadFakeState();
  const state = fake.state;
  state.products[0].is_active = true;
  const adapters = createFakeAdapters(state);
  const { pre } = await prepareFirstExecuteJournal(adapters, state.connection);
  assert.equal(pre.ok, false);
});

test("15. frozen current mismatch causes zero writes (CLI spawn stops at live preflight)", async () => {
  const fake = loadFakeState();
  const state = structuredClone(fake.state);
  const p = state.products.find((x) => x.merchant_sku === "ARD-2793");
  p.image_url = "https://example.invalid/tampered.webp";
  p.images = [p.image_url];
  const adapters = createFakeAdapters(state);
  const { pre } = await prepareFirstExecuteJournal(adapters, state.connection);
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some((e) => /CURRENT_MISMATCH:ARD-2793/.test(e)));

  const tamperedPath = path.join(TMP, "fake-adapters-tampered.json");
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(tamperedPath, JSON.stringify(state));
  const r = spawnExec(["--execute"], writeAuthEnv({ FIX_EXEC_FAKE_ADAPTERS_JSON: tamperedPath }));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /CURRENT_MISMATCH:ARD-2793/);
  const journalPath = path.join(TMP, "execution-journal.json");
  if (fs.existsSync(journalPath)) {
    const j = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    const uploaded = (j.entries || []).filter((e) => e.upload_status === "uploaded_verified");
    assert.equal(uploaded.length, 0);
  }
});

test("16. HOLD or ARD-1191 mutation fails (scope) — never in resolved manifest", () => {
  assert.equal(resolved.skus.includes("ARD-1191"), false);
  assert.equal(resolved.skus.includes("ARD-4300"), false);
  assert.equal(resolved.skus.includes("ARD-4750"), false);
  assert.equal(resolved.skus.includes("ARD-4751"), false);
  assert.equal(resolved.skus.includes("ARD-4807"), false);
});

// ---------------------------------------------------------------------------
// Collateral-diff protection on Admin update payloads.
// ---------------------------------------------------------------------------

test("buildAdminUpdatePayload forbids price field", () => {
  assert.throws(() =>
    buildAdminUpdatePayload(
      {
        name: "n",
        slug: "s",
        price: 1,
        stock: 0,
        purchase_price: 0,
        low_stock_threshold: 5,
        is_active: false,
        is_featured: false,
        is_new: false,
        is_best_seller: false,
        loyalty_points_enabled: false,
        images: [],
        sizes: [],
      },
      { price: { current_value: "1", proposed_value: "2" } },
    ),
  );
});

test("17. assertOnlyAllowedPayloadDiffs rejects collateral diffs outside requested fields", () => {
  const before = { name: "A", short_description: "x", price: 100 };
  const after = { name: "B", short_description: "x", price: 999 };
  const result = assertOnlyAllowedPayloadDiffs(before, after, { name: {} });
  assert.equal(result.ok, false);
  assert.ok(result.unexpected.includes("price"));

  const clean = assertOnlyAllowedPayloadDiffs(before, { ...before, name: "B" }, { name: {} });
  assert.equal(clean.ok, true);
});

// ---------------------------------------------------------------------------
// Storage upload write accounting + canary + resume no re-upload.
// ---------------------------------------------------------------------------

test("18. canary failure causes zero DB updates; accounting reflects the attempted upload", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters({ ...fake.state, failCanary: true });
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage.allow_db, false);
  assert.equal(storage.write_accounting.storage_upload_attempted >= 1, true);
  // An upload attempt reached the Storage adapter even though it failed — accounting must
  // reflect that a real write attempt happened, never a hardcoded "no writes occurred".
  assert.equal(storage.write_accounting.production_storage_writes, true);
  assert.equal(storage.write_accounting.storage_upload_succeeded, 0);
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: storage.allow_db });
  assert.equal(db.updates, 0);
});

test("19. 8/9 uploads causes zero DB updates", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters({ ...fake.state, failUploadSku: "ARD-823" });
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage.verified_count < 9, true);
  assert.equal(storage.allow_db, false);
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: false });
  assert.equal(db.updates, 0);
});

test("20. remote SHA mismatch causes zero DB updates", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters({ ...fake.state, shaMismatchSku: CANARY_SKU });
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage.allow_db, false);
});

test("21. resume does not re-upload an already-verified image", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal } = await prepareFirstExecuteJournal(adapters, fake.state.connection);

  const asset = resolved.assets.find((a) => a.merchant_sku === CANARY_SKU);
  const local = path.join(ROOT, asset.local_asset_path);
  const buf = fs.readFileSync(local);
  adapters._state.objects.set(asset.storage_path, { buf, sha: asset.sha256, contentType: "image/webp" });
  const imgEntry = journal.entries.find((e) => e.merchant_sku === CANARY_SKU);
  imgEntry.upload_status = "uploaded_verified";

  const uploadsBefore = adapters._state.uploadCalls.length;
  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "resume", root: ROOT });
  const canaryRes = storage.results.find((r) => r.merchant_sku === CANARY_SKU);
  assert.equal(canaryRes.upload_status, "already_verified_resume");
  const canaryUploads = adapters._state.uploadCalls.filter((c) => c.path === asset.storage_path);
  assert.equal(canaryUploads.length, uploadsBefore);
});

// ---------------------------------------------------------------------------
// DB update contract: GET-by-id only, stop after indeterminate/4xx, nontarget verification.
// ---------------------------------------------------------------------------

test("22. 30 grouped API updates, 38 fields, resolved exclusively via GET-by-id (never search)", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.judgment, "LIVE_PREFLIGHT_PASS", pre.errors?.join("; "));

  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage.allow_db, true, storage.stop_reason);

  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  assert.equal(db.ok, true, JSON.stringify(db.results.filter((r) => r.apply_status !== "completed")));
  assert.equal(db.updates, 30);
  assert.equal(adapters._state.updateCalls.length, 30);
  const skus = new Set(adapters._state.updateCalls.map((c) => c.merchant_sku));
  assert.equal(skus.size, 30);
  assert.equal(adapters._state.searchCalls.length, 0, "runtime must never call name search to resolve a SKU");

  let fields = 0;
  for (const g of groupUpdatesBySku(resolved.fieldRows)) fields += Object.keys(g.fields).length;
  assert.equal(fields, 38);
  assert.equal(journal.write_accounting.db_update_verified, 30);
});

test("23. API timeout marks indeterminate and stops subsequent SKU processing", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters({ ...fake.state, timeoutSku: "ARD-4680" });
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage.allow_db, true);
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });

  const idx = db.results.findIndex((r) => r.merchant_sku === "ARD-4680");
  assert.equal(db.results[idx].apply_status, "indeterminate");
  const je = journal.entries.find((e) => e.merchant_sku === "ARD-4680");
  assert.equal(je.status, "indeterminate");
  assert.equal(db.stopped_early, true);
  const after = db.results.slice(idx + 1);
  assert.ok(after.length > 0);
  assert.ok(after.every((r) => r.apply_status === "skipped_stopped_early"));
});

test("24. unknown Admin response is treated as indeterminate and stops (inspect before retry)", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters({ ...fake.state, unknownSku: "ARD-4792" });
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  assert.equal(db.results.find((r) => r.merchant_sku === "ARD-4792").apply_status, "indeterminate");
  assert.equal(db.stopped_early, true);
});

test("25. definite 4xx Admin response stops subsequent SKU processing", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const targetSku = "ARD-4680";
  const originalUpdate = adapters.admin.updateProduct.bind(adapters.admin);
  adapters.admin.updateProduct = async (id, payload) => {
    const p = adapters._state.products.find((x) => x.id === id);
    if (p && p.merchant_sku === targetSku) {
      const e = new Error("ADMIN_HTTP_422");
      e.status = 422;
      throw e;
    }
    return originalUpdate(id, payload);
  };
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  const row = db.results.find((r) => r.merchant_sku === targetSku);
  assert.equal(row.apply_status, "failed_update");
  assert.equal(row.status, 422);
  assert.equal(db.stopped_early, true);
});

test("26. non-target field mutation surfaced on post-write GET fails that SKU", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const targetSku = "ARD-4680";
  const callCounts = new Map();
  const originalGetById = adapters.admin.getProductById.bind(adapters.admin);
  adapters.admin.getProductById = async (id) => {
    const result = await originalGetById(id);
    if (result?.merchant_sku === targetSku) {
      const n = (callCounts.get(id) || 0) + 1;
      callCounts.set(id, n);
      if (n === 2) return { ...result, price: Number(result.price) + 1 };
    }
    return result;
  };
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  const row = db.results.find((r) => r.merchant_sku === targetSku);
  assert.equal(row.apply_status, "failed_nontarget_field_changed");
  assert.ok(row.mismatches.some((m) => m.field === "price"));
});

test("27. resume skips completed SKUs and refuses to touch unverified pending SKUs", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  const entry = journal.entries.find((e) => e.merchant_sku === "ARD-1369");
  entry.status = "completed";
  const otherEntry = journal.entries.find((e) => e.merchant_sku === "ARD-1480");
  otherEntry.frozen_current_verified = false;

  const db = await runDbUpdates({ resolved, adapters, journal, mode: "resume", allowDb: true });
  assert.ok(db.results.some((r) => r.merchant_sku === "ARD-1369" && r.apply_status === "skipped_completed"));
  assert.ok(db.results.some((r) => r.merchant_sku === "ARD-1480" && r.apply_status === "skipped_unverified_pending"));
});

// ---------------------------------------------------------------------------
// Resume preflight: manifest/head SHA gates + indeterminate reconciliation A/B/C
// + storage/journal corroboration.
// ---------------------------------------------------------------------------

test("28. resume blocked when journal manifest SHA does not match the resolved manifest", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  journal.manifest_sha256 = "0".repeat(64);
  const pre = await runResumePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some((e) => /JOURNAL_MANIFEST_SHA_MISMATCH/.test(e)));
});

test("29. journal.head_sha is historical QA metadata only and never blocks resume (QA_HEAD_SHA gating removed)", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  journal.head_sha = "deadbeef";
  // No enforceHeadBinding requested here, so the actual Git-HEAD binding gate (see the
  // dedicated head-binding test section below) does not apply either — resume proceeds.
  const pre = await runResumePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(pre.ok, true, pre.errors?.join("; "));
});

test("30. resume reconciles an indeterminate SKU as completed (classification A) via GET-by-id", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const g = groupUpdatesBySku(resolved.fieldRows).find((x) => x.merchant_sku === "ARD-1858");
  const p = adapters._state.products.find((x) => x.merchant_sku === "ARD-1858");
  p.short_description = g.fields.short_description.proposed_value;
  const entry = journal.entries.find((e) => e.merchant_sku === "ARD-1858");
  entry.status = "indeterminate";

  const resumePre = await runResumePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(resumePre.ok, true, resumePre.errors?.join("; "));
  assert.equal(resumePre.classifications["ARD-1858"].classification, "A");
  assert.equal(entry.status, "completed");
});

test("31. resume reconciles an indeterminate SKU as pending (classification B) via GET-by-id", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const entry = journal.entries.find((e) => e.merchant_sku === "ARD-1858");
  entry.status = "indeterminate";

  const resumePre = await runResumePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(resumePre.ok, true, resumePre.errors?.join("; "));
  assert.equal(resumePre.classifications["ARD-1858"].classification, "B");
  assert.equal(entry.status, "pending");
  assert.equal(entry.frozen_current_verified, true);
});

test("32. resume blocks on a conflicting mixed classification (classification C)", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const g = groupUpdatesBySku(resolved.fieldRows).find((x) => x.merchant_sku === "ARD-775");
  const p = adapters._state.products.find((x) => x.merchant_sku === "ARD-775");
  // Apply only the `name` field to the proposed value; leave brand/slug/category_slug frozen.
  p.name = g.fields.name.proposed_value;
  const entry = journal.entries.find((e) => e.merchant_sku === "ARD-775");
  entry.status = "indeterminate";

  const resumePre = await runResumePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(resumePre.ok, false);
  assert.ok(resumePre.errors.some((e) => /INDETERMINATE_CONFLICT:ARD-775/.test(e)));
  assert.equal(resumePre.classifications["ARD-775"].classification, "C");
});

test("33. resume blocks when DB classification disagrees with Storage journal evidence", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const g = groupUpdatesBySku(resolved.fieldRows).find((x) => x.merchant_sku === "ARD-2932");
  const p = adapters._state.products.find((x) => x.merchant_sku === "ARD-2932");
  // DB shows proposed (classification A) but Storage journal never recorded a verified upload.
  p.image_url = g.fields.image_url.proposed_value;
  p.images = [p.image_url];
  const entry = journal.entries.find((e) => e.merchant_sku === "ARD-2932");
  entry.status = "indeterminate";
  entry.upload_status = "failed";

  const resumePre = await runResumePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(resumePre.ok, false);
  assert.ok(resumePre.errors.some((e) => /STORAGE_JOURNAL_CORROBORATION_FAILED:ARD-2932/.test(e)));
});

test("classifyIndeterminateLive direct unit coverage", () => {
  const fields = { name: { current_value: "old", proposed_value: "new" } };
  const proposedProduct = { name: "new" };
  const frozenProduct = { name: "old" };
  const neitherProduct = { name: "other" };
  assert.equal(classifyIndeterminateLive(proposedProduct, fields).classification, "A");
  assert.equal(classifyIndeterminateLive(frozenProduct, fields).classification, "B");
  assert.equal(classifyIndeterminateLive(neitherProduct, fields).classification, "C");
});

// ---------------------------------------------------------------------------
// Postflight exact reconciliation.
// ---------------------------------------------------------------------------

test("34. postflight passes with exact unaffected-80 / HOLD / ARD-1191 reconciliation + category dist", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage.allow_db, true, storage.stop_reason);
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  assert.equal(db.ok, true, JSON.stringify(db.results.filter((r) => r.apply_status !== "completed")));

  const post = await runPostflight({ resolved, adapters, journal });
  assert.equal(post.ok, true, post.errors?.join("; "));
  assert.equal(post.proposed_matches, 30);
  assert.equal(post.field_verified, 38);
  assert.equal(post.images_verified, 9);
  assert.equal(post.unaffected_checked, 80);
  assert.equal(post.unaffected_exact_matches, 80);
  assert.equal(post.hold_unchanged, 4);
  assert.equal(post.ard_1191_unchanged, true);
  assert.deepEqual(post.distribution, {
    perfumes: 98,
    "home-linen-air": 8,
    "mini-travel-perfume": 3,
    "musk-oils-mukhammaria": 1,
  });
});

test("35. unaffected product mutation fails postflight exactly", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });

  const fill = adapters._state.products.find((p) => String(p.merchant_sku).startsWith("FILL-"));
  fill.price = 1;

  const post = await runPostflight({ resolved, adapters, journal });
  assert.equal(post.ok, false);
  assert.ok(post.errors.some((e) => /UNAFFECTED_BASELINE_MISMATCH/.test(e)));
});

test("36. HOLD SKU mutation fails postflight explicitly", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });

  const hold = adapters._state.products.find((p) => p.merchant_sku === "ARD-4300");
  hold.name = "MUTATED";

  const post = await runPostflight({ resolved, adapters, journal });
  assert.equal(post.ok, false);
  assert.ok(post.errors.some((e) => /HOLD_MUTATED:ARD-4300/.test(e)));
  assert.equal(post.hold_unchanged, 3);
});

test("37. ARD-1191 mutation fails postflight explicitly", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });

  const ard1191 = adapters._state.products.find((p) => p.merchant_sku === "ARD-1191");
  ard1191.short_description = "MUTATED";

  const post = await runPostflight({ resolved, adapters, journal });
  assert.equal(post.ok, false);
  assert.ok(post.errors.some((e) => /ARD_1191_MUTATED:ARD-1191/.test(e)));
  assert.equal(post.ard_1191_unchanged, false);
});

test("38. postflight proposed matches 29/30 fails", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });

  const p = adapters._state.products.find((x) => x.merchant_sku === "ARD-1858");
  p.short_description = "WRONG";
  const post = await runPostflight({ resolved, adapters, journal });
  assert.equal(post.ok, false);
  assert.equal(post.proposed_matches, 29);
});

test("39. postflight missing live input fails (CLI spawn)", () => {
  const r = spawnVerify({});
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /LIVE_INPUT_REQUIRED|JOURNAL_MISSING/);
});

test("40. secrets are scrubbed from journal and evidence", async () => {
  const { scrubSecrets } = await import("./lib/private-catalog-fix-plan.mjs");
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb";
  assert.match(scrubSecrets(`token ${jwt}`), /REDACTED_JWT/);
  assert.doesNotMatch(scrubSecrets(`token ${jwt}`), /eyJhbGci/);
});

// ---------------------------------------------------------------------------
// CLI end-to-end + write accounting accuracy.
// ---------------------------------------------------------------------------

test("41. CLI live preflight PASS with fake adapters", () => {
  const fake = loadFakeState();
  const r = spawnExec(["--preflight"], { FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /LIVE_PREFLIGHT_PASS/);
  assert.match(r.stdout, /"checked_live": true/);
});

test("42. CLI --execute happy path reports accurate write accounting", () => {
  // Note: fake adapters are JSON-file-backed and rebuilt fresh per process, so a spawned
  // --execute subprocess's in-memory mutations are not visible to a second spawned
  // --postflight subprocess reading the same static fixture file. The full execute→postflight
  // reconciliation loop (against the SAME adapter instance) is covered directly by test 34.
  const fake = loadFakeState();
  const journalPath = path.join(TMP, "execution-journal.json");
  if (fs.existsSync(journalPath)) fs.rmSync(journalPath);

  const r = spawnExec(["--execute"], writeAuthEnv({ FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path }));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.api_updates, 30);
  assert.equal(out.production_storage_writes, true);
  assert.equal(out.production_db_writes, true);
  assert.equal(out.write_accounting.storage_verified, 9);
  assert.equal(out.write_accounting.db_update_verified, 30);

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  assert.equal(journal.entries.filter((e) => e.status === "completed").length, 30);
  assert.ok(journal.resolved_products && Object.keys(journal.resolved_products).length === 30);
  assert.ok(journal.frozen_baselines && Object.keys(journal.frozen_baselines).length === 110);
});

test("43. CLI --execute failure after partial writes reports true accounting (never hardcoded false)", () => {
  const fake = loadFakeState();
  fake.state.timeoutSku = "ARD-4680";
  const tamperedPath = path.join(TMP, "fake-adapters-timeout.json");
  fs.writeFileSync(tamperedPath, JSON.stringify(fake.state));
  const journalPath = path.join(TMP, "execution-journal.json");
  if (fs.existsSync(journalPath)) fs.rmSync(journalPath);

  const r = spawnExec(["--execute"], writeAuthEnv({ FIX_EXEC_FAKE_ADAPTERS_JSON: tamperedPath }));
  assert.notEqual(r.status, 0);
  const out = JSON.parse(r.stderr || r.stdout);
  assert.equal(out.ok, false);
  // Storage succeeded fully (9/9 verified) even though DB stopped early — must not be hardcoded false.
  assert.equal(out.production_storage_writes, true);
  assert.equal(out.write_accounting.storage_verified, 9);
});

test("44. createProductionAdapters(readOnly:true) buildable without execution authorization; blocks writes", async () => {
  const jwt = fakeJwt({ sub: "admin-uid-1", role: "authenticated" });
  const adapters = createProductionAdapters({
    supabaseUrl: `https://${EXPECTED_SUPABASE_HOST}`,
    serverKey: `sb_secret_${"x".repeat(24)}`,
    adminJwt: jwt,
    readOnly: true,
  });
  assert.equal(adapters.kind, "production_readonly");
  assert.equal(adapters.readOnly, true);

  const up = await adapters.storage.upload({ path: "x", body: Buffer.from("a"), contentType: "image/webp", upsert: false });
  assert.equal(up.ok, false);
  assert.equal(up.error, "READ_ONLY_ADAPTER_WRITE_BLOCKED");

  await assert.rejects(() => adapters.admin.updateProduct("id", {}), /READ_ONLY_ADAPTER_WRITE_BLOCKED/);
});

// ---------------------------------------------------------------------------
// FINAL SAFETY PATCH — execution head binding (actual Git HEAD, never QA_HEAD_SHA).
// ---------------------------------------------------------------------------

test("45. getActualGitHead returns the actual repository HEAD sha", () => {
  const sha = getActualGitHead(ROOT);
  assert.match(sha, /^[0-9a-f]{40}$/);
});

test("46. first-execute head binding: missing FIX_EXEC_APPROVED_HEAD_SHA fails APPROVED_HEAD_REQUIRED", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  const pre = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: {},
    enforceHeadBinding: true,
  });
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some((e) => /APPROVED_HEAD_REQUIRED/.test(e)));
});

test("47. first-execute head binding: mismatched FIX_EXEC_APPROVED_HEAD_SHA fails APPROVED_HEAD_MISMATCH", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  const pre = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: "0".repeat(40) },
    getActualHeadShaFn: () => "1".repeat(40),
    enforceHeadBinding: true,
  });
  assert.equal(pre.ok, false);
  assert.ok(pre.errors.some((e) => /APPROVED_HEAD_MISMATCH/.test(e)));
});

test("48. first-execute head binding success records journal.execution_head_sha", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  const stubHead = "a".repeat(40);
  const pre = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: stubHead },
    getActualHeadShaFn: () => stubHead,
    enforceHeadBinding: true,
  });
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  assert.equal(journal.execution_head_sha, stubHead);
});

test("49. resume head binding: actual Git HEAD drift from journal.execution_head_sha fails RESUME_HEAD_MISMATCH", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const stubHead = "a".repeat(40);
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  const pre = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: stubHead },
    getActualHeadShaFn: () => stubHead,
    enforceHeadBinding: true,
  });
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const resumePre = await runResumePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: stubHead },
    getActualHeadShaFn: () => "b".repeat(40), // repo checked out a different commit
    enforceHeadBinding: true,
  });
  assert.equal(resumePre.ok, false);
  assert.ok(resumePre.errors.some((e) => /RESUME_HEAD_MISMATCH/.test(e)));
});

test("50. resume head binding: FIX_EXEC_APPROVED_HEAD_SHA must equal journal.execution_head_sha (APPROVED_HEAD_MISMATCH)", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const stubHead = "a".repeat(40);
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  const pre = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: stubHead },
    getActualHeadShaFn: () => stubHead,
    enforceHeadBinding: true,
  });
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const resumePre = await runResumePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: "c".repeat(40) },
    getActualHeadShaFn: () => stubHead,
    enforceHeadBinding: true,
  });
  assert.equal(resumePre.ok, false);
  assert.ok(resumePre.errors.some((e) => /APPROVED_HEAD_MISMATCH/.test(e)));
});

// ---------------------------------------------------------------------------
// FINAL SAFETY PATCH — resume completion accounting.
// ---------------------------------------------------------------------------

test("51. resume completion accounting: 12 completed + reconciled indeterminate + 17 untouched pending -> resume completes remaining 18, ok=true, completed=30, no duplicate updates", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const grouped = groupUpdatesBySku(resolved.fieldRows);
  const sku13 = grouped[12].merchant_sku;
  const first12 = grouped.slice(0, 12).map((g) => g.merchant_sku);

  const stubHead = "d".repeat(40);
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  const pre = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: stubHead },
    getActualHeadShaFn: () => stubHead,
    enforceHeadBinding: true,
  });
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage.allow_db, true, storage.stop_reason);

  adapters._state.timeoutSku = sku13;
  const firstDb = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  assert.equal(firstDb.stopped_early, true);
  assert.equal(firstDb.metrics.db_updates_this_run, 12);
  assert.equal(journal.entries.filter((e) => e.status === "completed").length, 12);
  assert.equal(journal.entries.find((e) => e.merchant_sku === sku13).status, "indeterminate");
  adapters._state.timeoutSku = null; // the 13th SKU's update never actually landed

  const resumePre = await runResumePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: stubHead },
    getActualHeadShaFn: () => stubHead,
    enforceHeadBinding: true,
  });
  assert.equal(resumePre.ok, true, resumePre.errors?.join("; "));
  assert.equal(resumePre.classifications[sku13].classification, "B");
  assert.equal(journal.entries.find((e) => e.merchant_sku === sku13).status, "pending");

  const verifiedPending = journal.entries.filter((e) => e.status === "pending" && e.frozen_current_verified === true);
  assert.equal(verifiedPending.length, 18);

  const resumeDb = await runDbUpdates({ resolved, adapters, journal, mode: "resume", allowDb: true });
  assert.equal(
    resumeDb.ok,
    true,
    JSON.stringify(resumeDb.results.filter((r) => !["completed", "skipped_completed"].includes(r.apply_status))),
  );
  assert.equal(resumeDb.metrics.db_updates_this_run, 18);
  assert.equal(resumeDb.metrics.completed_before_resume, 12);
  assert.equal(resumeDb.metrics.completed_after_resume, 30);
  assert.equal(resumeDb.metrics.db_updates_total_verified, 30);
  assert.equal(journal.entries.filter((e) => e.status === "completed").length, 30);
  assert.equal(resumeDb.completion_summary.pending, 0);
  assert.equal(resumeDb.completion_summary.failed, 0);
  assert.equal(resumeDb.completion_summary.indeterminate, 0);
  assert.equal(resumeDb.completion_summary.fields_verified, 38);
  assert.equal(resumeDb.completion_summary.images_verified, 9);

  const updateCounts = new Map();
  for (const c of adapters._state.updateCalls) {
    updateCounts.set(c.merchant_sku, (updateCounts.get(c.merchant_sku) || 0) + 1);
  }
  for (const sku of first12) {
    assert.equal(updateCounts.get(sku), 1, `${sku} must not be updated twice`);
  }
  assert.equal(adapters._state.updateCalls.length, 30);
});

// ---------------------------------------------------------------------------
// FINAL SAFETY PATCH — canonical image journal.
// ---------------------------------------------------------------------------

test("52. canonical image journal: execute 9 uploads; first resume verify no upload; DB fails; second resume verify no upload; uploadCalls stays 9 throughout", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const storage1 = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage1.allow_db, true, storage1.stop_reason);
  assert.equal(adapters._state.uploadCalls.length, 9);
  const imageSkus = new Set(resolved.assets.map((a) => a.merchant_sku));
  const imageEntries = () => journal.entries.filter((e) => imageSkus.has(e.merchant_sku));
  assert.equal(imageEntries().length, 9);
  for (const e of imageEntries()) assert.equal(e.upload_status, "uploaded_verified");

  const storage2 = await runStorageUploads({ resolved, adapters, journal, mode: "resume", root: ROOT });
  assert.equal(adapters._state.uploadCalls.length, 9, "first resume must never re-upload");
  for (const r of storage2.results) assert.equal(r.upload_status, "already_verified_resume");
  for (const e of imageEntries()) {
    assert.equal(e.upload_status, "uploaded_verified", "canonical status must never be overwritten by a resume-only verify");
  }

  // DB fails — Storage canonical state must be completely unaffected by whatever
  // happens to the DB.
  adapters._state.http500Sku = "ARD-4680";
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  assert.equal(db.stopped_early, true);
  adapters._state.http500Sku = null;

  const storage3 = await runStorageUploads({ resolved, adapters, journal, mode: "resume", root: ROOT });
  assert.equal(adapters._state.uploadCalls.length, 9, "second resume must never re-upload");
  for (const r of storage3.results) assert.equal(r.upload_status, "already_verified_resume");
  for (const e of imageEntries()) assert.equal(e.upload_status, "uploaded_verified");
});

// ---------------------------------------------------------------------------
// FINAL SAFETY PATCH — Storage/DB corroboration for image SKUs (classification A/B).
// ---------------------------------------------------------------------------

test("53. resume classification B is not a Storage/DB conflict — DB frozen retries via DB only, never re-uploads, even though Storage independently shows uploaded_verified", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const storage = await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  assert.equal(storage.allow_db, true, storage.stop_reason);

  // ARD-2932's image is genuinely uploaded + verified in Storage, but its DB row never
  // updated (still frozen) — simulate an indeterminate outcome directly on the journal.
  const entry = journal.entries.find((e) => e.merchant_sku === "ARD-2932");
  assert.equal(entry.upload_status, "uploaded_verified");
  entry.status = "indeterminate";

  const uploadCallsBefore = adapters._state.uploadCalls.length;
  const resumePre = await runResumePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(resumePre.ok, true, resumePre.errors?.join("; "));
  assert.equal(resumePre.classifications["ARD-2932"].classification, "B");
  assert.equal(entry.status, "pending");
  assert.equal(entry.frozen_current_verified, true);

  await runStorageUploads({ resolved, adapters, journal, mode: "resume", root: ROOT });
  assert.equal(adapters._state.uploadCalls.length, uploadCallsBefore, "classification B must never trigger a re-upload");
  assert.equal(entry.upload_status, "uploaded_verified");

  const db = await runDbUpdates({ resolved, adapters, journal, mode: "resume", allowDb: true });
  const row = db.results.find((r) => r.merchant_sku === "ARD-2932");
  assert.equal(row.apply_status, "completed");
});

test("54. resume classification A requires Storage object existence + SHA match, not just the journal flag", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));

  const g = groupUpdatesBySku(resolved.fieldRows).find((x) => x.merchant_sku === "ARD-2932");
  const p = adapters._state.products.find((x) => x.merchant_sku === "ARD-2932");
  p.image_url = g.fields.image_url.proposed_value; // DB shows proposed (classification A)
  p.images = [p.image_url];

  const entry = journal.entries.find((e) => e.merchant_sku === "ARD-2932");
  entry.status = "indeterminate";
  // The journal flag claims uploaded_verified, but no Storage object was ever actually
  // written for this path — corroboration must fail closed regardless of the flag.
  entry.upload_status = "uploaded_verified";

  const resumePre = await runResumePreflight({ resolved, adapters, connection: fake.state.connection, journal });
  assert.equal(resumePre.ok, false);
  assert.ok(resumePre.errors.some((e) => /STORAGE_JOURNAL_CORROBORATION_FAILED:ARD-2932/.test(e)));
});

// ---------------------------------------------------------------------------
// FINAL SAFETY PATCH — pre-POST semantic collateral.
// ---------------------------------------------------------------------------

test("55. assertNoPreWriteCollateral flags a real semantic collateral change on a non-target field", () => {
  const live = {
    name: "n",
    slug: "s",
    description: null,
    short_description: "sd",
    category_id: "cat-1",
    purchase_price: null,
    low_stock_threshold: 5,
    is_active: false,
    is_featured: null,
    is_new: false,
    is_best_seller: false,
    offer_ends_at: null,
    images: [],
    loyalty_points_enabled: null,
    brand: "  Lattafa  ",
    colors: null,
    sizes: "100 مل",
    dimensions: null,
    weight_grams: null,
  };
  const payload = {
    name: "n",
    slug: "s",
    description: "a real different description", // genuine collateral change
    short_description: "sd",
    category_id: "cat-1",
    purchase_price: 0,
    low_stock_threshold: 5,
    is_active: false,
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    offer_ends_at: null,
    images: [],
    loyalty_points_enabled: false,
    brand: "Lattafa",
    colors: [],
    sizes: ["100 مل"],
    dimensions: null,
    weight_grams: 0,
  };
  const result = assertNoPreWriteCollateral(live, payload, { name: {} });
  assert.equal(result.ok, false);
  assert.ok(result.collateral.some((c) => c.field === "description"));
  assert.equal(result.collateral.length, 1, JSON.stringify(result.collateral));
});

test("56. assertNoPreWriteCollateral tolerates null/0/false/[] equivalences and trims brand/colors/dimensions/sizes representation", () => {
  const live = {
    name: "n",
    description: null,
    purchase_price: null,
    is_featured: null,
    images: null,
    colors: null,
    brand: "  Lattafa ",
    sizes: ["100 مل"],
    dimensions: null,
    weight_grams: null,
  };
  const payload = {
    name: "n",
    description: "",
    purchase_price: 0,
    is_featured: false,
    images: [],
    colors: [],
    brand: "Lattafa",
    sizes: "100 مل",
    dimensions: null,
    weight_grams: 0,
  };
  const result = assertNoPreWriteCollateral(live, payload, { name: {} });
  assert.equal(result.ok, true, JSON.stringify(result.collateral));
});

test("57. runDbUpdates stops a SKU with failed_pre_write_collateral_diff before POST when a malformed live field would be silently corrupted by the payload builder", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const targetSku = "ARD-4680";
  const originalGetById = adapters.admin.getProductById.bind(adapters.admin);
  adapters.admin.getProductById = async (id) => {
    const result = await originalGetById(id);
    if (result?.merchant_sku === targetSku) {
      // Malformed live `sizes` (neither string nor array). The payload builder's naive
      // coercion (`!Array.isArray(sizes) => []`) would silently drop it to an empty array
      // — a real collateral change that a basePayload/nextPayload-only comparison could
      // never catch, because both sides would already show the same coerced [].
      return { ...result, sizes: 12345 };
    }
    return result;
  };
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  const row = db.results.find((r) => r.merchant_sku === targetSku);
  assert.equal(row.apply_status, "failed_pre_write_collateral_diff");
  assert.ok(row.collateral.some((c) => c.field === "sizes"));
  assert.ok(!adapters._state.updateCalls.some((c) => c.merchant_sku === targetSku));
});

// ---------------------------------------------------------------------------
// FINAL SAFETY PATCH — expanded full-catalog baseline.
// ---------------------------------------------------------------------------

test("58. BASELINE_FIELDS includes the expanded full-catalog field set", () => {
  for (const f of [
    "colors",
    "dimensions",
    "weight_grams",
    "offer_ends_at",
    "target_audience",
    "business_type_tags",
    "product_use_cases",
    "visible_in",
    "purchase_mode",
    "is_b2b_offer",
    "requires_verified_salon",
    "min_order_qty",
    "max_order_qty",
  ]) {
    assert.ok(BASELINE_FIELDS.includes(f), `BASELINE_FIELDS missing ${f}`);
  }
  assert.equal(BASELINE_FIELDS[BASELINE_FIELDS.length - 1], "updated_at");
});

// ---------------------------------------------------------------------------
// FINAL SAFETY PATCH — ARD-775 postflight category_id (not slug-only).
// ---------------------------------------------------------------------------

test("59. matchProposedAgainstProduct checks category_id via extras alongside category_slug", () => {
  const fields = { category_slug: { current_value: "musk-oils-mukhammaria", proposed_value: "perfumes" } };
  const wrongProduct = { category_slug: "perfumes", category_id: "cat-WRONG" };
  const wrong = matchProposedAgainstProduct(wrongProduct, fields, { category_id: "cat-CORRECT" });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.mismatches.some((m) => m.field === "category_id"));

  const correctProduct = { category_slug: "perfumes", category_id: "cat-CORRECT" };
  const ok = matchProposedAgainstProduct(correctProduct, fields, { category_id: "cat-CORRECT" });
  assert.equal(ok.ok, true);
});

test("60. postflight requires ARD-775's category_id to equal journal.perfumes_category_id, not just category_slug", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const { journal, pre } = await prepareFirstExecuteJournal(adapters, fake.state.connection);
  assert.equal(pre.ok, true, pre.errors?.join("; "));
  await runStorageUploads({ resolved, adapters, journal, mode: "execute", root: ROOT });
  const db = await runDbUpdates({ resolved, adapters, journal, mode: "execute", allowDb: true });
  assert.equal(db.ok, true, JSON.stringify(db.results.filter((r) => r.apply_status !== "completed")));

  // A decoy category sharing the "perfumes" slug, introduced after execution completed.
  // category_slug enrichment for ARD-775 still resolves to "perfumes" (matching the
  // proposed value), but category_id now differs from the resolved perfumes leaf — this
  // must fail postflight, proving the check is not slug-only.
  adapters._state.categories.push({ id: "cat-perfumes-decoy", slug: "perfumes", is_active: true, parent_id: null });
  const ard775 = adapters._state.products.find((p) => p.merchant_sku === "ARD-775");
  ard775.category_id = "cat-perfumes-decoy";

  const post = await runPostflight({ resolved, adapters, journal });
  assert.equal(post.ok, false);
  assert.ok(post.errors.some((e) => /PROPOSED_MISMATCH:ARD-775:.*category_id/.test(e)));
});

// ---------------------------------------------------------------------------
// FINAL SAFETY PATCH — summarizeJournalCompletion unit coverage.
// ---------------------------------------------------------------------------

test("61. summarizeJournalCompletion counts completed/pending/failed/indeterminate/fields/images correctly", () => {
  const grouped = [
    { merchant_sku: "A", fields: { name: {}, image_url: {} } },
    { merchant_sku: "B", fields: { short_description: {} } },
    { merchant_sku: "C", fields: { brand: {} } },
    { merchant_sku: "D", fields: { slug: {} } },
  ];
  const journal = {
    entries: [
      { merchant_sku: "A", status: "completed", upload_status: "uploaded_verified" },
      { merchant_sku: "B", status: "pending" },
      { merchant_sku: "C", status: "failed" },
      { merchant_sku: "D", status: "indeterminate" },
    ],
    write_accounting: { conflicts: 2 },
  };
  const summary = summarizeJournalCompletion(journal, grouped);
  assert.deepEqual(summary, {
    completed: 1,
    pending: 1,
    failed: 1,
    indeterminate: 1,
    conflict: 2,
    fields_verified: 2,
    images_verified: 1,
  });
});

// ---------------------------------------------------------------------------
// FINAL PREFLIGHT EVIDENCE — validateApprovedHead (operator-supplied only, never
// derived from the actual Git HEAD).
// ---------------------------------------------------------------------------

test("62. validateApprovedHead: missing FIX_EXEC_APPROVED_HEAD_SHA fails APPROVED_HEAD_REQUIRED (never auto-filled)", () => {
  const { dir } = makeTempGitRepo();
  const r = validateApprovedHead({ env: {}, cwd: dir });
  assert.equal(r.ok, false);
  assert.equal(r.code, "APPROVED_HEAD_REQUIRED");
  assert.equal(r.approved, null);
});

test("63. validateApprovedHead: mismatched value fails APPROVED_HEAD_MISMATCH", () => {
  const { dir } = makeTempGitRepo();
  const r = validateApprovedHead({ env: { FIX_EXEC_APPROVED_HEAD_SHA: "0".repeat(40) }, cwd: dir });
  assert.equal(r.ok, false);
  assert.equal(r.code, "APPROVED_HEAD_MISMATCH");
});

test("64. validateApprovedHead: value equal to actual `git rev-parse HEAD` passes", () => {
  const { dir, head } = makeTempGitRepo();
  const r = validateApprovedHead({ env: { FIX_EXEC_APPROVED_HEAD_SHA: head }, cwd: dir });
  assert.equal(r.ok, true);
  assert.equal(r.headSha, head);
});

// ---------------------------------------------------------------------------
// FINAL PREFLIGHT EVIDENCE — validateAdminJwtForReadOnly (local decode only, never
// sent to production as part of this gate, never logs the token).
// ---------------------------------------------------------------------------

test("65. validateAdminJwtForReadOnly: missing/malformed token fails ADMIN_JWT_INVALID", () => {
  assert.equal(validateAdminJwtForReadOnly(undefined).code, "ADMIN_JWT_INVALID");
  assert.equal(validateAdminJwtForReadOnly("not-a-jwt").code, "ADMIN_JWT_INVALID");
});

test("66. validateAdminJwtForReadOnly: missing sub fails ADMIN_JWT_INVALID", () => {
  const jwt = fakeJwt({ role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  const r = validateAdminJwtForReadOnly(jwt);
  assert.equal(r.ok, false);
  assert.equal(r.code, "ADMIN_JWT_INVALID");
  assert.equal(r.reason, "MISSING_SUB");
});

test("67. validateAdminJwtForReadOnly: anon/service_role tokens fail ADMIN_JWT_ROLE_REJECTED", () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const anon = fakeJwt({ sub: "u1", role: "anon", exp: nowSec + 3600 });
  const service = fakeJwt({ sub: "u2", role: "service_role", exp: nowSec + 3600 });
  assert.equal(validateAdminJwtForReadOnly(anon).code, "ADMIN_JWT_ROLE_REJECTED");
  assert.equal(validateAdminJwtForReadOnly(service).code, "ADMIN_JWT_ROLE_REJECTED");
});

test("68. validateAdminJwtForReadOnly: missing exp fails ADMIN_JWT_INVALID", () => {
  const jwt = fakeJwt({ sub: "u1", role: "authenticated" });
  const r = validateAdminJwtForReadOnly(jwt);
  assert.equal(r.ok, false);
  assert.equal(r.code, "ADMIN_JWT_INVALID");
  assert.equal(r.reason, "MISSING_EXP");
});

test("69. validateAdminJwtForReadOnly: expiry within minRemainingSec fails ADMIN_JWT_EXPIRED (injectable clock)", () => {
  const nowSec = 1_800_000_000;
  const jwt = fakeJwt({ sub: "u1", role: "authenticated", exp: nowSec + 60 });
  const r = validateAdminJwtForReadOnly(jwt, { nowSec, minRemainingSec: 300 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "ADMIN_JWT_EXPIRED");
  assert.equal(r.remaining_sec, 60);
});

test("70. validateAdminJwtForReadOnly: fresh authenticated token with >= 5 minutes remaining passes", () => {
  const nowSec = 1_800_000_000;
  const jwt = fakeJwt({ sub: "u1", role: "authenticated", exp: nowSec + 600 });
  const r = validateAdminJwtForReadOnly(jwt, { nowSec, minRemainingSec: 300 });
  assert.equal(r.ok, true);
  assert.equal(r.sub, "u1");
  assert.equal(r.remaining_sec, 600);
});

// ---------------------------------------------------------------------------
// FINAL PREFLIGHT EVIDENCE — assertCleanWorktreeForExecution (tracked dirty OR
// untracked outside `.tmp-product-import/` fails; ignored-style tmp scratch is allowed).
// ---------------------------------------------------------------------------

test("71. assertCleanWorktreeForExecution: freshly committed repo is clean", () => {
  const { dir } = makeTempGitRepo();
  assert.equal(assertCleanWorktreeForExecution(dir).ok, true);
});

test("72. assertCleanWorktreeForExecution: tracked modification fails WORKTREE_NOT_CLEAN", () => {
  const { dir } = makeTempGitRepo();
  fs.writeFileSync(path.join(dir, "README.md"), "dirty\n");
  const r = assertCleanWorktreeForExecution(dir);
  assert.equal(r.ok, false);
  assert.equal(r.code, "WORKTREE_NOT_CLEAN");
});

test("73. assertCleanWorktreeForExecution: untracked file outside .tmp-product-import/ fails", () => {
  const { dir } = makeTempGitRepo();
  fs.writeFileSync(path.join(dir, "stray-scratch-file.txt"), "x\n");
  const r = assertCleanWorktreeForExecution(dir);
  assert.equal(r.ok, false);
  assert.equal(r.code, "WORKTREE_NOT_CLEAN");
  assert.ok(r.offending.some((l) => l.includes("stray-scratch-file.txt")));
});

test("74. assertCleanWorktreeForExecution: untracked file under .tmp-product-import/ is allowed", () => {
  const { dir } = makeTempGitRepo();
  fs.mkdirSync(path.join(dir, ".tmp-product-import/ard-al-khaleej/private-catalog-fix-plan"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".tmp-product-import/ard-al-khaleej/private-catalog-fix-plan/scratch.json"),
    "{}",
  );
  assert.equal(assertCleanWorktreeForExecution(dir).ok, true);
});

// ---------------------------------------------------------------------------
// FINAL PREFLIGHT EVIDENCE — writeTmpPreflightEvidence (evidence lives only under the
// gitignored `.tmp-product-import/` scratch space, never under tracked docs/).
// ---------------------------------------------------------------------------

test("75. writeTmpPreflightEvidence writes only under .tmp-product-import/ with a matching SHA-256, never under docs/", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fix-safety-evidence-"));
  const evidence = { ok: true, mode: "preflight" };
  const written = writeTmpPreflightEvidence(evidence, { root });
  assert.ok(fs.existsSync(written.path));
  assert.ok(
    written.path
      .replace(/\\/g, "/")
      .includes("/.tmp-product-import/ard-al-khaleej/private-catalog-fix-plan/production-readonly-preflight.json"),
  );
  const bytes = fs.readFileSync(written.path);
  const expectedSha = crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
  assert.equal(written.sha256, expectedSha);
  assert.deepEqual(JSON.parse(bytes.toString("utf8")), evidence);
  assert.equal(fs.existsSync(path.join(root, "docs")), false);
});

// ---------------------------------------------------------------------------
// FINAL PREFLIGHT EVIDENCE — expanded preflight report (runFirstExecutePreflight / CLI
// --preflight stdout).
// ---------------------------------------------------------------------------

test("76. CLI --preflight (fake adapters) reports the full expanded evidence field set with exact catalog counts", () => {
  const fake = loadFakeState();
  const r = spawnExec(["--preflight"], { FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.judgment, "LIVE_PREFLIGHT_PASS");
  assert.equal(out.checked_live, true);
  assert.equal(out.product_count, 110);
  assert.equal(out.private_count, 110);
  assert.equal(out.inactive_count, 110);
  assert.equal(out.unpublished_count, 110);
  assert.equal(out.stock_zero_count, 110);
  assert.equal(out.public_leakage_count, 0);
  assert.equal(out.affected_products, 30);
  assert.equal(out.affected_skus_resolved, 30);
  assert.equal(out.frozen_current_matches, 30);
  assert.equal(out.frozen_current_mismatches, 0);
  assert.equal(out.payload_semantic_checks, 30);
  assert.equal(out.payload_semantic_pass, 30);
  assert.equal(out.payload_semantic_fail, 0);
  assert.equal(out.storage_paths_total, 9);
  assert.equal(out.storage_paths_absent, 9);
  assert.equal(out.storage_paths_existing, 0);
  assert.equal(Array.isArray(out.path_results), true);
  assert.equal(out.path_results.length, 9);
  assert.match(out.full_catalog_baseline_sha256, /^[0-9A-F]{64}$/);
  assert.equal(out.baseline_field_count, BASELINE_FIELDS.length);
  assert.equal(out.segmentation_fields_covered, SEGMENTATION_FIELDS.length);
  assert.equal(out.merchandising_fields_covered, MERCHANDISING_FIELDS.length);
  assert.deepEqual(out.category_distribution_before, {
    perfumes: 97,
    "home-linen-air": 8,
    "mini-travel-perfume": 3,
    "musk-oils-mukhammaria": 2,
  });
  assert.equal(out.production_storage_writes, false);
  assert.equal(out.production_db_writes, false);
  // Fake-adapter preflight runs are exempt from head-binding enforcement by default.
  assert.equal(out.head_match, null);
});

test("77. non-fake live preflight enforces approved-Head binding and reports actual_git_head/approved_head_sha/head_match", async () => {
  const fake = loadFakeState();
  const adapters = createFakeAdapters(fake.state);
  const stubHead = "e".repeat(40);

  const missing = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal: createJournalSkeleton(resolved.skus),
    env: {},
    getActualHeadShaFn: () => stubHead,
    enforceHeadBinding: true,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.head_match, false);
  assert.equal(missing.actual_git_head, stubHead);
  assert.equal(missing.approved_head_sha, null);

  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  const passed = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: fake.state.connection,
    journal,
    env: { FIX_EXEC_APPROVED_HEAD_SHA: stubHead },
    getActualHeadShaFn: () => stubHead,
    enforceHeadBinding: true,
  });
  assert.equal(passed.ok, true, passed.errors?.join("; "));
  assert.equal(passed.head_match, true);
  assert.equal(passed.actual_git_head, stubHead);
  assert.equal(passed.approved_head_sha, stubHead);
  assert.equal(passed.resolved_manifest_sha256, resolved.manifestSha);
  assert.equal(passed.merchant_id, TARGET_MERCHANT_ID);
});

test("78. assertNoPreWriteCollateral failure surfaces as payload_semantic_fail in the read-only preflight (never a live POST)", async () => {
  const fake = loadFakeState();
  const state = structuredClone(fake.state);
  const target = state.products.find((p) => p.merchant_sku === "ARD-4680");
  // Malformed live `sizes` the payload builder would silently coerce to [] — the same
  // scenario proven end-to-end pre-POST in test 57, but here checked entirely inside the
  // read-only preflight (adapters._state.updateCalls must stay empty).
  target.sizes = 12345;
  const adapters = createFakeAdapters(state);
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;
  const pre = await runFirstExecutePreflight({ resolved, adapters, connection: state.connection, journal });
  assert.equal(pre.ok, false);
  assert.equal(pre.payload_semantic_checks, 30);
  assert.equal(pre.payload_semantic_fail, 1);
  assert.equal(pre.payload_semantic_pass, 29);
  assert.ok(pre.errors.some((e) => /PAYLOAD_SEMANTIC_COLLATERAL:ARD-4680/.test(e)));
  assert.equal(adapters._state.updateCalls.length, 0, "preflight must never POST");
});

// ---------------------------------------------------------------------------
// STORAGE AUTH COMPATIBILITY — production Storage must use the proven Batch100
// compatibility client, behind a read-only server-key acceptance probe.
//
// Mocked gateway behaviour mirrors the Supabase platform:
//   REST    — an unrecognized `apikey` is rejected 401 "Invalid API key".
//   Storage — a recognized `apikey` has its Authorization substituted by the gateway
//             (request succeeds); an unrecognized one is forwarded as-is, so the opaque
//             `Bearer sb_secret_…` reaches storage-api and fails JWT parsing with
//             400 "Invalid Compact JWS" (the live failure this patch closes).
// ---------------------------------------------------------------------------

const VALID_SB_SECRET = `sb_secret_${"v".repeat(28)}`;
const UNRECOGNIZED_SB_SECRET = `sb_secret_${"u".repeat(28)}`;
const VALID_LEGACY_SERVICE_JWT = fakeJwt({ sub: "svc", role: "service_role", exp: 4_102_444_800 });
const ADMIN_USER_JWT = fakeJwt({ sub: "admin-uid-1", role: "authenticated", exp: 4_102_444_800 });
const PROD_URL = `https://${EXPECTED_SUPABASE_HOST}`;

function createSupabaseGatewayDouble({ acceptedKeys = [], objects = [] } = {}) {
  const accepted = new Set(acceptedKeys);
  const requests = [];
  const storageMethodCalls = [];
  const clients = [];

  async function gatewayFetch(input, init = {}) {
    const url = String(typeof input === "string" ? input : input?.url || "");
    const headers = new Headers(init.headers || {});
    const apikey = headers.get("apikey");
    const authorization = headers.get("authorization");
    const isStorage = url.includes("/storage/v1/");
    requests.push({
      url,
      is_storage: isStorage,
      apikey_present: Boolean(apikey),
      apikey_accepted: accepted.has(apikey),
      authorization_present: Boolean(authorization),
      authorization_is_opaque_key: Boolean(authorization && /^Bearer sb_/.test(authorization)),
    });

    const json = (body, status) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (!isStorage) {
      return accepted.has(apikey) ? json({}, 200) : json({ message: "Invalid API key" }, 401);
    }
    if (!authorization) {
      return json({ message: "headers must have required property 'authorization'" }, 400);
    }
    if (!accepted.has(apikey)) {
      return json({ message: "Invalid Compact JWS", key_echo: apikey }, 400);
    }
    return json(objects, 200);
  }

  function createClientDouble(url, key, options) {
    const compatFetch = options?.global?.fetch;
    clients.push({ url, options, usedCompatFetch: typeof compatFetch === "function" });
    const doFetch = compatFetch || globalThis.fetch;

    async function storageRequest(method, pathname) {
      storageMethodCalls.push(method);
      // Mirrors @supabase/supabase-js: it always sets BOTH `apikey` and
      // `Authorization: Bearer <supabaseKey>` on Storage requests.
      const res = await doFetch(`${url}/storage/v1/${pathname}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      const body = await res.json();
      if (!res.ok) {
        const error = new Error(body?.message || `HTTP_${res.status}`);
        error.status = res.status;
        return { data: null, error };
      }
      return { data: body, error: null };
    }

    const unexpected = (name) => async () => {
      storageMethodCalls.push(name);
      throw new Error(`UNEXPECTED_STORAGE_WRITE:${name}`);
    };

    return {
      storage: {
        from(bucket) {
          return {
            list: (prefix) => storageRequest("list", `object/list/${bucket}?prefix=${prefix ?? ""}`),
            download: () => storageRequest("download", `object/${bucket}`),
            upload: unexpected("upload"),
            remove: unexpected("remove"),
            move: unexpected("move"),
            copy: unexpected("copy"),
            createSignedUrl: unexpected("createSignedUrl"),
            update: unexpected("update"),
          };
        },
      },
    };
  }

  return {
    requests,
    storageMethodCalls,
    clients,
    gatewayFetch,
    supabaseJs: { createClient: createClientDouble },
  };
}

/** Route the compatibility fetch's base `globalThis.fetch` at the mocked gateway. */
async function withStubbedGlobalFetch(gatewayFetch, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = gatewayFetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("79. regression: direct createClient + sb_secret Storage fails 'Invalid Compact JWS'; the patched adapter fails earlier with a classified probe code", async () => {
  const gateway = createSupabaseGatewayDouble({ acceptedKeys: [] });

  await withStubbedGlobalFetch(gateway.gatewayFetch, async () => {
    // Old behaviour: plain createClient, no acceptance probe — the raw upstream JWS error.
    const direct = gateway.supabaseJs.createClient(PROD_URL, UNRECOGNIZED_SB_SECRET, {});
    const { error } = await direct.storage.from("products").list("prefix");
    assert.equal(error.message, "Invalid Compact JWS");
    assert.equal(
      classifyAuthFailure(error.status, error.message).code,
      "KEY_NOT_RECOGNIZED_OR_WRONG_AUTH_FLOW",
    );

    // Patched behaviour: the read-only acceptance probe stops before any Storage request.
    const storageRequestsBefore = gateway.requests.filter((r) => r.is_storage).length;
    const adapters = createProductionAdapters({
      supabaseUrl: PROD_URL,
      serverKey: UNRECOGNIZED_SB_SECRET,
      serverKeySource: "SUPABASE_SERVICE_ROLE_KEY",
      adminJwt: ADMIN_USER_JWT,
      readOnly: true,
    });
    await assert.rejects(
      () => adapters.storage.pathExists("merchant/ARD-2511.webp"),
      /STORAGE_SERVER_KEY_PROBE_FAILED:KEY_INVALID_DISABLED_OR_WRONG_PROJECT/,
    );
    assert.equal(gateway.requests.filter((r) => r.is_storage).length, storageRequestsBefore);
    assert.equal(adapters.storageAuthMeta().storage_server_key_probe, "FAIL");
    assert.equal(adapters.storageAuthMeta().storage_server_key_probe_status, 401);
  });
});

test("80. production adapter builds its Storage client through createBatch100StorageClient (single compatibility client)", async () => {
  const gateway = createSupabaseGatewayDouble({ acceptedKeys: [VALID_SB_SECRET] });
  let seenApiKey = null;
  const recordingFetch = async (_input, init) => {
    seenApiKey = new Headers(init?.headers || {}).get("apikey");
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  await withStubbedGlobalFetch(recordingFetch, async () => {
    createProductionAdapters({
      supabaseUrl: PROD_URL,
      serverKey: VALID_SB_SECRET,
      serverKeySource: "SUPABASE_SERVICE_ROLE_KEY",
      adminJwt: ADMIN_USER_JWT,
      readOnly: true,
      supabaseJs: gateway.supabaseJs,
    });

    assert.equal(gateway.clients.length, 1, "exactly one Supabase client per adapter");
    const [client] = gateway.clients;
    assert.equal(client.usedCompatFetch, true);
    assert.equal(client.options.auth.persistSession, false);
    assert.equal(client.options.auth.autoRefreshToken, false);

    // Behavioural fingerprint of createStorageCompatibleFetch: it supplies the `apikey`
    // credential even when the caller omitted it.
    await client.options.global.fetch("https://example.test/storage/v1/object/list/products", { headers: {} });
    assert.equal(seenApiKey, VALID_SB_SECRET);
  });
});

test("81. sb_secret server-key acceptance probe succeeds via the apikey flow (no opaque Bearer on REST)", async () => {
  const seen = [];
  const probeFetch = async (input, init) => {
    const headers = new Headers(init?.headers || {});
    seen.push({
      url: String(input),
      apikey_present: Boolean(headers.get("apikey")),
      authorization_present: Boolean(headers.get("authorization")),
    });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  const adapters = createProductionAdapters({
    supabaseUrl: PROD_URL,
    serverKey: VALID_SB_SECRET,
    serverKeySource: "SUPABASE_SERVICE_ROLE_KEY",
    adminJwt: ADMIN_USER_JWT,
    readOnly: true,
    supabaseJs: createSupabaseGatewayDouble({ acceptedKeys: [VALID_SB_SECRET] }).supabaseJs,
    probeFetch,
  });

  const probe = await adapters.ensureStorageAuth();
  assert.equal(probe.ok, true);
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /\/rest\/v1\/$/);
  assert.equal(seen[0].apikey_present, true);
  assert.equal(seen[0].authorization_present, false, "sb_secret must not be sent as a Bearer JWT");

  // Probe runs at most once for the frozen key, no matter how many Storage calls follow.
  await adapters.ensureStorageAuth();
  assert.equal(seen.length, 1);
  assert.deepEqual(adapters.storageAuthMeta(), {
    storage_key_kind: "sb_secret",
    storage_key_source: "SUPABASE_SERVICE_ROLE_KEY",
    storage_server_key_probe: "PASS",
    storage_server_key_probe_status: 200,
    storage_auth_flow: "compatibility_client",
  });
});

test("82. sb_secret Storage list runs through the compatibility fetch and is accepted", async () => {
  const gateway = createSupabaseGatewayDouble({
    acceptedKeys: [VALID_SB_SECRET],
    objects: [{ name: "ARD-2511.webp" }],
  });
  await withStubbedGlobalFetch(gateway.gatewayFetch, async () => {
    const adapters = createProductionAdapters({
      supabaseUrl: PROD_URL,
      serverKey: VALID_SB_SECRET,
      serverKeySource: "SUPABASE_SERVICE_ROLE_KEY",
      adminJwt: ADMIN_USER_JWT,
      readOnly: true,
      supabaseJs: gateway.supabaseJs,
    });
    const exists = await adapters.storage.pathExists("merchant/ARD-2511.webp");
    assert.equal(exists, true);
    assert.equal(gateway.clients[0].usedCompatFetch, true);
    const storageReq = gateway.requests.find((r) => r.is_storage);
    assert.equal(storageReq.apikey_present, true);
    assert.equal(storageReq.apikey_accepted, true);
    assert.equal(adapters.storageAuthMeta().storage_server_key_probe, "PASS");
  });
});

test("83. legacy service_role Storage list remains supported (Bearer JWT preserved)", async () => {
  const gateway = createSupabaseGatewayDouble({
    acceptedKeys: [VALID_LEGACY_SERVICE_JWT],
    objects: [],
  });
  await withStubbedGlobalFetch(gateway.gatewayFetch, async () => {
    const adapters = createProductionAdapters({
      supabaseUrl: PROD_URL,
      serverKey: VALID_LEGACY_SERVICE_JWT,
      serverKeySource: "BATCH100_SUPABASE_SERVICE_ROLE_JWT",
      adminJwt: ADMIN_USER_JWT,
      readOnly: true,
      supabaseJs: gateway.supabaseJs,
    });
    const exists = await adapters.storage.pathExists("merchant/ARD-2511.webp");
    assert.equal(exists, false);
    const meta = adapters.storageAuthMeta();
    assert.equal(meta.storage_key_kind, "legacy_service_role");
    assert.equal(meta.storage_server_key_probe, "PASS");
    const storageReq = gateway.requests.find((r) => r.is_storage);
    assert.equal(storageReq.authorization_present, true);
    assert.equal(storageReq.authorization_is_opaque_key, false);
  });
});

test("84. publishable/anon-style keys remain rejected before any client is built", () => {
  assert.throws(
    () =>
      createProductionAdapters({
        supabaseUrl: PROD_URL,
        serverKey: `sb_publishable_${"p".repeat(24)}`,
        adminJwt: ADMIN_USER_JWT,
        readOnly: true,
      }),
    /UNSUPPORTED_SERVER_KEY/,
  );
});

test("85. wrong Supabase project remains rejected before any client is built", () => {
  assert.throws(
    () =>
      createProductionAdapters({
        supabaseUrl: "https://zlmdwhuphuxppxznsgso.supabase.co",
        serverKey: VALID_SB_SECRET,
        adminJwt: ADMIN_USER_JWT,
        readOnly: true,
      }),
    /WRONG_SUPABASE_PROJECT/,
  );
});

test("86. a failed server-key probe prevents all nine Storage path probes", async () => {
  const fake = loadFakeState();
  const state = structuredClone(fake.state);
  state.storageKeyKind = "sb_secret";
  state.storageKeySource = "SUPABASE_SERVICE_ROLE_KEY";
  state.storageServerKeyProbe = { ok: false, status: 401, code: "KEY_INVALID_DISABLED_OR_WRONG_PROJECT" };
  const adapters = createFakeAdapters(state);

  const pre = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: state.connection,
    journal: createJournalSkeleton(resolved.skus),
  });

  assert.equal(pre.ok, false);
  assert.equal(pre.judgment, "LIVE_PREFLIGHT_UNAVAILABLE");
  assert.equal(pre.checked_live, false);
  assert.deepEqual(pre.errors, ["STORAGE_SERVER_KEY_PROBE_FAILED:KEY_INVALID_DISABLED_OR_WRONG_PROJECT"]);
  assert.equal(adapters._state.pathProbeCalls.length, 0, "no path probe may run after a failed key probe");
  assert.equal(pre.storage_server_key_probe, "FAIL");
  assert.equal(pre.storage_server_key_probe_status, 401);
  assert.equal(pre.storage_paths_total, 9);
  assert.equal(pre.storage_paths_existing, 0);
  assert.equal(pre.production_storage_writes, false);
  assert.equal(pre.production_db_writes, false);
});

test("87. a failed first Storage path probe stops the remaining probes and reports a scrubbed code", async () => {
  const fake = loadFakeState();
  const state = structuredClone(fake.state);
  const firstAsset = resolved.assets[0];
  state.pathProbeError = { path: firstAsset.storage_path, code: "KEY_NOT_RECOGNIZED_OR_WRONG_AUTH_FLOW" };
  const adapters = createFakeAdapters(state);

  const pre = await runFirstExecutePreflight({
    resolved,
    adapters,
    connection: state.connection,
    journal: createJournalSkeleton(resolved.skus),
  });

  assert.equal(pre.ok, false);
  assert.equal(pre.judgment, "LIVE_PREFLIGHT_UNAVAILABLE");
  assert.equal(adapters._state.pathProbeCalls.length, 1);
  assert.deepEqual(pre.errors, [
    `STORAGE_PROBE_FAILED:${firstAsset.merchant_sku}:KEY_NOT_RECOGNIZED_OR_WRONG_AUTH_FLOW`,
  ]);
  assert.equal(pre.path_results.length, 0);
});

test("88. the compatibility path checks all nine Storage paths and reports safe auth metadata", async () => {
  const fake = loadFakeState();
  const state = structuredClone(fake.state);
  state.storageKeyKind = "sb_secret";
  state.storageKeySource = "SUPABASE_SERVICE_ROLE_KEY";
  const adapters = createFakeAdapters(state);
  const journal = createJournalSkeleton(resolved.skus);
  journal.manifest_sha256 = resolved.manifestSha;

  const pre = await runFirstExecutePreflight({ resolved, adapters, connection: state.connection, journal });

  assert.equal(pre.ok, true, pre.errors?.join("; "));
  assert.equal(adapters._state.storageAuthProbeCalls, 1);
  assert.equal(adapters._state.pathProbeCalls.length, 9);
  assert.equal(pre.storage_server_key_probe, "PASS");
  assert.equal(pre.storage_auth_flow, "compatibility_client");
  assert.equal(pre.storage_paths_total, 9);
  assert.equal(pre.storage_paths_absent, 9);
  assert.equal(pre.storage_paths_existing, 0);
  for (const row of pre.path_results) {
    assert.match(row.merchant_sku, /^ARD-\d+$/);
    assert.equal(typeof row.storage_path, "string");
    assert.equal(row.exists, false);
    assert.equal(row.probe_status, "absent");
  }

  const cli = spawnExec(["--preflight"], { FIX_EXEC_FAKE_ADAPTERS_JSON: fake.path });
  assert.equal(cli.status, 0, cli.stderr);
  const out = JSON.parse(cli.stdout);
  for (const field of [
    "storage_key_kind",
    "storage_key_source",
    "storage_server_key_probe",
    "storage_server_key_probe_status",
    "storage_auth_flow",
  ]) {
    assert.ok(field in out, `--preflight output missing ${field}`);
  }
  assert.equal(out.storage_server_key_probe, "PASS");
  assert.equal(out.storage_auth_flow, "compatibility_client");
});

test("89. read-only preflight invokes zero Storage write methods", async () => {
  const gateway = createSupabaseGatewayDouble({ acceptedKeys: [VALID_SB_SECRET], objects: [] });
  await withStubbedGlobalFetch(gateway.gatewayFetch, async () => {
    const adapters = createProductionAdapters({
      supabaseUrl: PROD_URL,
      serverKey: VALID_SB_SECRET,
      serverKeySource: "SUPABASE_SERVICE_ROLE_KEY",
      adminJwt: ADMIN_USER_JWT,
      readOnly: true,
      supabaseJs: gateway.supabaseJs,
    });

    for (const asset of resolved.assets) {
      assert.equal(await adapters.storage.pathExists(asset.storage_path), false);
    }
    assert.deepEqual(new Set(gateway.storageMethodCalls), new Set(["list"]));
    assert.equal(gateway.storageMethodCalls.length, 9);

    const blocked = await adapters.storage.upload({
      path: "x",
      body: Buffer.from("a"),
      contentType: "image/webp",
      upsert: false,
    });
    assert.equal(blocked.error, "READ_ONLY_ADAPTER_WRITE_BLOCKED");
    for (const forbidden of ["upload", "remove", "move", "copy", "createSignedUrl", "update", "download"]) {
      assert.equal(gateway.storageMethodCalls.includes(forbidden), false, `read-only preflight called ${forbidden}`);
    }
  });
});

test("90. Storage auth failures never leak the server key into errors or temporary evidence", async () => {
  const gateway = createSupabaseGatewayDouble({ acceptedKeys: [] });
  await withStubbedGlobalFetch(gateway.gatewayFetch, async () => {
    const adapters = createProductionAdapters({
      supabaseUrl: PROD_URL,
      serverKey: UNRECOGNIZED_SB_SECRET,
      serverKeySource: "SUPABASE_SERVICE_ROLE_KEY",
      adminJwt: ADMIN_USER_JWT,
      readOnly: true,
      supabaseJs: gateway.supabaseJs,
    });

    let thrown = null;
    try {
      await adapters.storage.pathExists("merchant/ARD-2511.webp");
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown);
    assert.equal(thrown.message.includes(UNRECOGNIZED_SB_SECRET), false);
    assert.equal(thrown.message.includes("sb_secret_"), false);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fix-storage-auth-evidence-"));
    const written = writeTmpPreflightEvidence(
      {
        ok: false,
        error: thrown.message,
        ...adapters.storageAuthMeta(),
      },
      { root },
    );
    const contents = fs.readFileSync(written.path, "utf8");
    assert.equal(contents.includes(UNRECOGNIZED_SB_SECRET), false);
    assert.equal(contents.includes("sb_secret_"), false);
    assert.equal(contents.includes(ADMIN_USER_JWT), false);
  });
});

test("91. Storage key metadata records kind + environment variable name only", () => {
  const gateway = createSupabaseGatewayDouble({ acceptedKeys: [VALID_SB_SECRET] });
  const adapters = createProductionAdapters({
    supabaseUrl: PROD_URL,
    serverKey: VALID_SB_SECRET,
    serverKeySource: "SUPABASE_SERVICE_ROLE_KEY",
    adminJwt: ADMIN_USER_JWT,
    readOnly: true,
    supabaseJs: gateway.supabaseJs,
  });
  const meta = adapters.storageAuthMeta();
  assert.deepEqual(Object.keys(meta).sort(), [
    "storage_auth_flow",
    "storage_key_kind",
    "storage_key_source",
    "storage_server_key_probe",
    "storage_server_key_probe_status",
  ]);
  assert.equal(meta.storage_key_kind, "sb_secret");
  assert.equal(meta.storage_key_source, "SUPABASE_SERVICE_ROLE_KEY");
  const serialized = JSON.stringify(meta);
  assert.equal(serialized.includes(VALID_SB_SECRET), false);
  assert.equal(/sb_secret_[A-Za-z0-9]/.test(serialized), false);
});

test("92. the frozen execution manifest SHA is unchanged by this patch", () => {
  assert.equal(EXPECTED_MANIFEST_SHA, "B32D751637019990581E2C34B81C960697D0DFF4DA2934860579F5A453B22E3E");
  assert.equal(resolved.manifestSha, EXPECTED_MANIFEST_SHA);
  assert.equal(resolved.counts.affected_products, 30);
  assert.equal(resolved.counts.field_changes, 38);
  assert.equal(resolved.counts.replacement_images, 9);
});
