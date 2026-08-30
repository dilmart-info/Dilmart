#!/usr/bin/env node
/**
 * Build a fake live catalog matching frozen currents for CI/local adapter tests.
 * Does not contact production.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadResolvedFromDocs,
  groupUpdatesBySku,
  P1_HOLD_SKUS,
  HOLD_KNOWN,
} from "./lib/private-catalog-fix-runtime.mjs";
import { TARGET_MERCHANT_ID } from "./lib/private-catalog-fix-gates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = path.join(ROOT, "docs/product-import/ard-al-khaleej/private-catalog-fix-plan");
const OUT =
  process.argv[2] ||
  path.join(ROOT, ".tmp-product-import/ard-al-khaleej/private-catalog-fix-plan/fake-adapters.json");

const resolved = loadResolvedFromDocs(DOCS, ROOT);
if (!resolved.ok) {
  console.error(resolved.errors);
  process.exit(1);
}

const grouped = groupUpdatesBySku(resolved.fieldRows);
const products = [];
const used = new Set();

for (const g of grouped) {
  used.add(g.merchant_sku);
  const p = {
    id: `id-${g.merchant_sku}`,
    merchant_id: TARGET_MERCHANT_ID,
    merchant_sku: g.merchant_sku,
    name: g.fields.name?.current_value || `Product ${g.merchant_sku}`,
    slug: g.fields.slug?.current_value || `slug-${g.merchant_sku.toLowerCase()}`,
    brand: g.fields.brand?.current_value || "Lattafa",
    sizes: g.fields.sizes?.current_value || "100 مل",
    category_slug: g.fields.category_slug?.current_value || "perfumes",
    // ARD-775 is frozen with category_slug=musk-oils-mukhammaria (current_value) and is
    // proposed to move to perfumes — the fake catalog MUST start it in cat-musk so the
    // category_slug fix is exercised end to end.
    category_id: g.fields.category_slug?.current_value === "musk-oils-mukhammaria" ? "cat-musk" : "cat-perfumes-leaf",
    short_description: g.fields.short_description?.current_value || "x".repeat(50),
    description: "",
    image_url: g.fields.image_url?.current_value || "",
    images: g.fields.image_url?.current_value ? [g.fields.image_url.current_value] : [],
    price: 10000,
    purchase_price: 0,
    stock: 0,
    low_stock_threshold: 5,
    is_active: false,
    is_published: false,
    visibility_status: "private",
    discount_price: null,
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    loyalty_points_enabled: false,
  };
  products.push(p);
}

// Explicitly seed the 4 HOLD SKUs + ARD-1191 as real (unaffected) products so postflight's
// exact HOLD / ARD-1191 checks have something concrete to compare against — these must
// remain byte-for-byte unchanged across the whole execution.
for (const sku of [...P1_HOLD_SKUS, ...HOLD_KNOWN]) {
  used.add(sku);
  products.push({
    id: `id-${sku}`,
    merchant_id: TARGET_MERCHANT_ID,
    merchant_sku: sku,
    name: `Held product ${sku}`,
    slug: `held-${sku.toLowerCase()}`,
    brand: "Lattafa",
    sizes: "100 مل",
    category_slug: "perfumes",
    category_id: "cat-perfumes-leaf",
    short_description: "منتج محجوز لا يجوز تعديله ضمن نطاق هذا الإصلاح إطلاقًا.",
    description: "",
    image_url: "",
    images: [],
    price: 10000,
    purchase_price: 0,
    stock: 0,
    low_stock_threshold: 5,
    is_active: false,
    is_published: false,
    visibility_status: "private",
    discount_price: null,
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    loyalty_points_enabled: false,
  });
}

// Fill to 110 with safe unaffected products; craft category distribution for postflight.
// Pre-execution: musk includes ARD-775 + 1 filler (=2). After 775→perfumes: musk=1, perfumes=98.
const needed = {
  "home-linen-air": 8,
  "mini-travel-perfume": 3,
  "musk-oils-mukhammaria": 2,
  perfumes: 0,
};
for (const p of products) {
  const s = p.category_slug || "perfumes";
  if (needed[s] != null) needed[s] = Math.max(0, needed[s] - 1);
}
let i = 0;
while (products.length < 110) {
  i += 1;
  const sku = `FILL-${String(i).padStart(3, "0")}`;
  if (used.has(sku)) continue;
  let cat = "perfumes";
  let catId = "cat-perfumes-leaf";
  if (needed["home-linen-air"] > 0) {
    cat = "home-linen-air";
    catId = "cat-home";
    needed["home-linen-air"] -= 1;
  } else if (needed["mini-travel-perfume"] > 0) {
    cat = "mini-travel-perfume";
    catId = "cat-mini";
    needed["mini-travel-perfume"] -= 1;
  } else if (needed["musk-oils-mukhammaria"] > 0) {
    cat = "musk-oils-mukhammaria";
    catId = "cat-musk";
    needed["musk-oils-mukhammaria"] -= 1;
  }
  products.push({
    id: `id-${sku}`,
    merchant_id: TARGET_MERCHANT_ID,
    merchant_sku: sku,
    name: `Filler ${sku}`,
    slug: `filler-${sku.toLowerCase()}`,
    brand: "Lattafa",
    sizes: "100 مل",
    category_slug: cat,
    category_id: catId,
    short_description: "وصف تعبئة للاختبار بطول كافٍ للتحقق من الحقول الآمنة فقط.",
    description: "",
    image_url: "",
    images: [],
    price: 10000,
    purchase_price: 0,
    stock: 0,
    low_stock_threshold: 5,
    is_active: false,
    is_published: false,
    visibility_status: "private",
    discount_price: null,
    is_featured: false,
    is_new: false,
    is_best_seller: false,
    loyalty_points_enabled: false,
  });
}

// Seed objects map empty (targets absent). Optionally seed 100 original placeholders for count tests.
const objects = {};
for (let n = 0; n < 100; n++) {
  const p = `${TARGET_MERCHANT_ID}/ORIG-${n}.webp`;
  objects[p] = { sha: "0".repeat(64) };
}

const state = {
  merchant: { id: TARGET_MERCHANT_ID, slug: "arth-al-khaleej".replace("khaleej", "khaleg"), status: "draft" },
  products,
  categories: [
    { id: "cat-perfumes-leaf", slug: "perfumes", is_active: true, parent_id: null },
    { id: "cat-musk", slug: "musk-oils-mukhammaria", is_active: true, parent_id: null },
    { id: "cat-home", slug: "home-linen-air", is_active: true, parent_id: null },
    { id: "cat-mini", slug: "mini-travel-perfume", is_active: true, parent_id: null },
  ],
  objects,
  connection: {
    supabaseUrl: "https://ztplxqlthuqkuktbznbo.supabase.co",
    backendApi: "https://DilMart-store-backend.onrender.com/api",
    merchantId: TARGET_MERCHANT_ID,
    merchantSlug: "arth-al-khaleg",
    merchantStatus: "draft",
    productCount: 110,
  },
};
// fix slug typo
state.merchant.slug = "arth-al-khaleg";

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(state));
console.log(JSON.stringify({ ok: true, out: OUT, products: products.length, affected: grouped.length }));
