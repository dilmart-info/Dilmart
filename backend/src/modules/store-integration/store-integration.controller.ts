import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { IsNotEmpty, IsString } from "class-validator";
import { StoreIntegrationService } from "./store-integration.service";

class ExchangeSessionDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/**
 * Store Integration Controller
 *
 * Handles incoming requests from DilMart Main Backend.
 * This endpoint is NOT public — it should only be called by DilMart Main Backend
 * using a signed integration token. No Supabase auth required here;
 * security is provided by the HMAC-SHA256 token signature.
 *
 * Route prefix: /integrations/DilMart
 */
@Controller("integrations/DilMart")
export class StoreIntegrationController {
  constructor(private readonly storeIntegrationService: StoreIntegrationService) {}

  /**
   * POST /integrations/DilMart/session/exchange
   *
   * Exchanges a DilMart Main-signed integration token for a Store session.
   * Called by DilMart Main Backend (not directly by Barber App frontend).
   *
   * Request body: { token: "SIGNED_JWT" }
   * Response: { storeSessionToken, expiresIn, profile }
   */
  @Post("session/exchange")
  @HttpCode(HttpStatus.OK)
  async exchangeSession(@Body() body: ExchangeSessionDto) {
    // class-validator ensures body.token is a non-empty string (via @IsString + @IsNotEmpty)
    // No manual check needed — NestJS ValidationPipe returns 400 automatically if missing.
    return this.storeIntegrationService.exchangeSession(body.token.trim());
  }
}
