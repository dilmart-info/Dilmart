# Canonical Workspace

This document defines the single, authoritative way to develop DilMart-Store and
to generate Production builds. It exists to prevent Production `dist` artifacts
from ever being built from an obsolete or unverified local checkout.

## Canonical GitHub repository

    cylendralabs-blip/DilMart-Store
    https://github.com/cylendralabs-blip/DilMart-Store.git

GitHub `origin/main` is the authoritative Production source. Nothing local
overrides it.

## Canonical branch for Production

    main

## Local rule

Only **one** active local DilMart-Store checkout is used for normal development
and for Production builds:

    C:\Dev\DilMart\DilMart-Store

Do not develop from, or build Production `dist` from, any other local copy.

## Production manual deploy rule

Only deploy a `dist` that was produced through the guarded Production build
procedure from the canonical workspace:

    powershell -ExecutionPolicy Bypass -File scripts\build-production.ps1

That script fails closed unless all of the following hold:

1. It is running inside the canonical `DilMart-Store` git repository.
2. `origin` points to `cylendralabs-blip/DilMart-Store`.
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

## Old folders

Earlier scattered checkouts (for example `DilMart-Store-admin-merchant`,
`DilMart-Store-Resilience`, and the many `DilMart-Store-*` deploy/worktree
directories) are **reference / recovery only**. They must never be used for
development or for Production builds. Archived copies live under
`C:\Dev\_ARCHIVE_DO_NOT_USE\` with an `ARCHIVED-...-<date>` prefix.

## Multi-agent rule

Claude Code, Antigravity, Cursor, and any other coding agent must all be opened
against this same canonical workspace (`C:\Dev\DilMart\DilMart-Store`). Do not
point different agents at different local copies.

## Feature isolation

Use Git branches — not copied project directories — for future tasks. One
canonical checkout, many branches.
