/**
 * Capacitor webDir expects index.html; Vite emits index.mobile.html from the mobile HTML entry.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist-mobile");
const from = path.join(dist, "index.mobile.html");
const to = path.join(dist, "index.html");

if (!fs.existsSync(from)) {
  console.error("Missing dist-mobile/index.mobile.html — build:mobile failed?");
  process.exit(1);
}

let html = fs.readFileSync(from, "utf8");
fs.writeFileSync(to, html, "utf8");
console.log("Wrote dist-mobile/index.html for Capacitor webDir");
