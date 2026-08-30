<#
.SYNOPSIS
    Guarded Production build for DilMart-Store.

.DESCRIPTION
    Fails closed: refuses to produce a deployable `dist` unless the local
    checkout is provably in sync with the authoritative GitHub source.

    Authoritative source : https://github.com/cylendralabs-blip/DilMart-Store
    Production branch     : main

    Only run this from the canonical workspace. Never deploy a `dist` that was
    produced by any other procedure. This script does NOT deploy — it only
    produces a verified local `dist`. Deployment to Netlify remains a separate,
    deliberate manual step.

.NOTES
    No secrets, tokens, machine usernames, or private filesystem paths are
    written into the public build metadata (dist/build-meta.json).
#>

[CmdletBinding()]
param(
    # Skip `npm ci` (use the already-installed node_modules). Off by default;
    # deterministic installs are the safe default for Production.
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedOwnerRepo = 'cylendralabs-blip/DilMart-Store'
$ExpectedBranch    = 'main'

function Fail([string]$msg) {
    Write-Host ""
    Write-Host "PRODUCTION BUILD ABORTED: $msg" -ForegroundColor Red
    exit 1
}

function Run-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    # git writes progress / "From <url>" lines to stderr even on success. Under
    # $ErrorActionPreference='Stop' a native exe writing to stderr surfaces as a
    # terminating NativeCommandError, so relax it around the call and gate only
    # on the real exit code.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out  = & git @GitArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) {
        Fail "git $($GitArgs -join ' ') failed: $out"
    }
    # Keep only stdout-style lines (drop ErrorRecord objects from stderr).
    $clean = $out | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }
    return ($clean | Out-String).Trim()
}

# --- 1. Run from the script's own repository -------------------------------
# Repository IDENTITY is authoritative via `origin` (check 2), not the folder
# name or any absolute machine path. The leaf-name check is advisory only so the
# guard stays portable across clone locations.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$repoRoot = Run-Git rev-parse --show-toplevel
Set-Location $repoRoot

$repoLeaf = Split-Path $repoRoot -Leaf
if ($repoLeaf -ne 'DilMart-Store') {
    Write-Host "WARNING: repository folder is '$repoLeaf', canonical convention is 'DilMart-Store'." -ForegroundColor Yellow
}

# --- 2. origin points at the authoritative repository ----------------------
$originUrl = Run-Git remote get-url origin
# Normalise https / ssh / trailing .git into owner/repo
$normalized = $originUrl.Trim()
$normalized = $normalized -replace '\.git$', ''
$normalized = $normalized -replace '^git@github\.com:', ''
$normalized = $normalized -replace '^https?://github\.com/', ''
if ($normalized -ne $ExpectedOwnerRepo) {
    Fail "origin is '$originUrl' (resolved '$normalized'), expected '$ExpectedOwnerRepo'."
}

# --- 3. On the Production branch -------------------------------------------
$branch = Run-Git rev-parse --abbrev-ref HEAD
if ($branch -ne $ExpectedBranch) {
    Fail "current branch is '$branch', expected '$ExpectedBranch'."
}

# --- 4. Working tree clean -------------------------------------------------
$dirty = & git status --porcelain
if ($LASTEXITCODE -ne 0) { Fail "git status failed." }
if (-not [string]::IsNullOrWhiteSpace(($dirty | Out-String))) {
    Fail "working tree is not clean. Commit, stash, or discard changes first."
}

# --- 7. No unresolved merge / rebase / cherry-pick / revert state ----------
foreach ($marker in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD')) {
    $p = Run-Git rev-parse --git-path $marker
    if (Test-Path $p) { Fail "in-progress operation detected ($marker present)." }
}
$gitDir = Run-Git rev-parse --git-dir
foreach ($d in @('rebase-merge', 'rebase-apply')) {
    if (Test-Path (Join-Path $gitDir $d)) { Fail "an interrupted rebase is in progress ($d present)." }
}

# --- 5. Fetch origin -------------------------------------------------------
Write-Host "Fetching origin/$ExpectedBranch ..." -ForegroundColor Cyan
Run-Git fetch origin $ExpectedBranch | Out-Null

# --- 6. HEAD exactly equals origin/main ------------------------------------
$head      = Run-Git rev-parse HEAD
$originHead = Run-Git rev-parse "origin/$ExpectedBranch"
if ($head -ne $originHead) {
    Fail "local HEAD ($head) does not equal origin/$ExpectedBranch ($originHead). Pull or reconcile first."
}

Write-Host "Safety checks passed. HEAD == origin/$ExpectedBranch == $head" -ForegroundColor Green

# --- 8. Remove old dist ----------------------------------------------------
$distPath = Join-Path $repoRoot 'dist'
if (Test-Path $distPath) {
    Write-Host "Removing previous dist ..." -ForegroundColor Cyan
    Remove-Item -Recurse -Force $distPath
}

# --- 9. Deterministic dependency install -----------------------------------
if ($SkipInstall) {
    Write-Host "Skipping npm ci (-SkipInstall)." -ForegroundColor Yellow
} else {
    Write-Host "Running npm ci ..." -ForegroundColor Cyan
    & npm ci
    if ($LASTEXITCODE -ne 0) { Fail "npm ci failed." }
}

# --- 10. Production build --------------------------------------------------
Write-Host "Running npm run build:deploy ..." -ForegroundColor Cyan
& npm run build:deploy
if ($LASTEXITCODE -ne 0) { Fail "npm run build:deploy failed." }

# --- 11. Verify dist/index.html --------------------------------------------
$indexPath = Join-Path $distPath 'index.html'
if (-not (Test-Path $indexPath)) {
    Fail "build finished but dist/index.html is missing."
}

# --- build metadata (non-sensitive only) -----------------------------------
$buildUtc = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$meta = [ordered]@{
    repository = $ExpectedOwnerRepo
    branch     = $branch
    commit     = $head
    buildUtc   = $buildUtc
}
($meta | ConvertTo-Json) | Set-Content -Path (Join-Path $distPath 'build-meta.json') -Encoding utf8

# --- 12. Production Build Receipt -------------------------------------------
Write-Host ""
Write-Host "================ PRODUCTION BUILD RECEIPT ================" -ForegroundColor Green
Write-Host ("  Repository : {0}" -f $ExpectedOwnerRepo)
Write-Host ("  Branch     : {0}" -f $branch)
Write-Host ("  Commit SHA : {0}" -f $head)
Write-Host ("  Build UTC  : {0}" -f $buildUtc)
Write-Host ("  Dist path  : {0}" -f $distPath)
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "dist is verified. Deploy is a separate, deliberate manual step." -ForegroundColor Yellow
exit 0
