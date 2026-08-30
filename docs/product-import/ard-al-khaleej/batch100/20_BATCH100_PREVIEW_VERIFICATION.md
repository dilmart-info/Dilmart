# Batch 100 Preview Verification

## Status

**PASS**

Preview was created once by the operator. Verifier was re-run after IDENTITY regex patch. Preview was **not** re-run.

## Preview session

| Field | Value |
|---|---|
| HTTP | 201 |
| import_id | `ff3274c4-7f65-455b-8bda-549c4ecd3fad` |
| total_rows | 100 |
| valid_rows | 100 |
| invalid_rows | 0 |
| warnings_count | 0 |
| Session status (DB) | `previewed` |
| Confirm | **NO** |

## Deep verification (all 100 normalized rows)

| Check | Result |
|---|---|
| SKU set exact match | PASS (100) |
| Duplicate / unexpected SKU | 0 |
| Category distribution | perfumes 87 / home-linen-air 8 / mini-travel-perfume 3 / musk-oils-mukhammaria 2 |
| stock / active / published / visibility / discount | 0 / false / false / private / null |
| Image URLs | match final CSV |
| ARD-4138 identity | PASS — `عطر اكلاير 100 مل` (Arabic transliteration accepted) |
| ARD-2511 identity | PASS — `عطر انا الابيض بودري` |

### Verifier false-negative fix

Previous failure `identity_name:ARD-4138` only matched Latin `eclaire`.  
IDENTITY regex now accepts verified transliterations:

- ARD-4138: `eclaire|éclaire|اكلاير|إكلاير|اكلير|إكلير`
- ARD-2511: `Ana Abiyedh Poudree` + `أنا الأبيض بودري` / `انا الابيض بودري`

## Post-Preview safety

| Check | Value |
|---|---|
| Target merchant products | 10 (unchanged) |
| Target merchant status | draft |
| ARD-1191 short/description | empty (unchanged) |
| Similar merchant | unchanged |
| Production product writes | **NO** |

## Hard stop

Confirm remains **NOT AUTHORIZED**. Await `BATCH100_CONFIRM_APPROVED`.
