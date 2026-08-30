# GIT_WORKFLOW.md — DilMart-Store

## Branching

Use small branches per task:

```txt
fix/launch-checkout-identity
fix/remove-direct-supabase-quick-links
feat/admin-quick-links-api
qa/order-delivery-finance-smoke-tests
```

## Commit Style

```txt
fix: secure checkout loyalty identity
fix: persist checkout delivery geo fields
refactor: route desktop quick links through backend api
test: add checkout order integrity scenarios
docs: add launch closure governance pack
```

## Before Commit

Run relevant checks and include results in the report.

Do not commit:

- `.env`
- secrets
- generated node_modules
- build artifacts unless required
- screenshots unless explicitly part of report

## Pull Request Report

Every PR should include:

- summary
- files changed
- risk domains
- validation commands
- screenshots for UI changes
- rollback note
