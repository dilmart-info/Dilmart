import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppActorRole, ROLES_KEY } from "./roles.decorator";
import { AuthSource, AUTH_SOURCES_KEY, DEFAULT_AUTH_SOURCES } from "./auth-source";
import { ActorRequest } from "./actor-context.decorator";
import { SupabaseActorResolverService } from "./supabase-actor-resolver.service";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly supabaseResolver: SupabaseActorResolverService,
  ) {}

  /** Wipe every trusted actor field so no stale/pre-populated value can survive on a reused request. */
  private resetActorContext(req: ActorRequest): void {
    req.actorRole = undefined;
    req.actorId = undefined;
    req.actorEmail = undefined;
    req.actorPhone = undefined;
    req.authSource = undefined;
    req.actorToken = undefined;
  }

  private requestId(headers: Record<string, string | string[] | undefined>): string {
    const raw = headers["x-request-id"] ?? headers["x-correlation-id"];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return String(v ?? "").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 128) || "-";
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AppActorRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<
      ActorRequest & { headers: Record<string, string | string[] | undefined>; originalUrl?: string; url?: string }
    >();

    this.resetActorContext(request);

    const rawAuthHeader = request.headers.authorization;
    const authHeader = (Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader)?.toString().trim();
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    const url = String(request.originalUrl ?? request.url ?? "");
    const isAuthContext = url.includes("/auth/context");

    if (!token) {
      if (requiredRoles.length === 1 && requiredRoles[0] === "authenticated") {
        if (isAuthContext) throw new UnauthorizedException("Missing bearer token for auth context.");
        return true;
      }
      throw new ForbiddenException("Missing bearer token for protected endpoint.");
    }

    const result = await this.supabaseResolver.resolve(token);
    if (!result.ok) {
      const reqId = this.requestId(request.headers);
      switch (result.reason) {
        case "project_ref_mismatch":
          this.logger.warn(`[authz] supabase project-ref mismatch reqId=${reqId} code=${result.diagnosticCode ?? "-"}`);
          throw new ForbiddenException({ code: "AUTH_CONFIG_ERROR", message: "Authentication configuration error." });
        case "backend_unavailable":
          this.logger.error(`[authz] supabase backend unavailable reqId=${reqId} code=${result.diagnosticCode ?? "-"}`);
          throw new ForbiddenException({ code: "AUTH_TEMPORARILY_UNAVAILABLE", message: "Authentication is temporarily unavailable." });
        case "role_error":
          this.logger.warn(`[authz] supabase role resolution failed reqId=${reqId}`);
          throw new ForbiddenException({ code: "AUTH_ROLE_RESOLUTION_FAILED", message: "Authorization resolution failed." });
        case "invalid_token":
        default:
          if (isAuthContext) throw new UnauthorizedException("Invalid or expired bearer token.");
          throw new ForbiddenException("Invalid or expired bearer token.");
      }
    }

    request.actorRole = result.actorRole;
    request.actorId = result.actorId;
    request.actorEmail = result.actorEmail;
    request.actorPhone = result.actorPhone;
    request.authSource = "supabase";
    request.actorToken = result.actorToken;

    if (requiredRoles.includes("authenticated")) {
      return true;
    }
    if (!request.actorRole || !requiredRoles.includes(request.actorRole)) {
      throw new ForbiddenException("Insufficient role for this endpoint.");
    }

    return true;
  }
}

