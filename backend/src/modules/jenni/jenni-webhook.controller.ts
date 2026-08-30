import { Body, Controller, Headers, Post } from "@nestjs/common";
import { JenniWebhookIngressService } from "./jenni-webhook-ingress.service";
import type { JenniWebhookBody } from "./jenni.types";

/**
 * Jenni Receive In webhook receiver.
 * Public route (no platform JWT). Secured via Bearer JENNI_WEBHOOK_TOKEN + system_code validation.
 * Prefixed route: POST /api/v2/push/update-status
 * Alias (no /api): POST /v2/push/update-status — see registerJenniWebhookAliasRoute in main.ts
 */
@Controller("v2/push")
export class JenniWebhookController {
  constructor(private readonly ingress: JenniWebhookIngressService) {}

  @Post("update-status")
  receiveStatusUpdate(@Body() body: JenniWebhookBody, @Headers("authorization") authorization?: string) {
    return this.ingress.receiveStatusUpdate(body, authorization);
  }
}
