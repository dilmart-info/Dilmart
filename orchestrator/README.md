# DilMart-Store Mini-Orchestrator

Lightweight workflow for AI development tasks.

Recommended flow:

```bash
node orchestrator/scripts/new-task.mjs "Secure checkout identity and loyalty points"
node orchestrator/scripts/run-checks.mjs
node orchestrator/scripts/summarize-for-chatgpt.mjs
```

Folders:

```txt
orchestrator/tasks/       Task specs for Cursor/Antigravity
orchestrator/reports/     Implementation/QA reports
orchestrator/screenshots/ UI proof images
orchestrator/templates/   Task/report templates
orchestrator/scripts/     Helper scripts
```

Always keep final reports concise and pasteable into ChatGPT supervisor review.
