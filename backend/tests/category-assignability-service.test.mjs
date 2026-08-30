/**
 * CategoriesService assertAssignable + resolveCategoryToken (L1–L4 style + path resolve).
 * Soft grandfather: previousCategoryId unchanged skips assignability.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { CategoriesService } = await import("../dist/modules/categories/categories.service.js");
const { CategoryAssignErrors } = await import("../dist/modules/categories/category-assignability.js");

const FRAG_ROOT = "fc662e9f-ea22-454e-bb29-cdb7bf5ea90c";
const PERFUMES = "11111111-1111-4111-8111-111111111111";
const CARE_ROOT = "d7df20e8-011c-430e-a8a7-77b9506936ac";
const SKIN = "22222222-2222-4222-8222-222222222222";

function nestCode(err) {
  const body = typeof err?.getResponse === "function" ? err.getResponse() : err?.response;
  if (body && typeof body === "object") return body.code;
  return undefined;
}

function matchesFilters(record, filters) {
  return filters.every(([col, op, val]) => (op === "neq" ? record[col] !== val : record[col] === val));
}

function createFakeSupabase(categories) {
  const state = { categories: categories.map((r) => ({ ...r })) };

  function builder(table) {
    const filters = [];
    let wantSingle = false;
    let wantMaybeSingle = false;
    let wantCount = false;

    async function execute() {
      const matched = (state[table] ?? []).filter((r) => matchesFilters(r, filters));
      if (wantCount) {
        return { data: null, error: null, count: matched.length };
      }
      if (wantSingle) {
        return matched.length ? { data: { ...matched[0] }, error: null } : { data: null, error: { message: "no rows" } };
      }
      if (wantMaybeSingle) {
        return { data: matched[0] ? { ...matched[0] } : null, error: null };
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    }

    const api = {
      select(_cols, opts) {
        if (opts?.count === "exact" && opts?.head) wantCount = true;
        return api;
      },
      eq(col, val) {
        filters.push([col, "eq", val]);
        return api;
      },
      maybeSingle() {
        wantMaybeSingle = true;
        return execute();
      },
      single() {
        wantSingle = true;
        return execute();
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };
    return api;
  }

  return { client: { from: (table) => builder(table) } };
}

function makeService(categories) {
  return new CategoriesService({ client: createFakeSupabase(categories).client });
}

const taxonomy = [
  { id: FRAG_ROOT, name: "العطور والمعطرات", slug: "fragrances-and-scents", parent_id: null, is_active: true },
  { id: PERFUMES, name: "العطور", slug: "perfumes", parent_id: FRAG_ROOT, is_active: true },
  { id: CARE_ROOT, name: "العناية الشخصية والتجميل", slug: "personal-care-beauty", parent_id: null, is_active: true },
  { id: SKIN, name: "العناية بالبشرة", slug: "skin-care", parent_id: CARE_ROOT, is_active: true },
];

test("L1-style: previousCategoryId unchanged skips parent-with-children assert", async () => {
  const svc = makeService(taxonomy);
  await assert.doesNotReject(() =>
    svc.assertAssignableCategoryId(FRAG_ROOT, { previousCategoryId: FRAG_ROOT }),
  );
});

test("L2-style: change to leaf succeeds", async () => {
  const svc = makeService(taxonomy);
  await assert.doesNotReject(() =>
    svc.assertAssignableCategoryId(PERFUMES, { previousCategoryId: FRAG_ROOT }),
  );
});

test("L3-style: change to another parent-with-children fails", async () => {
  const svc = makeService(taxonomy);
  await assert.rejects(
    () => svc.assertAssignableCategoryId(CARE_ROOT, { previousCategoryId: FRAG_ROOT }),
    (err) => {
      assert.equal(nestCode(err), CategoryAssignErrors.CATEGORY_PARENT_NOT_ASSIGNABLE);
      return true;
    },
  );
});

test("L4-style: new assignment to parent-with-children fails", async () => {
  const svc = makeService(taxonomy);
  await assert.rejects(
    () => svc.assertAssignableCategoryId(FRAG_ROOT, { required: true }),
    (err) => {
      assert.equal(nestCode(err), CategoryAssignErrors.CATEGORY_PARENT_NOT_ASSIGNABLE);
      return true;
    },
  );
});

test("resolveCategoryToken: hierarchical path succeeds", async () => {
  const svc = makeService(taxonomy);
  const resolved = await svc.resolveCategoryToken("العطور والمعطرات > العطور");
  assert.equal(resolved.id, PERFUMES);
  assert.equal(resolved.slug, "perfumes");
});

test("resolveCategoryToken: parent alone fails when children exist", async () => {
  const svc = makeService(taxonomy);
  await assert.rejects(
    () => svc.resolveCategoryToken("العطور والمعطرات"),
    (err) => {
      assert.equal(nestCode(err), CategoryAssignErrors.CATEGORY_PARENT_NOT_ASSIGNABLE);
      return true;
    },
  );
});

test("resolveCategoryToken: ambiguous flat name fails closed", async () => {
  const dupName = "عطور";
  const cats = [
    ...taxonomy,
    { id: randomUUID(), name: dupName, slug: "dup-a", parent_id: null, is_active: true },
    { id: randomUUID(), name: dupName, slug: "dup-b", parent_id: null, is_active: true },
  ];
  const svc = makeService(cats);
  await assert.rejects(
    () => svc.resolveCategoryToken(dupName),
    (err) => {
      assert.equal(nestCode(err), CategoryAssignErrors.CATEGORY_AMBIGUOUS);
      return true;
    },
  );
});
