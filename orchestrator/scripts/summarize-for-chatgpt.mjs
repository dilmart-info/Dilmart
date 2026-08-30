#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const reportsDir = path.resolve("orchestrator/reports");
if (!fs.existsSync(reportsDir)) {
  console.error("No orchestrator/reports directory found.");
  process.exit(1);
}

const files = fs.readdirSync(reportsDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ f, p: path.join(reportsDir, f), m: fs.statSync(path.join(reportsDir, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m)
  .slice(0, 5);

if (!files.length) {
  console.log("No reports found.");
  process.exit(0);
}

console.log("# Latest DilMart-Store Reports for ChatGPT\n");
for (const item of files) {
  console.log(`\n--- ${item.f} ---\n`);
  const content = fs.readFileSync(item.p, "utf8");
  console.log(content.slice(0, 6000));
}
