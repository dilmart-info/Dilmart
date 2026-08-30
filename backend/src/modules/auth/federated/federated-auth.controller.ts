/**
 * STORE-PR4/PR5 — Federated auth endpoints (spec §9.6, §14.3):
 *   POST /auth/federated/refresh      (rotating refresh — native body OR web HttpOnly cookie)
 *   POST /auth/federated/logout       (revoke current family)
 *   POST /auth/federated/logout-all   (revoke all federated families for the identity)
 *
 * No `@Roles(...)` metadata → the global RolesGuard passes these through (identity is the refresh token).
 * Token-bearing responses set Cache-Control: no-store. All failures render the safe §14.5 body.
 *
 * STORE-PR5 §Phase E — dual channel:
 *  - native: refresh token in the JSON body; response returns the rotated token in the body (unchanged).
 *  - web:    refresh token from the `__Host-DilMart_store_frt` HttpOnly cookie; response sets the rotated
 *            cookie and NEVER returns the raw token to JS. Cookie mode additionally requires an allowed
 *            Origin (CSRF). Supplying BOTH a body token and a cookie is rejected as ambiguous.
 */
import { Body, Controller, HttpCode, HttpException, HttpStatus, Ip, Post, Req, Res } from "@nestjs/common";
import { randomUUID } from "crypto";
import { FederatedAuthService } from "./federated-auth.service";
import { FederatedError } from "./federated-auth.errors";
import { LogoutDto, RefreshDto } from "./federated-auth.dto";
import {
  buildRefreshCookie,
  clearRefreshCookie,
  resolveFederatedTokenSource,
  FederatedTokenSource,
} from "./federated-cookie";

type ResWithHeaders = { setHeader: (name: string, value: string) => void };
type ReqWithHeaders = { headers?: Record<string, string | string[] | undefined> };

@Controller("auth/federated")
export class FederatedAuthController {
  constructor(private readonly service: FederatedAuthService) {}

  private noStore(res: ResWithHeaders): void {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }

  /** Reject the two channel-confusion cases BEFORE touching the session store, with safe §14.5 bodies. */
  private rejectBadSource(src: FederatedTokenSource, requestId: string): void {
    if (src.kind === "ambiguous") {
      throw new HttpException(
        { code: "FEDERATED_AUTH_AMBIGUOUS", message: "Provide the refresh token via a single channel.", requestId, retryable: false },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (src.kind === "forbidden_origin") {
      throw new HttpException(
        { code: "FORBIDDEN_ORIGIN", message: "Origin not permitted.", requestId, retryable: false },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: RefreshDto,
    @Ip() ip: string,
    @Req() req: ReqWithHeaders,
    @Res({ passthrough: true }) res: ResWithHeaders,
  ) {
    const requestId = randomUUID();
    const src = resolveFederatedTokenSource(req.headers, body ?? {});
    this.rejectBadSource(src, requestId);

    const token = src.kind === "web" || src.kind === "native" ? src.token : undefined;
    try {
      const result = await this.service.refresh({ refreshToken: token, device: body?.device }, ip, requestId);
      this.noStore(res);
      if (src.kind === "web") {
        // Rotate the cookie; strip the raw token from the JS-visible body.
        res.setHeader("Set-Cookie", buildRefreshCookie(result.session.refreshToken, result.session.refreshExpiresIn));
        return {
          session: {
            accessToken: result.session.accessToken,
            expiresIn: result.session.expiresIn,
            refreshExpiresIn: result.session.refreshExpiresIn,
          },
        };
      }
      return result;
    } catch (err) {
      const httpErr = this.toHttp(err, requestId);
      // Web: a DEFINITIVE rejection (invalid/expired/reuse → 401) clears the cookie; a transient
      // 503 (disabled/unavailable) does NOT, so a valid session survives a network/backend blip.
      if (src.kind === "web" && err instanceof FederatedError && err.httpStatus === HttpStatus.UNAUTHORIZED) {
        res.setHeader("Set-Cookie", clearRefreshCookie());
      }
      throw httpErr;
    }
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: LogoutDto, @Req() req: ReqWithHeaders, @Res({ passthrough: true }) res: ResWithHeaders) {
    const requestId = randomUUID();
    const src = resolveFederatedTokenSource(req.headers, body ?? {});
    this.rejectBadSource(src, requestId);
    const token = src.kind === "web" || src.kind === "native" ? src.token : undefined;
    try {
      const result = await this.service.logout({ refreshToken: token }, requestId);
      this.noStore(res);
      if (src.kind === "web") res.setHeader("Set-Cookie", clearRefreshCookie());
      return result;
    } catch (err) {
      if (src.kind === "web") res.setHeader("Set-Cookie", clearRefreshCookie());
      throw this.toHttp(err, requestId);
    }
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Body() body: LogoutDto, @Req() req: ReqWithHeaders, @Res({ passthrough: true }) res: ResWithHeaders) {
    const requestId = randomUUID();
    const src = resolveFederatedTokenSource(req.headers, body ?? {});
    this.rejectBadSource(src, requestId);
    const token = src.kind === "web" || src.kind === "native" ? src.token : undefined;
    try {
      const result = await this.service.logoutAll({ refreshToken: token }, requestId);
      this.noStore(res);
      if (src.kind === "web") res.setHeader("Set-Cookie", clearRefreshCookie());
      return result;
    } catch (err) {
      if (src.kind === "web") res.setHeader("Set-Cookie", clearRefreshCookie());
      throw this.toHttp(err, requestId);
    }
  }

  private toHttp(err: unknown, requestId: string): HttpException {
    if (err instanceof HttpException) return err;
    if (err instanceof FederatedError) return new HttpException(err.toBody(requestId), err.httpStatus);
    return new HttpException(
      { code: "STORE_UNAVAILABLE", message: "Store is temporarily unavailable.", requestId, retryable: true },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
