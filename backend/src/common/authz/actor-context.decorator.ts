import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AppActorRole } from "./roles.decorator";
import { AuthSource } from "./auth-source";

/**
 * Unified backend actor context (spec §9.4). Populated by RolesGuard from either a Supabase Bearer
 * token or a DilMart federated Bearer token. `actorId` is ALWAYS the Store profiles/customer UUID,
 * regardless of source, so downstream ownership checks are source-agnostic.
 *
 * Invariants:
 *  - `actorToken` is the raw Supabase access token and exists ONLY for `authSource === "supabase"`.
 *    It MUST be undefined for federated actors (a federated access/refresh token is never attached here).
 *  - The federated identifiers (`linkedProfileId`, `DilMartUserId`, `sessionFamilyId`, `sessionVersion`)
 *    are populated only for federated actors and are internal — they must not appear in normal API
 *    responses (see /auth/context contract in §14).
 */
export type ActorContext = {
  actorRole?: AppActorRole;
  actorId?: string;
  actorEmail?: string | null;
  actorPhone?: string | null;

  /** Which identity provider resolved this actor. Undefined only on unauthenticated/optional routes. */
  authSource?: AuthSource;

  /** Federated-only (spec §9.2/§9.4). Undefined for Supabase actors. */
  linkedProfileId?: string;
  DilMartUserId?: string;
  sessionFamilyId?: string;
  sessionVersion?: number;

  /**
   * Supabase-only raw access token (used by services that call Supabase on the caller's behalf).
   * MUST be undefined for federated actors.
   */
  actorToken?: string;
};

/** Request shape written by RolesGuard and read back by the CurrentActor param decorator. */
export type ActorRequest = {
  actorRole?: AppActorRole;
  actorId?: string;
  actorEmail?: string | null;
  actorPhone?: string | null;
  authSource?: AuthSource;
  linkedProfileId?: string;
  DilMartUserId?: string;
  sessionFamilyId?: string;
  sessionVersion?: number;
  actorToken?: string;
};

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): ActorContext => {
  const request = ctx.switchToHttp().getRequest<ActorRequest>();
  return {
    actorRole: request.actorRole,
    actorId: request.actorId,
    actorEmail: request.actorEmail,
    actorPhone: request.actorPhone,
    authSource: request.authSource,
    linkedProfileId: request.linkedProfileId,
    DilMartUserId: request.DilMartUserId,
    sessionFamilyId: request.sessionFamilyId,
    sessionVersion: request.sessionVersion,
    actorToken: request.actorToken,
  };
});
