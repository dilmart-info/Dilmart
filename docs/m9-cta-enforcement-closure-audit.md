# M9 CTA Enforcement Closure Audit

Date: 2026-04-22  
Scope: WhatsApp Assisted Commerce Tracking & Compliance (M9)  
Status: Ready for closure review

## Objective

Verify end-to-end enforcement of tracked WhatsApp policy on acquisition/commercial surfaces, and explicitly separate allowed operational post-order usage.

---

## Baseline Findings (Before Hardening)

Raw WhatsApp links (`https://wa.me/...`) were present in multiple user-facing surfaces, including:

- `src/components/WhatsAppButton.tsx`
- `src/components/Footer.tsx`
- `src/pages/ThankYou.tsx`
- `src/pages/TrackOrder.tsx`
- `src/pages/Support.tsx`
- Commercial funnel surfaces where global CTA appears (e.g. `Products`, `Index`, `Stores`, `Offers`, `Wishlist`, `Checkout`)

Impact:

- bypassed intent creation
- bypassed intent lifecycle tracking
- violated acquisition channel policy

---

## Enforcement Changes Applied

## 1) Global CTA Hardening

- `src/components/WhatsAppButton.tsx`
  - Replaced raw `wa.me` redirect with internal route to `/support`.
  - Component is now non-commerce entry and no longer opens direct WhatsApp.

## 2) Footer Hardening

- `src/components/Footer.tsx`
  - Replaced direct WhatsApp anchor with `/support` link.
  - Preserves support discoverability without bypassing acquisition tracking.

## 3) Thank You / Track / Support Page Hardening

- `src/pages/ThankYou.tsx`
  - Replaced direct WhatsApp CTA with `/support`.
- `src/pages/TrackOrder.tsx`
  - Replaced direct WhatsApp text link with `/support`.
- `src/pages/Support.tsx`
  - Converted WhatsApp block to operational guidance entry (`/track-order`) instead of raw `wa.me`.

## 4) Commercial Surface Coverage Expansion

- `src/pages/Storefront.tsx`
  - Added explicit tracked CTA: `واتساب المتجر (Tracked)`.
  - Uses `startTrackedWhatsAppIntent(...)` with `sourceSurface: "store"`.
- `src/pages/Checkout.tsx`
  - Added tracked CTA for cart-assisted flow.
  - Uses `startTrackedWhatsAppIntent(...)` with `sourceSurface: "cart"` and cart snapshot payload.

---

## Residual Raw `wa.me` Usage Review

After hardening pass, raw `wa.me` remains only in:

- `src/pages/admin/OrderDetail.tsx`
  - customer communication and delivery operations messages
- `src/lib/whatsapp-assisted.ts`
  - tracked redirect execution after intent creation/confirmation (required)

Assessment:

- `admin/OrderDetail.tsx` is **Operational WhatsApp** (post-order workflow), acceptable by policy separation.
- `src/lib/whatsapp-assisted.ts` is the approved **tracked acquisition mechanism**, not a policy bypass.

---

## Policy Mapping

## Acquisition WhatsApp (Tracked Only) — Enforced

- Product-level tracked flow: implemented
- Store-level tracked flow: implemented
- Cart-level tracked flow: implemented
- Global/general CTA direct bypass: removed

## Operational WhatsApp (Post-Order) — Allowed

- Admin order operations messaging: retained by design

---

## Verification Evidence

- Frontend lint diagnostics on modified files: no errors
- Frontend production build: successful (`vite build`)

---

## Closure Recommendation

M9 CTA enforcement gap has been addressed for user-facing acquisition/commercial surfaces.  
Remaining direct WhatsApp usage is constrained to operational post-order workflows and tracked redirect internals.

Recommendation: **Mark M9 as CLOSED**, pending product owner sign-off on policy wording alignment in `docs/whatsapp-assisted-commerce-policy.md`.
