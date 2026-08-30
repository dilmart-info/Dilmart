/**
 * STORE-PR4 — Opaque refresh-token entropy + keyed hashing (spec §9.3, §16). No DB.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";

const { FederatedRefreshTokenService } = await import("../dist/modules/auth/federated/federated-refresh-token.service.js");

const SECRET = randomBytes(32).toString("base64url");
const svc = new FederatedRefreshTokenService({ get: () => undefined, getRefreshHashSecret: () => SECRET });

test("raw token is 256 bits of entropy, base64url, and unique per call", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const raw = svc.generateRawToken();
    assert.match(raw, /^[A-Za-z0-9_-]+$/, "base64url charset (no +/= )");
    assert.equal(Buffer.from(raw, "base64url").length, 32, "decodes to 32 bytes");
    assert.equal(seen.has(raw), false, "no collision");
    seen.add(raw);
  }
});

test("hashToken is a deterministic keyed HMAC-SHA256 (matches an independent computation)", () => {
  const raw = svc.generateRawToken();
  const expected = createHmac("sha256", Buffer.from(SECRET, "base64url")).update(raw, "utf8").digest("base64url");
  assert.equal(svc.hashToken(raw), expected);
  assert.equal(svc.hashToken(raw), svc.hashToken(raw), "deterministic");
});

test("different raw tokens produce different hashes; the hash is not the raw token", () => {
  const a = svc.generateRawToken(), b = svc.generateRawToken();
  assert.notEqual(svc.hashToken(a), svc.hashToken(b));
  assert.notEqual(svc.hashToken(a), a, "stored value is not the raw token");
});

test("hash depends on the secret (a different key yields a different hash)", () => {
  const other = new FederatedRefreshTokenService({ get: () => undefined, getRefreshHashSecret: () => randomBytes(32).toString("base64url") });
  const raw = svc.generateRawToken();
  assert.notEqual(svc.hashToken(raw), other.hashToken(raw));
});

test("device hash is keyed, domain-separated, and null-safe", () => {
  assert.equal(svc.hashDevice(null), null);
  assert.equal(svc.hashDevice(""), null);
  assert.equal(svc.hashDevice("   "), null);
  const expected = createHmac("sha256", Buffer.from(SECRET, "base64url")).update("device:iphone-15", "utf8").digest("base64url");
  assert.equal(svc.hashDevice("iphone-15"), expected);
  // Domain separation: a device id equal to a raw token does NOT collide with its token hash.
  const raw = svc.generateRawToken();
  assert.notEqual(svc.hashDevice(raw), svc.hashToken(raw));
});
