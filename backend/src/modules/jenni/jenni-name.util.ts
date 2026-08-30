/** Normalize Arabic governorate/city names for fuzzy local matching. */
export function normalizeArabicName(value: string): string {
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

export type JenniGovernorateRef = {
  code: string;
  name_en?: string | null;
  name_ar?: string | null;
};

export function matchGovernorateToJenni(
  localName: string,
  jenniList: JenniGovernorateRef[],
): JenniGovernorateRef | null {
  const normalizedLocal = normalizeArabicName(localName);
  if (!normalizedLocal) return null;

  for (const item of jenniList) {
    if (normalizeArabicName(item.name_ar ?? "") === normalizedLocal) return item;
  }
  for (const item of jenniList) {
    const ar = normalizeArabicName(item.name_ar ?? "");
    if (ar && (normalizedLocal.includes(ar) || ar.includes(normalizedLocal))) return item;
  }
  for (const item of jenniList) {
    const en = String(item.name_en ?? "").trim().toLowerCase();
    if (en && normalizedLocal.includes(en.replace(/\s+/g, ""))) return item;
  }
  return null;
}
