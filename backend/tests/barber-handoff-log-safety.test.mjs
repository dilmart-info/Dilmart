/**
 * Barber Handoff — Logging & audit safety. Mirrors customer-handoff-log-safety.test.mjs: a static
 * scan of every barber-handoff source file proving no logging statement interpolates a raw secret
 * (code/state/session token/assertion/phone/authorization/cookie), plus no console.* usage.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(here, "../src/modules/store-integration/barber-handoff");

const SENSITIVE = [
  "code", "state", "rawToken", "raw", "token", "secret", "password", "assertion",
  "phone", "email", "authorization", "sessionToken", "cookie",
];
const FORBIDDEN_IN_LOG = SENSITIVE.map(
  (name) => new RegExp(String.raw`\$\{[^}]*(?<![.\w])${name}(?![\w])[^}]*\}`, "i"),
);

test("no barber-handoff source file logs a raw secret and none uses console.*", () => {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length >= 9, "expected the full barber-handoff module");
  for (const file of files) {
    const src = readFileSync(join(SRC_DIR, file), "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      const isLog = /\b(logger\.(log|warn|error|debug|verbose)|console\.\w+)\s*\(/.test(line);
      if (!isLog) return;
      assert.ok(!/console\./.test(line), `${file}:${i + 1} must not use console.* logging`);
      for (const re of FORBIDDEN_IN_LOG) {
        assert.ok(!re.test(line), `${file}:${i + 1} logs a forbidden secret interpolation: ${line.trim()}`);
      }
    });
  }
});

test("this module never READS the Barber HMAC secret or the Customer handoff key ring as an env var", () => {
  // Quoted-literal usage only (an actual config.get("...") read) — prose in a doc comment
  // documenting what this module deliberately does NOT reuse is not a violation.
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));
  for (const file of files) {
    const src = readFileSync(join(SRC_DIR, file), "utf8");
    assert.ok(!/["']DilMart_INTEGRATION_SECRET["']/.test(src), `${file} must not read the Barber HMAC secret`);
    assert.ok(!/["']DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON["']/.test(src), `${file} must not read the Customer handoff key ring`);
    assert.ok(!/FEDERATED_REFRESH_COOKIE/.test(src), `${file} must use its own cookie, not the Customer federated cookie`);
  }
});

test("the redeem response never carries the raw session token in the JSON body (cookie-only)", () => {
  const controllerSrc = readFileSync(join(SRC_DIR, "barber-handoff.controller.ts"), "utf8");
  assert.ok(
    /return result;/.test(controllerSrc),
    "redeem() must return only the safe `result` object, not sessionToken",
  );
  // The service's redeem() return type separates sessionToken from result; the controller must
  // destructure sessionToken out and never spread it back into the returned body.
  assert.ok(
    /const \{ result, sessionToken, sessionTtlSeconds \} = await this\.service\.redeem/.test(controllerSrc),
    "controller must destructure sessionToken separately from result",
  );
});
