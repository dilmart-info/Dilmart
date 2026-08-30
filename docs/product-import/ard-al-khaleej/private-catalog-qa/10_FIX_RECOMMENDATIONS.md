# Fix recommendations (proposal only — no production writes)

Authorization required for execution: `PRIVATE_CATALOG_QA_FIX_PLAN_APPROVED`

## P1 — image / identity / size / brand

| SKU | Issue | Recommended fix |
|---|---|---|
| ARD-2793, ARD-2797, ARD-4300, ARD-4564, ARD-4750, ARD-4751, ARD-4752, ARD-4807 | Home-linen-air 300ml listings use perfume EDP packshots | Source true 300ml home-spray / air-freshener packaging images; re-upload; update `image_url` |
| ARD-4792 | Listed Black Intense; image is White Intense | Replace with Musamam **Black** Intense official packshot |
| ARD-775 | Brand Lattafa + musk category; image is ASDAAF Salamah EDP | Either re-identify product to Asdaaf Salamah + correct category, or replace image with true Lattafa musk oil packaging |
| ARD-823 | Catalog 100 مل; packaging prints 50 ML set | Align size/name to 50ml set **or** replace image with true 100ml SKU packaging |
| ARD-2511 | Poudrée identity OK; possible 60ml marking vs catalog 100 مل | Human measure/confirm official size; correct catalog size if needed |

## P2 — content / polish

| Pattern | SKUs (examples) | Recommended fix |
|---|---|---|
| Repeated «عطر عطر» in short | ARD-1369, 1480, 2436, 2583, 3117, 3347, 3711, 3714, 4214, 4255, 4256, 4286, 4336, 4637, 4660, 4680, 4685, 4686, 5036, 5058 | Editorial rewrite removing duplicate noun |
| Longevity claim «ثبات عالٍ» | ARD-1858 | Remove unsupported claim |
| Review overlay on image | ARD-2932 | Replace with clean e-commerce packshot (identity already correct) |
| Repeated phrase inside short | ARD-4286 (ويتميز… duplicated) | Deduplicate clause |

## KNOWN_HOLD

| SKU | Action |
|---|---|
| ARD-1191 | Keep empty short/description; resolve gold-bottle identity match before content apply |

## Explicitly out of scope until separate auth

- Merchant activation
- Product activation / publication
- Stock updates
- Live market repricing
- Batch 101+
