/**
 * Barber B2B web-session consumer endpoints.
 *
 *   GET  /integrations/DilMart/barber/web-session          (public; __Host-DilMart_store_bwt cookie)
 *   POST /integrations/DilMart/barber/web-session/logout    (public; __Host-DilMart_store_bwt cookie)
 *
 * DELIBERATELY a separate controller from BarberHandoffController (which owns
 * /integrations/DilMart/barber/handoff/{prepare,redeem}) — a shared class prefix previously caused
 * these two routes to register at .../handoff/web-session instead of .../barber/web-session,
 * a live P1 contract mismatch between this backend and the frontend client. Registering the path
 * here, at the controller level, makes the mismatch impossible to reintroduce by editing the
 * sibling controller's `@Controller(...)` prefix.
 *
 * No `@Roles(...)` metadata — security is the B2B session cookie + Origin allowlist, never a
 * Supabase session. All failures render the safe structured error body.
 */
import { Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Post, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { randomUUID } from "crypto";
import { BarberHandoffService } from "./barber-handoff.service";
import { BarberHandoffError } from "./barber-handoff.errors";
import { clearBarberWebSessionCookie } from "./barber-web-cookie";

type IncomingHeaders = Record<string, string | string[] | undefined>;

@Controller("integrations/DilMart/barber")
export class BarberWebSessionController {
  constructor(private readonly service: BarberHandoffService) {}

  @Get("web-session")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async webSession(@Headers() headers: IncomingHeaders, @Res({ passthrough: true }) res: { setHeader: (n: string, v: string) => void }) {
    const requestId = randomUUID();
    try {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      return await this.service.checkWebSession(headers);
    } catch (err) {
      throw this.toHttp(err, requestId);
    }
  }

  @Post("web-session/logout")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async webSessionLogout(@Headers() headers: IncomingHeaders, @Res({ passthrough: true }) res: { setHeader: (n: string, v: string) => void }) {
    const requestId = randomUUID();
    try {
      const result = await this.service.logoutWebSession(headers);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Set-Cookie", clearBarberWebSessionCookie());
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
