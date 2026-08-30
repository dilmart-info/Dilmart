# Ard Al Khaleej — Pilot 10 Product Import

Task: `DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001`

## Scope

Import **exactly 10** products for draft merchant:

```text
merchant_id: ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7
slug: arth-al-khaleg
```

Products stay **inactive / unpublished / private / stock=0** until a separate activation decision.

## Gate status

| Gate               | Status                                             |
| ------------------ | -------------------------------------------------- |
| 0 Environment      | PASS (approved)                                    |
| 1 Importer + tests | In progress on this branch                         |
| 2 Categories       | Decision: use existing parent category only        |
| 3 Images           | Not started — Storage write policies are a blocker |
| 4–8 Import / smoke | Not authorized yet                                 |

## Working assets (not committed)

```text
.tmp-product-import/ard-al-khaleej/Ard_Al_Khaleej_Catalog_Stage3_Pilot_Batches_AB_v4.xlsx
```

Covered by `.gitignore` via `.tmp-*`.

## Allowed SKUs

```text
ARD-1015 ARD-1042 ARD-1065 ARD-1172 ARD-1173
ARD-1191 ARD-3270 ARD-1826 ARD-2800 ARD-3723
```

## Category (Pilot)

```text
عطور و معطرات جسم
fc662e9f-ea22-454e-bb29-cdb7bf5ea90c
```

No new subcategories in this Pilot.

## Admin import routes

```text
POST /admin/merchants/:merchantId/products/import/preview
POST /admin/merchants/:merchantId/products/import/confirm
```

Admin/super_admin only. Does not activate the merchant.
