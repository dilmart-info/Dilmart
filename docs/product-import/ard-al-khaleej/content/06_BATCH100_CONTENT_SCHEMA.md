# 06 — Batch 100 Content Schema

Every Batch 100 row needs:

| Field | Required | Rules |
|-------|----------|-------|
| merchant_sku | YES | Unique within merchant |
| name | YES | Non-empty, reviewed |
| brand | YES | Normalized |
| sizes | YES when known | e.g. `100 مل` |
| category_path | YES | Ends at assignable **leaf** |
| short_description | YES | 40–280 chars (target 90–180) |
| description | NO | Only with trusted source |
| image_url | YES | Allowed Storage prefix |
| price | YES | > 0 |
| stock | YES | **0** for draft batch |
| is_active | YES | **false** |
| is_published | YES | **false** |
| visibility_status | YES | **private** |

Batch gates:

- short_description 100/100  
- images 100/100  
- Ready status only (no merchant confirmation / duplicates)  
- Leaf category path  
- No activation/publication via import for draft merchant  

This task does **not** run Batch 100 Preview/Confirm.
