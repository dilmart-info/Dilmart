# Batch 100 Storage Postflight

Task: `DilMart-ARD-AL-KHALEEJ-BATCH100-UPLOAD-PREVIEW-001` (resume after auth compatibility)  
Upload script: **not re-run** (operator-confirmed success)

## Upload summary (operator + local artifacts)

| Metric                   | Value                                                 |
| ------------------------ | ----------------------------------------------------- |
| Auth probe               | PASS HTTP 200                                         |
| Key kind                 | `sb_secret`                                           |
| Canary SKU               | ARD-1318                                              |
| Canary                   | `uploaded_verified` / SHA match / GET 200 / MIME PASS |
| Total                    | 100                                                   |
| uploaded_verified        | 100                                                   |
| already_present_verified | 0                                                     |
| failed                   | 0                                                     |
| indeterminate            | 0                                                     |
| sha_mismatches           | 0                                                     |
| public_get_200           | 100                                                   |
| remaining_attempted      | 99                                                    |
| stop / auth_aborted      | false / false                                         |

## Storage verification (SQL)

| Metric                                                       | Value                    |
| ------------------------------------------------------------ | ------------------------ |
| Target merchant WebP objects (`…/ARD-*.webp`)                | **100**                  |
| Target merchant product rows                                 | **10** (unchanged)       |
| Target merchant status                                       | `draft`                  |
| Similar merchant (`1689ae4a-…`)                              | `suspended`, 15 products |
| Public marketplace products (triple-state + active merchant) | **311**                  |

## Manifest / final CSV

| Artifact                         | Status                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `16_BATCH100_UPLOAD_RESULT.csv`  | verified 100/100                                                                 |
| `04_BATCH100_IMAGE_MANIFEST.csv` | updated with public_url + upload evidence                                        |
| `18_BATCH100_FINAL_IMPORT.csv`   | generated                                                                        |
| Final CSV SHA-256                | `A4378AAFC3121C880230C960563F9DB7E148CA567B79CEAEE5930A873E4BA181`               |
| Image URL re-validation          | 100/100 PASS                                                                     |
| Category distribution            | perfumes 87 / home-linen-air 8 / mini-travel-perfume 3 / musk-oils-mukhammaria 2 |

## Preview

Blocked pending Admin **user** JWT (`ADMIN_JWT`). Terminal candidates were anon/service_role API keys only — rejected by hardened loader.
