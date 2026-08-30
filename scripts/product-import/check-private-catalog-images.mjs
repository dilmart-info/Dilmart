#!/usr/bin/env node
/**
 * Read-only image integrity for private catalog QA.
 * Downloads images locally for contact sheets / SHA compare. No Storage writes.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { loadProductsJson, GOLDEN, writeCsv, nfcTrim } from "./lib/private-catalog-qa.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TMP = path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-qa");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-qa");
const IMG = path.join(TMP, "images");
const BATCH = path.join(ROOT, "docs/product-import/ard-al-khaleej/batch100");

function splitCsv(line) {
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

async function fetchImage(url) {
  const res = await fetch(url, { redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, ctype: res.headers.get("content-type") || "", buf };
}

function avgHash(buf) {
  // lightweight grayscale downsample hash via raw bytes entropy proxy if sharp/PIL unavailable
  // Use simple content fingerprint: sha256 + size; perceptual left to python contact sheet stage
  return crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
}

fs.mkdirSync(IMG, { recursive: true });
const products = loadProductsJson();
const manifest = readCsv(path.join(BATCH, "04_BATCH100_IMAGE_MANIFEST.csv"));
const manBySku = new Map(manifest.map((r) => [r.merchant_sku || r.sku, r]));

const rows = [];
const shaMap = new Map();

for (const p of products) {
  const url = nfcTrim(p.image_url);
  let status = 0;
  let ctype = "";
  let size = 0;
  let sha = "";
  let decodable = false;
  let shaMatch = "";
  let err = "";
  try {
    const r = await fetchImage(url);
    status = r.status;
    ctype = r.ctype;
    size = r.buf.length;
    sha = avgHash(r.buf);
    decodable = size > 1000 && /image\//i.test(ctype);
    const out = path.join(IMG, `${p.merchant_sku}.webp`);
    fs.writeFileSync(out, r.buf);
    if (!GOLDEN.has(p.merchant_sku)) {
      const m = manBySku.get(p.merchant_sku);
      const expected = (m?.sha256 || m?.local_sha256 || m?.remote_sha256 || "").toUpperCase();
      if (expected) shaMatch = sha === expected ? "true" : "false";
      else shaMatch = "no_manifest_sha";
    } else shaMatch = "golden_n/a";
    if (!shaMap.has(sha)) shaMap.set(sha, []);
    shaMap.get(sha).push(p.merchant_sku);
  } catch (e) {
    err = String(e.message || e);
  }
  rows.push({
    merchant_sku: p.merchant_sku,
    image_url: url,
    http_status: status,
    content_type: ctype,
    bytes: size,
    sha256: sha,
    decodable: decodable ? "true" : "false",
    sha_match_manifest: shaMatch,
    error: err,
  });
  process.stdout.write(".");
}
console.log("");

const exactDupGroups = [...shaMap.entries()].filter(([, skus]) => skus.length > 1);
writeCsv(
  path.join(DOCS, "05_IMAGE_IDENTITY_REVIEW_110.csv"),
  rows.sort((a, b) => a.merchant_sku.localeCompare(b.merchant_sku)),
  [
    "merchant_sku",
    "image_url",
    "http_status",
    "content_type",
    "bytes",
    "sha256",
    "decodable",
    "sha_match_manifest",
    "error",
  ],
);
fs.writeFileSync(
  path.join(TMP, "image_integrity_summary.json"),
  JSON.stringify(
    {
      total: rows.length,
      http_200: rows.filter((r) => Number(r.http_status) === 200).length,
      broken: rows.filter((r) => Number(r.http_status) !== 200 || r.decodable !== "true").length,
      sha_mismatch: rows.filter((r) => r.sha_match_manifest === "false").length,
      exact_sha_duplicate_groups: exactDupGroups.map(([sha, skus]) => ({ sha, skus })),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      total: rows.length,
      http_200: rows.filter((r) => Number(r.http_status) === 200).length,
      broken: rows.filter((r) => Number(r.http_status) !== 200 || r.decodable !== "true").length,
      sha_mismatch: rows.filter((r) => r.sha_match_manifest === "false").length,
      exact_dup_groups: exactDupGroups.length,
    },
    null,
    2,
  ),
);
