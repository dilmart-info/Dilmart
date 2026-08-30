/**
 * apply-golden10-content.mjs safety tests (no network by default).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptUrl = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "product-import", "apply-golden10-content.mjs"),
).href;

const mod = await import(scriptUrl);

test("ready fixture count remains 9 and HOLD remains 1", () => {
  const rows = mod.loadReadyRows();
  assert.equal(rows.length, 9);
  mod.assertHoldFixture();
});

test("incorrect/missing API base fails before write", async () => {
  await assert.rejects(
    () =>
      mod.runApplyGolden10({
        argv: ["node", "apply", "--execute"],
        env: {},
        skipConfirm: true,
      }),
    /DilMart_API_BASE_URL is required/,
  );

  await assert.rejects(
    () =>
      mod.runApplyGolden10({
        argv: ["node", "apply", "--execute"],
        env: { DilMart_API_BASE_URL: "https://DilMart-store-api.onrender.com/api", ADMIN_ACCESS_TOKEN: "t" },
        skipConfirm: true,
      }),
    /Refusing silent\/legacy API host/,
  );
});

test("health failure stops before write", async () => {
  let writes = 0;
  await assert.rejects(
    () =>
      mod.runApplyGolden10({
        argv: ["node", "apply", "--execute"],
        env: {
          DilMart_API_BASE_URL: "https://DilMart-store-backend.onrender.com/api",
          ADMIN_ACCESS_TOKEN: "token",
        },
        skipConfirm: true,
        fetchImpl: async (url) => {
          if (String(url).endsWith("/health")) {
            return { ok: false, status: 503, text: async () => '{"ok":false}' };
          }
          writes += 1;
          return { ok: true, status: 200, text: async () => "{}" };
        },
      }),
    /Health check failed/,
  );
  assert.equal(writes, 0);
});

test("success performs one write request with content-only fields", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "golden10-"));
  const lockPath = path.join(tmp, "lock.json");
  const reportDir = path.join(tmp, "reports");
  const calls = [];

  const products = mod.loadReadyRows().map((r, i) => ({
    id: `p-${i}`,
    merchant_id: mod.MERCHANT_ID,
    merchant_sku: String(r.merchant_sku).trim().toUpperCase(),
    short_description: null,
    description: null,
    name: "n",
    price: 1,
    stock: 0,
  }));

  const result = await mod.runApplyGolden10({
    argv: ["node", "apply", "--execute"],
    env: {
      DilMart_API_BASE_URL: "https://DilMart-store-backend.onrender.com/api",
      ADMIN_ACCESS_TOKEN: "token",
    },
    skipConfirm: true,
    lockPath,
    reportDir,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init?.method || "GET", body: init?.body ? JSON.parse(init.body) : null });
      if (String(url).endsWith("/health")) {
        return { ok: true, status: 200, text: async () => '{"ok":true}' };
      }
      if (String(url).includes("/products?") && (!init?.method || init.method === "GET")) {
        return { ok: true, status: 200, text: async () => JSON.stringify(products) };
      }
      if (String(url).includes("/content/bulk-update")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, updated_count: 9, results: [] }),
        };
      }
      return { ok: false, status: 404, text: async () => "{}" };
    },
  });

  assert.equal(result.write_requests, 1);
  const writeCalls = calls.filter((c) => c.method === "POST");
  assert.equal(writeCalls.length, 1);
  assert.ok(String(writeCalls[0].url).includes("/content/bulk-update"));
  const body = writeCalls[0].body;
  assert.equal(body.items.length, 9);
  for (const item of body.items) {
    assert.deepEqual(Object.keys(item).sort(), ["description", "merchant_sku", "short_description"]);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "price"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "stock"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "name"), false);
  }
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  assert.equal(lock.status, "COMPLETE");
});

test("timeout preserves indeterminate lock and blocks blind rerun", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "golden10-"));
  const lockPath = path.join(tmp, "lock.json");
  const reportDir = path.join(tmp, "reports");
  const rows = mod.loadReadyRows();
  const beforeAfter = rows.map((r) => ({
    merchant_sku: String(r.merchant_sku).trim().toUpperCase(),
    before: { short_description: null, description: null },
    after: {
      short_description: String(r.short_description).trim(),
      description: String(r.description || "").trim() || null,
    },
  }));

  await assert.rejects(
    () =>
      mod.runApplyGolden10({
        argv: ["node", "apply", "--execute"],
        env: {
          DilMart_API_BASE_URL: "https://DilMart-store-backend.onrender.com/api",
          ADMIN_ACCESS_TOKEN: "token",
        },
        skipConfirm: true,
        lockPath,
        reportDir,
        beforeAfter,
        fetchImpl: async (url, init) => {
          if (String(url).endsWith("/health")) {
            return { ok: true, status: 200, text: async () => '{"ok":true}' };
          }
          if (String(url).includes("/content/bulk-update")) {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
          }
          return { ok: false, status: 404, text: async () => "{}" };
        },
      }),
    /INDETERMINATE_REQUIRES_DB_VERIFICATION/,
  );

  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  assert.equal(lock.status, "INDETERMINATE_REQUIRES_DB_VERIFICATION");

  await assert.rejects(
    () =>
      mod.runApplyGolden10({
        argv: ["node", "apply", "--execute"],
        env: {
          DilMart_API_BASE_URL: "https://DilMart-store-backend.onrender.com/api",
          ADMIN_ACCESS_TOKEN: "token",
        },
        skipConfirm: true,
        lockPath,
        reportDir,
        beforeAfter,
        fetchImpl: async () => ({ ok: true, status: 200, text: async () => "{}" }),
      }),
    /Indeterminate lock present/,
  );
});

test("payload builder never includes forbidden fields", () => {
  const payload = mod.buildBulkPayload(mod.loadReadyRows());
  for (const item of payload.items) {
    for (const forbidden of ["name", "price", "stock", "images", "category_id", "brand", "is_active"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(item, forbidden), false);
    }
  }
});
