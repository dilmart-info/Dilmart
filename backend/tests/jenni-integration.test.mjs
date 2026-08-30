import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = join(__dirname, "..", "dist", "modules", "jenni");

const dist = (name) => import(pathToFileURL(join(distRoot, name)).href);

const { mapJenniProviderUpdate } = await dist("jenni-status-mapper.js");
const { normalizeIraqMobilePhone } = await dist("jenni-dispatch.service.js");
const { assertJenniWebhookSystemCode } = await dist("jenni-webhook.util.js");
const {
  assertOrderEligibleForJenniDispatch,
  isJenniDispatchComplete,
  shouldRetryJenniLocalDispatchOnly,
} = await dist("jenni-dispatch.util.js");

test("maps OFD to in_transit via real status mapper", () => {
  const mapped = mapJenniProviderUpdate({ action_code: "OFD", current_step: "OFD" });
  assert.equal(mapped.deliveryStatus, "in_transit");
});

test("maps SUCCESSFUL_DELIVERY to delivered via real status mapper", () => {
  const mapped = mapJenniProviderUpdate({ action_code: "SUCCESSFUL_DELIVERY", current_step: "DELIVERED" });
  assert.equal(mapped.deliveryStatus, "delivered");
});

test("maps returned codes via real status mapper", () => {
  const mapped = mapJenniProviderUpdate({ action_code: "RETURNED_WITH_AGENT", current_step: "RTO_WITH_DA" });
  assert.equal(mapped.deliveryStatus, "returned");
});

test("normalizes Iraqi phone numbers", () => {
  assert.equal(normalizeIraqMobilePhone("07901234567"), "07901234567");
  assert.equal(normalizeIraqMobilePhone("+9647901234567"), "07901234567");
  assert.equal(normalizeIraqMobilePhone("invalid"), null);
});

test("payload hash is stable for idempotency", () => {
  const payload = { shipment_id: 1, action_code: "OFD" };
  const a = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const b = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  assert.equal(a, b);
});

const { assertJenniWebhookBearerToken } = await dist("jenni-webhook.util.js");

test("rejects missing Jenni webhook bearer token when configured", () => {
  assert.throws(
    () => assertJenniWebhookBearerToken(undefined, "secret"),
    (err) => err && err.name === "UnauthorizedException",
  );
});

test("rejects invalid Jenni webhook bearer token", () => {
  assert.throws(
    () => assertJenniWebhookBearerToken("Bearer wrong", "secret"),
    (err) => err && err.name === "UnauthorizedException",
  );
});

test("allows valid Jenni webhook bearer token", () => {
  assert.doesNotThrow(() => assertJenniWebhookBearerToken("Bearer secret", "secret"));
});

test("rejects missing system_code when JENNI_SYSTEM_CODE is configured", () => {
  assert.throws(
    () => assertJenniWebhookSystemCode({}, "STORE_SYS"),
    (err) => err && err.name === "UnauthorizedException",
  );
});

test("rejects mismatched system_code", () => {
  assert.throws(
    () => assertJenniWebhookSystemCode({ system_code: "WRONG" }, "STORE_SYS"),
    (err) => err && err.name === "UnauthorizedException",
  );
});

test("allows matching system_code", () => {
  assert.doesNotThrow(() => assertJenniWebhookSystemCode({ system_code: "STORE_SYS" }, "STORE_SYS"));
});

test("skips system_code validation when expected code is empty", () => {
  assert.doesNotThrow(() => assertJenniWebhookSystemCode({}, ""));
  assert.doesNotThrow(() => assertJenniWebhookSystemCode({ system_code: "ANY" }, null));
});

test("blocks terminal orders before Jenni dispatch", () => {
  assert.throws(
    () => assertOrderEligibleForJenniDispatch({ id: "o1", delivery_status: "delivered", status: "preparing" }),
    (err) => err && err.name === "BadRequestException",
  );
});

test("retries local-only when Jenni accepted but local update failed", () => {
  assert.equal(
    shouldRetryJenniLocalDispatchOnly({ dispatch_status: "local_update_failed", provider_shipment_id: "99" }),
    true,
  );
  assert.equal(isJenniDispatchComplete({ dispatch_status: "dispatched" }), true);
  assert.equal(isJenniDispatchComplete({ dispatch_status: "local_update_failed" }), false);
});

test("production patch migration restores agent_unassigned event type", () => {
  const sql = readFileSync(
    join(__dirname, "..", "..", "supabase", "migrations", "20260517100000_jenni_production_patch.sql"),
    "utf8",
  );
  assert.match(sql, /agent_unassigned/);
  assert.match(sql, /local_update_failed/);
  assert.match(sql, /provider_dispatched/);
});
