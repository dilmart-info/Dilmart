/**
 * STORE-PR4 Security Closure B2 — one deterministic lock order (family → token) across rotate/logout/
 * logout-all makes lifecycle races safe: no PostgreSQL deadlock, no unhandled SQLSTATE / HTTP 500, no
 * partially-rotated/revoked chain, and a documented outcome. 25 iterations of each race.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { supabase, makeLinkedHandoff, createSession, rotate, logout, logoutAll, cleanupIdentity } from "./federated-helpers.mjs";

const N = 25;
const fam = async (id) => (await supabase.from("store_federated_session_families").select("status, session_version").eq("id", id).single()).data;
async function freshSession() {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), th = "c-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: th });
  return { h, familyId, th };
}
const noDbError = (label, ...rs) => rs.forEach((r, i) => assert.equal(r.error, null, `${label}[${i}] db error: ${r.error?.message ?? ""}`));

test("B2 refresh vs logout — no deadlock; documented outcome (rotate OK ⟺ family ACTIVE)", async () => {
  for (let i = 0; i < N; i++) {
    const s = await freshSession();
    const [r, l] = await Promise.all([rotate(s.th, { newHash: "x-" + crypto.randomUUID() }), logout(s.th)]);
    noDbError(`iter ${i}`, r, l);
    const f = await fam(s.familyId);
    if (r.data[0].status === "OK") assert.equal(f.status, "ACTIVE", `iter ${i}: rotate won → ACTIVE`);
    else { assert.equal(r.data[0].error_code, "FEDERATED_SESSION_EXPIRED"); assert.equal(f.status, "REVOKED", `iter ${i}: logout won → REVOKED`); }
    await cleanupIdentity(s.h);
  }
});

test("B2 refresh vs logout-all — no deadlock; documented outcome", async () => {
  for (let i = 0; i < N; i++) {
    const s = await freshSession();
    const [r, l] = await Promise.all([rotate(s.th, { newHash: "y-" + crypto.randomUUID() }), logoutAll(s.th)]);
    noDbError(`iter ${i}`, r, l);
    const f = await fam(s.familyId);
    if (r.data[0].status === "OK") assert.equal(f.status, "ACTIVE");
    else assert.equal(f.status, "REVOKED");
    await cleanupIdentity(s.h);
  }
});

test("B2 logout vs logout-all — one revokes; exactly one version bump; no partial state", async () => {
  for (let i = 0; i < N; i++) {
    const s = await freshSession();
    const [a, b] = await Promise.all([logout(s.th), logoutAll(s.th)]);
    noDbError(`iter ${i}`, a, b);
    const f = await fam(s.familyId);
    assert.equal(f.status, "REVOKED", `iter ${i}: revoked`);
    assert.equal(f.session_version, 2, `iter ${i}: exactly one increment`);
    await cleanupIdentity(s.h);
  }
});

test("B2 two concurrent logouts — idempotent; exactly one revocation", async () => {
  for (let i = 0; i < N; i++) {
    const s = await freshSession();
    const [a, b] = await Promise.all([logout(s.th), logout(s.th)]);
    noDbError(`iter ${i}`, a, b);
    const f = await fam(s.familyId);
    assert.equal(f.status, "REVOKED");
    assert.equal(f.session_version, 2, `iter ${i}: single increment`);
    await cleanupIdentity(s.h);
  }
});

test("B2 two concurrent logout-alls — idempotent; exactly one revocation", async () => {
  for (let i = 0; i < N; i++) {
    const s = await freshSession();
    const [a, b] = await Promise.all([logoutAll(s.th), logoutAll(s.th)]);
    noDbError(`iter ${i}`, a, b);
    const f = await fam(s.familyId);
    assert.equal(f.status, "REVOKED");
    assert.equal(f.session_version, 2, `iter ${i}: single increment`);
    await cleanupIdentity(s.h);
  }
});
