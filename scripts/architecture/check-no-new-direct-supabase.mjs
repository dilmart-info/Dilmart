import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const GUARD_VERSION = 1;
const baselinePath = "scripts/architecture/supabase-guard-baseline.json";
const allowlistPath = "scripts/architecture/supabase-guard-allowlist.json";
const shouldWriteBaseline = process.argv.includes("--write-baseline");

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath.replaceAll("\\", "/"));
    }
  }
  return files;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function keyOf(record) {
  return `${record.file}|${record.kind}|${record.rule}|${record.line}`;
}

function isAllowed(record, allowlist) {
  if (record.kind === "import") {
    const importRules = allowlist.allowedImports ?? [];
    return importRules.some((r) => r.file === record.file && r.source === record.rule);
  }

  const runtimeRules = allowlist.allowedRuntimeCalls ?? [];
  return runtimeRules.some((r) => r.file === record.file && r.rule === record.rule);
}

const allowlist = readJson(allowlistPath, {
  allowedImports: [],
  allowedRuntimeCalls: [],
});

const files = walk("src");
const records = [];

const importPattern = /import\s+\{\s*supabase\s*\}\s+from\s+["']([^"']+)["']/g;
const runtimePatterns = [
  { rule: "supabase.from", regex: /supabase\.from\s*\(/g },
  { rule: "supabase.rpc", regex: /supabase\.rpc\s*\(/g },
  { rule: "supabase.functions.invoke", regex: /supabase\.functions\.invoke\s*\(/g },
  { rule: "supabase.channel", regex: /supabase\.channel\s*\(/g },
];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const fileLines = content.split("\n");

  fileLines.forEach((line, idx) => {
    importPattern.lastIndex = 0;
    const importMatch = importPattern.exec(line);
    if (importMatch) {
      records.push({
        file,
        line: idx + 1,
        kind: "import",
        rule: importMatch[1],
        text: line.trim(),
      });
    }

    runtimePatterns.forEach(({ rule, regex }) => {
      regex.lastIndex = 0;
      if (regex.test(line)) {
        records.push({
          file,
          line: idx + 1,
          kind: "runtime",
          rule,
          text: line.trim(),
        });
      }
    });
  });
}

const currentViolations = records.filter((record) => !isAllowed(record, allowlist));
const currentViolationKeys = new Set(currentViolations.map(keyOf));

if (shouldWriteBaseline) {
  const baselinePayload = {
    guardVersion: GUARD_VERSION,
    generatedAt: new Date().toISOString(),
    notes: "Temporary baseline for existing violations. New violations are blocked; baseline must trend to zero across M0 batches.",
    violations: currentViolations
      .map((v) => ({ file: v.file, line: v.line, kind: v.kind, rule: v.rule }))
      .sort((a, b) => keyOf(a).localeCompare(keyOf(b))),
  };
  writeFileSync(baselinePath, `${JSON.stringify(baselinePayload, null, 2)}\n`, "utf8");
  console.log(`Baseline written: ${baselinePath} (${baselinePayload.violations.length} entries).`);
  process.exit(0);
}

const baseline = readJson(baselinePath, { guardVersion: GUARD_VERSION, violations: [] });
const baselineKeys = new Set((baseline.violations ?? []).map(keyOf));

const newViolations = currentViolations.filter((v) => !baselineKeys.has(keyOf(v)));
const resolvedViolations = (baseline.violations ?? []).filter((v) => !currentViolationKeys.has(keyOf(v)));

if (newViolations.length > 0) {
  console.error("Architecture guard failed: new forbidden Supabase usage beyond approved baseline.\n");
  newViolations.forEach((v) => {
    console.error(`${v.file}:${v.line} [${v.kind}:${v.rule}] ${v.text}`);
  });
  process.exit(1);
}

console.log(
  [
    "Architecture guard passed.",
    `Current violations (temporary baseline): ${currentViolations.length}.`,
    `Resolved since baseline: ${resolvedViolations.length}.`,
  ].join(" "),
);
