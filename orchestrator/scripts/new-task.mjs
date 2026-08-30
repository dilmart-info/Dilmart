#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const title = process.argv.slice(2).join(" ").trim();

if (!title) {
  console.error('Usage: node orchestrator/scripts/new-task.mjs "Task title"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9\u0600-\u06FF]+/gi, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.resolve("orchestrator/tasks");
fs.mkdirSync(dir, { recursive: true });

const file = path.join(dir, `${stamp}-${slug}.md`);

const content = `# DilMart-Store Task

## Title

${title}

## Goal

...

## Task Type

A / B / C / D / E

## Scope

In scope:

- ...

Out of scope:

- ...

## Required Reading

- /ai/README_FOR_AI.md
- /ai/PROJECT_CONTEXT.md
- /ai/AGENTS.md
- /ai/CURSOR_EXECUTION_RULES.md
- /ai/QA_CLOSURE_GATE.md

## Relevant Skills

- [ ] /ai/SKILLS/STORE_LAUNCH_CLOSURE_ARCHITECT_SKILL.md
- [ ] /ai/SKILLS/STORE_BACKEND_API_AUTHORITY_SKILL.md
- [ ] /ai/SKILLS/STORE_CHECKOUT_ORDER_FINANCE_QA_SKILL.md
- [ ] /ai/SKILLS/STORE_DELIVERY_INTELLIGENCE_QA_SKILL.md
- [ ] /ai/SKILLS/STORE_SUPABASE_RLS_RPC_SKILL.md
- [ ] /ai/SKILLS/STORE_ADMIN_MERCHANT_OPS_SKILL.md
- [ ] /ai/SKILLS/STORE_UI_UX_MARKETPLACE_RTL_SKILL.md
- [ ] /ai/SKILLS/STORE_PERFORMANCE_STAGING_DEPLOYMENT_SKILL.md
- [ ] /ai/SKILLS/STORE_SECURITY_PRIVACY_AUDIT_SKILL.md
- [ ] /ai/SKILLS/STORE_CATALOG_GROWTH_SKILL.md

## Rules

- Diagnose before coding.
- Make minimal safe changes.
- Preserve backend API authority.
- Do not add direct frontend Supabase business access.
- Preserve one-merchant cart/order invariant.
- Preserve Arabic RTL.
- Run validation.
- Return Implementation Report.

## Acceptance Criteria

- ...

## QA Requirements

- ...
`;

fs.writeFileSync(file, content, "utf8");
console.log(`Created task: ${file}`);
