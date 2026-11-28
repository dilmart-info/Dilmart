import { ACTOR, createState } from "./fixtures.js";
import { reduce } from "./reducer.js";
import { render } from "./render.js";
import {
  clearStore,
  currentFix,
  enqueueLocal,
  listenForNotice,
  onDevice,
  openDeviceSettings,
  postTaskNotice,
  readStore,
  recordBarcode,
  rememberActor,
  scanBarcode,
  watchNetwork,
  writeStore,
} from "./native.js";

const app = document.querySelector("#app");
let state = createState("pickup");
let persist = false;

history.replaceState({ screen: state.screen }, "", "#UI-07");

function paint() {
  app.dataset.theme = state.theme;
  app.dataset.screen = state.screen;
  app.dir = "rtl";
  app.innerHTML = render(state);
}

function apply(action, fromPop = false) {
  const previous = state.screen;
  state = reduce(state, action);
  if (!fromPop && state.screen !== previous) {
    history.pushState({ screen: state.screen }, "", `#${state.screen}`);
  }
  paint();
  if (persist && onDevice() && action.type !== "restore") writeStore(state).catch(() => {});
}

window.addEventListener("popstate", () => apply({ type: "back" }, true));

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.id === "sign-in") apply({ type: "sign-in", phone: String(data.get("phone") || ""), code: String(data.get("code") || "") });
  if (event.target.id === "verify") apply({ type: "verify", code: String(data.get("otp") || "") });
  if (event.target.id === "otp") apply({ type: "otp-submit", code: String(data.get("otp") || "") });
  if (event.target.id === "cod") apply({ type: "cod-submit", amount: String(data.get("amount") || "") });
  if (event.target.id === "manual-barcode") {
    const code = String(data.get("barcode") || "").trim();
    recordBarcode(code).then((row) => {
      apply({ type: "scan-code", code, stored: row && row.result });
      if (row && row.result === "recorded") enqueueLocal({ id: `scan-${code}`, kind: "scan", payload: code }).catch(() => {});
    }).catch(() => apply({ type: "scan-code", code }));
  }
});

app.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("button") : null;
  if (!button || button.type === "submit") return;
  if (button.dataset.scenario) {
    apply({ type: "scenario", scenario: button.dataset.scenario });
    return;
  }
  if (button.dataset.nav) {
    apply({ type: "nav", id: button.dataset.nav });
    return;
  }
  const action = button.dataset.action;
  if (!action) return;
  if (action === "back") {
    if (state.history.length === 0) return;
    history.back();
    return;
  }
  if (action === "theme-light" || action === "theme-dark") {
    apply({ type: "theme", theme: action === "theme-dark" ? "dark" : "light" });
    return;
  }
  if (action === "scan-live") {
    scanBarcode().then(async (scan) => {
      if (scan.reason === "denied") {
        apply({ type: "camera-deny" });
        return;
      }
      if (!scan.code) return;
      const row = await recordBarcode(scan.code).catch(() => ({ result: "recorded" }));
      apply({ type: "scan-code", code: scan.code, stored: row && row.result });
      if (row && row.result === "recorded") enqueueLocal({ id: `scan-${scan.code}`, kind: "scan", payload: scan.code }).catch(() => {});
    }).catch(() => apply({ type: "scan-bad" }));
    return;
  }
  if (action === "fake-settings") {
    openDeviceSettings().then((opened) => {
      if (!opened) apply({ type: "fake-settings" });
    }).catch(() => apply({ type: "fake-settings" }));
    return;
  }
  if (action === "read-fix" || action === "permissions-allow" || action === "start-readiness") {
    if (!onDevice()) {
      apply({ type: action === "read-fix" ? "position" : action });
      return;
    }
    currentFix().then((fix) => {
      if (fix.status === "denied") {
        apply({ type: "location-deny" });
        return;
      }
      if (fix.status !== "ok") {
        apply({ type: "gps-stale" });
        return;
      }
      apply({ type: "position", position: fix.position });
      if (action !== "read-fix") apply({ type: action });
    }).catch(() => apply({ type: "gps-stale" }));
    return;
  }
  if (action === "notify-task") {
    postTaskNotice().then((result) => {
      if (!result.posted) apply({ type: "help" });
    }).catch(() => apply({ type: "help" }));
    return;
  }
  if (action === "reset") clearStore().catch(() => {});
  apply({ type: action === "home" ? "home" : action });
});

async function boot() {
  for (let attempt = 0; attempt < 20 && !onDevice(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (onDevice()) {
    try {
      const saved = await readStore();
      if (saved) state = reduce(state, { type: "restore", state: saved });
      await rememberActor(ACTOR);
      persist = true;
    } catch {
      persist = false;
    }
    watchNetwork((online) => apply({ type: "connectivity", online })).catch(() => {});
    listenForNotice(() => {
      if (state.shift === "active") apply({ type: "open-offer" });
    });
  }
  history.replaceState({ screen: state.screen }, "", `#${state.screen}`);
  paint();
}

boot();
