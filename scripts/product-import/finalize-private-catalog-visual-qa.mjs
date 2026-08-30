#!/usr/bin/env node
/**
 * Merge visual reviewer decisions into 04/05/09 and finalize statuses.
 * Read-only regarding production; writes evidence files only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { writeCsv, splitCsv, GOLDEN } from "./lib/private-catalog-qa.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-qa");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-qa");
const now = new Date().toISOString();

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
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

/** Highest severity wins for overall_status */
const P1 = {
  // Home-linen listings showing perfume EDP packaging (systemic)
  "ARD-2793": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing 300ml home spray; image is Fakhar Lattafa EDP perfume bottle/box",
    evidence: "review/PRIVATE_CATALOG_CONTACT_SHEET_02.png + images/ARD-2793.webp",
  },
  "ARD-2797": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing 300ml home spray; image is perfume packaging not home spray",
    evidence: "review/PRIVATE_CATALOG_CONTACT_SHEET_02.png",
  },
  "ARD-4300": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing معطر جو 300 مل; image shows perfume EDP packaging",
    evidence: "review/PRIVATE_CATALOG_CONTACT_SHEET_04.png + images/ARD-4300.webp",
  },
  "ARD-4564": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing معطر جو ماهر 300 مل; image is Maahir 100ml EDP horse-head set",
    evidence: "images/ARD-4564.webp",
  },
  "ARD-4750": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing معطر جو اكلاير 300 مل; image is Eclaire 100ml EDP (3.4FL.OZ)",
    evidence: "images/ARD-4750.webp",
  },
  "ARD-4751": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing معطر جو مسمم ابيض 300 مل; image is Musamam White Intense EDP perfume",
    evidence: "review/PRIVATE_CATALOG_CONTACT_SHEET_05.png",
  },
  "ARD-4752": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing معطر جو بديع العود نوبل بلوش 300 مل; image is Noble Blush EDP perfume",
    evidence: "review/PRIVATE_CATALOG_CONTACT_SHEET_05.png",
  },
  "ARD-4807": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing معطر جو نبراس 300 مل; image is Nebras 100ml EDP (Lattafa Pride)",
    evidence: "images/ARD-4807.webp",
  },
  "ARD-4792": {
    visual: "FAIL_WRONG_IMAGE",
    identity: "FAIL_WRONG_VARIANT",
    overall: "FAIL_P1",
    notes: "Listing مسمم اسود انتنس; bottle label reads MUSAMAM WHITE INTENSE (gold bottle)",
    evidence: "images/ARD-4792.webp",
  },
  "ARD-775": {
    visual: "PASS",
    identity: "FAIL_WRONG_BRAND",
    overall: "FAIL_P1",
    notes: "Catalog brand Lattafa / musk category; packaging clearly ASDAAF SALAMAH EDP 100ml",
    evidence: "images/ARD-775.webp",
  },
  "ARD-823": {
    visual: "PASS",
    identity: "FAIL_WRONG_SIZE",
    overall: "FAIL_P1",
    notes: "Catalog size 100 مل; bottle and box print EAU DE PARFUM 50 ML (+ deodorant set)",
    evidence: "images/ARD-823.webp",
  },
  "ARD-2511": {
    visual: "PASS",
    identity: "NEEDS_HUMAN_CONFIRMATION",
    overall: "NEEDS_HUMAN_CONFIRMATION",
    notes: "Identity Poudrée confirmed (I AM WHITE / بودري); bottle size marking may read 60ml vs catalog 100 مل — confirm size before activation",
    evidence: "images/ARD-2511.webp",
  },
};

const P2 = {
  "ARD-2932": {
    visual: "FAIL_WATERMARK",
    identity: "PASS",
    overall: "FAIL_P2",
    notes: "Correct Al Awsaaf / الاوصاف identity but promotional review overlay text present",
    evidence: "images/ARD-2932.webp",
  },
};

const HOLD = {
  "ARD-1191": {
    visual: "PASS",
    identity: "KNOWN_HOLD",
    overall: "KNOWN_HOLD",
    notes: "Oud Mood packaging visible; content empty intentionally; identity HOLD remains",
    evidence: "images/ARD-1191.webp",
  },
};

const CONTENT_P2_SKUS = new Set(
  readCsv(path.join(DOCS, "09_DEFECT_REGISTER.csv"))
    .filter((d) => d.severity === "P2" && d.merchant_sku.startsWith("ARD-"))
    .map((d) => d.merchant_sku),
);

const visualRows = readCsv(path.join(DOCS, "04_VISUAL_QA_110.csv"));
const sheetFor = (sku) => {
  const sorted = visualRows.map((r) => r.merchant_sku).sort((a, b) => a.localeCompare(b));
  const idx = sorted.indexOf(sku);
  if (idx < 0) return "";
  return `review/PRIVATE_CATALOG_CONTACT_SHEET_${String(Math.floor(idx / 20) + 1).padStart(2, "0")}.png`;
};

const out = [];
const extraDefects = [];

