# Netlify gated production deployment

`store.DilMart.org` is published by `.github/workflows/netlify-production-deploy.yml`, and only for a
commit that is the current tip of `main` **and** has already passed the required push CI for that exact
SHA.

## Why this exists

Netlify's Git continuous deployment for this site is **non-functional despite retained Git
configuration**. The site still records the repository, the `main` branch, `npm run build:deploy`,
`dist`, and an `installation_id`, and `stop_builds` is `false` — yet no Git-sourced production deploy
appears anywhere in the visible history. **The precise GitHub App / linkage failure was not proven**, and
repairing it is deliberately out of scope here.

What filled the gap was manual publishing: `api`, `cli`, and drag-and-drop `drop` uploads. The `drop`
deploys carry **no commit reference at all**, so the bytes serving production could not be traced to any
Git state. That is the problem this pipeline removes.

## The gate

A deployment happens only when every one of these holds:

| Condition                         | How it is proven                                                              |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Target is an exact commit         | 40-hex SHA from the event or dispatch input, never from repository content    |
| Target is still the tip of `main` | checked in the gate, then **re-checked immediately before the upload**        |
| Production target is canonical    | `scripts/ci/verify-store-production-build-env.mjs` runs before the build      |
| Launch Critical CI passed         | Run filtered by `event=push` **and** `head_sha=<target>`, `completed/success` |
| Native Foundation CI passed       | Same filter. See "Native Foundation" below                                    |
| Not already published             | Live `deploy-meta.json` compared against the target                           |
| Deployment is enabled             | `NETLIFY_PRODUCTION_DEPLOY_ENABLED` is exactly `true`                         |
| Credential is present             | `NETLIFY_AUTH_TOKEN` exists and is non-empty                                  |

If any of these cannot be proven, nothing is published. Refusals are recorded in the job summary rather
than passing silently.

### Native Foundation

`native-foundation.yml` is path-filtered, so a `main` push touching none of its paths produces **no run
for that commit**. Absence is recorded as **NOT REQUIRED** — it is not a failure, and it does not block.
A run that _exists_ and did not succeed **does** block. Those two cases are deliberately different: a
workflow that never needed to run is not evidence of a problem, but one that ran and failed is.

### Superseded commits

If `main` advanced while CI was running, the older commit is **skipped**, not published. The newer commit
receives its own CI and its own deployment opportunity. Publishing a superseded commit would silently
roll production backwards.

### Duplicate events, and the publish race

Both required workflows fire `workflow_run`, so one commit can produce two events. Workflow-level
concurrency is scoped to `netlify-production-<sha>` so those two serialise, and the idempotency check
makes the second a successful no-op.

The **publish itself** is serialised **globally** by a job-level `netlify-production` group, both with
`cancel-in-progress: false`. Per-SHA alone would let an older commit's publish run concurrently with a
newer commit's — the race that can roll Production backwards. Cancelling is never used: aborting a run
that may already be uploading is worse than queueing behind it.

### Last-moment freshness

The gate's freshness check is an early optimisation, not the guarantee. Between it and the upload the
deploy job waits for a runner, may wait for environment approval, installs dependencies, validates the
target and builds — and `main` can advance during any of that.

So `refs/heads/main` is queried **again inside the deploy job**, after the build and provenance file and
immediately before `netlify deploy`. On mismatch nothing is uploaded and the run ends **successfully** as
a no-op, recording the target SHA, the new current `main`, and the reason. Being overtaken is not a
deployment failure — the newer commit gets its own CI and its own deployment.

### Production target validation

`scripts/ci/verify-store-production-build-env.mjs` runs **before** the build, because a Vite build bakes
its environment into the bundle: a wrong value is not a runtime misconfiguration that can be corrected
later, it is a wrong artifact.

It requires `VITE_STORE_API_BASE_URL` to be `https://api.store.DilMart.org/api` (protocol, host and
normalised path — a trailing slash is accepted, anything else is not), `VITE_SUPABASE_PROJECT_ID` to be
`ztplxqlthuqkuktbznbo`, `VITE_SUPABASE_URL` to be that project's host over https, and
`VITE_SUPABASE_PUBLISHABLE_KEY` to be non-empty. `localhost`, `*.onrender.com`, other DilMart hosts, plain
HTTP and arbitrary paths are all rejected.

