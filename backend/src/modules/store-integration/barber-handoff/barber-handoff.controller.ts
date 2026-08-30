/**
 * Barber Handoff endpoints.
 *
 *   POST /integrations/DilMart/barber/handoff/prepare   (internal; signed assertion)
 *   POST /integrations/DilMart/barber/handoff/redeem    (public; one-time code, web-only)
 *
 * The B2B web-session consumer (GET/POST .../barber/web-session...) lives in the SEPARATE
 * BarberWebSessionController — see that file's doc comment for why the split is deliberate
 * (a shared class prefix here previously caused a live route-path mismatch with the frontend).
 *
 * No `@Roles(...)` metadata — security is the signed assertion (prepare) and the one-time code
 * (redeem), never a Supabase session. All failures render the safe structured error body.
 */
import { Body, Controller, Headers, HttpCode, HttpException, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { randomUUID } from "crypto";
import { BarberHandoffService } from "./barber-handoff.service";
import { BarberHandoffError } from "./barber-handoff.errors";
import { PrepareBarberHandoffDto, RedeemBarberHandoffDto } from "./barber-handoff.dto";
import { BarberHandoffConfig } from "./barber-handoff.config";
import { resolveClientIp } from "../customer-handoff/customer-handoff-rate-limiter";
import { buildBarberWebSessionCookie } from "./barber-web-cookie";

@Controller("integrations/DilMart/barber/handoff")
export class BarberHandoffController {
  constructor(
    private readonly service: BarberHandoffService,
    private readonly config: BarberHandoffConfig,
  ) {}

  @Post("prepare")
  @HttpCode(HttpStatus.OK)
  async prepare(@Headers("authorization") authorization: string | undefined, @Body() body: PrepareBarberHandoffDto) {
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
    @Body() body: RedeemBarberHandoffDto,
    @Req() req: { ip?: string; socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) res: { setHeader: (n: string, v: string) => void },
  ) {
    const requestId = randomUUID();
    try {
      const ip = resolveClientIp(req, this.config.trustedProxyHops);
      const { result, sessionToken, sessionTtlSeconds } = await this.service.redeem(body ?? {}, ip, requestId);
      // The authenticated response's Set-Cookie carries the session — never cache it.
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Set-Cookie", buildBarberWebSessionCookie(sessionToken, sessionTtlSeconds));
      // Session token itself is cookie-only — the JSON body never carries it.
      return result;
    } catch (err) {
      throw this.toHttp(err, requestId);
    }
  }

  private toHttp(err: unknown, requestId: string): HttpException {
    if (err instanceof BarberHandoffError) {
      return new HttpException(err.toBody(requestId), err.httpStatus);
    }
    return new HttpException(
      { code: "STORE_UNAVAILABLE", message: "Store is temporarily unavailable.", requestId, retryable: true },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
