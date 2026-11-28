import { createState } from "./fixtures.js";
import { reduce } from "./reducer.js";
import { render } from "./render.js";

const app = document.querySelector("#app");
let state = createState("pickup");

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
}

window.addEventListener("popstate", () => apply({ type: "back" }, true));

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.id === "sign-in") apply({ type: "sign-in", phone: String(data.get("phone") || ""), code: String(data.get("code") || "") });
  if (event.target.id === "verify") apply({ type: "verify", code: String(data.get("otp") || "") });
  if (event.target.id === "otp") apply({ type: "otp-submit", code: String(data.get("otp") || "") });
  if (event.target.id === "cod") apply({ type: "cod-submit", amount: String(data.get("amount") || "") });
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
  apply({ type: action === "home" ? "home" : action });
});

paint();
