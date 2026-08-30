# Agent Instructions

This document defines the operating rules, constraints, and instructions for any AI Agent (e.g., Claude Code, Antigravity) working on the **DilMart-Store** repository.

You are an Execution Agent operating in a highly governed system. You do not have permission to make unauthorized architectural changes or break defined constraints.

---

## 1. Project Context & Branding

- **Name**: DilMart-Store (متجر ستايلي)
- **Nature**: An independent multi-vendor ecommerce marketplace platform for Iraq.
- **Independence**: It is completely separate from the DilMart booking/barber platform. Do not assume or couple the database tables or models with booking, appointments, or salons except for auth/identity context integration.

## 2. Priority Source of Truth

When executing tasks, follow this hierarchy of authority:

1. `governance/MASTER_SPEC.md`
2. `governance/CURRENT_PHASE.md`
3. `governance/CODING_STANDARDS.md`
4. `governance/SAFETY_RULES.md`
5. `governance/AGENT_INSTRUCTIONS.md` (This file)

## 3. Strict Operating Rules

### Phase Scoping

- **NEVER** work on files or domains outside the scope of the `CURRENT_PHASE.md`.
- If a task request asks you to implement a feature that belongs to a future phase, stop immediately and ask for clarification.

### Code & Database Safety

- **No Production Access**: Never attempt to modify production configurations or secrets.
- **No Destructive SQL**: Avoid running commands containing `DROP`, `TRUNCATE`, or unconstrained `DELETE`.
- **Idempotency**: All database migrations, seeds, and API operations must be idempotent.
- **Runtime Integrity**: Ensure no changes are introduced to `.env` variables or platform configurations (Render, Netlify, production config) without explicit approval.

### Jenni Integration (Third-Party Delivery)

- **Jenni Dispatch Behavior**: Do not modify dispatch rules or bypass state validation guards for the Jenni shipping aggregator.
- **Jenni Gates**: Do not activate or bypass shipping/dispatch gates unless specifically requested and tested in controlled environments.

## 4. Execution Workflow

### Step 1: Decompose & Plan

- Before making any code changes, read the codebase of the target area.
- Outline your changes in a plan.

### Step 2: Implement & Follow Coding Standards

- Refer to `governance/CODING_STANDARDS.md`.
- Keep NestJS controllers thin and put all business logic in services.
- Validate all incoming DTOs strictly (e.g., validate phone formats with regex).
- Clean up any unused imports, debug logs, or commented code before finishing.

### Step 3: Verify & Compile

- Run backend compilation: `npm run build` (inside the backend folder).
- Run tests: `npm run test` or specific module tests if available.
- Ensure the frontend builds without errors: `npm run build` (inside the root folder).

### Step 4: Write Closure Report

- Upon finishing any task, you must generate a closure report at:
  `/governance/CLOSURE_REPORT.md`
- Use `/governance/CLOSURE_REVIEW_TEMPLATE.md` as your guide. It must list all files modified, tests run, edge cases covered, and any remaining risks.

---

## 5. Escalation Policy

If you find a conflict between the requested task and the governance files, or if you encounter undefined behaviors/unknown states:

- **STOP immediately**.
- Do not make assumptions or write fallback logic without approval.
- Clearly present the conflict or unknown state to the operator and await instruction.
