/**
 * Static guard for the gated Netlify production deployment workflow.
 *
 * The workflow itself cannot be exercised here — it needs GitHub's event context and a real Netlify
 * credential. What CAN be pinned, and what actually protects Production, is its SHAPE: that publishing
 * is unreachable unless the gate says yes, that the gate refuses every unsafe trigger, that the deploy
 * builds an exact SHA rather than a branch, and that no credential is committed.
 *
 * These are the properties a well-meaning edit is most likely to erode — dropping a trust-boundary
 * check while "simplifying", or letting the CLI rebuild, which would publish an
 * artifact GitHub never verified.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOW_PATH = resolve(__dirname, "../../.github/workflows/netlify-production-deploy.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf8");

/** The one existing production site. A new or wrong site id must never appear here. */
const SITE_ID = "e9925590-a4cb-4e31-a97b-141f45264f24";

/** Extracts a top-level `jobs:` entry by name, up to the next job at the same indentation. */
function jobBlock(name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, `job "${name}" is missing`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][a-z0-9_-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * The `npx … netlify-cli … deploy` invocation only — comments and other steps excluded, so a flag
 * assertion can never be satisfied by prose that merely mentions the flag.
 */
function publishCommand(): string {
  const deploy = jobBlock("deploy");
  // Start AFTER the `deploy` subcommand so npx's own flags (--yes) are not mistaken for CLI flags.
  const start = deploy.indexOf('" deploy');
  expect(start, "publish command is missing").toBeGreaterThan(-1);
  const rest = deploy.slice(start);
  const end = rest.indexOf("netlify-deploy.json");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("netlify production deploy workflow — publishing is gated", () => {
  it("makes the deploy job depend on the gate decision", () => {
    const deploy = jobBlock("deploy");
    expect(deploy).toMatch(/needs:\s*gate/);
    expect(deploy).toMatch(/if:\s*needs\.gate\.outputs\.should_deploy == 'true'/);
  });

  it("only sets should_deploy when freshness, CI, novelty and enablement all hold", () => {
    const gate = jobBlock("gate");
    expect(gate).toMatch(
      /\[\s*"\$FRESH"\s*=\s*"true"\s*\]\s*&&\s*\[\s*"\$CI_OK"\s*=\s*"true"\s*\]\s*&&\s*\[\s*"\$ALREADY"\s*=\s*"false"\s*\]\s*&&\s*\[\s*"\$ENABLED"\s*=\s*"true"\s*\]/,
    );
  });

  it("defaults the kill switch to OFF — absence must not enable publishing", () => {
    const gate = jobBlock("gate");
    // Any value other than exactly "true" disables. An absent variable expands to empty and disables.
    expect(gate).toMatch(/"\$\{DEPLOY_ENABLED:-\}"\s*!=\s*"true"/);
    expect(gate).toMatch(/enabled=false/);
  });

  it("refuses to publish when the credential is absent even if the switch is on", () => {
    expect(jobBlock("gate")).toMatch(/-z "\$\{NETLIFY_AUTH_TOKEN:-\}"/);
  });
});

describe("netlify production deploy workflow — trust boundary", () => {
  const gate = jobBlock("gate");

  it("requires the triggering run to be a push", () => {
    expect(gate).toMatch(/"\$RUN_EVENT"\s*!=\s*"push"/);
  });

  it("requires the triggering run to be on main", () => {
    expect(gate).toMatch(/"\$RUN_BRANCH"\s*!=\s*"main"/);
  });

  it("requires the triggering run to come from this repository", () => {
    expect(gate).toMatch(/"\$RUN_REPO"\s*!=\s*"cylendralabs-blip\/DilMart-Store"/);
    expect(gate).toMatch(/"\$THIS_REPO"\s*!=\s*"cylendralabs-blip\/DilMart-Store"/);
  });

  it("never triggers on pull_request, so a contributor head cannot reach the secrets", () => {
    const triggers = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\npermissions:"));
    expect(triggers).not.toMatch(/pull_request/);
    expect(triggers).toMatch(/workflow_run/);
    expect(triggers).toMatch(/workflow_dispatch/);
  });

  it("validates the dispatch input as a full commit SHA", () => {
    expect(gate).toMatch(/\^\[0-9a-f\]\{40\}\$/);
  });

  it("puts the manual path through the same freshness and CI gates", () => {
    // The dispatch branch exits the trust step early, but freshness/CI steps are not conditioned on
    // the event name, so they run for a dispatch too.
    expect(gate).not.toMatch(/if:\s*github\.event_name\s*!=\s*'workflow_dispatch'/);
    expect(gate).toMatch(/Require target SHA to be the current tip of main/);
  });
});

describe("netlify production deploy workflow — exact-SHA evidence", () => {
  const gate = jobBlock("gate");

  it("queries CI runs filtered by push event AND the exact head SHA", () => {
    expect(gate).toMatch(/actions\/runs\?event=push&head_sha=\$\{TARGET_SHA\}/);
  });

  it("requires Launch Critical to have completed successfully", () => {
    expect(gate).toMatch(/LAUNCH_STATUS"\s*!=\s*"completed"\s*\]\s*\|\|\s*\[\s*"\$LAUNCH_CONCLUSION"\s*!=\s*"success"/);
  });

  it("treats a missing Native Foundation run as NOT REQUIRED but a failing one as blocking", () => {
    expect(gate).toMatch(/native_status=NOT REQUIRED/);
    expect(gate).toMatch(/NATIVE_STATUS"\s*!=\s*"completed"\s*\]\s*\|\|\s*\[\s*"\$NATIVE_CONCLUSION"\s*!=\s*"success"/);
  });

  it("refuses a superseded commit rather than publishing it", () => {
    expect(gate).toMatch(/git\/ref\/heads\/main/);
    expect(gate).toMatch(/"\$MAIN_SHA"\s*!=\s*"\$TARGET_SHA"/);
    expect(gate).toMatch(/fresh=false/);
  });
});

describe("netlify production deploy workflow — one publish per commit", () => {
  it("de-duplicates the two events for ONE commit at the workflow level", () => {
    const header = workflow.split("jobs:")[0];
    expect(header).toMatch(/group:[\s\S]{0,200}netlify-production-/);
    expect(header).toMatch(/cancel-in-progress:\s*false/);
  });

  it("serialises the PUBLISH globally, not per SHA", () => {
    // Per-SHA alone would let an older commit's publish run concurrently with a newer commit's — the
    // race that can roll Production backwards. The deploy job's group carries no SHA expression.
    const deploy = jobBlock("deploy");
    const group = deploy.match(/concurrency:[^]*?group:[ ]*([^ \r\n]+)/);
    expect(group, "deploy job must declare its own concurrency group").not.toBeNull();
    expect(group![1]).toBe("netlify-production");
    expect(group![1]).not.toContain("$");
    expect(deploy).toMatch(/cancel-in-progress:\s*false/);
  });

  it("skips when the live marker already reports the target commit", () => {
    const gate = jobBlock("gate");
    expect(gate).toMatch(/deploy-meta\.json/);
    expect(gate).toMatch(/already=true/);
  });
});

describe("netlify production deploy workflow — the verified artifact is the published one", () => {
  const deploy = jobBlock("deploy");

  it("checks out the resolved SHA, not a branch name", () => {
    expect(deploy).toMatch(/ref:\s*\$\{\{\s*needs\.gate\.outputs\.target_sha\s*\}\}/);
    expect(deploy).not.toMatch(/ref:\s*main\s*$/m);
  });

  it("builds with the project's own production build command", () => {
    expect(deploy).toMatch(/npm ci/);
    expect(deploy).toMatch(/npm run build:deploy/);
  });

  /**
   * The publish command is checked option-by-option against what the PINNED CLI actually accepts.
   *
   * The earlier version of this test asserted the presence of `--no-build`, which netlify-cli 17.38.1
   * does not have. Test and workflow agreed with each other and both were wrong about the tool, so the
   * guard passed while the publish step could only ever fail. Asserting a string is not the same as
   * asserting a supported invocation.
   *
   * The scan deliberately matches SHORT options too. Every long option here has a single-letter alias
   * -- `--build` is also `-b` -- so a scan that only recognised `--` would let `-b` request a Netlify
   * rebuild while still reporting green. Only the long options reviewed below are allowed, so an alias
   * fails as an unrecognised option rather than needing its own rule.
   */
  it("passes only options the pinned CLI supports, in their reviewed long form", () => {
    const publish = publishCommand();
    const options = [...publish.matchAll(/(^|\s)(-{1,2}[A-Za-z][A-Za-z0-9-]*)/g)].map((m) => m[2]);
    const SUPPORTED = new Set(["--prod", "--dir", "--site", "--message", "--json"]);
    for (const option of options) {
      expect(SUPPORTED.has(option), `unsupported option in publish command: ${option}`).toBe(true);
    }
  });

  it("allows no short options at all, so no alias can slip past the long-option review", () => {
    const publish = publishCommand();
    const shorts = [...publish.matchAll(/(^|\s)(-[A-Za-z][A-Za-z0-9-]*)/g)].map((m) => m[2]);
    expect(shorts, `short options are not reviewed: ${shorts.join(" ")}`).toEqual([]);
  });

  it("requires the flags that make the publish correct", () => {
    const publish = publishCommand();
    expect(publish).toMatch(/--prod(\s|$)/m);
    expect(publish).toMatch(/--dir=dist(\s|$)/m);
    expect(publish).toMatch(/--site=/);
  });

  it("never asks the CLI to build, and never invents an opt-out flag", () => {
    const publish = publishCommand();
    // --build would make Netlify produce a SECOND artifact that GitHub never verified, and `-b` is the
    // same option spelled shorter -- both are refused by name as well as by the option scan above.
    expect(publish).not.toMatch(/(^|\s)--build(\s|$)/m);
    expect(publish).not.toMatch(/(^|\s)-b(\s|$)/m);
    // The pinned CLI has no build opt-out; passing one aborts the publish before it starts.
    expect(publish).not.toMatch(/--no-build/);
  });

  it("pins an exact Netlify CLI version", () => {
    const pin = workflow.match(/NETLIFY_CLI_VERSION:\s*"([^"]+)"/);
    expect(pin, "NETLIFY_CLI_VERSION must be set").not.toBeNull();
    expect(pin![1]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(workflow).not.toMatch(/netlify-cli@latest/);
  });

  it("targets the existing production site by id", () => {
    expect(workflow).toContain(SITE_ID);
    const siteIds = workflow.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    expect(new Set(siteIds)).toEqual(new Set([SITE_ID]));
  });

  it("writes a provenance marker carrying the commit and run, and nothing sensitive", () => {
    expect(deploy).toMatch(/dist\/deploy-meta\.json/);
    expect(deploy).toMatch(/--arg git_sha/);
    expect(deploy).toMatch(/--arg github_run_id/);
    for (const forbidden of ["NETLIFY_AUTH_TOKEN", "SUPABASE", "email", "actor"]) {
      const markerStep = deploy.slice(deploy.indexOf("Write deployment provenance marker"));
      const markerBody = markerStep.slice(0, markerStep.indexOf("- name: Publish"));
      expect(markerBody).not.toContain(forbidden);
    }
  });

  it("verifies the live marker matches the deployed commit before declaring success", () => {
    expect(deploy).toMatch(/"\$LIVE_SHA"\s*!=\s*"\$TARGET_SHA"/);
    expect(deploy).toMatch(/exit 1/);
  });
});

describe("netlify production deploy workflow — last-moment freshness", () => {
  const deploy = jobBlock("deploy");

  it("re-queries main inside the deploy job, not only in the gate", () => {
    const gate = jobBlock("gate");
    expect(gate).toMatch(/git\/ref\/heads\/main/);
    expect(deploy).toMatch(/git\/ref\/heads\/main/);
  });

  it("performs that check AFTER the build and provenance, and BEFORE the upload", () => {
    const build = deploy.indexOf("npm run build:deploy");
    const provenance = deploy.indexOf("dist/deploy-meta.json");
    const recheck = deploy.indexOf("Re-verify main immediately before upload");
    const upload = deploy.indexOf("netlify-cli@");

    expect(build).toBeGreaterThan(-1);
    expect(provenance).toBeGreaterThan(-1);
    expect(recheck).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(-1);

    expect(recheck).toBeGreaterThan(build);
    expect(recheck).toBeGreaterThan(provenance);
    expect(recheck).toBeLessThan(upload);
  });

  it("makes the upload unreachable when main advanced", () => {
    expect(deploy).toMatch(/proceed=false/);
    // Both the publish and the live verification hang off the same decision.
    const guarded = deploy.match(/if:\s*steps\.final_freshness\.outputs\.proceed == 'true'/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(2);
  });

  it("treats a superseded target as a successful no-op rather than a failure", () => {
    expect(deploy).toMatch(/SUPERSEDED/);
    // No `exit 1` in the freshness step itself — being overtaken is not a deployment failure.
    const step = deploy.slice(deploy.indexOf("Re-verify main immediately before upload"));
    const stepBody = step.slice(0, step.indexOf("- name: Publish"));
    expect(stepBody).not.toMatch(/exit 1/);
  });
});

describe("netlify production deploy workflow — production target validation", () => {
  const deploy = jobBlock("deploy");

  it("validates the Production target BEFORE building", () => {
    const validate = deploy.indexOf("verify-store-production-build-env.mjs");
    const build = deploy.indexOf("npm run build:deploy");
    expect(validate).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(build);
  });

  it("passes the four Production variables to the verifier", () => {
    for (const key of [
      "VITE_STORE_API_BASE_URL",
      "VITE_SUPABASE_PROJECT_ID",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_URL",
    ]) {
      expect(deploy).toContain(key);
    }
  });
});

describe("the deployment guard is part of the CI that authorises production", () => {
  const ciWorkflow = readFileSync(
    resolve(__dirname, "../../.github/workflows/ci.yml"),
    "utf8",
  );

  it("Launch Critical CI executes the guards", () => {
    // A guard that is not part of the gating CI does not protect anything. This assertion makes its
    // removal fail the very workflow that authorises a deployment.
    expect(ciWorkflow).toMatch(/npm run test:ci-guards/);
  });

  it("does not let the guard step pass silently", () => {
    const step = ciWorkflow.slice(ciWorkflow.indexOf("npm run test:ci-guards") - 400);
    const stepBlock = step.slice(0, step.indexOf("npm run test:ci-guards") + 60);
    expect(stepBlock).not.toMatch(/continue-on-error:\s*true/);
  });
});

describe("netlify production deploy workflow — no committed credentials", () => {
  it("references secrets only through the secrets context", () => {
    // A literal Netlify personal access token is `nfp_…`; a Supabase key is a JWT.
    expect(workflow).not.toMatch(/nfp_[A-Za-z0-9]/);
    expect(workflow).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(workflow).toMatch(/\$\{\{\s*secrets\.NETLIFY_AUTH_TOKEN\s*\}\}/);
  });

  it("keeps the non-secret site id in plain configuration rather than a secret", () => {
    expect(workflow).toMatch(new RegExp(`NETLIFY_SITE_ID:\\s*${SITE_ID}`));
  });
});
