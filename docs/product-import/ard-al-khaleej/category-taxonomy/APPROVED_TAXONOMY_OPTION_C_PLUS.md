# APPROVED_TAXONOMY_OPTION_C_PLUS.md

**Authorization:** `CATEGORY_TAXONOMY_PHASE_B_APPROVED`  
**Architecture:** `OPTION_C_PLUS_REUSE_EXISTING_EMPTY_ROOTS`  
**Draft PR:** #67

## Freeze

### Fragrance root (reuse)

| Field | Value |
|-------|-------|
| id | `fc662e9f-ea22-454e-bb29-cdb7bf5ea90c` |
| name | العطور والمعطرات |
| slug | `fragrances-and-scents` |

Children (6):

| Arabic | slug |
|--------|------|
| العطور | `perfumes` |
| العطور الصغيرة والميني | `mini-travel-perfume` |
| معطرات الجسم والبودي مست | `body-mist-splash` |
| معطرات المنزل والمفارش والجو | `home-linen-air` |
| البخور والمعمول | `incense-maamoul` |
| المسك والمخمريات والعطور الزيتية | `musk-oils-mukhammaria` |

### Personal care root (reuse empty)

| Field | Value |
|-------|-------|
| id | `d7df20e8-011c-430e-a8a7-77b9506936ac` |
| name | العناية الشخصية والتجميل |
| slug | `personal-care-beauty` |

Children (4):

| Arabic | slug |
|--------|------|
| العناية بالبشرة | `skin-care` |
| العناية بالجسم والاستحمام | `body-bath-care` |
| العناية بالشعر وعطور الشعر | `hair-care-fragrance` |
| البودرة ومنتجات التجميل | `powder-makeup` |

**Expected new children total: 10** (6 + 4).

## Pilot 10

Move exactly these SKUs on merchant `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` to leaf `perfumes`:

`ARD-1015` `ARD-1042` `ARD-1065` `ARD-1172` `ARD-1173` `ARD-1191` `ARD-1826` `ARD-2800` `ARD-3270` `ARD-3723`

## Legacy similar merchant

- merchant `1689ae4a-41f5-425b-bebe-c99c74880008` / `ardh-alkhaleej`: **do not move / do not modify**
- Allow non-category field updates while `category_id` unchanged
- Reject **new** assignment to parent-with-active-children
- **No** permanent grandfather DB flag

## ARD-2575

Mapping-only for future full import → existing `pro-hair-color-care`. No production row create/move in this task.

## Still not authorized

Merge · remote migration apply · production writes · Render/Netlify deploy · product/merchant activation · full 2204 import
