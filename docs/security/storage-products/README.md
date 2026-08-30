# DilMart-PRODUCT-STORAGE-SECURITY-REMEDIATION-001

## Task

Gate S1 — remediate unrestricted public write access on the Supabase Storage bucket `products`.

## Scope

- Independent of Pilot PR #65 (do not merge Pilot; do not apply Pilot migrations here).
- Create migration + tests + documentation.
- Do **not** apply the migration to remote production without separate authorization.
- Do **not** upload Pilot product images.

## Findings (upload paths)

| Caller                                                      | Mechanism                                                   | Uses service role?                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| `POST /uploads/products/image`                              | NestJS `UploadsService` → `storage.from('products').upload` | **Yes** (admin client)                                  |
| Admin `ProductForm.tsx`                                     | `apiClient.uploadProductImage` → backend                    | Indirect                                                |
| Merchant `Settings.tsx`                                     | same API                                                    | Indirect                                                |
| Admin `Categories.tsx`                                      | same API (category images also land in `products` bucket)   | Indirect                                                |
| App frontend direct `supabase.storage.from('products')`     | **None found**                                              | N/A                                                     |
| Legacy root scripts `upload_images.cjs` / `add_product.cjs` | Direct Storage upload with **publishable/anon** key         | **No** — will stop working after lockdown (intentional) |

Legitimate product-image writes are backend-only. After this migration, ops must use authenticated `POST /uploads/products/image` (or a service-role script), never anon/public Storage writes.

## Policy change

Migration: `supabase/migrations/20260801210000_products_storage_write_lockdown.sql`

- DROP `Public Insert`
- DROP `Public Update`
- DROP `Public Delete`
- KEEP `Public Access` (SELECT)

After apply: anon/authenticated cannot write; service_role backend uploads continue via RLS bypass.

## Tests

`backend/tests/db-integration/products-storage-write-lockdown.test.mjs`

1. service_role upload succeeds
2. anon INSERT denied
3. anon UPDATE/upsert denied
4. anon DELETE denied
5. public URL SELECT still HTTP 200

Skips until migration is applied on the target local/CI database.

## Explicit non-goals

- Merge PR #65
- Apply any remote migration
- Gate 3 image preparation
- Alarsh SKU cleanup
- Product RLS triple-state apply (Gate D1 preflight still required first)
