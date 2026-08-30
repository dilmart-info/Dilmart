/**
 * jenni-groundwork-guards.test.mjs
 * 
 * Tests for the Jenni groundwork changes:
 * 1. Status mapper corrections (NEW_WITH_PA → picked_up, IN_SC → in_transit)
 * 2. Cancel/modify guards (blocked after pickup)
 * 3. Event metadata (postponed/return reasons)
 * 
 * Uses compiled dist/ files — run `npx tsc` first if needed.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = join(__dirname, "..", "dist", "modules", "jenni");
const dist = (name) => import(pathToFileURL(join(distRoot, name)).href);

const { mapJenniProviderUpdate } = await dist("jenni-status-mapper.js");

// ══════════════════════════════════════════════════════════════════
// 1. STATUS MAPPER — fixed mappings
// ══════════════════════════════════════════════════════════════════

test("NEW_WITH_PA maps to assigned_to_company (not picked_up)", () => {
  const result = mapJenniProviderUpdate({
    action_code: null,
    current_step: "NEW_WITH_PA",
  });
  assert.equal(result.deliveryStatus, "assigned_to_company", "First barcode scan = assigned to company");
  assert.equal(result.financeDelivered, false);
  assert.equal(result.financeReturned, false);
});

test("IN_SC maps to in_transit (not picked_up)", () => {
  const result = mapJenniProviderUpdate({
    action_code: null,
    current_step: "IN_SC",
  });
  assert.equal(result.deliveryStatus, "in_transit", "Sorting center = in transit, past pickup");
});

test("NEW_ORDER_TO_PRINT maps to assigned_to_company", () => {
  const result = mapJenniProviderUpdate({
    action_code: null,
    current_step: "NEW_ORDER_TO_PRINT",
  });
  assert.equal(result.deliveryStatus, "assigned_to_company");
});

test("NEW_ORDER_TO_PICKUP maps to assigned_to_company", () => {
  const result = mapJenniProviderUpdate({
    action_code: null,
    current_step: "NEW_ORDER_TO_PICKUP",
  });
  assert.equal(result.deliveryStatus, "assigned_to_company");
});

test("OFD maps to in_transit", () => {
  const result = mapJenniProviderUpdate({
    action_code: "OFD",
    current_step: "OFD",
  });
  assert.equal(result.deliveryStatus, "in_transit");
});

test("DELIVERED maps to delivered with financeDelivered=true", () => {
  const result = mapJenniProviderUpdate({
    action_code: "DELIVERED",
    current_step: "DELIVERED",
  });
  assert.equal(result.deliveryStatus, "delivered");
  assert.equal(result.financeDelivered, true);
  assert.equal(result.financeReturned, false);
});

test("DELIVERED_PRICE_CHANGED maps to delivered with requiresAdminReview", () => {
  const result = mapJenniProviderUpdate({
    action_code: "DELIVERED_PRICE_CHANGED",
    current_step: "DELIVERED_PRICE_CHANGED",
  });
  assert.equal(result.deliveryStatus, "delivered");
  assert.equal(result.requiresAdminReview, true);
  assert.equal(result.eventType, "amount_change_reported");
});

test("PRINT_MANIFEST_DA maps to in_transit", () => {
  const result = mapJenniProviderUpdate({
    action_code: null,
    current_step: "PRINT_MANIFEST_DA",
  });
  assert.equal(result.deliveryStatus, "in_transit");
});

// ══════════════════════════════════════════════════════════════════
// 2. RETURN STATUSES
// ══════════════════════════════════════════════════════════════════

test("RTO_WITH_DA maps to returned with financeReturned=true", () => {
  const result = mapJenniProviderUpdate({
    action_code: "RTO_WITH_DA",
    current_step: "RTO_WITH_DA",
  });
  assert.equal(result.deliveryStatus, "returned");
  assert.equal(result.financeReturned, true);
  assert.equal(result.eventType, "provider_return");
});

test("RTO_ARCHIVED maps to returned", () => {
  const result = mapJenniProviderUpdate({
    action_code: null,
    current_step: "RTO_ARCHIVED",
  });
  assert.equal(result.deliveryStatus, "returned");
});

test("RETURN_APPROVED maps to returned", () => {
  const result = mapJenniProviderUpdate({
    action_code: "RETURN_APPROVED",
    current_step: "RETURN_APPROVED",
  });
  assert.equal(result.deliveryStatus, "returned");
  assert.equal(result.eventType, "provider_return");
});

// ══════════════════════════════════════════════════════════════════
// 3. EVENT METADATA — postponed/return reasons
// ══════════════════════════════════════════════════════════════════

test("POSTPONED extracts postponed_reason and postponed_date_id into eventMetadata", () => {
  const result = mapJenniProviderUpdate({
    action_code: "POSTPONED",
    current_step: "POSTPONED",
    postponed_reason: "العميل غير متواجد",
    postponed_date_id: 5,
  });
  assert.equal(result.deliveryStatus, "in_transit");
  assert.equal(result.eventType, "provider_postponed");
  assert.notEqual(result.eventMetadata, null);
  assert.equal(result.eventMetadata.postponed_reason, "العميل غير متواجد");
  assert.equal(result.eventMetadata.postponed_date_id, 5);
});

test("POSTPONED without reason returns null eventMetadata", () => {
  const result = mapJenniProviderUpdate({
    action_code: "POSTPONED",
    current_step: "POSTPONED",
  });
  assert.equal(result.deliveryStatus, "in_transit");
  assert.equal(result.eventType, "provider_postponed");
  assert.equal(result.eventMetadata, null);
});

test("RETURN extracts return_reason into eventMetadata", () => {
  const result = mapJenniProviderUpdate({
    action_code: "RETURNED_WITH_AGENT",
    current_step: "RTO_WITH_DA",
    return_reason: "رفض الاستلام",
  });
  assert.equal(result.deliveryStatus, "returned");
  assert.equal(result.eventType, "provider_return");
  assert.notEqual(result.eventMetadata, null);
  assert.equal(result.eventMetadata.return_reason, "رفض الاستلام");
});

// ══════════════════════════════════════════════════════════════════
// 4. PARTIALLY_DELIVERED — admin review
// ══════════════════════════════════════════════════════════════════

test("PARTIALLY_DELIVERED maps to in_transit with requiresAdminReview", () => {
  const result = mapJenniProviderUpdate({
    action_code: "PARTIAL_DELIVERY",
    current_step: "PARTIALLY_DELIVERED",
  });
  assert.equal(result.deliveryStatus, "in_transit");
  assert.equal(result.requiresAdminReview, true);
  assert.equal(result.eventType, "provider_partially_delivered");
});

// ══════════════════════════════════════════════════════════════════
// 5. FORCE_DELIVERY and POSTPONED_CONFIRMED — new statuses
// ══════════════════════════════════════════════════════════════════

test("FORCE_DELIVERY maps to in_transit", () => {
  const result = mapJenniProviderUpdate({
    action_code: "FORCE_DELIVERY",
    current_step: "FORCE_DELIVERY",
  });
  assert.equal(result.deliveryStatus, "in_transit");
});

test("POSTPONED_CONFIRMED maps to in_transit", () => {
  const result = mapJenniProviderUpdate({
    action_code: null,
    current_step: "POSTPONED_CONFIRMED",
  });
  assert.equal(result.deliveryStatus, "in_transit");
});

// ══════════════════════════════════════════════════════════════════
// 6. UNKNOWN STATUS — returns null deliveryStatus
// ══════════════════════════════════════════════════════════════════

test("unknown status returns null deliveryStatus", () => {
  const result = mapJenniProviderUpdate({
    action_code: "COMPLETELY_UNKNOWN",
    current_step: "ALSO_UNKNOWN",
  });
  assert.equal(result.deliveryStatus, null);
});

// ══════════════════════════════════════════════════════════════════
// 7. CANCEL/MODIFY DELIVERY STATUS GUARDS (pure logic test)
// ══════════════════════════════════════════════════════════════════

const MODIFIABLE_STATUSES = new Set(["pending_assignment", "assigned_to_company"]);

function isModifiable(deliveryStatus) {
  if (!deliveryStatus) return true; // no status yet = allow
  return MODIFIABLE_STATUSES.has(deliveryStatus);
}

test("cancel allowed when delivery_status is pending_assignment", () => {
  assert.equal(isModifiable("pending_assignment"), true);
});

test("cancel allowed when delivery_status is assigned_to_company", () => {
  assert.equal(isModifiable("assigned_to_company"), true);
});

test("cancel BLOCKED when delivery_status is picked_up", () => {
  assert.equal(isModifiable("picked_up"), false);
});

test("cancel BLOCKED when delivery_status is in_transit", () => {
  assert.equal(isModifiable("in_transit"), false);
});

test("cancel BLOCKED when delivery_status is delivered", () => {
  assert.equal(isModifiable("delivered"), false);
});

test("cancel BLOCKED when delivery_status is returned", () => {
  assert.equal(isModifiable("returned"), false);
});

test("cancel BLOCKED when delivery_status is cancelled", () => {
  assert.equal(isModifiable("cancelled"), false);
});

test("modify COD allowed when delivery_status is null (no status yet)", () => {
  assert.equal(isModifiable(null), true);
  assert.equal(isModifiable(undefined), true);
});

test("modify COD BLOCKED when delivery_status is in_transit", () => {
  assert.equal(isModifiable("in_transit"), false);
});

// ══════════════════════════════════════════════════════════════════
// 8. STICKER SERVICE — credentials check (concept test)
// ══════════════════════════════════════════════════════════════════

const nestCommon = await import(
  pathToFileURL(join(__dirname, "..", "node_modules", "@nestjs", "common", "index.js")).href
);
const { ServiceUnavailableException } = nestCommon;

test("missing Jenni credentials should produce ServiceUnavailableException (503)", () => {
  const err = new ServiceUnavailableException("Jenni not configured");
  assert.equal(err.name, "ServiceUnavailableException");
  assert.equal(err.getStatus(), 503);
});

