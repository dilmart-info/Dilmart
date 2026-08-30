/**
 * DilMart-STORE-DESKTOP-QUICK-LINKS-SECURITY-047/048 — canonical href validator (internal-only
 * policy) + defense-in-depth wiring (admin create/update reject unsafe hrefs; public read filters
 * legacy-invalid rows). Pure unit tests against the compiled service classes with a minimal fake
 * Supabase client — same style as category-assignability-service.test.mjs. No live DB.
 */
import test from "node:test";
import assert from "node:assert/strict";

const {
  classifyDesktopQuickLinkHref,
  isValidDesktopQuickLinkHref,
} = await import("../dist/modules/admin/desktop-quick-link-href.validator.js");
const { AdminOperationalAlertsService } = await import("../dist/modules/admin/admin-operational-alerts.service.js");
const { MarketplaceService } = await import("../dist/modules/marketplace/marketplace.service.js");

// ── Pure validator — VALID cases (internal Store paths only) ───────────────────────────────

test("accepts safe internal Store paths", () => {
  for (const href of [
    "/",
    "/products",
    "/products?brand=Lattafa",
    "/category/tools",
    "/offers",
    "/products?search=%D8%AD%D9%84%D8%A7%D9%82%D8%A9",
    "/products?sort=newest",
  ]) {
    assert.equal(classifyDesktopQuickLinkHref(href), "VALID_INTERNAL", `should accept ${href}`);
    assert.equal(isValidDesktopQuickLinkHref(href), true);
  }
});

test("preserves a legitimate single-encoded query value", () => {
  assert.equal(classifyDesktopQuickLinkHref("/products?brand=O%27me%27do"), "VALID_INTERNAL");
});

// ── Query key/value encoding correctness (DilMart-STORE-DESKTOP-QUICK-LINKS-SECURITY-FIX-049) ──

test("accepts a literal percent sign that survives one decode — not double-encoding", () => {
  for (const href of [
    "/products?search=50%25",
    "/products?search=100%25%20original",
    "/products?brand=Lattafa&search=50%25",
  ]) {
    assert.equal(classifyDesktopQuickLinkHref(href), "VALID_INTERNAL", `should accept ${href}`);
  }
});

test("rejects a malformed percent escape in the query KEY", () => {
  assert.equal(classifyDesktopQuickLinkHref("/products?%ZZ=ok"), "INVALID_MALFORMED");
});

test("rejects a double-encoded query KEY", () => {
  assert.equal(classifyDesktopQuickLinkHref("/products?%2525=ok"), "INVALID_MALFORMED");
});

test("rejects a decoded control character in the query KEY", () => {
  assert.equal(classifyDesktopQuickLinkHref("/products?na%0Ame=value"), "INVALID_UNSAFE_CHARACTERS");
});

test("rejects a malformed percent escape in the query VALUE", () => {
  assert.equal(classifyDesktopQuickLinkHref("/products?search=%ZZ"), "INVALID_MALFORMED");
});

test("rejects a double-encoded query VALUE", () => {
  assert.equal(classifyDesktopQuickLinkHref("/products?search=50%2525"), "INVALID_MALFORMED");
});

test("rejects a decoded control character in the query VALUE", () => {
  assert.equal(classifyDesktopQuickLinkHref("/products?search=foo%0Abar"), "INVALID_UNSAFE_CHARACTERS");
});

// ── Policy: internal-only — explicit http(s) external URLs are rejected outright ───────────

test("rejects explicit http/https external URLs regardless of well-formedness", () => {
  for (const href of ["https://example.com/promo", "http://example.com/x?y=1", "https://partner.example.com/promo"]) {
    assert.equal(classifyDesktopQuickLinkHref(href), "INVALID_EXTERNAL_NOT_ALLOWED", `should reject ${href}`);
    assert.equal(isValidDesktopQuickLinkHref(href), false);
  }
});

// ── Raw leading/trailing whitespace must never be stripped-then-accepted ───────────────────

