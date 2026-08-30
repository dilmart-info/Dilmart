#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const checks = [
  { name: "frontend build", cmd: "npm", args: ["run", "build"] },
  { name: "frontend tests", cmd: "npm", args: ["run", "test"] },
  { name: "architecture guard", cmd: "npm", args: ["run", "arch:guard"] },
  { name: "backend build", cmd: "npm", args: ["run", "build"], cwd: "backend" },
  { name: "backend policy tests", cmd: "npm", args: ["run", "test:policy"], cwd: "backend" },
  { name: "backend commercial tests", cmd: "npm", args: ["run", "test:commercial"], cwd: "backend" },
];

let failed = false;

for (const check of checks) {
  console.log(`\n=== ${check.name} ===`);
  const result = spawnSync(check.cmd, check.args, {
    cwd: check.cwd ?? process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    failed = true;
    console.log(`FAILED: ${check.name}`);
  } else {
    console.log(`PASSED: ${check.name}`);
  }
}

process.exit(failed ? 1 : 0);
