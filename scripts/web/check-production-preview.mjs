/**
 * Production preview smoke guard.
 *
 * `npm run build` exiting 0 says nothing about whether the bundle actually boots — a
 * circular chunk graph builds cleanly and then throws on the first module evaluation,
 * leaving a black screen. This guard serves dist/ through `vite preview`, drives a real
 * headless Chrome over the DevTools Protocol, and fails when the page does not render
 * or when the console reports a runtime crash.
 *
 * Zero new dependencies: Node 22 ships a global WebSocket, and Chrome is discovered
 * from the local install.
 *
 * Usage:  node scripts/web/check-production-preview.mjs [--port 4173] [--route /]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distDir = path.join(root, "dist");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(argValue("--port", "4173"));
const HOST = "127.0.0.1";
const ROUTES = argValue("--route", "/,/products,/auth").split(",");
const NAV_TIMEOUT_MS = 30_000;
const SETTLE_MS = 2_500;

/** Console text that always means the bundle failed to boot. */
const FATAL_PATTERNS = [
  "forwardRef",
  "Cannot read properties of undefined",
  "React is undefined",
  "is not a function",
  "Cannot access '",
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

/** dist/ must exist and index.html must reference files that are actually there. */
function checkDistLayout() {
  const problems = [];
  const indexPath = path.join(distDir, "index.html");

  if (!fs.existsSync(indexPath)) {
    problems.push("dist/index.html is missing — run npm run build first");
    return { problems, entry: null };
  }

  const html = fs.readFileSync(indexPath, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
  const entry = refs.find((r) => r.endsWith(".js"));

  if (!entry) problems.push("dist/index.html references no entry JavaScript file");

  for (const ref of refs) {
    if (!/\.(js|css)$/.test(ref)) continue;
    if (!fs.existsSync(path.join(distDir, ref.replace(/^\//, "")))) {
      problems.push(`dist/index.html references ${ref}, which does not exist on disk`);
    }
  }

  if (html.includes("dist-mobile") || html.includes("index.mobile")) {
    problems.push("dist/index.html points at the mobile bundle — the wrong build was published");
  }

  return { problems, entry };
}

async function cdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let nextId = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method) {
      events.push(message);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { send, events, close: () => socket.close() };
}

function collectFindings(events) {
  const consoleErrors = [];
  const exceptions = [];
  const failedRequests = [];

  for (const event of events) {
    if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") {
      consoleErrors.push(event.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    }
    if (event.method === "Runtime.exceptionThrown") {
      const d = event.params.exceptionDetails;
      exceptions.push(d.exception?.description ?? d.text ?? "unknown exception");
    }
    if (event.method === "Log.entryAdded" && event.params.entry.level === "error") {
      consoleErrors.push(event.params.entry.text);
    }
    if (event.method === "Network.loadingFailed") {
      failedRequests.push(`${event.params.type} ${event.params.errorText}`);
    }
    if (event.method === "Network.responseReceived" && event.params.response.status >= 400) {
      failedRequests.push(`${event.params.response.status} ${event.params.response.url}`);
    }
  }

  return { consoleErrors, exceptions, failedRequests };
}

async function main() {
  const { problems, entry } = checkDistLayout();
  for (const problem of problems) fail(problem);
  if (problems.length > 0) return;

  console.log(`dist entry: ${entry}`);

  const chrome = findChrome();
  if (!chrome) {
    fail(
      "no Chrome or Edge binary found. Set CHROME_PATH to a Chromium-based browser to run this guard.",
    );
    return;
  }
  console.log(`browser   : ${chrome}`);

  // Spawn Vite's JS entry through the current Node binary. Running the .cmd shim would
  // need a shell on Windows, which newer Node refuses without shell: true.
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(viteBin)) {
    fail("vite is not installed — run npm ci before this guard");
    return;
  }
  const preview = spawn(
    process.execPath,
    [viteBin, "preview", "--host", HOST, "--port", String(PORT), "--strictPort"],
    { cwd: root, stdio: "ignore" },
  );

  const userDataDir = fs.mkdtempSync(path.join(root, "node_modules", ".preview-smoke-"));
  const debugPort = PORT + 1;
  const browser = spawn(
    chrome,
    [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const cleanup = () => {
    try {
      browser.kill();
    } catch {
      /* already gone */
    }
    try {
      preview.kill();
    } catch {
      /* already gone */
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };
  process.on("exit", cleanup);

  try {
    const previewUrl = `http://${HOST}:${PORT}`;
    await waitFor(async () => (await fetch(previewUrl)).ok, "vite preview did not start");

    // A server already squatting on this port would answer, and the guard would then
    // smoke-test somebody else's bundle and pass. Verify the served document is the
    // artifact that is actually on disk before trusting anything below.
    const servedHtml = await (await fetch(previewUrl)).text();
    if (!servedHtml.includes(entry)) {
      fail(
        `port ${PORT} is serving a different bundle than dist/ — expected ${entry}. ` +
          `Another dev server is probably bound to it; rerun with --port <free port>.`,
      );
      return;
    }

    let target = null;
    await waitFor(async () => {
      const list = await (await fetch(`http://${HOST}:${debugPort}/json/list`)).json();
      target = list.find((t) => t.type === "page");
      return Boolean(target?.webSocketDebuggerUrl);
    }, "Chrome DevTools endpoint did not come up");

    for (const route of ROUTES) {
      const url = `${previewUrl}${route}`;
      const client = await cdp(target.webSocketDebuggerUrl);

      await client.send("Runtime.enable");
      await client.send("Log.enable");
      await client.send("Network.enable");
      await client.send("Page.enable");
      await client.send("Runtime.addBinding", { name: "__smokeBinding" }).catch(() => {});
      await client.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `
          window.__smokeErrors = [];
          window.addEventListener('error', (e) => window.__smokeErrors.push('error: ' + (e.message || e.error)));
          window.addEventListener('unhandledrejection', (e) => window.__smokeErrors.push('unhandledrejection: ' + (e.reason && (e.reason.message || e.reason))));
        `,
      });

      await client.send("Page.navigate", { url });
      await sleep(SETTLE_MS);

      const probe = await client.send("Runtime.evaluate", {
        expression: `JSON.stringify({
          rootChildren: document.getElementById('root') ? document.getElementById('root').childElementCount : -1,
          bodyText: (document.body.innerText || '').trim().length,
          windowErrors: window.__smokeErrors || [],
          status: document.readyState
        })`,
        returnByValue: true,
      });

      const result = JSON.parse(probe.result.result.value);
      const { consoleErrors, exceptions, failedRequests } = collectFindings(client.events);
      const fatalConsole = [...consoleErrors, ...exceptions, ...result.windowErrors].filter((line) =>
        FATAL_PATTERNS.some((pattern) => String(line).includes(pattern)),
      );

      console.log(
        `route ${route.padEnd(10)} rootChildren=${result.rootChildren} bodyText=${result.bodyText} ` +
          `consoleErrors=${consoleErrors.length} exceptions=${exceptions.length} failedRequests=${failedRequests.length}`,
      );

      if (result.rootChildren === -1) fail(`${route}: #root element is missing from the document`);
      if (result.rootChildren === 0) fail(`${route}: #root rendered nothing — black screen`);
      if (result.bodyText === 0) fail(`${route}: the page rendered no visible text`);
      for (const line of exceptions) fail(`${route}: uncaught exception — ${line.split("\n")[0]}`);
      for (const line of result.windowErrors) fail(`${route}: window error — ${line}`);
      for (const line of fatalConsole) fail(`${route}: fatal console error — ${String(line).split("\n")[0]}`);
      for (const line of failedRequests.filter((r) => r.includes(".js"))) {
        fail(`${route}: JavaScript request failed — ${line}`);
      }

      client.close();
    }
  } finally {
    cleanup();
  }

  if (process.exitCode === 1) {
    console.error("\nProduction preview smoke FAILED");
  } else {
    console.log("\nProduction preview smoke PASS — the built bundle boots and renders");
  }
}

async function waitFor(predicate, message, timeoutMs = NAV_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch {
      /* not ready yet */
    }
    await sleep(400);
  }
  throw new Error(message);
}

main().catch((err) => {
  console.error(`FAIL  ${err.message}`);
  process.exit(1);
});