test("rejects raw leading/trailing whitespace and control chars on the original input", () => {
  const cases = [
    " https://example.com",
    "https://example.com ",
    "\thttps://example.com",
    "https://example.com\r",
    "\nhttps://example.com",
    " /offers",
    "/offers ",
    "\t/products",
  ];
  for (const href of cases) {
    const c = classifyDesktopQuickLinkHref(href);
    assert.equal(c, "INVALID_LEADING_OR_TRAILING_WHITESPACE", `${JSON.stringify(href)} should be rejected as whitespace-boundary, got ${c}`);
    assert.equal(isValidDesktopQuickLinkHref(href), false);
  }
});

test("rejects a control char embedded mid-string (not just at boundaries)", () => {
  assert.equal(isValidDesktopQuickLinkHref("https://exa\nmple.com"), false);
});

// ── INVALID cases (task's exact list, plus obfuscation variants) ───────────────────────────

test("rejects javascript: scheme, including case and whitespace obfuscation", () => {
  for (const href of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "\tjavascript:alert(1)",
    "\njavascript:alert(1)",
    "jav\tascript:alert(1)",
    "  \n javascript:alert(1)",
  ]) {
    assert.equal(isValidDesktopQuickLinkHref(href), false, `should reject ${JSON.stringify(href)}`);
  }
});

test("rejects every other unsafe scheme from the task's list", () => {
  const cases = [
    ["data:text/html,<script>alert(1)</script>", "INVALID_DATA_SCHEME"],
    ["vbscript:msgbox(1)", "INVALID_VBSCRIPT_SCHEME"],
    ["file:///etc/passwd", "INVALID_FILE_SCHEME"],
    ["blob:https://example.com/uuid", "INVALID_BLOB_SCHEME"],
    ["about:blank", "INVALID_ABOUT_SCHEME"],
    ["intent://scan/#Intent;scheme=zxing;end", "INVALID_INTENT_SCHEME"],
  ];
  for (const [href, expected] of cases) {
    const c = classifyDesktopQuickLinkHref(href);
    assert.equal(c, expected, `${href} should be ${expected}, got ${c}`);
    assert.equal(isValidDesktopQuickLinkHref(href), false);
  }
});

test("rejects protocol-relative URLs", () => {
  for (const href of ["//evil.com", "//evil.com/x"]) {
    assert.equal(classifyDesktopQuickLinkHref(href), "INVALID_PROTOCOL_RELATIVE");
    assert.equal(isValidDesktopQuickLinkHref(href), false);
  }
});

test("rejects percent-encoded scheme obfuscation (does not start with /)", () => {
  for (const href of ["javascript%3Aalert(1)", "%6A%61%76%61%73%63%72%69%70%74%3Aalert(1)"]) {
    assert.equal(isValidDesktopQuickLinkHref(href), false, `should reject ${href}`);
  }
});

test("rejects control/newline-obfuscated variants embedded inside an otherwise internal-looking path", () => {
  for (const href of ["/foo\njavascript:alert(1)", "/foo\rbar", "/foo\x00bar", "/foo<script>", "/foo\\..\\bar"]) {
    assert.equal(isValidDesktopQuickLinkHref(href), false, `should reject ${JSON.stringify(href)}`);
  }
});

test("rejects unknown/arbitrary schemes and malformed/empty/oversized input", () => {
  assert.equal(classifyDesktopQuickLinkHref("ftp://example.com"), "INVALID_UNKNOWN_SCHEME");
  assert.equal(classifyDesktopQuickLinkHref(""), "INVALID_EMPTY_OR_TOO_LONG");
  assert.equal(classifyDesktopQuickLinkHref("a".repeat(501)), "INVALID_EMPTY_OR_TOO_LONG");
  assert.equal(classifyDesktopQuickLinkHref(null), "INVALID_EMPTY_OR_TOO_LONG");
  assert.equal(classifyDesktopQuickLinkHref(undefined), "INVALID_EMPTY_OR_TOO_LONG");
  assert.equal(classifyDesktopQuickLinkHref("/products?brand=%"), "INVALID_MALFORMED"); // lone "%" is itself a malformed escape
  assert.equal(classifyDesktopQuickLinkHref("/products?brand=%2525"), "INVALID_MALFORMED"); // decodes to "%25" — still an escape, one more layer remains
});

