import XLSX from "xlsx";
import fs from "fs";
import path from "path";

const xlsxPath = ".tmp-product-import/ard-al-khaleej/DilMart_ARD_AL_KHALEEJ_GOLDEN10_CONTENT_v1.xlsx";
const outDir = "docs/product-import/ard-al-khaleej/content";
fs.mkdirSync(outDir, { recursive: true });

const wb = XLSX.readFile(xlsxPath);
const rows = XLSX.utils.sheet_to_json(wb.Sheets.GOLDEN10_CONTENT, { defval: "" });

function map(r) {
  const decision = String(r["قرار الإدخال"] || "").trim();
  const contentStatus = String(r["حالة المحتوى"] || "").trim();
  let approval_status = "APPROVED_FULL";
  if (decision === "HOLD") approval_status = "HOLD";
  else if (decision === "APPROVED_SHORT_ONLY" || contentStatus === "SHORT_ONLY_OFFICIAL") {
    approval_status = "APPROVED_SHORT_ONLY";
  }
  const short = String(r["الوصف المختصر (إلزامي)"] || "").trim();
  const detailed = String(r["الوصف التفصيلي (اختياري موثق)"] || "").trim();
  return {
    merchant_sku: String(r.SKU || "").trim(),
    store_name: String(r["اسم المنتج في المتجر"] || "").trim(),
    official_name: String(r["الاسم الرسمي المطابق"] || "").trim(),
    brand: String(r["العلامة التجارية"] || "").trim(),
    size: String(r["الحجم"] || "").trim(),
    category_path: String(r["مسار القسم"] || "").trim(),
    short_description: short,
    description: detailed,
    short_char_count: short.length,
    description_char_count: detailed.length,
    source_type: String(r["نوع المصدر"] || "").trim(),
    source_url: String(r["رابط المصدر"] || "").trim(),
    identity_status: String(r["حالة مطابقة الهوية"] || "").trim(),
    content_status: contentStatus,
    decision,
    approval_status,
    review_notes: String(r["ملاحظات المراجعة"] || "").trim(),
  };
}

const all = rows.map(map);
const hold = all.filter((r) => r.approval_status === "HOLD");
const ready = all.filter((r) => r.approval_status !== "HOLD");

function toCsv(list) {
  const cols = [
    "merchant_sku",
    "store_name",
    "official_name",
    "brand",
    "size",
    "category_path",
    "short_description",
    "description",
    "short_char_count",
    "description_char_count",
    "source_type",
    "source_url",
    "identity_status",
    "content_status",
    "decision",
    "approval_status",
    "review_notes",
  ];
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${[cols.join(",")].concat(list.map((r) => cols.map((c) => esc(r[c])).join(","))).join("\n")}\n`;
}

fs.writeFileSync(path.join(outDir, "02_GOLDEN10_ALL.csv"), toCsv(all), "utf8");
fs.writeFileSync(path.join(outDir, "03_GOLDEN10_READY.csv"), toCsv(ready), "utf8");
fs.writeFileSync(path.join(outDir, "04_GOLDEN10_HOLD.csv"), toCsv(hold), "utf8");

console.log(
  JSON.stringify(
    {
      total: all.length,
      ready: ready.length,
      shortOnly: ready.filter((r) => r.approval_status === "APPROVED_SHORT_ONLY").length,
      hold: hold.length,
      holdSkus: hold.map((h) => h.merchant_sku),
    },
    null,
    2,
  ),
);
