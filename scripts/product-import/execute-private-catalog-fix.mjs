#!/usr/bin/env node
/**
 * Guarded private-catalog FIX EXECUTION CLI.
 *
 * Modes: --preflight | --dry-run | --execute | --resume | --postflight
 *
 * Write modes (--execute/--resume) require ALL of:
 *   FIX_EXEC_AUTHORIZATION=PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED
 *   FIX_EXEC_ALLOW_WRITES=1
 *   explicit mode flag
 *
 * Bare `--auth` does NOT authorize. Authorization is never self-generated.
 * Never print authorization values or JWTs.
 *
 * Adapter resolution:
 *   - Read modes (--preflight/--dry-run/--postflight) may use fake adapters (any env) OR
 *     production adapters built with readOnly:true — neither requires
 *     FIX_EXEC_AUTHORIZATION/FIX_EXEC_ALLOW_WRITES.
 *   - Write modes (--execute/--resume) may use fake adapters ONLY when
 *     NODE_ENV=test && FIX_EXEC_TEST_MODE=1; otherwise production adapters are built
 *     (readOnly:false) strictly after the authorization + connection gates pass.
 *
 * Write accounting is always derived from journal.write_accounting — never hardcoded —
 * so a failure after partial writes reports the true production_storage_writes /
 * production_db_writes state, including on uncaught exceptions.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadResolvedFromDocs,
  runLivePreflight,
  runStorageUploads,
  runDbUpdates,
  runPostflight,
  assertWriteAuthorization,
  assertProductionConnection,
  createJournalSkeleton,
  scrubSecrets,
  summarizeWriteAccounting,
  createEmptyWriteAccounting,
  EXPECTED_MANIFEST_SHA,
  TARGET_MERCHANT_ID,
  EXPECTED_BACKEND_API,
  EXPECTED_SUPABASE_HOST,
  QA_HEAD_SHA,
} from "./lib/private-catalog-fix-runtime.mjs";
import {
  createFakeAdapters,
  createProductionAdapters,
  resolveProductionAdapterEnv,
  canBuildProductionAdapters,
  assertFakeAdaptersAllowedForWrites,
} from "./lib/private-catalog-fix-adapters.mjs";
import { assertCleanWorktreeForExecution } from "./lib/private-catalog-fix-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-fix-plan");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-fix-plan");

function parseArgs(argv) {
  const out = { mode: null, bareAuth: false, authEquals: null };
  for (const a of argv) {
    if (a === "--preflight") out.mode = "preflight";
    else if (a === "--dry-run") out.mode = "dry-run";
    else if (a === "--execute") out.mode = "execute";
    else if (a === "--resume") out.mode = "resume";
    else if (a === "--postflight") out.mode = "postflight";
    else if (a === "--auth") out.bareAuth = true;
    else if (a.startsWith("--auth=")) out.authEquals = a.slice("--auth=".length);
  }
  return out;
}

function loadJournal() {
  const p = path.join(TMP, "execution-journal.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveJournal(j) {
  fs.mkdirSync(TMP, { recursive: true });
  const scrubbed = JSON.parse(scrubSecrets(JSON.stringify(j)));
  fs.writeFileSync(path.join(TMP, "execution-journal.json"), JSON.stringify(scrubbed, null, 2));
}

function computeAccounting(journal) {
  return summarizeWriteAccounting(journal?.write_accounting || createEmptyWriteAccounting());
}

/**
 * Fail-closed error output. Write accounting is ALWAYS derived from the journal (never
 * hardcoded to false) so a failure after partial writes reports true production state.
 */
function fail(payload, code = 1, journal = null) {
  const acct = computeAccounting(journal);
  console.error(
    scrubSecrets(
      JSON.stringify({
        ok: false,
        ...payload,
        production_storage_writes: acct.production_storage_writes,
        production_db_writes: acct.production_db_writes,
        write_accounting: acct,
      }),
    ),
  );
  process.exit(code);
}

function defaultConnection(env) {
  return {
    supabaseUrl: env.SUPABASE_URL || env.FIX_EXEC_SUPABASE_URL || `https://${EXPECTED_SUPABASE_HOST}`,
    backendApi: (env.FIX_EXEC_BACKEND_API || EXPECTED_BACKEND_API).replace(/\/$/, ""),
    merchantId: TARGET_MERCHANT_ID,
    merchantSlug: env.FIX_EXEC_MERCHANT_SLUG || "arth-al-khaleg",
    merchantStatus: env.FIX_EXEC_MERCHANT_STATUS || "draft",
    productCount: Number(env.FIX_EXEC_PRODUCT_COUNT || 110),
  };
}

