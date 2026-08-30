/**
 * Unit tests for short_description normalize/validate helpers.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  normalizeShortDescription,
  validateShortDescription,
  codePointLength,
  SHORT_DESCRIPTION_MIN,
  SHORT_DESCRIPTION_MAX,
  ShortDescriptionErrors,
} = await import("../dist/modules/products/short-description.js");

const VALID =
  "عطر تجريبي بحجم مناسب بتركيبة واضحة للجنسين من علامة موثوقة ضمن نطاق الوصف المختصر المعتمد.";

test("normalize: trims and maps empty/whitespace to null", () => {
  assert.equal(normalizeShortDescription("  hi  "), "hi");
  assert.equal(normalizeShortDescription(""), null);
  assert.equal(normalizeShortDescription("   "), null);
  assert.equal(normalizeShortDescription(null), null);
  assert.equal(normalizeShortDescription(undefined), null);
});

test("validate: required rejects null", () => {
  const r = validateShortDescription(null, { required: true });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, ShortDescriptionErrors.SHORT_DESCRIPTION_REQUIRED);
});

test("validate: optional null ok (legacy)", () => {
  const r = validateShortDescription(null, { required: false });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, null);
});

test("validate: Arabic-only exactly 40 and 280 code points", () => {
  const forty = "ا".repeat(SHORT_DESCRIPTION_MIN);
  const twoEighty = "ب".repeat(SHORT_DESCRIPTION_MAX);
  assert.equal(codePointLength(forty), 40);
  assert.equal(codePointLength(twoEighty), 280);
  assert.equal(validateShortDescription(forty).ok, true);
  assert.equal(validateShortDescription(twoEighty).ok, true);
});

test("validate: 281 code points rejected", () => {
  const tooLong = "ج".repeat(SHORT_DESCRIPTION_MAX + 1);
  assert.equal(codePointLength(tooLong), 281);
  const r = validateShortDescription(tooLong);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, ShortDescriptionErrors.SHORT_DESCRIPTION_TOO_LONG);
});

test("validate: Arabic + emoji uses code-point length (not UTF-16 length)", () => {
  // 39 Arabic letters + one emoji = 40 code points; JS string.length is 41 (emoji = 2 UTF-16 units).
  const mixed = `${"د".repeat(39)}😀`;
  assert.equal(codePointLength(mixed), 40);
  assert.equal(mixed.length, 41);
  assert.equal(validateShortDescription(mixed).ok, true);

  const tooLongMixed = `${"د".repeat(279)}😀😀`; // 279 + 2 = 281 code points
  assert.equal(codePointLength(tooLongMixed), 281);
  assert.equal(validateShortDescription(tooLongMixed).ok, false);
});

test("validate: spaces-only invalid when required; null when optional", () => {
  const opt = validateShortDescription("     ", { required: false });
  assert.equal(opt.ok, true);
  if (opt.ok) assert.equal(opt.value, null);
  const req = validateShortDescription("     ", { required: true });
  assert.equal(req.ok, false);
});

test("validate: HTML rejected", () => {
  const r = validateShortDescription(`${VALID}<b>x</b>`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, ShortDescriptionErrors.SHORT_DESCRIPTION_INVALID);
});

test("validate: valid Arabic sample accepted", () => {
  const r = validateShortDescription(VALID, { required: true });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, VALID);
});
