# Batch100 validator lifecycle (PRE_UPLOAD vs POST_UPLOAD_PREVIEWED)

After Storage upload + Preview, `upload_status` is truthfully `uploaded_verified`.
CI must call:

```bash
node scripts/product-import/validate-batch100-phase-a.mjs --phase=post-upload-previewed
node scripts/product-import/verify-batch100-preview.mjs
```

Pre-upload (historical Phase A2) remains available as:

```bash
node scripts/product-import/validate-batch100-phase-a.mjs --phase=pre-upload
```

Missing/unknown `--phase` fails closed. Do not revert manifest statuses to `not_uploaded`.
