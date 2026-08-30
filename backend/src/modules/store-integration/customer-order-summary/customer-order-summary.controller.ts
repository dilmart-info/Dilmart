/**
 * STORE-PR6A — Customer Order Summary endpoint (spec §33.2, §33.6).
 *
 *   POST /integrations/DilMart/customer/order-summary   (internal; Main→Store; signed Order Summary assertion)
 *
 * No `@Roles(...)` — like the Barber `session/exchange` and the Customer Handoff endpoints, the global RolesGuard
 * passes it through; security is the dedicated signed assertion, NEVER a Supabase/Store customer session. The
 * global ThrottlerGuard still applies. Request body is NONE; identity is the verified assertion `sub`. All
 * failures render the safe §14.5 structured error body. The raw assertion is never logged.
 */
import { Controller, Headers, HttpCode, HttpException, HttpStatus, Post, Res } from "@nestjs/common";
import { randomUUID } from "crypto";
import { CustomerOrderSummaryService } from "./customer-order-summary.service";
import { OrderSummaryError } from "./customer-order-summary.errors";

@Controller("integrations/DilMart/customer/order-summary")
export class CustomerOrderSummaryController {
  constructor(private readonly service: CustomerOrderSummaryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async orderSummary(
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: true }) res: { setHeader: (n: string, v: string) => void },
  ) {
    const requestId = randomUUID();
    try {
      const result = await this.service.getOrderSummary(authorization);
      // Order data is a live read — never cache it.
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      return result;
    } catch (err) {
      throw this.toHttp(err, requestId);
    }
  }

  /** Renders an OrderSummaryError to the safe §14.5 body; anything else → generic STORE_UNAVAILABLE. */
  private toHttp(err: unknown, requestId: string): HttpException {
    if (err instanceof OrderSummaryError) {
      return new HttpException(err.toBody(requestId), err.httpStatus);
    }
    return new HttpException(
      { code: "STORE_UNAVAILABLE", message: "Store is temporarily unavailable.", requestId, retryable: true },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
