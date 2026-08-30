# AGENTS.md — DilMart-Store AI Governance Entry Point

> **هذا الملف هو نقطة الدخول الحاكمة لأي AI agent يعمل داخل DilMart-Store.**

## Required reading before any implementation or live operation

1. `ai/ENVIRONMENT_SOURCE_OF_TRUTH.md` ← **الخريطة الحاكمة للـ DilMart Main / staging / Store current environment**
2. `ai/README_FOR_AI.md`
3. `ai/PROJECT_CONTEXT.md`
4. `ai/AGENTS.md`
5. `ai/CURSOR_EXECUTION_RULES.md`
6. `ai/QA_CLOSURE_GATE.md`
7. Domain-specific skill(s) relevant to the task.

## Environment precedence

If any historical Store document, smoke-test report, bootstrap checklist, test fixture, or safety gate conflicts
with `ai/ENVIRONMENT_SOURCE_OF_TRUTH.md`, **the Environment Source of Truth wins** until the product owner
explicitly updates it.

Current critical rule:

```text
DilMart Main staging Supabase  = zlmdwhuphuxppxznsgso
DilMart Main production       = yssjhxeybitiycdviyrc
DilMart-Store current/live    = ztplxqlthuqkuktbznbo

DilMart-Store has NO separate staging branch/backend/database today.
```

Do not infer or invent a Store staging environment from an old document or from a guard that rejects a DilMart
staging identifier.

## Non-negotiable live-operation gate

Before deployment, env mutation, DB migration/write, or live smoke testing, verify and report:

```text
Repository:
Git branch:
Render service:
Backend hostname:
Supabase project ref:
Environment role:
```

If those identifiers conflict with `ai/ENVIRONMENT_SOURCE_OF_TRUTH.md`, STOP before writing anything.

## General rules

```text
❌ no production/live mutation without explicit authorization
❌ no secret values in Git, logs, reports, or chat
❌ no destructive SQL without a separately approved emergency plan
❌ no mixing DilMart Main DBs with DilMart-Store DB
❌ no fabricated staging infrastructure
✅ inspect current code and live target identity before changing anything
✅ feature flags default off unless activation is explicitly authorized
✅ important changes use a scoped branch + PR
```
