/**
 * Shared CSV helpers for bulk-catalog pipeline.
 */
import fs from "fs";
import crypto from "crypto";

export function splitCsvLine(line) {
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

export function parseCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const hdr = splitCsvLine(lines[0]);
  return lines.slice(1).map((line, idx) => {
    const cols = splitCsvLine(line);
    const row = { __source_row: idx + 2 };
    for (let i = 0; i < hdr.length; i++) row[hdr[i]] = cols[i] ?? "";
    return row;
  });
}

export function readCsvFile(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n") + "\n";
}

export function writeCsv(filePath, headers, rows) {
  fs.mkdirSync(pathDir(filePath), { recursive: true });
  fs.writeFileSync(filePath, toCsv(headers, rows), "utf8");
}

function pathDir(p) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(0, i) : ".";
}

export function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
}

export function sha256File(filePath) {
  return sha256Hex(fs.readFileSync(filePath));
}

export function writeJson(filePath, obj) {
  fs.mkdirSync(pathDir(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
