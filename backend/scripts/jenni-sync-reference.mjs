#!/usr/bin/env node
/**
 * Sync Jenni governorate codes (and optional cities) via admin API.
 *
 * Usage:
 *   STORE_API_BASE_URL=https://DilMart-store-backend.onrender.com/api \
 *   ADMIN_ACCESS_TOKEN=eyJ... \
 *   node backend/scripts/jenni-sync-reference.mjs [--dry-run] [--cities]
 */
const baseUrl = String(process.env.STORE_API_BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const token = process.env.ADMIN_ACCESS_TOKEN ?? process.env.ACCESS_TOKEN;
const dry_run = process.argv.includes("--dry-run");
const sync_cities = process.argv.includes("--cities");

if (!token) {
  console.error("Set ADMIN_ACCESS_TOKEN (Supabase access token for an admin user).");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/admin/delivery/jenni/sync-reference`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    dry_run,
    sync_cities,
    copy_existing_governorate_prices: !dry_run,
  }),
});

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error("Sync failed:", response.status, body);
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));
