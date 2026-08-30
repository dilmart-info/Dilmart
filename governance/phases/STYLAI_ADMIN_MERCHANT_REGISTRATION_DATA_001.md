# DilMart Admin Merchant Registration Data - DilMart-ADMIN-MERCHANT-REGISTRATION-DATA-001

## Task

`DilMart-ADMIN-MERCHANT-REGISTRATION-DATA-001`

## Governing docs

- `governance/MASTER_SPEC.md`
- `governance/CURRENT_PHASE.md`

## PR

[Pending] — `feat/admin-merchant-registration-data`

## Status

```text
IMPLEMENTATION_COMPLETE
TARGETED_TESTS_PASS
FRONTEND_BUILD_PASS
BACKEND_BUILD_PASS
MIGRATION_NOT_APPLIED
READY_FOR_PULL_REQUEST
NOT_DEPLOYED
```

## Problem

The merchant registration form collects multiple fields, but the Admin Merchant Detail page currently displays only limited merchant information.

## Fix

- New migration adds `business_type` TEXT column to `public.merchants`.
- `MerchantApplicationsService` is updated to persist `business_type` during registration.
- `MerchantsService.getMerchantById` is enhanced to aggregate `registration_details` object from `merchants`, `merchant_settings`, and the earliest owner's `profiles`.
- Strong TypeScript types added to `src/lib/api/admin-core.ts` with no password or auth secrets exposed.
- Read-only card titled "بيانات طلب التسجيل" is added to the Admin Merchant Detail UI.

## Tests

- `backend/tests/admin-merchant-registration-data.test.mjs`
- `src/pages/admin/MerchantDetail.test.tsx`

## Database / auth / deploy

New migration file: `supabase/migrations/20260805164900_add_merchant_business_type.sql`
No password or authentication secrets exposed.
