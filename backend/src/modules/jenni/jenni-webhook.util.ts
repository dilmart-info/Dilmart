import { UnauthorizedException } from "@nestjs/common";

/** Reject missing or invalid Bearer token when JENNI_WEBHOOK_TOKEN is configured. */
export function assertJenniWebhookBearerToken(
  authorization: string | string[] | undefined,
  expectedToken: string | null | undefined,
): void {
  const expected = String(expectedToken ?? "").trim();
  if (!expected) return;

  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = String(raw ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token || token !== expected) {
    throw new UnauthorizedException("Invalid Jenni webhook token.");
  }
}

/** Reject missing or mismatched system_code when JENNI_SYSTEM_CODE is configured. */
export function assertJenniWebhookSystemCode(
  body: { system_code?: string | null },
  expectedCode: string | null | undefined,
): void {
  const expected = String(expectedCode ?? "").trim();
  if (!expected) return;
  if (body.system_code !== expected) {
    throw new UnauthorizedException("Invalid Jenni system_code.");
  }
}