The publishable key is checked for **presence only** — never printed, and never pattern-matched for
"looks like a key", because a convincing string proves nothing about which project it belongs to. That is
established by the ref and URL checks.

With `VERIFY_STORE_BACKEND_BINDING=true` it also performs a read-only `GET` of
`/api/health/config-public` and fails closed unless the live API reports the expected project — the one
check that confirms the bundle and the backend it will call actually agree.

## Trust boundary

`workflow_run` executes in the context of the default branch **with access to repository secrets**. The
gate therefore refuses anything that is not a `push`, on `main`, in `dilmart-info/Dilmart`, and
the deploy job checks out the resolved SHA rather than a branch name. A `workflow_run` raised by a
`pull_request` carries a contributor-controlled head and must never reach a job that can publish — the
workflow has no `pull_request` trigger at all, and the trust step rejects a non-push triggering run.

`workflow_dispatch` exists for controlled rollout and recovery. It does **not** bypass anything: the
dispatched SHA goes through the identical freshness and CI checks.

## Provenance

A direct CLI upload does not populate Netlify's `commit_ref` the way a native Git build does, so the
artifact carries its own identity at `dist/deploy-meta.json`:

```json
{
  "repository": "dilmart-info/Dilmart",
  "git_sha": "<exact commit>",
  "github_run_id": "<run id>",
  "github_run_attempt": "<attempt>"
}
```

Non-secret by construction — repository, commit and run identifiers only. No tokens, no environment
values, no user identity, no PII. `https://store.DilMart.org/deploy-meta.json` is the independent proof of
which commit is actually live, and the workflow verifies it after publishing rather than assuming the
upload worked.

The Netlify CLI version is pinned, and the deploy uploads the already-built `dist` **without** `--build`,
so **the artifact GitHub verified is the artifact that gets uploaded**. Passing `--build` would make the
CLI produce a second artifact that no CI ever checked.

There is no build opt-out flag on the pinned CLI — not building is simply the default. An earlier version
of this pipeline passed an invented one, and the CLI aborted the publish before contacting Netlify; the
guard now checks the publish flags against what that exact version accepts rather than checking that a
particular string is present.

## Rollout order — mandatory

Do these in order. Step 1 is not optional.

1. **Stop Netlify site builds.** Netlify → _Site configuration → Build & deploy → Continuous deployment
   → Stop builds_.
2. **Verify `stop_builds` is `true`** independently, via the site API, not just the dashboard toast.
3. **Provision a dedicated `NETLIFY_AUTH_TOKEN`** repository secret — a CI-specific token, not a personal
   one copied from a developer machine.
4. **Set `NETLIFY_PRODUCTION_DEPLOY_ENABLED` to exactly `true`** (repository variable).
5. **Manually dispatch** the workflow for the exact safe `main` SHA and confirm the live marker.

Step 1 exists because the Netlify Git connection may recover — by repair, by a GitHub App reinstall, or
on its own. If it does while this pipeline is enabled, a future push would auto-publish **outside** the CI
gate, and two independent publishers would be live at once. Stopping builds first means the gate cannot be
bypassed by a connection coming back.

Direct CLI and API deployments still work while builds are stopped, which is what makes the emergency path
below possible.

Until step 4, the workflow runs and records its decision but **cannot** build or publish: the kill switch
defaults to off by being absent.

## No manual fallback

Routine publishing must no longer use drag-and-drop, a local `netlify deploy --prod`, or ad-hoc API
uploads. Those are what produced commit-less deploys that cannot be audited.

An emergency manual deployment remains possible but requires explicit authorisation, and the commit and
reason must be recorded. Historical evidence of previous manual deploys is kept, not deleted, and the
local Netlify CLI installation is left in place.

## The guard is part of the gating CI

`npm run test:ci-guards` runs inside **Launch Critical CI** as a normal required step — not
`continue-on-error`. A guard that is not part of the CI authorising Production does not protect it. The
guard also asserts that `ci.yml` still invokes it, so removing the step fails the very workflow that
gates a deployment.

## Rollback

Netlify's own "publish deploy" on a previous deploy is the fastest path. To roll forward again, dispatch
the workflow at the desired SHA — which re-runs the full gate, so a rollback cannot accidentally publish
something unverified.
