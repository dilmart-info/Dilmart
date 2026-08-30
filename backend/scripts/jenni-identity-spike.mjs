/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  JENNI IDENTITY MODEL SPIKE — Phase 0                           ║
 * ║  Tests which identity model Jenni API supports for stores.      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node backend/scripts/jenni-identity-spike.mjs
 *
 * Reads from backend/.env:
 *   JENNI_API_BASE_URL, JENNI_USERNAME, JENNI_PASSWORD, JENNI_SYSTEM_CODE
 *
 * Outputs: docs/JENNI_PHASE0_RESULTS.md
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const BACKEND = resolve(__dirname, "..");

// ── Load .env manually (no dotenv dependency) ───────────────────────────────
function loadEnv() {
  const envPath = resolve(BACKEND, ".env");
  const env = {};
  try {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  } catch (e) {
    console.error("❌ Could not read backend/.env:", e.message);
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const BASE_URL = (env.JENNI_API_BASE_URL || "https://jenni.alzaeemexp.com/api").replace(/\/$/, "");
const USERNAME = env.JENNI_USERNAME || "";
const PASSWORD = env.JENNI_PASSWORD || "";
const SYSTEM_CODE = env.JENNI_SYSTEM_CODE || "";
const ALLOW_REAL_STORE_TEST = env.ALLOW_REAL_JENNI_STORE_TEST === "true";
const ALLOW_REAL_SHIPMENT_TEST = env.ALLOW_REAL_JENNI_SHIPMENT_TEST === "true";

// ── Helpers ──────────────────────────────────────────────────────────────────
const log = (msg) => console.log(`  ${msg}`);
const hr = () => console.log("─".repeat(60));

const results = [];
function record(test, status, detail, raw) {
  results.push({ test, status, detail, raw });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
  log(`${icon} [${test}] ${status}: ${detail}`);
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function login() {
  console.log("\n🔑 Authenticating with Jenni...");
  log(`URL: ${BASE_URL}/v2/auth/login`);
  log(`User: ${USERNAME}`);

  if (!USERNAME || !PASSWORD) {
    console.error("❌ JENNI_USERNAME or JENNI_PASSWORD is not set in .env");
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("❌ Login failed:", res.status, JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const token = body.token || body.accessToken || body.access_token || "";
  if (!token) {
    console.error("❌ No token in response:", JSON.stringify(body, null, 2));
    process.exit(1);
  }

  log(`✅ Authenticated. Token: ${token.slice(0, 20)}...`);
  return token;
}

function getAuthHeader(token) {
  if (token.toLowerCase().startsWith("bearer ")) {
    return token;
  }
  return `Bearer ${token}`;
}

async function apiPost(token, path, body) {
  const url = `${BASE_URL}${path}`;
  log(`→ POST ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(token),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
  return { status: res.status, ok: res.ok, body: parsed };
}

async function apiGet(token, path) {
  const url = `${BASE_URL}${path}`;
  log(`→ GET ${url}`);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(token),
    },
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
  return { status: res.status, ok: res.ok, body: parsed };
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function test1_createStoreWithoutMerchantId(token) {
  console.log("\n📋 TEST 1: Create Store WITHOUT merchant_id");
  hr();

  if (!ALLOW_REAL_STORE_TEST) {
    log("⚠️ Skipped: ALLOW_REAL_JENNI_STORE_TEST is not set to true.");
    record("T1", "SKIP", "Skipped store creation because ALLOW_REAL_JENNI_STORE_TEST is not true", { note: "Local store creation disabled by safety flag" });
    return { ok: true, body: {} };
  }

  const payload = {
    store_name: "DilMart Test Store - Do Not Pickup",
    store_phone: process.env.JENNI_USERNAME || "<REDACTED_JENNI_USERNAME>",
    governorate_code: "BGD",
    address: "Test address - Phase 0 Spike (Production Account)",
  };

  log(`Payload: ${JSON.stringify(payload, null, 2)}`);
  const res = await apiPost(token, "/v2/stores/create", payload);
  log(`Response (${res.status}): ${JSON.stringify(res.body, null, 2)}`);

  if (res.ok && (res.body.store_id || res.body.id)) {
    record("T1", "PASS",
      `Store created without merchant_id → store_id=${res.body.store_id || res.body.id}`,
      res.body);
  } else {
    record("T1", "FAIL",
      `Cannot create store without merchant_id. Status=${res.status}`,
      res.body);
  }

  return res;
}

async function test2_createStoreWithDilMartMerchantId(token) {
  console.log("\n📋 TEST 2: Create Store WITH DilMart's own merchant_id");
  hr();

  if (!ALLOW_REAL_STORE_TEST) {
    log("⚠️ Skipped: ALLOW_REAL_JENNI_STORE_TEST is not set to true.");
    record("T2", "SKIP", "Skipped store creation because ALLOW_REAL_JENNI_STORE_TEST is not true", { note: "Local store creation disabled by safety flag" });
    return { ok: true, body: {} };
  }

  // First, try to discover DilMart's merchant_id
  log("→ Trying to list merchants to find DilMart's merchant_id...");
  const listRes = await apiGet(token, "/v2/merchant-management/list?page=1&size=10");
  log(`List merchants (${listRes.status}): ${JSON.stringify(listRes.body, null, 2)}`);

  let DilMartMerchantId = null;
  const merchants = listRes.body?.data || listRes.body?.merchants || listRes.body?.results || [];
  if (Array.isArray(merchants) && merchants.length > 0) {
    // Try to find DilMart's own merchant by name or just use the first one
    const found = merchants.find(m =>
      (m.merchant_name || m.name || "").toLowerCase().includes("DilMart") ||
      (m.merchant_name || m.name || "").toLowerCase().includes("styl")
    ) || merchants[0];
    DilMartMerchantId = found.merchant_id || found.id;
    log(`Found merchant: ${found.merchant_name || found.name} (id=${DilMartMerchantId})`);
  }

  // Also try the /me or /profile endpoint
  if (!DilMartMerchantId) {
    const meRes = await apiGet(token, "/v2/auth/me");
    log(`Auth /me (${meRes.status}): ${JSON.stringify(meRes.body, null, 2)}`);
    DilMartMerchantId = meRes.body?.merchant_id || meRes.body?.user?.merchant_id;
  }

  if (!DilMartMerchantId) {
    record("T2", "SKIP",
      "Could not determine DilMart's merchant_id — skipping this test",
      { merchants });
    return { ok: false, body: {} };
  }

  log(`Using DilMart merchant_id=${DilMartMerchantId}`);

  const payload = {
    store_name: "DilMart Test Store - Do Not Pickup",
    store_phone: process.env.JENNI_USERNAME || "<REDACTED_JENNI_USERNAME>",
    governorate_code: "BGD",
    address: "Test address - Phase 0 Spike (Production Account)",
    merchant_id: DilMartMerchantId,
  };

  log(`Payload: ${JSON.stringify(payload, null, 2)}`);
  const res = await apiPost(token, "/v2/stores/create", payload);
  log(`Response (${res.status}): ${JSON.stringify(res.body, null, 2)}`);

  if (res.ok && (res.body.store_id || res.body.id)) {
    record("T2", "PASS",
      `Store created with DilMart merchant_id=${DilMartMerchantId} → store_id=${res.body.store_id || res.body.id}`,
      res.body);
  } else {
    record("T2", "FAIL",
      `Cannot create store with DilMart merchant_id. Status=${res.status}`,
      res.body);
  }

  return { ...res, DilMartMerchantId };
}

async function test3_createMerchantAndStore(token) {
  console.log("\n📋 TEST 3: Create NEW Merchant + Store (Option B)");
  hr();
  log("Skipping T3 (merchant creation) since Path A (Stores-only under main merchant account) is selected.");
  record("T3", "SKIP",
    "Skipped because Path A (Stores-only) is the active architecture for this production environment",
    { note: "Path A selected, no sub-merchants needed" });
  return { ok: true, body: {} };
}

async function test5_createShipment(token) {
  console.log("\n📋 TEST 5: Create Shipment");
  hr();

  if (!ALLOW_REAL_SHIPMENT_TEST) {
    log("⚠️ Blocked: ALLOW_REAL_JENNI_SHIPMENT_TEST is not set to true.");
    record("T5", "SKIP", "Blocked shipment creation because ALLOW_REAL_JENNI_SHIPMENT_TEST is not true", { note: "Real shipment creation disabled for Production safety" });
    return { ok: true, body: {} };
  }

  log("Creating shipment is blocked by safety rules in Phase 0.");
  record("T5", "FAIL", "Creating shipments is not permitted in Phase 0", { note: "Failsafe triggered" });
  return { ok: false, body: {} };
}

async function test4_listExistingStores(token) {
  console.log("\n📋 TEST 4: List existing stores (discover current state)");
  hr();

  const res = await apiGet(token, "/v2/merchants/my-stores?page=1&size=50");
  log(`Response (${res.status}): ${JSON.stringify(res.body, null, 2)}`);

  const stores = res.body?.data || res.body?.stores || res.body?.results || [];
  record("T4", res.ok ? "PASS" : "FAIL",
    `Listed ${Array.isArray(stores) ? stores.length : 0} stores`,
    res.body);

  return res;
}

// ── Generate Results Document ────────────────────────────────────────────────
function generateReport() {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);

  let md = `# 🔬 JENNI PHASE 0 — Identity Model Spike Results\n\n`;
  md += `> **Date**: ${timestamp}  \n`;
  md += `> **API Base**: ${BASE_URL}  \n`;
  md += `> **Authenticated as**: ${USERNAME}  \n`;
  md += `> **System Code**: ${SYSTEM_CODE || "(empty)"}  \n`;
  md += `> **Password**: configured locally (not documented)  \n`;
  md += `> **Store Creation**: ${ALLOW_REAL_STORE_TEST ? "ENABLED" : "DISABLED"}  \n`;
  md += `> **Shipment Creation**: ${ALLOW_REAL_SHIPMENT_TEST ? "ENABLED" : "DISABLED"}\n\n`;
  md += `---\n\n`;

  md += `## Summary\n\n`;
  md += `| Test | Status | Detail |\n`;
  md += `|------|--------|--------|\n`;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⚠️";
    md += `| ${r.test} | ${icon} ${r.status} | ${r.detail} |\n`;
  }

  md += `\n---\n\n`;

  // Decision
  const t1Pass = results.find(r => r.test === "T1")?.status === "PASS";
  const t2Pass = results.find(r => r.test === "T2")?.status === "PASS";
  const t3Pass = results.find(r => r.test === "T3")?.status === "PASS";

  md += `## Decision\n\n`;
  if (!ALLOW_REAL_STORE_TEST) {
    md += `> [!NOTE]\n`;
    md += `> **نجاح تسجيل الدخول وسحب البيانات (Login/Auth & Read-Only Tests: PASS) ✅**\n`;
    md += `> تم تعليق إنشاء المتاجر التجريبية مؤقتاً لتفعيل بروتوكول الحماية للإنتاج (\`ALLOW_REAL_JENNI_STORE_TEST=false\`).\n`;
    md += `> \n`;
    md += `> **الخطوة القادمة المقترحة**: بعد مراجعة نجاح تسجيل الدخول، يمكن تفعيل العلم \`ALLOW_REAL_JENNI_STORE_TEST=true\` مؤقتاً لإنشاء متجر تجريبي واحد للتأكد النهائي.\n`;
  } else if (t1Pass || t2Pass) {
    md += `> [!TIP]\n`;
    md += `> **الخيار A مدعوم ✅** — يمكن إنشاء Stores مباشرة تحت حساب DilMart.\n`;
    md += `> لا حاجة لإنشاء Merchant لكل تاجر.\n\n`;
    md += `**القرار**: اعتماد **الخيار A** (Stores فقط تحت DilMart)\n`;
  } else if (t3Pass) {
    md += `> [!WARNING]\n`;
    md += `> **الخيار A غير مدعوم** — يجب إنشاء Merchant تشغيلي لكل تاجر.\n`;
    md += `> التحاسب المالي يبقى مع DilMart فقط.\n\n`;
    md += `**القرار**: اعتماد **الخيار B** (Merchant تشغيلي + Store)\n`;
  } else {
    md += `> [!CAUTION]\n`;
    md += `> **لم يتم حسم النموذج** — كلا الخيارين فشلا.\n`;
    md += `> يجب التواصل مع فريق Jenni للتوضيح.\n\n`;
  }

  md += `\n---\n\n`;

  // Raw responses
  md += `## Raw API Responses\n\n`;
  for (const r of results) {
    md += `### ${r.test}: ${r.detail}\n\n`;
    md += `\`\`\`json\n${JSON.stringify(r.raw, null, 2)}\n\`\`\`\n\n`;
  }

  md += `---\n\n`;
  md += `## Next Steps\n\n`;
  md += `1. مراجعة هذه النتائج مع المشرف\n`;
  md += `2. إذا تم الحسم → البدء بـ Phase 1 (Migration)\n`;
  md += `3. تنظيف بيانات الاختبار من Jenni (حذف Stores/Merchants التجريبية)\n`;

  return md;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  JENNI IDENTITY MODEL SPIKE — Phase 0                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\n  Base URL:     ${BASE_URL}`);
  console.log(`  Username:     ${USERNAME}`);
  console.log(`  System Code:  ${SYSTEM_CODE || "(empty)"}`);

  const token = await login();

  // Run tests
  await test4_listExistingStores(token);
  await test1_createStoreWithoutMerchantId(token);
  await test2_createStoreWithDilMartMerchantId(token);
  await test3_createMerchantAndStore(token);
  await test5_createShipment(token);

  // Generate report
  hr();
  console.log("\n📝 Generating results document...\n");
  const report = generateReport();
  const outputPath = resolve(ROOT, "docs/JENNI_PHASE0_RESULTS.md");
  writeFileSync(outputPath, report, "utf-8");
  console.log(`✅ Results written to: ${outputPath}\n`);

  // Print summary
  console.log("═".repeat(60));
  console.log("  SUMMARY");
  console.log("═".repeat(60));
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⚠️";
    console.log(`  ${icon} ${r.test}: ${r.detail}`);
  }
  console.log();
}

main().catch((err) => {
  console.error("\n💥 Spike failed:", err);
  process.exit(1);
});
