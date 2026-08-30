# Authenticity & Badges

In MENA beauty, counterfeits are a real threat. Customers have been burned. Showing that your products are authentic isn't a marketing flourish — it's a structural feature of the storefront. This document covers how to design authenticity signals that actually earn trust.

## The authenticity problem in MENA

Parallel imports, gray market goods, and outright fakes plague:
- High-end cosmetics (especially makeup)
- Fragrances (top counterfeit category)
- Hair treatments from premium brands
- Salon-professional products
- Korean/Japanese imported skincare

Customers are sensitive. They:
- Check ingredient lists vs official brand source
- Compare packaging to brand's website
- Test products against reviews
- Read return policy first
- Trust verified brand stores over generic retailers

If your site doesn't address authenticity proactively, sales suffer.

## Layered authenticity model

Vendors fall into authenticity tiers:

### Tier A: Brand-direct
The brand itself operates the storefront on your marketplace (e.g., L'Oréal direct, Sephora direct). Authenticity guaranteed by brand.

Badge: **"Sold by Brand"** with brand logo.

### Tier B: Authorized retailer
Brand has officially authorized the vendor (with paperwork). E.g., regional distributor, certified salon supplier.

Badge: **"Authorized Retailer"** with verification date.

### Tier C: Verified vendor
Vendor verified by marketplace (legal docs, sourcing checked). Sells genuine products but not officially partnered with brand.

Badge: **"Verified Vendor"**.

### Tier D: Independent
Standard vendor. Subject to marketplace authenticity policy and returns.

Badge: optional — only the marketplace authenticity guarantee.

## Marketplace-wide authenticity guarantee

Backstop policy that applies to all vendors:

```
✓ 100% Authentic Guarantee

If you receive a product that isn't authentic, return it
within 30 days for a full refund — including shipping.

We test products from random vendors monthly to verify
authenticity. Vendors selling fakes are permanently 
banned from the marketplace.
```

This is the floor. Even Tier D vendors are covered.

Display on:
- Footer of every page
- PDP near price
- Trust section in cart
- Checkout page
- Order confirmation

## Badge design

Badges should be:
- Visible without dominating
- Linked to detail (one click reveals what it means)
- Consistent across the site
- Used sparingly (every badge = less trust per badge)

### Visual style

```
┌──────────────────────┐
│ ✓ AUTHENTIC          │  ← compact, label inside box
└──────────────────────┘

✓ Sold by L'Oréal      ← inline, with icon

[ Verified Vendor ]    ← chip-style
```

Use marketplace primary color (rose-red) or success green for these. Not gold (gold reads "premium" not "verified").

### Where to show

PDP:
```
[Product Title]

★ 4.7 (1,247)    ✓ Authentic    ✓ Sold by Brand
                  ↑                ↑
              MP guarantee      Tier A/B badge
```

Vendor profile:
```
SkinCare Pro
✓ Authorized Retailer        ← Tier B
On marketplace since 2022
4.8 ★ from 3,420 reviews
```

Search/Category cards:
```
[product image]
Brand Name
Product Name
AED 89  ✓ Authentic
```

Don't put badges on EVERY product card if EVERY product is authentic (overkill). Show only when product/vendor has elevated tier.

## Vendor verification details

When user clicks the badge, show evidence:

### For "Sold by Brand"

```
About this vendor:
─────────────────────────
✓ This is L'Oréal's official store on Beauty Marketplace.
✓ All products sold directly by the brand.
✓ Backed by L'Oréal's manufacturer warranty.
✓ On marketplace since 2021.

[ See all L'Oréal products ]
```

### For "Authorized Retailer"

```
About this vendor:
─────────────────────────
SkinCare Pro is an authorized retailer for:
- L'Oréal Professionnel
- Kérastase
- Redken

✓ Verified by marketplace
✓ Authorization confirmed with each brand (renewed annually)
✓ 4.8 ★ from 3,420 reviews
✓ On marketplace since 2022

[ View vendor profile ]
```

### For "Verified Vendor"

```
About this vendor:
─────────────────────────
✓ Vendor verified by Beauty Marketplace
✓ Trade license: confirmed
✓ Sourcing documentation: on file
✓ 4.5 ★ from 1,290 reviews
✓ On marketplace since 2023

All products covered by our 100% Authentic Guarantee.

[ View vendor profile ]
```

## Authenticity guarantee policy page

Dedicated page (`/authenticity-guarantee`):

```
Beauty Marketplace Authenticity Guarantee
==========================================

We guarantee that every product sold on Beauty Marketplace is 100% 
authentic. If you ever receive a product that isn't authentic:

1. Return within 30 days
2. Get a full refund (including original and return shipping)
3. We'll investigate the vendor

How we verify authenticity:
- Vendor verification on signup (legal docs, sourcing)
- Random spot-checks (we test products from vendors)
- Customer reports trigger immediate investigation
- Authorized retailer status verified with brands annually

What counts as inauthentic:
- Counterfeit products
- Tampered packaging
- Products past expiration date
- Products from gray-market sources without proper authorization

How to report:
- Photo of product
- Photo of packaging
- Comparison details (if you have a genuine product to compare)
- Email: authenticity@beauty.com
- Or contact support in your account

Vendor consequences:
- First confirmed violation: suspension + warning
- Second: permanent ban
- We share data with brands to support their enforcement
```

This must be linked from:
- Footer
- PDP authenticity badge
- Cart trust section
- Return initiation flow

## Brand-direct accounts

A vendor sub-product: the brand itself operates a store.

Setup:
- Brand contracts directly with marketplace
- Brand-direct status granted (Tier A)
- Brand logo appears on vendor profile
- Marketing: brand operates campaigns, has dedicated landing pages
- Pricing: brand controls
- Inventory: brand-managed

Benefits to brand:
- Direct-to-consumer channel
- Anti-counterfeit story
- Customer data (subject to consent)
- Reduced gray market

Benefits to marketplace:
- Authenticity trust massively boosted
- Premium category visibility
- Higher AOV

Display:
```
┌──────────────────────────────────────┐
│  [Brand logo]                         │
│  L'Oréal Paris — Official Store       │
│  ✓ Sold and shipped by L'Oréal        │
│  ✓ Authentic guaranteed by brand      │
│  Active on marketplace since 2021     │
└──────────────────────────────────────┘
```

## Authorized retailer badges with brand logos

For Tier B, show specific brand authorizations:

```
SkinCare Pro is authorized for:

[L'Oréal Pro logo] [Kérastase logo] [Redken logo]

These authorizations are verified annually with each brand.
```

Display brand logos with proper licensing (get permission to use).

If vendor sells products from non-authorized brands too, distinguish on the PDP:

```
✓ Authorized retailer for L'Oréal Pro  ← this specific product
```

Mixed inventory should not muddy the message.

## Anti-counterfeit features

### Batch/serial number display

```
Product details:
- Batch: A24L3F92
- Manufactured: 2024-08
- Expiration: 2026-08
```

Customer can verify on brand's website if brand provides lookup.

### High-resolution packaging photos

PDP includes:
- Multiple angles of the box/packaging
- Close-ups of seals, holograms, batch codes
- Comparison to brand-original (where possible)

This signals: "we're not hiding anything."

### Unboxing video (optional)

For premium items, vendor can record unboxing of stock arrival:
- Sealed carton
- Brand's seal intact
- Inner items revealed

User sees this on PDP. Strong trust signal.

### Product reviews mention authenticity

Encourage reviewers to note authenticity:
```
Review prompt:
"How was your experience? Tell us about:
- Quality
- Packaging  
- Authenticity (does it match what you expected from the brand?)
- Delivery"
```

User-generated authenticity confirmations build collective trust.

### "Spot a fake" guide

Per-brand guide:
```
How to verify L'Oréal authenticity:
- Hologram on bottom-right of box
- Serial number starts with "L"
- Batch code engraved (not printed)
- Pump action smooth
- Scent matches typical
```

Helps customers self-check; doubles as anti-counterfeit education.

## Other badges to consider

### "Brand Direct" — for Tier A

### "Authorized Retailer" — for Tier B

### "Verified Vendor" — for Tier C

### "Best Seller" — top 5% by sales in category

### "Marketplace Choice" — editorially selected

### "Sustainably Sourced" — verified eco-credentials

### "Halal Certified" — for relevant products

### "Vegan" — verified vegan formulation

### "Cruelty-Free" — verified no animal testing

### "Made in [country]" — origin disclosure

### "Award Winner" — context-specific (Allure, Cosmo, etc.)

### "Salon Approved" — by Pro Zone vendors

### "New Arrival" — added in last 30 days

### "Trending" — viewed/added many times in last 7 days

### "Last Chance" — discontinuing soon (be careful)

Use 1-3 badges per product max. More = noise.

## Badge ordering / hierarchy

When multiple apply, show in this order on PDP:

1. **Authenticity** (always first if applicable): Brand Direct > Authorized > Verified
2. **Functional**: Halal, Vegan, Cruelty-Free
3. **Editorial**: Award Winner, Marketplace Choice
4. **Social**: Bestseller, Trending
5. **Temporal**: New, Last Chance

Trust before flair. Authenticity > "bestseller."

## Counterfeit response process

When customer reports a fake:

```
Day 0: Customer reports
  ├─ Auto-pause vendor's similar listings
  ├─ Open investigation ticket
  ├─ Notify customer of investigation
  └─ Inform brand (if Tier A/B)

Day 1-3: Vendor responds
  ├─ Sourcing documentation requested
  ├─ Photo evidence requested
  └─ Customer's photos reviewed

Day 3-7: Decision
  ├─ Confirmed fake:
  │  ├─ Full refund to customer
  │  ├─ Vendor warning (first time) or ban
  │  ├─ Listings removed
  │  └─ Brand notified
  ├─ Genuine but disputed:
  │  ├─ Mediation
  │  └─ Partial refund or return
  └─ Inconclusive:
     ├─ Customer refund (we err on customer side)
     └─ Vendor on watchlist
```

Always refund the customer in disputed cases. Trust > short-term margin.

## Vendor education

Help vendors understand the system:

```
Authenticity Guidelines for Sellers
====================================

To remain in good standing:

✓ Source from authorized distributors only
✓ Keep purchase invoices for all stock
✓ Avoid gray-market arbitrage on premium brands
✓ Respect MAP (Minimum Advertised Price) when set by brand
✓ Don't tamper with packaging
✓ Don't sell expired products

Risks of violating:
- Customer refunds at your expense
- Account suspension
- Permanent ban
- Legal action by brand (we cooperate with enforcement)

Resources:
- Authorized distributor list (per brand)
- Brand contact information for authorization
- Sourcing best practices
```

Vendor dashboard surfaces this education during onboarding (see `beauty-vendor-dashboard/references/vendor-onboarding.md`).

## Recourse and recourse visibility

Every PDP should make recourse visible:

```
Worried about authenticity?

✓ 100% Authentic Guarantee
✓ 30-day return — full refund
✓ Authentic verified by [vendor tier]
✓ Backed by Beauty Marketplace

[ Learn more ]
```

This isn't optional. It's load-bearing trust.

## Anti-patterns

- ❌ Generic "Authentic!" claim with no policy backing it
- ❌ "Verified" badge that's just a graphic, no verification process
- ❌ Hiding which tier a vendor is (customer assumes lowest)
- ❌ Confusing badges that look like rewards programs
- ❌ Different badge styles per category (inconsistent = un-trustable)
- ❌ Badges for everyone (devalues them all)
- ❌ Brand logos on vendor profile without authorization (legally risky)
- ❌ Defending vendor over customer in authenticity dispute
- ❌ Refunding customer but keeping vendor active (no consequence)
- ❌ "100% genuine" promise without a return policy
- ❌ Strict authenticity policy that scares away legitimate vendors
- ❌ Permanent ban on first offense without investigation
- ❌ No way for customers to report fakes
- ❌ Hiding authenticity claims behind 3 clicks (customer never sees)
- ❌ Trust seal that's purely visual (decorative SSL lock with no actual https)
