import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JenniSyncService } from "./jenni-sync.service";
import { assertJenniWebhookBearerToken } from "./jenni-webhook.util";
import type { JenniWebhookBody } from "./jenni.types";

/** Shared Jenni webhook ingress — used by /api/v2/... controller and /v2/... Express alias. */
@Injectable()
export class JenniWebhookIngressService {
  constructor(
    private readonly sync: JenniSyncService,
    private readonly config: ConfigService,
  ) {}

  async receiveStatusUpdate(body: JenniWebhookBody, authorization?: string | string[]) {
    assertJenniWebhookBearerToken(authorization, this.config.get("JENNI_WEBHOOK_TOKEN"));
    return this.sync.processWebhook(body);
  }
}
