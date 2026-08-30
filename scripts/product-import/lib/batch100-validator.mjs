/**
 * Batch100 lifecycle validator — PRE_UPLOAD vs POST_UPLOAD_PREVIEWED.
 * No network. Docs-only evidence gates.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const EXPECTED_ROWS = 100;
export const EXPECTED_FINAL_CSV_SHA256 =
  "A4378AAFC3121C880230C960563F9DB7E148CA567B79CEAEE5930A873E4BA181";
export const EXPECTED_IMPORT_ID = "ff3274c4-7f65-455b-8bda-549c4ecd3fad";
export const MERCHANT_ID = "ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7";
export const EXPECTED_CAT = {
  perfumes: 87,
  "home-linen-air": 8,
  "mini-travel-perfume": 3,
  "musk-oils-mukhammaria": 2,
};

export const PHASE_ALIASES = {
  "pre-upload": "PRE_UPLOAD",
  PRE_UPLOAD: "PRE_UPLOAD",
  "post-upload-previewed": "POST_UPLOAD_PREVIEWED",
  POST_UPLOAD_PREVIEWED: "POST_UPLOAD_PREVIEWED",
};

const FORBIDDEN = [
  "ضمن دفعة أرض الخليج الخاصة",
  "بيانات هوية أساسية فقط",
  "قبل النشر",
  "دون ادعاءات غير موثقة",
  "دون ادعاءات غير موثّقة",
  "تم التحقق",
  "حسب ملف الاستيراد",
];

const PILOT = new Set([
  "ARD-1015",
  "ARD-1042",
  "ARD-1065",
  "ARD-1172",
  "ARD-1173",
  "ARD-1191",
  "ARD-3270",
  "ARD-1826",
  "ARD-2800",
  "ARD-3723",
]);

const POST_OK = new Set(["uploaded_verified", "already_present_verified"]);

export function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function readCsvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const hdr = splitCsv(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = splitCsv(line);
    const row = {};
    hdr.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

export function parsePhaseArg(argv = process.argv.slice(2)) {
  const raw = argv.find((a) => a.startsWith("--phase="));
  if (!raw) {
    return {
      ok: false,
      phase: null,
      error:
        "MISSING_PHASE: pass --phase=pre-upload or --phase=post-upload-previewed (fail-closed; no silent inference).",
    };
  }
  const value = raw.slice("--phase=".length).trim();
  const phase = PHASE_ALIASES[value];
  if (!phase) {
    return {
      ok: false,
      phase: null,
      error: `UNKNOWN_PHASE: '${value}'. Allowed: pre-upload | post-upload-previewed.`,
    };
  }
  return { ok: true, phase, error: null };
}

function cp(s) {
  return [...String(s || "")].length;
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u0600-\u06ff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return new Set(normalize(s).split(" ").filter(Boolean));
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function setEq(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * Phase-specific upload_status gates (pure; used by tests).
 * @param {Array<Record<string,string>>} images
 * @param {"PRE_UPLOAD"|"POST_UPLOAD_PREVIEWED"} phase
 */
