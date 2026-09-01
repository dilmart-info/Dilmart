# Canonical Workspace

This document defines the single, authoritative way to develop DilMart-Store and
to generate Production builds. It exists to prevent Production `dist` artifacts
from ever being built from an obsolete or unverified local checkout.

## Canonical GitHub repository

    dilmart-info/Dilmart
    https://github.com/dilmart-info/Dilmart.git

GitHub `origin/main` is the authoritative Production source. Nothing local
overrides it.

## Canonical branch for Production

    main

## Local workspace rule

- Each operator or machine may have a different filesystem path for their workspace.
- One verified active local checkout per operator should be used for normal work.
- A local checkout is canonical **only** when `origin` resolves to `dilmart-info/Dilmart`.
- Copied, duplicated, or archived workspaces must never be used for development or for Production builds.

## Production manual deploy rule

Only deploy a `dist` that was produced through the guarded Production build
procedure from a verified canonical workspace:

    powershell -ExecutionPolicy Bypass -File scripts\build-production.ps1

That script fails closed unless all of the following hold:

1. It is running inside the canonical `DilMart` git repository.
2. `origin` points to `dilmart-info/Dilmart`.
3. The current branch is `main`.
4. The working tree is clean.
5. `origin` has been fetched.
6. Local `HEAD` exactly equals `origin/main`.
7. No merge / rebase / cherry-pick / revert is in progress.

It then removes any old `dist`, runs `npm ci`, runs `npm run build:deploy`,
verifies `dist/index.html`, writes a non-sensitive `dist/build-meta.json`
(commit, branch, UTC timestamp only), and prints a Production Build Receipt.

The script never deploys. Deployment to Netlify remains a separate, deliberate
manual step performed only against a `dist` produced this way.

## Old folders and archives

Earlier scattered checkouts or archive directories are **reference / recovery only**.
They must never be used for active development or for Production builds.

## Multi-agent rule

Claude Code, Antigravity, Cursor, and any other coding agent must all be opened
against the same verified canonical checkout on the operator's machine. Do not
point different agents at different local copies.

## Feature isolation

Use Git branches — not copied project directories — for future tasks. One
canonical checkout, many branches.