/**
 * Resolve adapters for the requested mode.
 *  - Fake adapters (FIX_EXEC_FAKE_ADAPTERS_JSON) are always allowed for read modes.
 *    For write modes they require NODE_ENV=test && FIX_EXEC_TEST_MODE=1.
 *  - Otherwise, production adapters are built when credentials are available —
 *    readOnly for read modes (no authorization required), read/write for write modes
 *    (only reached after the authorization + connection gates pass).
 */
function resolveAdaptersForMode(env, mode) {
  const isWriteMode = mode === "execute" || mode === "resume";

  if (env.FIX_EXEC_FAKE_ADAPTERS_JSON) {
    if (isWriteMode) {
      const gate = assertFakeAdaptersAllowedForWrites(env);
      if (!gate.ok) return { error: gate };
    }
    const state = JSON.parse(fs.readFileSync(env.FIX_EXEC_FAKE_ADAPTERS_JSON, "utf8"));
    return { adapters: createFakeAdapters(state), connection: state.connection || defaultConnection(env) };
  }

  if (canBuildProductionAdapters(env)) {
    const cfg = resolveProductionAdapterEnv(env);
    try {
      const adapters = createProductionAdapters({
        supabaseUrl: cfg.supabaseUrl,
        serverKey: cfg.key.key,
        serverKeySource: cfg.key.source,
        adminJwt: cfg.adminJwt,
        backendApi: cfg.backendApi,
        readOnly: !isWriteMode,
      });
      return { adapters, connection: defaultConnection(env) };
    } catch (e) {
      return {
        error: { code: "PRODUCTION_ADAPTER_BUILD_FAILED", message: scrubSecrets(String(e.message || e)) },
      };
    }
  }

  return { adapters: null, connection: defaultConnection(env) };
}

/**
 * Exported for tests.
 */
