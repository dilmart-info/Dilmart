#!/usr/bin/env node
/**
 * Smoke both Jenni webhook URLs (prefixed + alias).
 *
 * Usage:
 *   STORE_API_BASE_URL=https://DilMart-store-backend.onrender.com \
 *   JENNI_WEBHOOK_TOKEN=your-token \
 *   JENNI_SYSTEM_CODE=your-code \
 *   node backend/scripts/jenni-webhook-smoke.mjs
 */
const host = String(process.env.WEBHOOK_HOST ?? process.env.STORE_API_BASE_URL ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);
const token = process.env.JENNI_WEBHOOK_TOKEN ?? "";
const systemCode = process.env.JENNI_SYSTEM_CODE ?? "test";

const paths = ["/api/v2/push/update-status", "/v2/push/update-status"];

const body = {
  system_code: systemCode,
  updates: [{ shipment_id: 0, action_code: "OFD", current_step: "OFD" }],
};

for (const path of paths) {
  const url = `${host}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(`${path} -> ${response.status} ${text.slice(0, 200)}`);
}
