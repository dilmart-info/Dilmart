import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { AuditLogInput } from "./audit.types";

const MAX_PAYLOAD_BYTES = 8 * 1024;

function sanitizePayload(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!payload) return {};

  const forbiddenKeys = new Set(["token", "access_token", "refresh_token", "authorization", "password", "secret", "api_key"]);
  const sanitizedEntries = Object.entries(payload).filter(([key]) => !forbiddenKeys.has(key.toLowerCase()));
  const sanitized = Object.fromEntries(sanitizedEntries);
  const serialized = JSON.stringify(sanitized);

  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    return { truncated: true, message: "Payload exceeded audit size limit." };
  }

  return sanitized;
}

@Injectable()
export class AuditService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async log(input: AuditLogInput): Promise<void> {
    const payload = sanitizePayload(input.payload);

    const { error } = await this.supabaseAdmin.client.from("audit_logs").insert({
      event_type: input.eventType,
      actor_id: input.actor.actorId,
      actor_role: input.actor.actorRole,
      merchant_id: input.merchantId ?? null,
      resource_type: input.resource.type,
      resource_id: input.resource.id,
      payload,
    });

    if (error) throw error;
  }
}
