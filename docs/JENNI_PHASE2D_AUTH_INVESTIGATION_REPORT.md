# Jenni Authentication Investigation & Observability Report

> **Security Note**: Sensitive credential values were redacted. Use environment variables from secure deployment dashboards instead.

> **Date**: 2026-06-18  
> **Status**: Completed  
> **Active Branch**: `feat/jenni-auth-observability`

---

## 1. Safety Gates & Lockdown Status (Confirmations)

We have verified that the safety gates are fully locked down in the repository's configuration (`.env`):

| Safety Variable                  | Local Value | Production (Render Target) | Status     |
| -------------------------------- | ----------- | -------------------------- | ---------- |
| `JENNI_ALLOW_STORE_PROVISIONING` | `false`     | `false`                    | ✅ BLOCKED |
| `JENNI_DIAGNOSTICS_ENABLED`      | `false`     | `false`                    | ✅ BLOCKED |
| `JENNI_ALLOW_SHIPMENT_DISPATCH`  | `false`     | `false`                    | ✅ BLOCKED |

> [!IMPORTANT]
> **No further provisioning attempts, dry-runs, or manual API calls will be executed** until the authentication role scope is verified and updated by Jenni Logistics support.

---

## 2. Environment Variables Verification

The following Render and local environment variables exist and are configured as non-empty:

- **`JENNI_API_BASE_URL`**: configured (e.g., `https://jenni.alzaeemexp.com/api`).
- **`JENNI_SYSTEM_CODE`**: configured (e.g., `DilMart_STORE`).
- **`JENNI_USERNAME`**: configured (contains phone/merchant username — see env).
- **`JENNI_PASSWORD`**: configured.

No actual values or credentials are exposed in this report or in any logs.

---

## 3. JenniAuthService Logic & Behavior Analysis

### 3.1 Authentication Workflow

- **Token Acquisition Endpoint**: `POST /v2/auth/login` (body payload: `{ username, password }`).
- **Token Cache Mechanism**:
  - The JWT access token is stored in-memory as a `CachedToken` object (`{ accessToken, refreshToken, expiresAtMs }`).
  - Cache lifespan is determined by `expires_in` / `expiresIn` returned by the provider (defaulting to 3600 seconds/1 hour if unspecified).
  - Before making any request, the service checks: `this.cache && this.cache.expiresAtMs > now + 30_000`.
- **Expiration and Auto-Refresh**:
  - If a cached token is within 30 seconds of expiration (or already expired), the service attempts a refresh call via `POST /v2/auth/refresh`.
  - If refresh fails, the service falls back to a fresh login call via `POST /v2/auth/login`.

### 3.2 Key Behavior Finding (401 Handling & Cache Invalidation)

- **Problem**: **The client does not clear the token cache on an upstream `401 Unauthorized`**.
- **Impact**: If Jenni Logistics invalidates/revokes the token upstream (or if the token was issued but is rejected for a specific path like `/v2/stores/create`), the NestJS backend does not capture the `401` to force-clear `this.cache`. The application will keep reusing the invalid/unauthorized cached token for subsequent requests until it hits the local `expiresAtMs` time window (or the server is restarted).

---

## 4. Auth Observability Improvements (JenniAuthService Patch)

We implemented safe, structured logging inside `JenniAuthService` to allow clear diagnostic tracing on Render without exposing sensitive credentials or token contents:

### Code Snippet Added ([jenni-auth.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/jenni/jenni-auth.service.ts#L55-L108))

```typescript
  private async login(): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl()}/v2/auth/login`, {
        method: "POST",
        // ...
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        this.logger.error(`Jenni login success=false status=${response.status}`);
        throw new ServiceUnavailableException("Jenni authentication failed.");
      }

      const token = String(body.token ?? body.accessToken ?? body.access_token ?? "").trim();
      const tokenExists = !!token;
      const tokenLen = token.length;

      if (!token) {
        this.logger.error(`Jenni login success=true | token exists=false`);
        throw new ServiceUnavailableException("Jenni authentication returned no token.");
      }

      // ...
      this.logger.log(
        `Jenni login success=true | token exists=${tokenExists} | token length=${tokenLen} | expires_in=${expiresInSec}`
      );
      // ...
```

This ensures that during deployment and testing, the log streams will report:

- `Jenni login success=true | token exists=true | token length=771 | expires_in=3600` (or similar)
- `Jenni login success=false status=401`
- `Jenni token refresh success=false status=401`
  No secrets or tokens are outputted.

---

## 5. Support Clarifications for Jenni Logistics

To resolve the authorization issue, please send the following list of inquiries to Jenni Logistics Support:

1. **Store Creation Authorization**:
   > _"Is our API account credentials (username: `JENNI_USERNAME`) authorized to invoke `POST /v2/stores/create`?"_
2. **Account Permissions / Role Segregation**:
   > _"Do store management APIs require a different role/scope or separate aggregator account than shipment dispatch APIs? If yes, what credentials should we configure?"_
3. **Endpoint Access**:
   > _"Is `POST /v2/stores/create` fully enabled for our account under the base URL `https://jenni.alzaeemexp.com/api`?"_
4. **JWT Verification**:
   > _"Does the JWT returned by `POST /v2/auth/login` for `JENNI_USERNAME` contain permissions/scope to create stores, or is it restricted to shipment tracking/creation only?"_
5. **System Code Validation**:
   > _"Is our `system_code` (`DilMart_STORE`) registered and allowed for store creation operations? Does the system validate it against our merchant structure?"_

---

## 6. Local Test Suite Status

All NestJS backend tests were run locally to ensure compile-time and run-time correctness of the added logs:

- **`npm run build`**: ✅ Succeeded.
- **`npm run test:jenni-provisioning`**: ✅ 24/24 tests passed.
- **`npm run test:jenni-admin`**: ✅ 20/20 tests passed.
- **`npm run test:hardening`**: ✅ 39/39 tests passed.
