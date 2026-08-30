# PATCH_LIFECYCLE.md — DilMart-Store

## Standard Patch Lifecycle

1. Intake
   - Understand request.
   - Classify task A/B/C/D/E.

2. Diagnosis
   - Inspect relevant files.
   - Identify current behavior and root cause.

3. Plan
   - Minimal safe change.
   - Risk areas.
   - Validation plan.

4. Implementation
   - Small patch.
   - No unrelated refactor.

5. Validation
   - Build/test/guard/lint/manual QA as appropriate.

6. Report
   - Implementation report.
   - Known limitations.
   - Verdict.

7. Closure Review
   - QA reviewer or ChatGPT supervisor reviews report.
   - If FAIL, create follow-up patch with exact scope.

## Patch Size Rule

If a task touches more than 8 files or 2 domains, split it unless the user explicitly requested a full phase patch.
