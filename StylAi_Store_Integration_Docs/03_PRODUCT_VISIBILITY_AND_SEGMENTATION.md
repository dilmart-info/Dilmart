# DilMart Store Integration — Product Visibility and Segmentation

## 1. Core Principle

Do not show the same store to every user.

The Store must be dynamic and segmented by:

- user segment
- user role
- business type
- product target audience
- channel visibility
- merchant approval
- stock/availability

## 2. Segments

Suggested segments:

```txt
RETAIL_CUSTOMER
PROFESSIONAL_BARBER_UNVERIFIED
SALON_OWNER_LEAD
B2B_BARBER_OWNER
B2B_BARBER_STAFF
B2B_WOMEN_SALON_OWNER
B2B_NAIL_STUDIO_OWNER
B2B_BEAUTY_CENTER_OWNER
DilMart_APP_CUSTOMER
```

## 3. Business Types

Suggested business type tags:

```txt
men_barbershop
women_salon
nail_studio
beauty_center
spa
all
```

## 4. Product Metadata

Products should support:

```txt
target_audience:
- customer
- barber_staff
- salon_owner
- professional_buyer
- all

business_type_tags:
- men_barbershop
- women_salon
- nail_studio
- beauty_center
- spa
- all

product_use_case:
- personal_tool
- salon_equipment
- consumable
- furniture
- professional_cosmetic
- setup_package
- wholesale

visible_in:
- web_store
- barber_app
- customer_app
- all

purchase_mode:
- retail
- b2b
- wholesale
- quote_request
```

## 5. Visibility Rule

A product can appear inside the Barber App only if:

```txt
status = active
AND merchant/supplier is approved
AND visible_in contains barber_app or all
AND target_audience matches the user's segment/role
AND business_type_tags matches the salon business type or all
AND product is available or supports preorder
```

## 6. Segment Examples

### Male salon owner

Should see:

```txt
- male barbershop setup
- barber chairs
- mirrors and workstations
- machines
- scissors
- razors
- sterilization products
- towels/capes
- wholesale offers
```

### Barber staff

Should see:

```txt
- machines
- scissors
- razors
- combs
- personal professional tools
- beard/hair products
```

Should not primarily see:

```txt
- chairs
- mirrors
- full salon setup packages
- reception furniture
```

### Women salon owner

Should see:

```txt
- women salon setup
- styling devices
- dyes and treatments
- hair-washing chairs
- professional haircare
- professional cosmetics
- sterilization/consumables
```

### Nail studio

Should see:

```txt
- nail tools
- gels and polish
- UV/LED devices
- nail tables
- precision tools
- nail consumables
```

### Beauty center

Should see:

```txt
- makeup products
- skincare products
- beauty devices
- consumables
- room setup products
```

## 7. Dynamic Home Layout

The mobile app must render backend-provided sections, not hardcoded lists.

Example response:

```json
{
  "layoutVersion": 1,
  "segment": "B2B_BARBER_OWNER",
  "businessType": "men_barbershop",
  "banners": [
    {
      "id": "banner_1",
      "title": "Equip your salon",
      "imageUrl": "https://...",
      "action": { "type": "campaign", "id": "campaign_1" }
    }
  ],
  "sections": [
    {
      "type": "category_grid",
      "title": "Shop by category",
      "items": []
    },
    {
      "type": "product_carousel",
      "title": "Special offers for salon owners",
      "items": []
    }
  ]
}
```

## 8. Supported Section Types

```txt
hero_banner
campaign_banner
category_grid
product_carousel
product_grid
supplier_carousel
setup_package_grid
quick_filter_chips
text_block
```

## 9. Important Rule

The homepage should be strongly personalized. Search can be wider but must still respect visibility and approval rules.
