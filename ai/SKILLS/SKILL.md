---
name: DilMart-store-redesign-guardrails
description: Mandatory project-specific guardrails for DilMart-Store redesign work. Always use this skill before applying any beauty marketplace skill in this codebase.
---

# DilMart-Store Redesign Guardrails

This project is DilMart-Store, an Arabic RTL marketplace for Iraq-focused beauty, salon, barber, grooming, and professional supply products.

These rules override any generic beauty marketplace skill.

## Market Rules

- Primary market: Iraq.
- Primary language: Arabic.
- Primary direction: RTL.
- Primary payment behavior: Cash on Delivery first.
- Currency: Iraqi dinar / local marketplace formatting where already implemented.
- Do not introduce GCC-specific assumptions unless the code already supports them.
- Do not add Tabby, Tamara, Mada, Apple Pay, Stripe, or BNPL unless explicitly requested.
- Do not add EU/US checkout assumptions.
- Do not add English storefront copy unless the existing UI already requires it.

## Design Rules

- Keep the current luxury dark direction: black, near-black, warm gold, ivory.
- Improve quality, spacing, hierarchy, trust, and commerce clarity.
- Do not replace the brand identity from scratch.
- Do not copy Ozon, Noon, Sephora, Amazon, or any competitor exactly.
- Use inspiration only at pattern level.
- Mobile-first is mandatory.
- RTL-first is mandatory.

## Engineering Rules

- Do not rewrite the app.
- Do not change backend APIs.
- Do not change Supabase schema.
- Do not add migrations.
- Do not change auth logic.
- Do not change cart logic.
- Do not change wishlist logic.
- Do not change checkout logic unless the task explicitly says so.
- Do not change merchant/admin finance logic.
- Do not modify env files.
- Do not modify deployment configuration.
- Do not add heavy dependencies.
- Do not introduce unnecessary animation libraries.

## Phase Discipline

When working on Phase 1, only touch:

- design tokens
- SearchBar
- mobile header
- desktop header
- HeroSlider
- homepage shell

Do not deeply redesign:

- ProductCard
- ProductSection
- CategoryGrid
- ProductDetail
- Products listing page
- Cart
- Checkout
- Vendor dashboard

## Data Contract Rules

Before editing a component, inspect its props and related marketplace types.

Never assume new fields exist.

Use graceful fallbacks for:

- missing images
- missing promo product
- missing merchant logo
- long Arabic text
- loading states
- error states
- empty states

## QA Rules

After changes, run:

```bash
npm install
npm run lint
npm run build
```
