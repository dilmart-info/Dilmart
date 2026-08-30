import assert from "node:assert/strict";
import test from "node:test";

function normalizeArabicName(value) {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim()
    .toLowerCase();
}

function matchGovernorateToJenni(localName, jenniList) {
  const normalizedLocal = normalizeArabicName(localName);
  if (!normalizedLocal) return null;
  for (const item of jenniList) {
    if (normalizeArabicName(item.name_ar ?? "") === normalizedLocal) return item;
  }
  for (const item of jenniList) {
    const ar = normalizeArabicName(item.name_ar ?? "");
    if (ar && (normalizedLocal.includes(ar) || ar.includes(normalizedLocal))) return item;
  }
  return null;
}

const JENNI = [
  { code: "BGD", name_ar: "بغداد", name_en: "Baghdad" },
  { code: "NIN", name_ar: "نينوى", name_en: "Nineveh" },
  { code: "BAS", name_ar: "البصرة", name_en: "Basra" },
];

test("matches exact Arabic governorate names", () => {
  assert.equal(matchGovernorateToJenni("بغداد", JENNI)?.code, "BGD");
  assert.equal(matchGovernorateToJenni("البصرة", JENNI)?.code, "BAS");
});

test("matches local name with parenthetical suffix", () => {
  assert.equal(matchGovernorateToJenni("نينوى (الموصل)", JENNI)?.code, "NIN");
});

test("returns null when no match", () => {
  assert.equal(matchGovernorateToJenni("كردستان", JENNI), null);
});
