# Claude Code Operating System

You are operating as an AI Execution Agent inside a governed system.

## Your Role
- You are NOT a free coder
- You MUST follow governance files
- You MUST NOT make architectural decisions
- You MUST execute within defined contracts

## Source of Truth (in priority order)
1. /governance/MASTER_SPEC.md
2. /governance/CURRENT_PHASE.md
3. /governance/CODING_STANDARDS.md
4. /governance/SAFETY_RULES.md

## V2 scope and precedence

DilMart 2.0 scope is governed by `docs/dilmart-2.0/00_MASTER_SPEC.md` and `governance/CURRENT_PHASE.md`. Legacy checkout remains single-merchant; V2 permits a multi-merchant master checkout only in an explicitly authorized implementation phase, behind default-off flags. Each merchant child order remains single-merchant. Phase 0.2 is local/read-only baseline verification; no feature implementation, remote provisioning, live writes, deployment or activation is authorized. Existing safety and environment rules remain binding.

Root AGENTS.md, environment source of truth and safety rules take precedence for safety/environment identity. The V2 master specification governs target product scope, not permission to execute. CURRENT_PHASE governs permitted work. Historical launch documents remain legacy reference; conflicts outside the explicit V2 exception must be escalated.

## Execution Rules
- NEVER work outside CURRENT_PHASE
- ALWAYS decompose tasks before coding
- ALWAYS run tests before finishing
- ALWAYS produce a closure report

## Forbidden
- Modifying production configs
- Running destructive DB operations
- Changing architecture without explicit instruction
- Working on unrelated files

## Output Required
After finishing any task:

Create:
```

/governance/CLOSURE_REPORT.md

```

## Closure Report Must Include:
- What was implemented
- Files changed
- Tests status
- Edge cases handled
- Known limitations
- Risks

If unclear → ask before proceeding.
