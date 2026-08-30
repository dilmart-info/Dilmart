# Render Deployment Guide

This project is deployed on Render using `render.yaml` with:

- backend web service (`backend/`)
- frontend static site (`/`)

## 1) Create services from blueprint

1. Push latest code to GitHub.
2. In Render dashboard: **New +** -> **Blueprint**.
3. Select this repository.
4. Render will detect `render.yaml` and create:
   - `DilMart-store-backend`
   - `DilMart-store-frontend`

## 2) Required environment variables

### Backend (`DilMart-store-backend`)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGINS`

`FRONTEND_ORIGINS` can contain one or multiple origins (comma-separated), for example:

`https://DilMart-store-frontend.onrender.com,https://your-custom-domain.com`

### Frontend (`DilMart-store-frontend`)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_STORE_API_BASE_URL`

Set `VITE_STORE_API_BASE_URL` to your backend URL + `/api`, for example:

`https://DilMart-store-backend.onrender.com/api`

## 3) Redeploy order

After setting env vars:

1. Deploy backend first.
2. Copy backend URL and set `VITE_STORE_API_BASE_URL` in frontend.
3. Deploy frontend.

## 4) Validation checklist

- Backend health returns 200:
  - `https://<backend-domain>/api/health`
- Frontend loads without CORS errors.
- Catalog endpoints load:
  - `/api/catalog/categories`
  - `/api/merchants/storefront-default`
