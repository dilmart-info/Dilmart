# Meta WhatsApp Business Setup Checklist for DilMart
**Target Project**: `DilMart-Store`  
**Purpose**: Official step-by-step procedure for provisioning and connecting the official DilMart Meta WhatsApp Business Account (WABA) and authentication message templates.

---

## Pre-Requisites & Required Assets
- Official DilMart Meta Business Manager account with Verified Business status.
- Dedicated Iraqi mobile or landline number not currently registered on personal WhatsApp or WhatsApp Business App.
- Display name: `DilMart` or `ديلمارت` (matching official commercial registration or trademark).
- Category: `Shopping & Retail` / `E-Commerce`.

---

## Phase 1: WABA & Phone Registration
1. In [Meta Business Manager](https://business.facebook.com/), navigate to **WhatsApp Accounts** -> **Add**.
2. Select **Create or connect a WhatsApp Business Account**.
3. Create or select a WABA named `DilMart Store WABA`.
4. Add the dedicated Iraqi phone number (`+964 7...`).
5. Choose verification method (SMS or voice call) and verify ownership with the 6-digit code.
6. Verify that the number status shows **Connected** and Certificate status is **Verified**.
7. Note down the **Phone Number ID** (e.g. `102938475610293`).
8. Note down the **WhatsApp Business Account ID** (WABA ID).

---

## Phase 2: System User & Permanent Token Generation
> [!CAUTION]
> Never use temporary 24-hour developer access tokens in production or backend deployment configs.

1. Navigate to **Business Settings** -> **Users** -> **System Users**.
2. Create a System User:
   - Name: `dilmart-otp-service`
   - Role: `Admin` (or `Employee` with WABA permissions).
3. Assign Assets:
   - Under **WhatsApp Accounts**, select `DilMart Store WABA`.
   - Grant permission: **Full Control** (or **Manage WhatsApp Business Account** and **Send Messages**).
4. Generate Token:
   - Click **Generate New Token**.
   - Select expiration: **Never** (Permanent).
   - Select permissions:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
5. Securely store the token in the password vault / Render Environment Secrets. Do NOT commit to Git.

---

## Phase 3: Authentication Template Creation & Approval
> [!IMPORTANT]
> Meta requires dedicated Authentication templates for OTP codes. Standard marketing or utility templates will be rejected or mispriced.

1. In WhatsApp Manager, go to **Account Tools** -> **Message Templates**.
2. Click **Create Template**:
   - Category: **Authentication**
   - Name: `dilmart_auth_otp` (lowercase, alphanumeric, underscores only)
   - Language: **Arabic** (`ar`)
3. Template Type selection:
   - Choose **Copy Code** (`AUTH_COPY_CODE`) or **One-Tap Autofill** (`AUTH_ONE_TAP`).
4. Content Configuration:
   - Body:
     ```text
     رمز التحقق الخاص بك في ديلمارت هو: {{1}}
     لا تشارك هذا الرمز مع أي شخص لحماية حسابك.
     ```
   - Button:
     - Button Type: **Copy Code**
     - Button Text: `نسخ الرمز`
   - Expiration / Security Recommendation:
     - Add code expiration warning (e.g. `صالح لمدة 5 دقائق`).
5. Submit for Review:
   - Meta automated review typically approves Authentication templates within 15 to 60 minutes.
   - Wait until template status changes to **Approved** (`APPROVED`).

---

## Phase 4: Recording Dynamic Template Metadata
Inspect the approved template in Meta Manager and record:
- `Template Name`: e.g. `dilmart_auth_otp`
- `Language Code`: `ar`
- `Template Type`: `AUTH_COPY_CODE`
- `Button Subtype`: `url` / `quick_reply` / `copy_code`

Configure in backend environment:
```env
OTP_WHATSAPP_TEMPLATE_NAME="dilmart_auth_otp"
OTP_WHATSAPP_TEMPLATE_TYPE="AUTH_COPY_CODE"
OTP_WHATSAPP_LANGUAGE_CODE="ar"
```

---

## Phase 5: Verification & Pre-Activation Smoke Test
1. Set `OTP_WHATSAPP_MODE=live` on a staging / internal backend instance.
2. Trigger an OTP request to an authorized internal test device.
3. Confirm message delivery in WhatsApp with official DilMart badge and "نسخ الرمز" action.
4. Verify HTTP 200 response and correct correlation ID logging in NestJS logs.
