import { AppActorRole } from "../../common/authz/roles.decorator";

export type AuditEventType =
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "AGENT_CREATED"
  | "AGENT_REVOKED"
  | "PROFILE_UPDATED"
  | "MERCHANT_ACTION"
  | "ADMIN_ACTION"
  | "LOYALTY_SETTINGS_UPDATED"
  | "NOTIFICATION_READ"
  | "GOVERNANCE_TASK_UPDATED"
  | "POLICY_ASSIGNMENT_UPDATED"
  | "JENNI_STORE_PROVISIONED"
  | "JENNI_STORE_LINKED_MANUALLY"
  | "JENNI_MERCHANT_PROVISIONED"
  /** A user proved ownership of a phone through Supabase Auth and we mirrored the result. */
  | "PHONE_IDENTITY_LINKED";
  // Note: "MERCHANT_COMMERCIAL_AGREEMENT_SCHEDULED" is written directly by
  // admin_schedule_merchant_commercial_agreement (SQL), not via AuditService.log(), so it is
  // intentionally not a member of this application-level union — see the migration for why.

export type AuditActor = {
  actorId: string;
  actorRole: AppActorRole;
};

export type AuditResource = {
  type: string;
  id: string;
};

export type AuditLogInput = {
  eventType: AuditEventType;
  actor: AuditActor;
  merchantId?: string | null;
  resource: AuditResource;
  payload?: Record<string, unknown>;
};
