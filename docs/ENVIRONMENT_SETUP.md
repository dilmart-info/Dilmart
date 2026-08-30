# Environment Setup

**Last updated:** 2026-05-12

This document is the single source of truth for every environment variable consumed by the frontend and backend. See `render.yaml` for how variables are declared in the Render blueprint.

---

## Security rules

- **Never commit real secret values.** Use `.env` / `.env.production` locally; they are gitignored.
- **Never hardcode secrets in `render.yaml`.** All secret-valued keys must use `sync: false` so Render prompts for them in the dashboard.
- The `VITE_SUPABASE_PUBLISHABLE_KEY` (Supabase anon key) is safe to expose to browsers. Everything else in these tables is a secret.

---

## Frontend environment variables

Consumed at **Vite build time** via `import.meta.env`. Must be set in the Render frontend service before building.

| Variable                        | Required | Description                                                                                        |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | **Yes**  | Full Supabase project URL, e.g. `https://<ref>.supabase.co`                                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **Yes**  | Supabase anon (publishable) key — safe to expose to browsers                                       |
| `VITE_SUPABASE_PROJECT_ID`      | **Yes**  | Supabase project ref (short ID), e.g. `ztplxqlthuqkuktbznbo`                                       |
| `VITE_STORE_API_BASE_URL`       | **Yes**  | Backend API base URL including `/api`, e.g. `https://DilMart-store-backend.onrender.com/api`       |
| `VITE_ENABLE_LOCAL_FALLBACKS`   | No       | Set to `"true"` to enable local mock data fallbacks. Default: `false`. Never enable in production. |

### Local frontend development

Copy the example and fill in your project values:

```bash
cp .env .env.local          # .env.local is gitignored
# or create .env.local with the 5 VITE_ vars above
```

For local development `VITE_STORE_API_BASE_URL` is typically `http://localhost:4000/api`.

---

## Backend environment variables

Consumed at **runtime** via `process.env` / NestJS `ConfigService`. Must be set in the Render backend service before starting.

### Required

| Variable                    | Description                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_URL`              | Full Supabase project URL, identical to `VITE_SUPABASE_URL`                                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role JWT — **never expose to browsers or commit**. Grants full DB access, bypasses RLS.                                                                                      |
| `FRONTEND_ORIGINS`          | Comma-separated list of allowed CORS origins, e.g. `https://DilMart-store-frontend.onrender.com,https://your-domain.com`. Falls back to `http://localhost:8080` if unset (dev only). |

### Optional — server

| Variable     | Default | Description                                                                                  |
| ------------ | ------- | -------------------------------------------------------------------------------------------- |
| `PORT`       | `4000`  | HTTP port the server listens on. Render sets this automatically.                             |
| `BODY_LIMIT` | `12mb`  | Max JSON body size. Raised from Express default to accommodate base64 product image uploads. |

### Optional — outbound alert webhooks

Set these to enable order-event webhook and email notifications. Leave blank to disable the channel.

| Variable                             | Default         | Description                                 |
| ------------------------------------ | --------------- | ------------------------------------------- |
| `OUTBOUND_ALERT_WEBHOOK_URL`         | _(blank)_       | Webhook endpoint URL for order event alerts |
| `OUTBOUND_ALERT_EMAIL_WEBHOOK_URL`   | _(blank)_       | Email webhook endpoint URL                  |
| `OUTBOUND_ALERT_CHANNEL_ORDER`       | `webhook,email` | Delivery order of alert channels            |
| `OUTBOUND_ALERT_WEBHOOK_MAX_RETRIES` | `2`             | Max retry attempts per webhook call (0–5)   |

### Optional — replay / deduplication

| Variable                                     | Default | Description                                                   |
| -------------------------------------------- | ------- | ------------------------------------------------------------- |
| `OUTBOUND_REPLAY_WINDOW_MINUTES`             | `60`    | Sliding window for replay deduplication (5–1440 min)          |
| `OUTBOUND_REPLAY_MAX_ATTEMPTS_PER_WINDOW`    | `5`     | Max outbound attempts allowed within the replay window (1–50) |
| `OUTBOUND_REPLAY_SIGNATURE_COOLDOWN_MINUTES` | `15`    | Minimum gap between retries with the same signature (≥1 min)  |

### Local backend development

```bash
cp backend/.env.example backend/.env
# Then fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_ORIGINS
```

---

## `.gitignore` coverage

The following files are gitignored and must never be committed:

```
.env
.env.local
.env.*.local
.env.production
backend/.env.production
backend/.env          # covered by the root .env pattern
```

`backend/.env.example` is committed — it contains only placeholder values, no real secrets.

---

## Render deployment order

1. Deploy **backend** first.
2. Copy the backend service URL (`https://DilMart-store-backend.onrender.com`).
3. Set `VITE_STORE_API_BASE_URL` on the **frontend** service to `<backend-url>/api`.
4. Set `FRONTEND_ORIGINS` on the **backend** service to the frontend URL.
5. Deploy **frontend**.

Full step-by-step instructions: [`docs/RENDER_DEPLOYMENT.md`](./RENDER_DEPLOYMENT.md).

---

## Variable cross-reference

| Render service | Variable                  | Counterpart                |
| -------------- | ------------------------- | -------------------------- |
| Frontend       | `VITE_SUPABASE_URL`       | == Backend `SUPABASE_URL`  |
| Frontend       | `VITE_STORE_API_BASE_URL` | == `<backend-url>/api`     |
| Backend        | `FRONTEND_ORIGINS`        | == Frontend service URL(s) |
