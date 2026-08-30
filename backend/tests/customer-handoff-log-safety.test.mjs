/**
 * STORE-PR3 — Logging & audit safety (spec §16.4, Phase L).
 * Static scan of every customer-handoff source file proving no logging statement interpolates
 * a raw secret (code/state/token/assertion/secret/password/authorization/phone/email), plus a
 * runtime check that a prepared handoff's audit metadata carries only safe fields.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(here, "../src/modules/store-integration/customer-handoff");

// Match an interpolated STANDALONE sensitive variable — but NOT a property access such as
// `error.code` / `err.status` (those are safe DB error codes, not the secret).
const SENSITIVE = ["code", "state", "rawToken", "raw", "token", "secret", "password", "assertion", "phone", "email", "authorization"];
const FORBIDDEN_IN_LOG = SENSITIVE.map(
  (name) => new RegExp(String.raw`\$\{[^}]*(?<![.\w])${name}(?![\w])[^}]*\}`, "i"),
);

test("no source file logs a raw secret and none uses console.*", () => {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length >= 8, "expected the full customer-handoff module");
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

test("prepare emits a URL with no PII and passes only hashes + a safe kid to finalize", async () => {
  const { CustomerHandoffService } = await import(
    "../dist/modules/store-integration/customer-handoff/customer-handoff.service.js"
  );
  const STATE = "s".repeat(43);
  const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
  const assertion = {
    sub: randomUUID(), jti: `jti-${randomUUID()}`, sourceApp: "customer_app",
    sourceSurface: "customer_home_gateway", target: "/product/example",
    clientStateHash: sha256(STATE), phone: "+9647700000000", phoneVerified: false, phoneVerifiedAt: null,
    email: "buyer@example.com", emailVerified: false, emailVerifiedAt: null,
    campaign: "aug", kid: "main-customer-current",
  };
  const finalizes = [];
  const svc = new CustomerHandoffService(
    { handoffEnabled: true, codeTtlSeconds: 120, getOpenBaseUrl: () => "https://store.DilMart.org/open" },
    { verify: async () => assertion },
    { resolve: async () => ({ outcome: "LINKED", storeCustomerId: "c", linkMethod: "NEW_FEDERATED", linkStatus: "LINKED", identityAssurance: "DilMart_SESSION", reuseExisting: false, existingLinkedProfileId: null }) },
    { finalizeHandoff: async (i) => { finalizes.push(i); return { status: "OK", handoffId: "h1", expiresAt: new Date().toISOString(), linkedProfileId: "lp" }; }, writeAudit: async () => {} },
  );
  const res = await svc.prepare("Bearer x.y.z", STATE);

  // URL leaks nothing.
  for (const secret of [assertion.phone, assertion.sub, "example", assertion.jti]) {
    assert.ok(!res.handoffUrl.includes(secret), `URL must not contain ${secret}`);
  }
  // Finalize receives hashes + kid; the raw code/state are never present.
  const fin = finalizes[0];
  assert.match(fin.codeHash, /^[0-9a-f]{64}$/);
  assert.equal(fin.kid, "main-customer-current");
  assert.ok(!("code" in fin) && !("state" in fin));
  // An unverified email is NOT copied into the verified identity field.
  assert.equal(fin.email, null, "unverified email is not persisted as verified identity");
});