test("rejects embedded credentials in an otherwise well-formed external URL (still external, still rejected)", () => {
  assert.equal(isValidDesktopQuickLinkHref("https://user:pass@example.com"), false);
});

test("rejects non-slash relative paths", () => {
  for (const href of ["relative/path", "products", "./products", "../products"]) {
    assert.equal(isValidDesktopQuickLinkHref(href), false, `should reject ${href}`);
  }
});

// ── Fake Supabase client — minimal, tailored to exactly the chains under test ──────────────

function makeFakeSupabaseForWrites(seedRows = []) {
  const rows = seedRows.map((r) => ({ ...r }));
  let nextId = 1;
  const client = {
    from(table) {
      assert.equal(table, "desktop_quick_links");
      let mode = null; // 'insert' | 'update'
      let insertPayload = null;
      let updatePayload = null;
      let updateId = null;
      const api = {
        insert(payload) {
          mode = "insert";
          insertPayload = payload;
          return api;
        },
        update(payload) {
          mode = "update";
          updatePayload = payload;
          return api;
        },
        eq(col, val) {
          if (mode === "update" && col === "id") updateId = val;
          return api;
        },
        select() {
          return api;
        },
        async single() {
          if (mode === "insert") {
            const row = { id: `row-${nextId++}`, sort_order: 0, is_active: true, ...insertPayload };
            rows.push(row);
            return { data: row, error: null };
          }
          if (mode === "update") {
            const row = rows.find((r) => r.id === updateId);
            if (!row) return { data: null, error: { message: "not found" } };
            Object.assign(row, updatePayload);
            return { data: { ...row }, error: null };
          }
          return { data: null, error: { message: "unsupported" } };
        },
      };
      return api;
    },
  };
  return { client, rows };
}