export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  if (!args.mode) {
    fail({ error: "MODE_REQUIRED", modes: ["--preflight", "--dry-run", "--execute", "--resume", "--postflight"] }, 2);
  }

  // Bare --auth must never authorize (and is an explicit failure signal).
  if (args.bareAuth) {
    fail({ error: "BARE_AUTH_REJECTED", message: "Pass authorization only via FIX_EXEC_AUTHORIZATION env" }, 1);
  }
  // --auth=VALUE is ignored for authorization (env-only).
  void args.authEquals;

  const resolved = loadResolvedFromDocs(DOCS, ROOT);
  if (!resolved.ok) fail({ stage: "resolve", errors: resolved.errors });
  if (resolved.manifestSha !== EXPECTED_MANIFEST_SHA) {
    fail({ error: "MANIFEST_SHA_MISMATCH", got: resolved.manifestSha, expected: EXPECTED_MANIFEST_SHA });
  }

  const { adapters: resolvedAdapters, connection, error: adapterError } = resolveAdaptersForMode(env, args.mode);
  if (adapterError) {
    fail({ mode: args.mode, error: adapterError.code, message: adapterError.message });
  }
  let adapters = resolvedAdapters;

  if (args.mode === "preflight" || args.mode === "dry-run") {
    if (!adapters) {
      // Live preflight requires adapters — refuse offline PASS.
      fail({
        mode: args.mode,
        judgment: "LIVE_PREFLIGHT_UNAVAILABLE",
        error: "LIVE_ADAPTERS_REQUIRED",
        hint: "Provide production credentials or FIX_EXEC_FAKE_ADAPTERS_JSON for tests",
      });
    }
    // A live (non-fake) read-only preflight against production must bind to an
    // operator-approved Git HEAD exactly like --execute/--resume (FIX_EXEC_APPROVED_HEAD_SHA
    // verified against the actual `git rev-parse HEAD`). Hermetic fake-adapter tests are
    // exempt by default — they can opt into head-binding coverage directly via
    // runFirstExecutePreflight({ enforceHeadBinding: true }).
    const isFakeAdapters = Boolean(env.FIX_EXEC_FAKE_ADAPTERS_JSON);
    const enforceHeadBinding = !isFakeAdapters;
    // --preflight/--dry-run are stateless, read-only inspections — never gated by, or
    // mutating, any journal left over from a prior --execute/--resume run.
    const pre = await runLivePreflight({
      resolved,
      adapters,
      connection,
      journal: null,
      mode: "execute",
      env,
      enforceHeadBinding,
    });
    const acct = computeAccounting(null);
    const out = {
      ok: pre.ok,
      mode: args.mode,
      judgment: pre.judgment,
      checked_live: pre.checked_live,
      actual_git_head: pre.actual_git_head ?? null,
      approved_head_sha: pre.approved_head_sha ?? null,
      head_match: pre.head_match ?? null,
      errors: pre.errors,
      resolved_manifest_sha256: resolved.manifestSha,
      merchant_id: pre.merchant_id ?? null,
      merchant_slug: pre.merchant_slug ?? null,
      merchant_status: pre.merchant_status ?? null,
      product_count: pre.product_count ?? null,
      private_count: pre.private_count ?? null,
      inactive_count: pre.inactive_count ?? null,
      unpublished_count: pre.unpublished_count ?? null,
      stock_zero_count: pre.stock_zero_count ?? null,
      public_leakage_count: pre.public_leakage_count ?? null,
      affected_products: pre.affected_products ?? pre.affected ?? null,
      affected_skus_resolved: pre.affected_skus_resolved ?? null,
      frozen_current_matches: pre.frozen_current_matches ?? null,
      frozen_current_mismatches: pre.frozen_current_mismatches ?? null,
      payload_semantic_checks: pre.payload_semantic_checks ?? null,
      payload_semantic_pass: pre.payload_semantic_pass ?? null,
      payload_semantic_fail: pre.payload_semantic_fail ?? null,
      storage_key_kind: pre.storage_key_kind ?? null,
      storage_key_source: pre.storage_key_source ?? null,
      storage_server_key_probe: pre.storage_server_key_probe ?? null,
      storage_server_key_probe_status: pre.storage_server_key_probe_status ?? null,
      storage_auth_flow: pre.storage_auth_flow ?? null,
      storage_paths_total: pre.storage_paths_total ?? null,
      storage_paths_absent: pre.storage_paths_absent ?? null,
      storage_paths_existing: pre.storage_paths_existing ?? null,
      path_results: pre.path_results ?? pre.pathResults ?? null,
      full_catalog_baseline_sha256: pre.full_catalog_baseline_sha256 ?? null,
      baseline_field_count: pre.baseline_field_count ?? null,
      segmentation_fields_covered: pre.segmentation_fields_covered ?? null,
      merchandising_fields_covered: pre.merchandising_fields_covered ?? null,
      category_distribution_before: pre.category_distribution_before ?? null,
      counts: resolved.counts,
      production_storage_writes: acct.production_storage_writes,
      production_db_writes: acct.production_db_writes,
    };
    console.log(scrubSecrets(JSON.stringify(out, null, 2)));
    process.exit(pre.ok ? 0 : 1);
  }

  if (args.mode === "postflight") {
    if (!adapters) fail({ mode: "postflight", judgment: "POSTFLIGHT_FAIL", error: "LIVE_INPUT_REQUIRED" });
    const journal = loadJournal();
    if (!journal) fail({ mode: "postflight", judgment: "POSTFLIGHT_FAIL", error: "JOURNAL_MISSING" });
    const post = await runPostflight({ resolved, adapters, journal });
    console.log(scrubSecrets(JSON.stringify({ ...post, mode: "postflight" }, null, 2)));
    process.exit(post.ok ? 0 : 1);
  }

  // execute / resume — write modes.
  const auth = assertWriteAuthorization(env);
  if (!auth.ok) fail({ mode: args.mode, error: auth.code, message: auth.message });

  // Clean-worktree guard: a genuine production write must execute against exactly the
  // reviewed/committed tree — never with uncommitted tracked changes or stray untracked
  // files outside the gitignored `.tmp-product-import/` scratch space. Hermetic
  // fake-adapter test-mode runs (NODE_ENV=test && FIX_EXEC_TEST_MODE=1, already gated
  // above via resolveAdaptersForMode/assertFakeAdaptersAllowedForWrites) never touch
  // production and are exempt, so the existing CLI-spawn test suite stays green
  // regardless of unrelated scratch files in the local working tree.
  if (!env.FIX_EXEC_FAKE_ADAPTERS_JSON) {
    const worktree = assertCleanWorktreeForExecution(ROOT);
    if (!worktree.ok) {
      fail({ mode: args.mode, error: worktree.code, offending: worktree.offending || null });
    }
  }

  const conn = assertProductionConnection(connection);
  if (!conn.ok) fail({ mode: args.mode, error: "CONNECTION_GUARD_FAILED", errors: conn.errors });

  if (!adapters) {
    fail({
      mode: args.mode,
      error: "LIVE_ADAPTERS_REQUIRED",
      hint: "Provide production credentials, or FIX_EXEC_FAKE_ADAPTERS_JSON with NODE_ENV=test && FIX_EXEC_TEST_MODE=1",
    });
  }

  let journal = loadJournal();
  if (args.mode === "resume" && !journal) {
    fail({ mode: args.mode, error: "JOURNAL_MANDATORY_FOR_RESUME" });
  }
  if (args.mode === "execute" && !journal) {
    journal = createJournalSkeleton(resolved.skus);
    journal.manifest_sha256 = resolved.manifestSha;
    // `head_sha` here is historical QA metadata only (never a gate) — the binding gate is
    // `journal.execution_head_sha`, set by runFirstExecutePreflight from the actual Git
    // HEAD once FIX_EXEC_APPROVED_HEAD_SHA is verified below.
    journal.head_sha = env.FIX_EXEC_HEAD_SHA || QA_HEAD_SHA;
  }
  if (args.mode === "execute" && journal.entries.some((e) => e.status === "completed")) {
    fail({ mode: args.mode, error: "JOURNAL_ALREADY_HAS_COMPLETED_ENTRIES", hint: "use --resume" }, 1, journal);
  }

  // --execute/--resume are the only modes bound to the actual Git HEAD: enforceHeadBinding
  // requires FIX_EXEC_APPROVED_HEAD_SHA to match the real `git rev-parse HEAD` (never the
  // frozen historical QA_HEAD_SHA constant). Read-only --preflight/--dry-run above never
  // enforce this binding.
  const pre = await runLivePreflight({ resolved, adapters, connection, journal, mode: args.mode, env, enforceHeadBinding: true });
  if (!pre.ok || pre.judgment !== "LIVE_PREFLIGHT_PASS") {
    fail({ mode: args.mode, stage: "live_preflight", ...pre }, 1, journal);
  }

  // Persist resolved product ids + frozen baselines + execution_head_sha BEFORE any
  // storage writes.
  saveJournal(journal);

  // runStorageUploads mutates journal.entries[].upload_status/status directly (canonical
  // journal write, including the "never overwrite uploaded_verified on a resume-only
  // verify" rule) — there is no separate translation step here.
  const storage = await runStorageUploads({
    resolved,
    adapters,
    journal,
    mode: args.mode,
    root: ROOT,
  });
  saveJournal(journal);

  if (!storage.allow_db) {
    fail(
      {
        mode: args.mode,
        stage: "storage",
        stop_reason: storage.stop_reason,
        verified_count: storage.verified_count,
        storage_results: storage.results,
      },
      1,
      journal,
    );
  }

  const db = await runDbUpdates({
    resolved,
    adapters,
    journal,
    mode: args.mode,
    allowDb: true,
  });
  saveJournal(journal);

  if (!db.ok) {
    fail(
      {
        mode: args.mode,
        stage: "db",
        stop_reason: db.stop_reason,
        api_updates: db.updates,
        expected_updates: db.expected_updates,
        db_results: db.results,
        completion_summary: db.completion_summary,
        metrics: db.metrics,
      },
      1,
      journal,
    );
  }

  const acct = computeAccounting(journal);
  const out = {
    ok: db.ok,
    mode: args.mode,
    storage_verified: storage.verified_count,
    api_updates: db.updates,
    expected_updates: db.expected_updates,
    db_results: db.results,
    completion_summary: db.completion_summary,
    metrics: db.metrics,
    production_storage_writes: acct.production_storage_writes,
    production_db_writes: acct.production_db_writes,
    write_accounting: acct,
  };
  console.log(scrubSecrets(JSON.stringify(out, null, 2)));
  process.exit(db.ok ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((e) => {
    // Uncaught exceptions must still report journal-derived write counts, never hardcoded false.
    const journal = loadJournal();
    fail({ error: "UNCAUGHT", message: scrubSecrets(String(e?.message || e)) }, 1, journal);
  });
}