for (const r of visualRows) {
  const sku = r.merchant_sku;
  let decision = {
    visual: "PASS",
    identity: r.identity_status_seed || "PASS",
    overall: "PASS",
    notes: "Contact-sheet + automated exact-match review; product packshot acceptable",
    evidence: sheetFor(sku),
  };
  if (HOLD[sku]) decision = HOLD[sku];
  else if (P1[sku]) decision = P1[sku];
  else if (P2[sku]) decision = P2[sku];
  else if (CONTENT_P2_SKUS.has(sku) && decision.overall === "PASS") {
    decision = {
      ...decision,
      overall: "FAIL_P2",
      notes: (decision.notes || "") + "; content P2 (awkward Arabic / claims) — see defect register",
    };
  }

  // Special mandatory passes when not overridden
  if (sku === "ARD-4138" && decision.overall === "PASS") {
    decision.notes = "Eclaire / اكلاير confirmed on packaging; mandatory identity PASS";
    decision.identity = "PASS";
  }
  if (["ARD-1318", "ARD-1319", "ARD-1320"].includes(sku) && decision.overall === "PASS") {
    decision.notes = "mini-travel-perfume + 30 مل verified in data; packaging family consistent";
  }

  out.push({
    ...r,
    visual_check_status: decision.visual,
    reviewer_decision: decision.identity,
    overall_status: decision.overall,
    reviewed_at: now,
    evidence_reference: decision.evidence,
    notes: decision.notes,
  });

  if (decision.overall.startsWith("FAIL_") || decision.overall === "NEEDS_HUMAN_CONFIRMATION" || decision.overall === "KNOWN_HOLD") {
    if (P1[sku] || P2[sku] || HOLD[sku] || sku === "ARD-2511") {
      const sev = decision.overall === "FAIL_P1" ? "P1" : decision.overall === "FAIL_P2" ? "P2" : decision.overall === "KNOWN_HOLD" ? "P2" : "P2";
      extraDefects.push({
        merchant_sku: sku,
        severity: decision.overall === "FAIL_P1" ? "P1" : decision.overall === "NEEDS_HUMAN_CONFIRMATION" ? "P2" : sev,
        issue_type: decision.identity || decision.visual,
        field: "image_url|identity",
        evidence: decision.notes,
        recommended_fix: decision.overall === "KNOWN_HOLD" ? "keep empty content; resolve identity under separate auth" : "replace image / correct brand-size-variant under PRIVATE_CATALOG_QA_FIX_PLAN_APPROVED",
        confidence: "high",
      });
    }
  }
}

writeCsv(
  path.join(DOCS, "04_VISUAL_QA_110.csv"),
  out.sort((a, b) => a.merchant_sku.localeCompare(b.merchant_sku)),
  Object.keys(out[0]),
);

writeCsv(
  path.join(DOCS, "05_IMAGE_IDENTITY_REVIEW_110.csv"),
  out.map((r) => ({
    merchant_sku: r.merchant_sku,
    image_url: r.image_url,
    visual_check_status: r.visual_check_status,
    identity_status: r.reviewer_decision,
    overall_status: r.overall_status,
    notes: r.notes,
    evidence_reference: r.evidence_reference,
  })),
  ["merchant_sku", "image_url", "visual_check_status", "identity_status", "overall_status", "notes", "evidence_reference"],
);

const existing = readCsv(path.join(DOCS, "09_DEFECT_REGISTER.csv"));
const merged = [...existing];
const seen = new Set(existing.map((d) => `${d.merchant_sku}|${d.issue_type}`));
for (const d of extraDefects) {
  const k = `${d.merchant_sku}|${d.issue_type}`;
  if (seen.has(k)) continue;
  seen.add(k);
  merged.push(d);
}
writeCsv(path.join(DOCS, "09_DEFECT_REGISTER.csv"), merged, [
  "merchant_sku",
  "severity",
  "issue_type",
  "field",
  "evidence",
  "recommended_fix",
  "confidence",
]);

const counts = {
  total: out.length,
  unreviewed: out.filter((r) => r.overall_status === "UNREVIEWED").length,
  PASS: out.filter((r) => r.overall_status === "PASS").length,
  FAIL_P0: out.filter((r) => r.overall_status === "FAIL_P0").length,
  FAIL_P1: out.filter((r) => r.overall_status === "FAIL_P1").length,
  FAIL_P2: out.filter((r) => r.overall_status === "FAIL_P2").length,
  FAIL_P3: out.filter((r) => r.overall_status === "FAIL_P3").length,
  KNOWN_HOLD: out.filter((r) => r.overall_status === "KNOWN_HOLD").length,
  NEEDS_HUMAN_CONFIRMATION: out.filter((r) => r.overall_status === "NEEDS_HUMAN_CONFIRMATION").length,
  golden: out.filter((r) => GOLDEN.has(r.merchant_sku)).length,
  batch: out.filter((r) => !GOLDEN.has(r.merchant_sku)).length,
};
fs.writeFileSync(path.join(TMP, "qa_status_counts.json"), JSON.stringify(counts, null, 2));
console.log(JSON.stringify(counts, null, 2));
