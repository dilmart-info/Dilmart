import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FRAME_IDS } from "../www/src/catalog.js";
import { createState } from "../www/src/fixtures.js";
import { reduce } from "../www/src/reducer.js";
import { render } from "../www/src/render.js";
import { nativeAdapters } from "../www/src/adapters.js";

const root = new URL("../www/", import.meta.url);
const source = ["index.html", "app.css", "src/main.js", "src/reducer.js", "src/render.js", "src/fixtures.js", "src/adapters.js"]
  .map((name) => readFileSync(new URL(name, root), "utf8")).join("\n");

function walk(scenario, actions) {
  const seen = new Set();
  let state = createState(scenario);
  seen.add(state.screen);
  for (const action of actions) {
    state = reduce(state, action);
    seen.add(state.screen);
  }
  return { state, seen };
}

const signIn = [
  { type: "sign-in", phone: "07701234567", code: "482196" },
  { type: "verify", code: "482196" },
  { type: "device-request" },
  { type: "server-confirm" },
  { type: "device-continue" },
  { type: "location-deny" },
  { type: "go-off-shift" },
  { type: "location-allow" },
  { type: "start-readiness" },
  { type: "confirm-shift" },
  { type: "close-dialog" },
];

test("catalog lists 54 reference frames", () => {
  assert.equal(new Set(FRAME_IDS).size, 54);
  assert.equal(FRAME_IDS[0], "UI-01");
  assert.equal(FRAME_IDS.at(-1), "UI-54");
});

test("pickup scenario hides customer and cash-on-delivery", () => {
  const state = createState("pickup");
  assert.equal(state.customer, null);
  assert.equal(state.codExpected, null);
  const blocked = reduce({ ...state, shift: "active", screen: "UI-01" }, { type: "delivery-route" });
  assert.equal(blocked.screen, "UI-01");
  assert.match(blocked.dialog.text, /مندوب الجمع/);
  const html = render({ ...state, screen: "UI-28", shift: "active" });
  assert.equal(html.includes("07700000000"), false);
  assert.equal(html.includes("سارة"), false);
});

test("hybrid flow reaches every reference frame", () => {
  const { state, seen } = walk("hybrid", [
    ...signIn,
    { type: "theme", theme: "dark" },
    { type: "theme", theme: "light" },
    { type: "open-offer" },
    { type: "expire-offer" },
    { type: "home" },
    { type: "open-offer" },
    { type: "decline-offer" },
    { type: "open-offer" },
    { type: "accept-offer" },
    { type: "check-offer" },
    { type: "close-dialog" },
    { type: "server-confirm" },
    { type: "navigate" },
    { type: "gps-stale" },
    { type: "back" },
    { type: "arrive-merchant" },
    { type: "open-pickup" },
    { type: "damaged" },
    { type: "open-pickup" },
    { type: "open-scanner" },
    { type: "scan-bad" },
    { type: "open-pickup" },
    { type: "partial" },
    { type: "handover" },
    { type: "server-confirm" },
    { type: "hub-scan" },
    { type: "hub-review" },
    { type: "server-confirm" },
    { type: "outbound-review" },
    { type: "server-confirm" },
    { type: "customer-arrive" },
    { type: "delivery-detail" },
    { type: "open-otp" },
    { type: "otp-submit", code: "482196" },
    { type: "cod-submit", amount: "1" },
    { type: "server-confirm" },
    { type: "cash" },
    { type: "remit" },
    { type: "remit-submit" },
    { type: "server-confirm" },
    { type: "earnings" },
    { type: "ledger" },
    { type: "fail-delivery" },
    { type: "return-task" },
    { type: "return-handover" },
    { type: "sync" },
    { type: "sync-check" },
    { type: "recovery" },
    { type: "profile" },
    { type: "vehicle" },
    { type: "notifications" },
    { type: "support" },
    { type: "safety" },
    { type: "task-history" },
    { type: "settings" },
    { type: "end-shift" },
    { type: "review-open" },
  ]);
  assert.deepEqual(FRAME_IDS.filter((id) => !seen.has(id)), []);
  assert.equal(state.shift, "active");
  assert.equal(state.customer.name, "أحمد ناصر");
});

test("login failure and denied location do not start a shift", () => {
  const failed = reduce(createState("pickup"), { type: "sign-in", phone: "0770", code: "000000" });
  assert.equal(failed.screen, "UI-07");
  const denied = walk("permission-denied", [
    { type: "sign-in", phone: "07701234567", code: "482196" },
    { type: "verify", code: "482196" },
    { type: "device-request" },
    { type: "server-confirm" },
    { type: "device-continue" },
    { type: "location-deny" },
    { type: "go-off-shift" },
    { type: "start-readiness" },
  ]);
  assert.equal(denied.state.screen, "UI-11");
  assert.equal(denied.state.shift, "off");
});

test("offer acceptance does not assign the task", () => {
  let state = createState("delivery");
  for (const action of [...signIn, { type: "open-offer" }, { type: "accept-offer" }, { type: "check-offer" }]) state = reduce(state, action);
  assert.equal(state.screen, "UI-15");
  assert.equal(state.offer, "pending");
  assert.equal(state.dialog.title, "ما زال التكليف معلقاً");
});

test("development source does not call production systems", () => {
  for (const token of ["supabase", "fetch(", "XMLHttpRequest", "geolocation", "ztplxqlthuqkuktbznbo", "yssjhxeybitiycdviyrc"]) {
    assert.equal(source.toLowerCase().includes(token.toLowerCase()), false, token);
  }
  assert.equal(nativeAdapters.commands.send().delivered, false);
  assert.equal(nativeAdapters.maps.open().opened, false);
});
