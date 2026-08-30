/**
 * Category assignability + hierarchical path unit tests (taxonomy Phase B L-helpers).
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  isAssignableCategory,
  splitCategoryPath,
  CategoryAssignErrors,
} = await import("../dist/modules/categories/category-assignability.js");

test("isAssignableCategory: active leaf ok", () => {
  const r = isAssignableCategory({ id: "leaf", is_active: true }, 0);
  assert.equal(r.ok, true);
});

test("isAssignableCategory: inactive rejected", () => {
  const r = isAssignableCategory({ id: "x", is_active: false }, 0);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, CategoryAssignErrors.CATEGORY_INACTIVE);
});

test("isAssignableCategory: parent with active children rejected", () => {
  const r = isAssignableCategory({ id: "parent", is_active: true }, 2);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, CategoryAssignErrors.CATEGORY_PARENT_NOT_ASSIGNABLE);
});

test("isAssignableCategory: missing category rejected", () => {
  const r = isAssignableCategory(null, 0);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, CategoryAssignErrors.CATEGORY_NOT_FOUND);
});

test("splitCategoryPath: > and › separators", () => {
  assert.deepEqual(splitCategoryPath("العطور والمعطرات > العطور"), ["العطور والمعطرات", "العطور"]);
  assert.deepEqual(splitCategoryPath("fragrances-and-scents › perfumes"), [
    "fragrances-and-scents",
    "perfumes",
  ]);
  assert.deepEqual(splitCategoryPath("  perfumes  "), ["perfumes"]);
});

test("L8: no grandfather flag exported — assignability is pure function of activeChildCount", () => {
  // Soft grandfather is implemented at call sites via previousCategoryId skip, not a DB flag.
  assert.equal("grandfather" in CategoryAssignErrors, false);
  assert.equal(typeof isAssignableCategory, "function");
});