export function validateUploadStatuses(images, phase) {
  const errors = [];
  let verifiedUpload = 0;
  let alreadyPresent = 0;
  let failed = 0;
  let indeterminate = 0;
  let shaMismatch = 0;
  let publicGet200 = 0;

  for (const r of images) {
    const sku = r.merchant_sku || r.sku || "?";
    const st = String(r.upload_status || "").trim();

    if (phase === "PRE_UPLOAD") {
      if (st !== "not_uploaded") errors.push(`upload_status not not_uploaded: ${sku}`);
      continue;
    }

    // POST_UPLOAD_PREVIEWED
    if (st === "uploaded_verified") verifiedUpload += 1;
    else if (st === "already_present_verified") alreadyPresent += 1;
    else if (st === "not_uploaded") errors.push(`upload_status not_uploaded not allowed in POST_UPLOAD: ${sku}`);
    else if (["failed", "not_uploaded", "stop_mismatch_existing"].includes(st) || st === "failed") {
      failed += 1;
      errors.push(`upload_status failed: ${sku}=${st}`);
    } else if (st === "indeterminate_mismatch" || st === "indeterminate") {
      indeterminate += 1;
      errors.push(`upload_status indeterminate: ${sku}=${st}`);
    } else if (!POST_OK.has(st)) {
      failed += 1;
      errors.push(`upload_status not verified: ${sku}=${st || "(empty)"}`);
    }

    if (POST_OK.has(st)) {
      if (String(r.public_get_status) === "200") publicGet200 += 1;
      else errors.push(`public_get_status not 200: ${sku}=${r.public_get_status || "(empty)"}`);

      if (String(r.sha_match).toLowerCase() !== "true") {
        shaMismatch += 1;
        errors.push(`sha_match not true: ${sku}`);
      }

      if (!String(r.public_url || "").trim()) errors.push(`missing public_url: ${sku}`);
      if (!String(r.remote_sha256 || "").trim()) errors.push(`missing remote_sha256: ${sku}`);
      if (
        r.remote_sha256 &&
        r.sha256 &&
        String(r.remote_sha256).toUpperCase() !== String(r.sha256).toUpperCase()
      ) {
        shaMismatch += 1;
        errors.push(`remote_sha256 != sha256: ${sku}`);
      }

      const expectedPath = `${MERCHANT_ID}/${sku}.webp`;
      if (String(r.storage_path || "") !== expectedPath) {
        errors.push(`storage_path mismatch: ${sku}`);
      }
      if (String(r.mime) !== "image/webp") errors.push(`mime not image/webp: ${sku}`);
    }
  }

  if (phase === "POST_UPLOAD_PREVIEWED") {
    const okCount = verifiedUpload + alreadyPresent;
    if (okCount !== images.length) errors.push(`verified upload rows=${okCount} want ${images.length}`);
    if (failed) errors.push(`failed rows=${failed}`);
    if (indeterminate) errors.push(`indeterminate rows=${indeterminate}`);
    if (shaMismatch) errors.push(`sha_mismatches=${shaMismatch}`);
    if (publicGet200 !== images.length) errors.push(`public_get_200=${publicGet200} want ${images.length}`);
  }

  return {
    errors,
    verifiedUpload,
    alreadyPresent,
    failed,
    indeterminate,
    shaMismatch,
    publicGet200,
  };
}

/**
 * @param {{
 *   phase: "PRE_UPLOAD"|"POST_UPLOAD_PREVIEWED",
 *   docsDir: string,
 *   imgDir?: string,
 *   expectedRows?: number,
 *   requireLocalImages?: boolean|null,
 *   expectedFinalSha?: string,
 *   expectedImportId?: string,
 * }} opts
 */
