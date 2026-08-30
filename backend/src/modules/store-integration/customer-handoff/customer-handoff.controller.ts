/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff endpoints.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §8.5 (prepare), §8.7 (redeem), §14.5.
 *
 *   POST /integrations/DilMart/customer/handoff/prepare   (internal; signed assertion)
 *   POST /integrations/DilMart/customer/handoff/redeem    (native/public; one-time code)
 *
 * These handlers carry NO `@Roles(...)` metadata, so the global RolesGuard passes them
 * through exactly like the Barber `session/exchange` endpoint — security is the signed
 * assertion (prepare), the one-time code + flags (redeem), never a Supabase session.
 * All failures render the safe §14.5 structured error body.
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { CustomerHandoffService } from "./customer-handoff.service";
import { CustomerHandoffConfig } from "./customer-handoff.config";
import { HandoffError } from "./customer-handoff.errors";
import { PrepareHandoffDto, RedeemHandoffDto } from "./customer-handoff.dto";
import { resolveClientIp } from "./customer-handoff-rate-limiter";
import { buildRefreshCookie } from "../../auth/federated/federated-cookie";

@Controller("integrations/DilMart/customer/handoff")
export class CustomerHandoffController {
  constructor(
    private readonly service: CustomerHandoffService,
    private readonly config: CustomerHandoffConfig,
  ) {}

  @Post("prepare")
  @HttpCode(HttpStatus.OK)
  async prepare(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: PrepareHandoffDto,
  ) {
    const requestId = randomUUID();
    try {
      return await this.service.prepare(authorization, body?.state, requestId);
    } catch (err) {
      throw this.toHttp(err, requestId);
    }
  }

  @Post("redeem")
  @HttpCode(HttpStatus.OK)
  async redeem(
    @Body() body: RedeemHandoffDto,
    @Req() req: { ip?: string; socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) res: { setHeader: (n: string, v: string) => void },
  ) {
    const requestId = randomUUID();
    try {
      // Explicit, deployment-aware trusted-proxy hop count (B6). Never trusts a spoofable XFF chain.
      const ip = resolveClientIp(req, this.config.trustedProxyHops);
      const result = await this.service.redeem(body ?? {}, ip, requestId);
      // The authenticated response carries tokens (STORE-PR4 issuer) — never cache it.
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      // STORE-PR5 §Phase E — a WEB redeem also plants the rotating refresh token in the __Host- HttpOnly
      // cookie (Max-Age = committed DB lifetime). The response body still carries refreshToken (master
      // §8.8 contract, unchanged); the web client discards that field and relies on the cookie. Native
      // platforms get no cookie and persist the body token in OS-encrypted secure storage.
      const isWeb = typeof body?.device?.platform === "string" && body.device.platform.toLowerCase() === "web";
      if (isWeb && result && (result as { status?: string }).status === "authenticated") {
        const session = (result as { session?: { refreshToken?: string; refreshExpiresIn?: number } }).session;
        if (session?.refreshToken && typeof session.refreshExpiresIn === "number") {
          res.setHeader("Set-Cookie", buildRefreshCookie(session.refreshToken, session.refreshExpiresIn));
        }
      }
      return result;
    } catch (err) {
      throw this.toHttp(err, requestId);
    }
  }

  /** Renders a HandoffError to the safe §14.5 body; anything else → generic STORE_UNAVAILABLE. */
  private toHttp(err: unknown, requestId: string): HttpException {
    if (err instanceof HandoffError) {
      return new HttpException(err.toBody(requestId), err.httpStatus);
    }
    return new HttpException(
      { code: "STORE_UNAVAILABLE", message: "Store is temporarily unavailable.", requestId, retryable: true },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
