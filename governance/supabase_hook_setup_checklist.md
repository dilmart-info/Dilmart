# Supabase Send SMS Auth Hook Setup Checklist
**Target Project**: `DilMart-Store` (`ztplxqlthuqkuktbznbo`)  
**Purpose**: Step-by-step setup for delegating Supabase Phone OTP dispatches to the DilMart NestJS backend WhatsApp hook.

---

## 1. Overview
By default, Supabase sends SMS via Twilio or MessageBird. Configuring the **Send SMS Hook** delegates phone OTP dispatch directly to the DilMart backend over HTTPS:
- Endpoint: `https://dilmart-store-backend.onrender.com/api/auth/hooks/supabase/send-sms`
- Request Method: `POST`
- Security: Secret token + HMAC-SHA256 signature (`X-Supabase-Signature`)

---

## 2. Generate Hook Secret
Generate a cryptographically secure random string (minimum 32 bytes):
```bash
openssl rand -hex 32
```
Save this value securely:
- On Render Backend: set `SUPABASE_AUTH_HOOK_SECRET=<generated_secret>`.
- Keep for entry into the Supabase Dashboard.

---

## 3. Supabase Dashboard Configuration
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard/project/ztplxqlthuqkuktbznbo).
2. Navigate to **Authentication** -> **Hooks** (or **Providers** -> **Phone** -> **Custom SMS Provider / Webhook**).
3. Enable **Send SMS (SMS Auth)** hook.
4. Hook settings:
   - **Type**: `HTTP Webhook`
   - **URL**: `https://dilmart-store-backend.onrender.com/api/auth/hooks/supabase/send-sms`
   - **HTTP Method**: `POST`
   - **Secret**: `<generated_secret>` (matches `SUPABASE_AUTH_HOOK_SECRET`)
   - **Timeout**: `4000ms` (within Supabase hook deadline)
5. Save changes.

---

## 4. Verification & Health Check
1. Ensure the DilMart backend service is running and healthy:
   ```bash
   curl -I https://dilmart-store-backend.onrender.com/api/health
   ```
2. Send a probe request without signature to verify fail-closed security:
   ```bash
   curl -X POST https://dilmart-store-backend.onrender.com/api/auth/hooks/supabase/send-sms \
     -H "Content-Type: application/json" \
     -d '{"sms":{"otp":"123456"},"user":{"phone":"+9647701112233"}}'
   ```
   **Expected Response**: `401 Unauthorized` (`Signature missing`).
3. Send a test OTP from the frontend or via Supabase client:
   ```ts
   const { error } = await supabase.auth.signInWithOtp({
     phone: "+9647701112233",
   });
   ```
4. Verify backend NestJS logs:
   - `[AUTH_HOOK] Dispatching correlationId=... phone=+*********2233`
   - `[AUTH_HOOK] WhatsApp accepted ... providerAcceptedMessageId=wamid...`