function makeFakeSupabaseForPublicRead(seedRows) {
  const client = {
    from(table) {
      assert.equal(table, "desktop_quick_links");
      const filters = [];
      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          filters.push([col, val]);
          return api;
        },
        order() {
          return api;
        },
        then(resolve, reject) {
          const matched = seedRows.filter((r) => filters.every(([c, v]) => r[c] === v));
          return Promise.resolve({ data: matched.map((r) => ({ ...r })), error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return { client };
}

// ── Admin write path — backend authoritative validation ────────────────────────────────────

test("createDesktopQuickLink rejects an invalid href with a 400-class error", async () => {
  const { client } = makeFakeSupabaseForWrites();
  const svc = new AdminOperationalAlertsService({ client }, {}, {});
  await assert.rejects(
    () => svc.createDesktopQuickLink({ label: "x", href: "javascript:alert(1)", sort_order: 0, is_active: true }),
    (err) => {
      assert.equal(err?.status ?? err?.getStatus?.(), 400);
      return true;
    },
  );
});

test("createDesktopQuickLink rejects an external URL (internal-only policy) with a 400-class error", async () => {
  const { client } = makeFakeSupabaseForWrites();
  const svc = new AdminOperationalAlertsService({ client }, {}, {});
  await assert.rejects(
    () => svc.createDesktopQuickLink({ label: "x", href: "https://example.com", sort_order: 0, is_active: true }),
    (err) => {
      assert.equal(err?.status ?? err?.getStatus?.(), 400);
      return true;
    },
  );
});

test("createDesktopQuickLink accepts a valid internal href and persists it", async () => {
  const { client, rows } = makeFakeSupabaseForWrites();
  const svc = new AdminOperationalAlertsService({ client }, {}, {});
  const created = await svc.createDesktopQuickLink({ label: "العروض", href: "/offers", sort_order: 1, is_active: true });
  assert.equal(created.href, "/offers");
  assert.equal(rows.length, 1);
});

test("updateDesktopQuickLink rejects a supplied invalid href", async () => {
  const { client } = makeFakeSupabaseForWrites([{ id: "row-1", label: "x", href: "/offers", sort_order: 0, is_active: true }]);
  const svc = new AdminOperationalAlertsService({ client }, {}, {});
  await assert.rejects(
    () => svc.updateDesktopQuickLink("row-1", { href: "data:text/html,x" }),
    (err) => {
      assert.equal(err?.status ?? err?.getStatus?.(), 400);
      return true;
    },
  );
});

test("updateDesktopQuickLink without href still succeeds (label/sort/active-only edits) even when the row's stored href is legacy-invalid", async () => {
  const { client } = makeFakeSupabaseForWrites([
    { id: "row-1", label: "old", href: "javascript:eval(atob('ZXZpbA=='))", sort_order: 0, is_active: true },
  ]);
  const svc = new AdminOperationalAlertsService({ client }, {}, {});
  const updated = await svc.updateDesktopQuickLink("row-1", { label: "new", is_active: false });
  assert.equal(updated.label, "new");
  assert.equal(updated.is_active, false);
  assert.equal(updated.href, "javascript:eval(atob('ZXZpbA=='))"); // untouched, not required to become valid
});

test("updateDesktopQuickLink accepts a valid new href", async () => {
  const { client } = makeFakeSupabaseForWrites([{ id: "row-1", label: "x", href: "/offers", sort_order: 0, is_active: true }]);
  const svc = new AdminOperationalAlertsService({ client }, {}, {});
  const updated = await svc.updateDesktopQuickLink("row-1", { href: "/products?sort=newest" });
  assert.equal(updated.href, "/products?sort=newest");
});

// ── Public read path — legacy-invalid rows filtered, valid rows unaffected ─────────────────

test("listActiveDesktopQuickLinks filters out an invalid legacy row without breaking valid ones", async () => {
  const seed = [
    { id: "good-1", label: "العروض", href: "/offers", sort_order: 1, is_active: true },
    { id: "bad-1", label: "مضر", href: "javascript:eval(atob('ZXZpbA=='))", sort_order: 2, is_active: true },
    { id: "good-2", label: "الأحدث", href: "/products?sort=newest", sort_order: 3, is_active: true },
    { id: "inactive", label: "غير نشط", href: "/offers", sort_order: 4, is_active: false },
  ];
  const { client } = makeFakeSupabaseForPublicRead(seed);
  const svc = new MarketplaceService({ client }, {});
  const result = await svc.listActiveDesktopQuickLinks();
  const ids = result.map((r) => r.id).sort();
  assert.deepEqual(ids, ["good-1", "good-2"]); // bad-1 filtered, inactive excluded by RLS-equivalent eq filter
});

test("listActiveDesktopQuickLinks returns all rows when every row is valid", async () => {
  const seed = [
    { id: "a", label: "1", href: "/offers", sort_order: 1, is_active: true },
    { id: "b", label: "2", href: "/products", sort_order: 2, is_active: true },
  ];
  const { client } = makeFakeSupabaseForPublicRead(seed);
  const svc = new MarketplaceService({ client }, {});
  const result = await svc.listActiveDesktopQuickLinks();
  assert.equal(result.length, 2);
});

test("listActiveDesktopQuickLinks filters out a legacy external-URL row now that policy is internal-only", async () => {
  const seed = [
    { id: "good-1", label: "العروض", href: "/offers", sort_order: 1, is_active: true },
    { id: "legacy-external", label: "شريك قديم", href: "https://partner.example.com/promo", sort_order: 2, is_active: true },
  ];
  const { client } = makeFakeSupabaseForPublicRead(seed);
  const svc = new MarketplaceService({ client }, {});
  const result = await svc.listActiveDesktopQuickLinks();
  assert.deepEqual(result.map((r) => r.id), ["good-1"]);
});
