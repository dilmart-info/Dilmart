# Category Decision — Pilot (Gate 2 prep)

## Decision for Pilot 10

**Option B — use existing general category only.**

```text
Name: عطور و معطرات جسم
category_id: fc662e9f-ea22-454e-bb29-cdb7bf5ea90c
parent_id: null
```

Do **not** create the nine detailed subcategories during this Pilot.

## Support check (read-only)

| Layer | Nested `parent_id` support? | Notes |
|-------|-----------------------------|-------|
| Database | Yes | `categories.parent_id` exists; currently **0** nested rows |
| Admin Categories UI | Yes | Create-as-child supported |
| Admin ProductForm | Yes | Root + children selectors |
| Storefront Products page | Yes | Subcategory browser when children exist |
| Backend marketplace | Partial | Category page loads `parent_id` children |

## Recommendation for later (not this Pilot)

Under parent `عطور و معطرات جسم`, create:

1. العطور  
2. العطور الصغيرة والميني  
3. معطرات الجسم والبودي مست  
4. معطرات المنزل والمفارش والجو  
5. البخور والمعمول  
6. المسك والمخمريات والعطور الزيتية  
7. العناية بالجسم والاستحمام  
8. العناية بالشعر وعطور الشعر  
9. البودرة ومنتجات التجميل  

Requires a separate migration + content IA review before production create.
