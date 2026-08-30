/**
 * Vite plugin: fail the mobile build if forbidden backoffice modules enter the graph.
 */
import path from "node:path";
import fs from "node:fs";

const FORBIDDEN_PATH_FRAGMENTS = [
  `${path.sep}pages${path.sep}admin${path.sep}`,
  `${path.sep}pages${path.sep}merchant${path.sep}`,
  `${path.sep}pages${path.sep}AgentOrders`,
  `${path.sep}components${path.sep}AdminLayout`,
  `${path.sep}components${path.sep}MerchantLayout`,
  `${path.sep}components${path.sep}guards${path.sep}BackofficeRouteGuards`,
  `${path.sep}components${path.sep}RouteGuards`,
  `${path.sep}app${path.sep}WebBackofficeRoutes`,
  `${path.sep}app${path.sep}WebApp`,
  "/pages/admin/",
  "/pages/merchant/",
  "/pages/AgentOrders",
  "/components/AdminLayout",
  "/components/MerchantLayout",
  "/components/guards/BackofficeRouteGuards",
  "/components/RouteGuards",
  "/app/WebBackofficeRoutes",
  "/app/WebApp",
];

function normalizeId(id) {
  return id.replace(/\\/g, "/");
}

function isForbiddenModule(id) {
  const n = normalizeId(id);
  if (n.includes("node_modules")) return false;
  return FORBIDDEN_PATH_FRAGMENTS.some((frag) => n.includes(frag.replace(/\\/g, "/")));
}

export function mobileBoundaryPlugin(options = {}) {
  const reportPath = options.reportPath || path.resolve("dist-mobile/mobile-boundary-rollup-report.json");
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const forbidden = [];

  return {
    name: "DilMart-mobile-boundary",
    enforce: "pre",
    moduleParsed(moduleInfo) {
      const id = moduleInfo.id || "";
      if (!id || seen.has(id)) return;
      seen.add(id);
      if (isForbiddenModule(id)) {
        forbidden.push(id);
        this.error(
          `[mobile-boundary] Forbidden module in mobile graph:\n${id}\n` +
            `Customer mobile build must not include admin/merchant/agent surfaces.`,
        );
      }
    },
    generateBundle(_options, bundle) {
      const modules = [];
      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "chunk" || !chunk.modules) continue;
        for (const modId of Object.keys(chunk.modules)) {
          modules.push(modId);
          if (isForbiddenModule(modId) && !forbidden.includes(modId)) {
            forbidden.push(modId);
          }
        }
      }
      if (forbidden.length > 0) {
        this.error(
          `[mobile-boundary] Forbidden modules in Rollup output (${forbidden.length}):\n` +
            forbidden.slice(0, 20).join("\n"),
        );
      }
      try {
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(
          reportPath,
          JSON.stringify(
            {
              forbiddenCount: forbidden.length,
              moduleCount: modules.length,
              forbidden,
              sampleModules: modules.filter((m) => !m.includes("node_modules")).slice(0, 80),
            },
            null,
            2,
          ),
        );
      } catch {
        // non-fatal report write
      }
    },
  };
}

export { FORBIDDEN_PATH_FRAGMENTS, isForbiddenModule };
