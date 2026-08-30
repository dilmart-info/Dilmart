/**
 * store.DilMart.org is deployed by Netlify DROP (dist/ uploaded directly, no Git build), so the
 * [[headers]] blocks in netlify.toml are never evaluated — a live check confirmed every path,
 * including content-hashed assets, served the platform default `public,max-age=0,must-revalidate`.
 *
 * The cache policy therefore has to travel INSIDE the build output as `public/_headers` (Vite copies
 * public/* to the dist root). These tests pin that file's existence and its two load-bearing rules,
 * so a future refactor cannot silently reintroduce a stale-SPA-shell deploy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const publicDir = resolve(__dirname, "../../../public");
const headersPath = resolve(publicDir, "_headers");
const redirectsPath = resolve(publicDir, "_redirects");

/** Parses a Netlify `_headers` file into `{ pathPattern: { header: value } }`. */
function parseHeaders(raw: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let current: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      current = trimmed;
      out[current] ??= {};
      continue;
    }
    const idx = trimmed.indexOf(":");
    if (idx > 0 && current) {
      out[current][trimmed.slice(0, idx).trim().toLowerCase()] = trimmed.slice(idx + 1).trim();
    }
  }
  return out;
}

describe("Netlify Drop cache policy ships inside the build output", () => {
  it("public/_headers exists (netlify.toml alone does not reach a Drop deploy)", () => {
    expect(existsSync(headersPath)).toBe(true);
  });

  it("never serves a stale SPA shell", () => {
    const rules = parseHeaders(readFileSync(headersPath, "utf8"));
    expect(rules["/*"]?.["cache-control"]).toBe("no-cache");
  });

  it("keeps content-hashed assets immutably cacheable", () => {
    const rules = parseHeaders(readFileSync(headersPath, "utf8"));
    const assets = rules["/assets/*"]?.["cache-control"] ?? "";
    expect(assets).toContain("max-age=31536000");
    expect(assets).toContain("immutable");
  });

  it("keeps the SPA redirect intact", () => {
    expect(existsSync(redirectsPath)).toBe(true);
    expect(readFileSync(redirectsPath, "utf8")).toMatch(/^\/\*\s+\/index\.html\s+200/m);
  });

  it("registers no service worker", () => {
    const raw = readFileSync(headersPath, "utf8");
    expect(raw).not.toMatch(/service-?worker/i);
  });
});
