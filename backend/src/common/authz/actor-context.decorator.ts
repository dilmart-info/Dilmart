import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AppActorRole } from "./roles.decorator";
import { AuthSource } from "./auth-source";

/**
 * Unified backend actor context. Populated by RolesGuard from Supabase Bearer token.
 * `actorId` is ALWAYS the Store profiles/customer UUID.
 */
export type ActorContext = {
  actorRole?: AppActorRole;
  actorId?: string;
  actorEmail?: string | null;
  actorPhone?: string | null;
  authSource?: AuthSource;
  actorToken?: string;
};

/** Request shape written by RolesGuard and read back by the CurrentActor param decorator. */
export type ActorRequest = {
  actorRole?: AppActorRole;
  actorId?: string;
  actorEmail?: string | null;
  actorPhone?: string | null;
  authSource?: AuthSource;
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
    actorToken: request.actorToken,
  };
});

