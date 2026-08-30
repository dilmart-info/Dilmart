# Live Smoke Test Checklist — 2026-06-08

**Phase:** PRV-2 — Manual Verification on Production/Staging
**Instructions:** Execute each step manually. Mark ✅ pass, ❌ fail, or ⏭️ skipped.

---

## 1. Public — Storefront

| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 1.1 | Open store homepage | Page loads, products displayed | ✅ |
| 1.2 | Browse product catalog | Products load with images, prices | ✅ |
| 1.3 | Open a product detail page | Name, description, price, images visible | ✅ |
| 1.4 | Add product to cart | Toast confirmation, cart count updates | ✅ |
| 1.5 | Open checkout page | Form visible with name, phone, governorate fields | ✅ |
| 1.6 | Select governorate | Dropdown loads Iraqi governorates | ✅ |
| 1.7 | Select region (if available for governorate) | Region dropdown appears after governorate selection | ✅ |
| 1.8 | Delivery fee preview | Fee updates after governorate selection | ✅ |

---

## 2. Checkout — Validation

| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 2.1 | Enter valid Iraqi phone `07XXXXXXXXX` | Accepted, no error | ✅ |
| 2.2 | Enter valid phone `+9647XXXXXXXXX` | Accepted, normalized to `07...` | ✅ |
| 2.3 | Enter invalid phone `12345` | Rejected with Arabic error message | ✅ |
| 2.4 | Enter `<script>alert(1)</script>` in name field | Rejected (NoHtmlTags validator) | ✅ |
| 2.5 | Submit valid order (if test allowed) | Order confirmed, order number displayed | ✅ |
| 2.6 | Try submitting 11+ orders in 1 minute | Rate limited (429) after 10 | ⏭️ |

---

## 3. Admin Panel

| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 3.1 | Login as admin | Dashboard loads | ✅ |
| 3.2 | Open Dashboard | Analytics cards, charts visible | ✅ |
| 3.3 | Open Orders page | Orders list with pagination | ✅ |
| 3.4 | Search orders by order number | Results filter correctly | ✅ |
| 3.5 | Search orders by customer name | Results filter correctly (admin has access) | ✅ |
| 3.6 | Open Customers page | Customer list with full_name, phone, role | ✅ |
| 3.7 | Paginate customers (next/previous) | Page changes, counter updates | ✅ |
| 3.8 | Open Analytics overview | Charts and stats load | ✅ |
| 3.9 | Open Executive Governance | Delayed orders, weekly throughput, merchant health | ✅ |
| 3.10 | Open Notifications | Notification list loads | ✅ |

---

## 4. Merchant Panel — Privacy

| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 4.1 | Login as merchant | Merchant dashboard loads | ✅ |
| 4.2 | Open Orders | Orders list visible | ✅ |
| 4.3 | Verify: `customer_name` column **NOT** visible | No customer name column in table | ✅ |
| 4.4 | Verify: `customer_phone` column **NOT** visible | No customer phone column in table | ✅ |
| 4.5 | Search by full customer phone `07501234567` | **Should NOT match** (merchant searches order_number only) | ✅ |
| 4.6 | Search by order number | Should match | ✅ |
| 4.7 | Open Customers page | Shows `customer_ref` (عميل #XXXX) and `phone_masked` (****XXXX) | ✅ |
| 4.8 | Verify: full phone not visible anywhere | Only last 4 digits shown | ✅ |
| 4.9 | Search customers by full phone number | **Should NOT reveal customer** | ✅ |
| 4.10 | Search customers by last 4 digits | Should match via phone_masked | ✅ |
| 4.11 | Search customers by customer_ref (عميل #A1B2) | Should match | ✅ |
| 4.12 | Paginate customers (next/previous) | Works correctly | ✅ |

---

## 5. Health Endpoints

| # | Step | Expected Result | Status |
|---|------|-----------------|--------|
| 5.1 | `GET /health` (no auth) | `{ ok: true }` | ✅ |
| 5.2 | `GET /health/config-public` (no auth) | Returns `supabaseProjectRef` | ✅ |
| 5.3 | `GET /health/db-public` (no auth) | **401/403 — rejected** | ✅ |
| 5.4 | `GET /health/db-public` (admin auth) | `{ ok: true/false }` — no error details | ✅ |

---

## 6. Logs Verification

| # | Check | Expected Result | Status |
|---|-------|-----------------|--------|
| 6.1 | Render deployment logs | Latest deploy succeeded | ✅ |
| 6.2 | Render runtime logs | No repeated 500 errors | ✅ |
| 6.3 | Supabase dashboard → Functions | All RPCs visible | ✅ |
| 6.4 | Supabase dashboard → Logs | No RPC errors | ✅ |
| 6.5 | Check for 429 rate limit responses | Only if intentional (e.g., test 2.6) | ✅ |

---

## Sign-off

| Role | Name | Date | Verdict |
|------|------|------|---------|
| Developer | Antigravity | 2026-06-08 | ✅ PASS |
| Supervisor | | | |

**Notes:**
- تم تسجيل طلب تجريبي بنجاح بالرقم: `DUK-260608-1099`.
- تم التأكد من عمل لوحة الأدمن ولوحة التاجر بشكل كامل بعد تحديث البناء ونشره على Netlify.
- تم التحقق من عدم تسريب معلومات PII للتاجر والبحث الآمن بـ `customer_ref` و `phone_masked`.
- تم التحقق من لوحة الحوكمة التنفيذية بنجاح.
