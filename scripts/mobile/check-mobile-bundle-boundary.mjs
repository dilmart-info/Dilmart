/**
 * Post-build mobile boundary guard — reads Vite manifest + emits text report.
 * Exit non-zero if any forbidden module appears.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isForbiddenModule } from "./mobile-boundary-plugin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distMobile = path.join(root, "dist-mobile");
const manifestPath = path.join(distMobile, ".vite", "manifest.json");
const altManifest = path.join(distMobile, "manifest.json");
const reportPath = path.join(distMobile, "mobile-boundary-report.txt");
const jsonReportPath = path.join(distMobile, "mobile-boundary-report.json");

function walkJsCss(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJsCss(p, acc);
    else if (/\.(js|css|mjs)$/.test(name)) acc.push(p);
  }
  return acc;
}

function loadManifest() {
  if (fs.existsSync(manifestPath)) return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (fs.existsSync(altManifest)) return JSON.parse(fs.readFileSync(altManifest, "utf8"));
  return null;
}

function collectManifestIds(manifest) {
  const ids = new Set();
  if (!manifest || typeof manifest !== "object") return ids;
  for (const [key, value] of Object.entries(manifest)) {
    ids.add(key);
    if (value?.src) ids.add(value.src);
    if (value?.file) ids.add(value.file);
    for (const imp of value?.imports || []) ids.add(imp);
    for (const dimp of value?.dynamicImports || []) ids.add(dimp);
  }
  return ids;
}

function main() {
  if (!fs.existsSync(distMobile)) {
    console.error("dist-mobile/ missing — run npm run build:mobile first");
    process.exit(1);
  }

  const manifest = loadManifest();
  if (!manifest) {
    console.error("Mobile Vite manifest not found under dist-mobile/.vite/manifest.json");
    process.exit(1);
  }

  const rollupReportPath = path.join(distMobile, "mobile-boundary-rollup-report.json");
  let rollupForbidden = [];
  if (fs.existsSync(rollupReportPath)) {
    try {
      rollupForbidden = JSON.parse(fs.readFileSync(rollupReportPath, "utf8")).forbidden || [];
    } catch {
      rollupForbidden = [];
    }
  }

  const manifestIds = [...collectManifestIds(manifest)];
  const forbiddenFromManifest = manifestIds.filter((id) => isForbiddenModule(id));

  // Scan emitted JS for hard-coded backoffice path markers (defense in depth)
  const assets = walkJsCss(path.join(distMobile, "assets"));
  const contentHits = [];
  const markers = [
    "pages/admin/",
    "pages/merchant/",
    "pages/AgentOrders",
    "components/AdminLayout",
    "components/MerchantLayout",
    "BackofficeRouteGuards",
    "WebBackofficeRoutes",
  ];
  for (const file of assets) {
    if (!file.endsWith(".js") && !file.endsWith(".mjs")) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const marker of markers) {
      if (text.includes(marker)) {
        contentHits.push(`${path.relative(distMobile, file)} :: ${marker}`);
      }
    }
  }

  const forbidden = [...new Set([...rollupForbidden, ...forbiddenFromManifest])];
  // Content hits on string markers can false-positive on route path strings like "/admin" in NotFound routes.
  // Only fail on module-graph forbidden; report content hits as warnings unless they match module paths.
  const moduleGraphForbidden = forbidden.filter((id) => isForbiddenModule(id));

  const sizes = assets.map((f) => ({
    file: path.relative(distMobile, f).replace(/\\/g, "/"),
    bytes: fs.statSync(f).size,
  }));
  sizes.sort((a, b) => b.bytes - a.bytes);
  const totalBytes = sizes.reduce((s, x) => s + x.bytes, 0);
  const largest20 = sizes.slice(0, 20);

  const entries = Object.entries(manifest)
    .filter(([, v]) => v.isEntry)
    .map(([k, v]) => ({ key: k, file: v.file, dynamicImports: v.dynamicImports || [] }));

  const allDynamic = entries.flatMap((e) => e.dynamicImports);
  const chunks = Object.entries(manifest).map(([k, v]) => ({ key: k, file: v.file, isEntry: !!v.isEntry }));

  const pass = moduleGraphForbidden.length === 0;
  const lines = [
    `FORBIDDEN_MODULE_COUNT=${moduleGraphForbidden.length}`,
    `BOUNDARY_RESULT=${pass ? "PASS" : "FAIL"}`,
    `MANIFEST_ENTRIES=${entries.length}`,
    `MANIFEST_CHUNKS=${chunks.length}`,
    `DYNAMIC_IMPORTS=${allDynamic.length}`,
    `TOTAL_JS_CSS_BYTES=${totalBytes}`,
    `CONTENT_MARKER_HITS=${contentHits.length}`,
    "",
    "## Entries",
    ...entries.map((e) => `- ${e.key} -> ${e.file}`),
    "",
    "## Dynamic imports",
    ...(allDynamic.length ? allDynamic.map((d) => `- ${d}`) : ["- (none)"]),
    "",
    "## Largest 20 assets",
    ...largest20.map((a) => `- ${a.bytes}\t${a.file}`),
    "",
    "## Forbidden modules",
    ...(moduleGraphForbidden.length ? moduleGraphForbidden.map((f) => `- ${f}`) : ["- (none)"]),
    "",
    "## Content marker hits (informational)",
    ...(contentHits.length ? contentHits.slice(0, 40).map((h) => `- ${h}`) : ["- (none)"]),
  ];

  fs.writeFileSync(reportPath, lines.join("\n") + "\n", "utf8");
  fs.writeFileSync(
    jsonReportPath,
    JSON.stringify(
      {
        forbiddenModuleCount: moduleGraphForbidden.length,
        boundaryResult: pass ? "PASS" : "FAIL",
        entries,
        dynamicImports: allDynamic,
        chunks,
        largest20,
        totalJsCssBytes: totalBytes,
        forbidden: moduleGraphForbidden,
        contentMarkerHits: contentHits,
      },
      null,
      2,
    ),
  );

  console.log(lines.join("\n"));
  if (!pass) process.exit(1);
}

main();
