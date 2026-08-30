## M15 Hosting Cold-Start Note

- Current deployment docs reference Render (`docs/RENDER_DEPLOYMENT.md`).
- If backend is on Render Free/sleeping instances, first-hit latency is expected and remains a production blocker even with app-level caching.
- Recommended fix: move backend API to always-on paid instance (Render paid plan or VPS/container host with no sleep).
- Temporary mitigation only: external health-check ping (`/api/health`) every few minutes to reduce cold starts.
- This ping is not a final solution and should be removed once always-on hosting is in place.