export function validateBatch100(opts) {
  const phase = opts.phase;
  if (phase !== "PRE_UPLOAD" && phase !== "POST_UPLOAD_PREVIEWED") {
    return {
      ok: false,
      phase: phase || null,
      errors: [`UNKNOWN_PHASE: ${phase}`],
      warn: [],
    };
  }

  const DIR = opts.docsDir;
  const IMG_DIR = opts.imgDir || path.join(DIR, "../../../.tmp-product-import/ard-al-khaleej/batch100/images");
  const expectedRows = opts.expectedRows ?? EXPECTED_ROWS;
  const expectedFinalSha = (opts.expectedFinalSha || EXPECTED_FINAL_CSV_SHA256).toUpperCase();
  const expectedImportId = opts.expectedImportId || EXPECTED_IMPORT_ID;

  const errors = [];
  const warn = [];

  const read = (name) => {
    const p = path.join(DIR, name);
    if (!fs.existsSync(p)) return null;
    return readCsvFile(p);
  };

  const master = read("02_BATCH100_MASTER.csv") || [];
  const images = read("04_BATCH100_IMAGE_MANIFEST.csv") || [];
  const dist = read("05_BATCH100_CATEGORY_DISTRIBUTION.csv") || [];
  const ready = read("06_BATCH100_IMPORT_READY.csv") || [];
  const identity = read("10_BATCH100_IDENTITY_REVIEW.csv") || [];
  const sim = read("12_BATCH100_DESCRIPTION_SIMILARITY.csv") || [];
  const phFlags = read("12b_BATCH100_IMAGE_PERCEPTUAL_FLAGS.csv") || [];

  if (master.length !== expectedRows) errors.push(`master rows=${master.length}`);
  if (ready.length !== expectedRows) errors.push(`ready rows=${ready.length}`);
  if (images.length !== expectedRows) errors.push(`image rows=${images.length}`);
  if (identity.length !== expectedRows) errors.push(`identity rows=${identity.length} want ${expectedRows}`);

  const masterSkus = new Set(master.map((r) => r.merchant_sku));
  const identitySkus = new Set(identity.map((r) => r.merchant_sku));
  const imageSkus = new Set(images.map((r) => r.merchant_sku));
  const readySkus = new Set(ready.map((r) => r.sku || r.merchant_sku));

  if (masterSkus.size !== expectedRows) errors.push("duplicate SKUs in master");
  if (!setEq(identitySkus, masterSkus)) errors.push("identity SKU set != master SKU set");
  if (!setEq(imageSkus, masterSkus)) errors.push("image SKU set != master SKU set");
  if (!setEq(readySkus, masterSkus)) errors.push("ready SKU set != master SKU set");

  for (const s of masterSkus) if (PILOT.has(s)) errors.push(`pilot leaked ${s}`);

  const distTotal = dist.reduce((a, d) => a + Number(d.selected_count || 0), 0);
  if (dist.length && distTotal !== expectedRows) errors.push(`dist total=${distTotal}`);

  if (expectedRows === 100) {
    for (const sku of ["ARD-1318", "ARD-1319", "ARD-1320"]) {
      const row = master.find((r) => r.merchant_sku === sku);
      if (!row) errors.push(`missing mandatory sku ${sku}`);
      else if (row.category_slug !== "mini-travel-perfume") {
        errors.push(`${sku} category=${row.category_slug} want mini-travel-perfume`);
      }
    }
  }

  let missingShort = 0;
  let badLen = 0;
  let internal = 0;
  const shortMap = new Map();
  const normMap = new Map();
  for (const r of master) {
    const s = String(r.short_description || "").trim();
    if (!s) missingShort += 1;
    const n = cp(s);
    if (n < 40 || n > 280) badLen += 1;
    for (const f of FORBIDDEN) if (s.includes(f)) internal += 1;
    shortMap.set(s, (shortMap.get(s) || 0) + 1);
    const ns = normalize(s);
    normMap.set(ns, (normMap.get(ns) || 0) + 1);
  }
  if (missingShort) errors.push(`missing short=${missingShort}`);
  if (badLen) errors.push(`bad short len=${badLen}`);
  if (internal) errors.push(`internal phrases=${internal}`);
  const exactDup = [...shortMap.values()].filter((n) => n > 1).length;
  const normDup = [...normMap.values()].filter((n) => n > 1).length;
  if (exactDup) errors.push(`exact dup shorts=${exactDup}`);
  if (normDup) errors.push(`normalized dup shorts=${normDup}`);

  const nearPairs = [];
  const shorts = master.map((r) => ({ sku: r.merchant_sku, t: tokens(r.short_description) }));
  for (let i = 0; i < shorts.length; i++) {
    for (let j = i + 1; j < shorts.length; j++) {
      const simScore = jaccard(shorts[i].t, shorts[j].t);
      if (simScore >= 0.85) nearPairs.push([shorts[i].sku, shorts[j].sku]);
    }
  }
  const simKeys = new Set(sim.map((r) => [r.sku_a, r.sku_b].sort().join("|")));
  for (const [a, b] of nearPairs) {
    const key = [a, b].sort().join("|");
    if (!simKeys.has(key)) errors.push(`near-dup pair missing decision row: ${a}|${b}`);
  }
  const unresolvedSim = sim.filter((r) => String(r.decision || "").startsWith("unresolved")).length;
  if (unresolvedSim) errors.push(`unresolved near-dup descriptions=${unresolvedSim}`);
  if (nearPairs.length) warn.push(`near-dup short pairs flagged=${nearPairs.length}`);

  const verified = identity.filter((r) => r.identity_status === "VERIFIED").length;
  const hold = identity.filter((r) => r.identity_status === "HOLD").length;
  if (verified !== expectedRows) errors.push(`identity verified=${verified}`);
  if (hold) errors.push(`identity HOLD=${hold}`);

  const allowedMatch = new Set(["EXACT_MATCH", "ACCEPTED_TRANSLITERATION"]);
  let badMatch = 0;
  let holdMismatch = 0;
  for (const r of identity) {
    const st = String(r.catalog_identity_match_status || "").trim();
    if (!allowedMatch.has(st)) {
      badMatch += 1;
      if (st === "HOLD_MISMATCH" || !st) holdMismatch += 1;
      errors.push(`catalog_identity_match_status invalid: ${r.merchant_sku}=${st || "(empty)"}`);
    }
    if (!String(r.catalog_identity_match_notes || "").trim()) {
      errors.push(`missing catalog_identity_match_notes: ${r.merchant_sku}`);
    }
  }
  if (holdMismatch) errors.push(`HOLD_MISMATCH count=${holdMismatch}`);

  for (const r of master) {
    const id = identity.find((x) => x.merchant_sku === r.merchant_sku);
    if (!id) continue;
    if (normalize(r.name) !== normalize(id.catalog_name_ar)) {
      errors.push(`master.name != identity.catalog_name_ar: ${r.merchant_sku}`);
    }
  }

  // Image metadata + phase upload gates
  const shaCounts = new Map();
  let missingLocal = 0;
  const imgDirExists = fs.existsSync(IMG_DIR);
  const localWebps = imgDirExists ? fs.readdirSync(IMG_DIR).filter((f) => f.endsWith(".webp")) : [];
  const requireLocalImages =
    opts.requireLocalImages != null
      ? Boolean(opts.requireLocalImages)
      : process.env.BATCH100_REQUIRE_LOCAL_IMAGES === "1" || localWebps.length > 0;

  for (const r of images) {
    const sku = r.merchant_sku;
    const localPath = path.join(IMG_DIR, `${sku}.webp`);
    const prepared = String(r.prepared_image_path || "").trim();
    const exists = fs.existsSync(localPath) || (prepared && fs.existsSync(prepared));
    if (requireLocalImages && !exists) missingLocal += 1;
    if (String(r.identity_status) !== "VERIFIED") errors.push(`image identity_status not VERIFIED: ${sku}`);
    if (String(r.mime) !== "image/webp") errors.push(`mime not image/webp: ${sku}`);
    if (String(r.width) !== "1200" || String(r.height) !== "1200") errors.push(`dims not 1200x1200: ${sku}`);
    if (!(Number(r.file_size) > 0)) errors.push(`file_size not >0: ${sku}`);
    if (!String(r.sha256 || "").trim()) errors.push(`missing sha256: ${sku}`);
    if (requireLocalImages && exists) {
      const p = fs.existsSync(localPath) ? localPath : prepared;
      const sha = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").toUpperCase();
      if (r.sha256 && r.sha256.toUpperCase() !== sha) errors.push(`sha mismatch ${sku}`);
      shaCounts.set(sha, (shaCounts.get(sha) || 0) + 1);
    }
  }
  if (missingLocal) errors.push(`missing local images=${missingLocal}`);
  const exactImgDup = [...shaCounts.values()].filter((n) => n > 1).length;
  if (exactImgDup) errors.push(`exact image sha duplicate groups=${exactImgDup}`);
  if (!requireLocalImages) {
    warn.push(
      "local image binaries not present — CSV image metadata gates only (set BATCH100_REQUIRE_LOCAL_IMAGES=1 to require files)",
    );
  }

  const uploadGate = validateUploadStatuses(images, phase);
  errors.push(...uploadGate.errors);

  const unresolvedPh = phFlags.filter(
    (r) => !String(r.decision || "").trim() || String(r.decision).startsWith("unresolved"),
  );
  if (phFlags.length) {
    const missingDecision = phFlags.filter((r) => !String(r.decision || "").trim()).length;
    if (missingDecision) errors.push(`perceptual flags missing decision=${missingDecision}`);
    if (unresolvedPh.length) errors.push(`unresolved perceptual flags=${unresolvedPh.length}`);
  } else if (expectedRows === 100) {
    warn.push("no perceptual flag csv (0 flags or not generated)");
  }

  for (const r of ready) {
    const sku = r.sku || r.merchant_sku;
    if (String(r.stock) !== "0") errors.push(`stock ${sku}`);
    if (String(r.is_active) !== "false") errors.push(`is_active ${sku}`);
    if (String(r.is_published) !== "false") errors.push(`is_published ${sku}`);
    if (String(r.visibility_status) !== "private") errors.push(`visibility ${sku}`);
  }

  // Category distribution from master (authoritative for frozen batch)
  if (expectedRows === 100) {
    const catCounts = {};
    for (const r of master) {
      catCounts[r.category_slug] = (catCounts[r.category_slug] || 0) + 1;
    }
    for (const [k, v] of Object.entries(EXPECTED_CAT)) {
      if ((catCounts[k] || 0) !== v) errors.push(`category_dist ${k}=${catCounts[k] || 0} want ${v}`);
    }
  }

  if (phase === "POST_UPLOAD_PREVIEWED") {
    const uploadResultPath = path.join(DIR, "16_BATCH100_UPLOAD_RESULT.csv");
    const finalPath = path.join(DIR, "18_BATCH100_FINAL_IMPORT.csv");
    const previewPath = path.join(DIR, "19_BATCH100_PREVIEW_RESPONSE_SAFE.json");
    const deepPath = path.join(DIR, "20_BATCH100_PREVIEW_DEEP_VERIFY.json");

    if (!fs.existsSync(uploadResultPath)) errors.push("missing Preview evidence: 16_BATCH100_UPLOAD_RESULT.csv");
    if (!fs.existsSync(finalPath)) errors.push("missing Preview evidence: 18_BATCH100_FINAL_IMPORT.csv");
    if (!fs.existsSync(previewPath)) errors.push("missing Preview evidence: 19_BATCH100_PREVIEW_RESPONSE_SAFE.json");
    if (!fs.existsSync(deepPath)) errors.push("missing Preview evidence: 20_BATCH100_PREVIEW_DEEP_VERIFY.json");

    if (fs.existsSync(finalPath)) {
      const finalRows = readCsvFile(finalPath);
      if (finalRows.length !== expectedRows) errors.push(`final CSV rows=${finalRows.length}`);
      const finalSkus = new Set(finalRows.map((r) => r.merchant_sku || r.sku));
      if (!setEq(finalSkus, masterSkus)) errors.push("final CSV SKU set != master SKU set");
      const actualSha = sha256File(finalPath);
      if (actualSha !== expectedFinalSha) {
        errors.push(`final CSV SHA-256 mismatch: got ${actualSha} want ${expectedFinalSha}`);
      }

      for (const r of finalRows) {
        if (String(r.stock) !== "0") errors.push(`final stock ${r.merchant_sku}`);
        if (String(r.is_active) !== "false") errors.push(`final is_active ${r.merchant_sku}`);
        if (String(r.is_published) !== "false") errors.push(`final is_published ${r.merchant_sku}`);
        if (String(r.visibility_status) !== "private") errors.push(`final visibility ${r.merchant_sku}`);
      }
    }

    if (fs.existsSync(uploadResultPath)) {
      const up = readCsvFile(uploadResultPath);
      const upSkus = new Set(up.map((r) => r.merchant_sku));
      if (!setEq(upSkus, masterSkus)) errors.push("upload evidence SKU set != final/master SKU set");
    }

    if (fs.existsSync(previewPath)) {
      const preview = JSON.parse(fs.readFileSync(previewPath, "utf8"));
      const summary = preview.summary || preview.response?.summary || {};
      const total = summary.total_rows ?? summary.total;
      const valid = summary.valid_rows ?? summary.valid;
      const invalid = summary.invalid_rows ?? summary.invalid;
      const importId = preview.import_id || preview.response?.import_id;
      if (total !== expectedRows || valid !== expectedRows || invalid !== 0) {
        errors.push(`Preview total/valid/invalid = ${total}/${valid}/${invalid} want ${expectedRows}/${expectedRows}/0`);
      }
      if (importId !== expectedImportId) {
        errors.push(`Preview import_id mismatch: ${importId} want ${expectedImportId}`);
      }
    }

    if (fs.existsSync(deepPath)) {
      const deep = JSON.parse(fs.readFileSync(deepPath, "utf8"));
      if (deep.ok !== true) errors.push("deep verification ok != true");
      if (deep.status !== "previewed") errors.push(`Preview status=${deep.status} want previewed`);
      if (deep.import_id && deep.import_id !== expectedImportId) {
        errors.push(`deep verify import_id mismatch: ${deep.import_id}`);
      }
      if (deep.total !== expectedRows || deep.valid !== expectedRows || deep.invalid !== 0) {
        errors.push(`deep verify total/valid/invalid = ${deep.total}/${deep.valid}/${deep.invalid}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    phase,
    errors,
    warn,
    rows: master.length,
    verified,
    hold,
    holdMismatch,
    badMatch,
    missingLocal,
    exactImgDup,
    exactDupShorts: exactDup,
    nearDupShorts: nearPairs.length,
    internalPhrases: internal,
    perceptualFlags: phFlags.length,
    upload: {
      verified: uploadGate.verifiedUpload,
      already_present: uploadGate.alreadyPresent,
      failed: uploadGate.failed,
      indeterminate: uploadGate.indeterminate,
      sha_mismatches: uploadGate.shaMismatch,
      public_get_200: uploadGate.publicGet200,
    },
  };
}
