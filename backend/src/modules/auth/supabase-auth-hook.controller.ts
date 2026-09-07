/**
 * Supabase Auth hook endpoint.
 *
 * Public by design — Supabase calls it server-to-server with no bearer token. It is not
 * unauthenticated: every request must carry a valid Standard Webhooks signature over the
 * raw body, and an unsigned or replayed call is rejected before anything is sent.
 */
import { Body, Controller, Header, Headers, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  SupabaseAuthHookService,
  type SupabaseSmsHookHeaders,
  type SupabaseSmsHookPayload,
} from "./supabase-auth-hook.service";

@Controller("auth/hooks/supabase")
export class SupabaseAuthHookController {
  constructor(private readonly hookService: SupabaseAuthHookService) {}

  /**
   * 200 with an empty JSON body on success. Supabase's HTTP auth hook contract expects a 200
   * with Content-Type: application/json; returning {} satisfies GoTrue's HTTP hook parser while
   * guaranteeing the code, the provider message id and the phone can never travel back out of this service.
   *
   * The global IP throttle is skipped here on purpose. Supabase calls this endpoint from a
   * small set of shared egress addresses, so an IP limit would treat every customer in the
   * country as a single caller and start refusing genuine OTPs once traffic grew. The IP
   * is Supabase's, not the user's, and must not be used as an identity.
   *
   * What protects the route instead:
   *   - Standard Webhooks signature over the raw body, rejecting anything unsigned
   *   - the signed timestamp window, rejecting stale requests
   *   - the delivery deduplication cache, so a retry never sends twice
   *   - a per-recipient send limit applied after the signature is verified
   *   - the capacity guard, which refuses new work rather than dropping in-flight work
   *   - Supabase's own upstream OTP issuance limits
   */
  // No @Roles decorator: RolesGuard passes any route that declares none, which is how the
  // other unauthenticated auth endpoints are already modelled. Authentication for this
  // route is the Standard Webhooks signature, not a bearer token.
  @Post("send-sms")
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Header("Content-Type", "application/json")
  async sendSms(
    @Req() request: { rawBody?: string },
    @Headers() headers: SupabaseSmsHookHeaders,
    @Body() payload: SupabaseSmsHookPayload,
  ): Promise<Record<string, never>> {
    await this.hookService.handleSendSms({
      rawBody: request?.rawBody,
      headers,
      payload,
    });
    return {};
  }
}
