import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const css = readFileSync(new URL("preview.css", root), "utf8");
const js = readFileSync(new URL("preview.js", root), "utf8");
const source = `${html}\n${css}\n${js}`;

const screens = ["UI-07", "UI-08", "UI-09", "UI-10", "UI-11", "UI-12", "UI-13", "UI-01", "UI-02", "UI-15", "UI-16", "UI-14", "UI-43", "UI-54"];

test("fourteen preview screens are declared", () => {
  for (const id of screens) assert.match(js, new RegExp(`"${id}"`));
});

test("document is Arabic RTL and uses the approved tokens", () => {
  assert.match(html, /lang="ar"/);
  assert.match(html, /dir="rtl"/);
  for (const color of ["#142B49", "#087E74", "#F3F6F8", "#FFFFFF", "#15803D", "#B45309", "#B91C1C", "#101C2B", "#203247"]) {
    assert.match(css, new RegExp(color, "i"));
  }
});

test("preview source does not call production systems", () => {
  for (const forbidden of ["supabase", "fetch(", "XMLHttpRequest", "geolocation", "capacitor", "ztplxqlthuqkuktbznbo", "yssjhxeybitiycdviyrc"]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});
