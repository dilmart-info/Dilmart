/**
 * STORE-PR5 — Global RolesGuard, dual-source (spec §9.4/§9.5, §16).
 *
 * Order: required roles → allowed auth sources (default Supabase-only) → reset stale actor state →
 * no-token handling (unchanged Supabase contract) → classify token → resolve+verify with the ONE
 * matching verifier (no cross-fallback) → THEN enforce source policy → attach ActorContext → enforce role.
 *
 * Blocker 3: for a federated candidate the actor is cryptographically verified BEFORE `allowedSources`
 * is enforced, so a valid federated actor on a Supabase-only route returns 403, while a forged/invalid
 * federated-shaped token returns 401 (never a Supabase probe, never a source-based 403 for an unverified
 * claim).
 *
 * Blocker 4: the Supabase branch preserves the pre-PR5 status codes but returns ONLY generic messages;
 * infrastructure diagnostics (project ref, SUPABASE_URL, SERVICE_ROLE_KEY, DB probe text, Dashboard
 * guidance) are written to the server log with a request id, never to the API body. Federated error
 * bodies are `{ code, message }` with a stable code and generic message.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppActorRole, ROLES_KEY } from "./roles.decorator";
import { AuthSource, AUTH_SOURCES_KEY, DEFAULT_AUTH_SOURCES } from "./auth-source";
import { ActorRequest } from "./actor-context.decorator";
import { DualActorResolverService, FederatedResolveReason } from "./dual-actor-resolver.service";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly dualResolver: DualActorResolverService,
  ) {}

  /** B5: wipe every trusted actor field so no stale/pre-populated value can survive on a reused request. */
  private resetActorContext(req: ActorRequest): void {
    req.actorRole = undefined;
    req.actorId = undefined;
    req.actorEmail = undefined;
    req.actorPhone = undefined;
    req.authSource = undefined;
    req.actorToken = undefined;
    req.linkedProfileId = undefined;
    req.DilMartUserId = undefined;
    req.sessionFamilyId = undefined;
    req.sessionVersion = undefined;
  }

  /**
   * Sanitize a client-supplied request id for safe logging: allowlist [A-Za-z0-9._:-], max 128 chars.
   * This strips newlines, carriage returns, tabs, ANSI/control characters, and Unicode line separators
   * (log-injection defense) — none of which are in the allowlist.
   */
  private requestId(headers: Record<string, string | string[] | undefined>): string {
    const raw = headers["x-request-id"] ?? headers["x-correlation-id"];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return String(v ?? "").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 128) || "-";
  }

  /** Map a typed federated failure to a safe HTTP exception (distinct from the Supabase contract). */
  private federatedFailure(reason: FederatedResolveReason): never {
    switch (reason) {
      case "FEDERATED_DISABLED":
        throw new ServiceUnavailableException({
          code: "FEDERATED_AUTH_DISABLED",
          message: "Federated authentication is not available.",
        });
      case "FEDERATED_DEPENDENCY_UNAVAILABLE":
        throw new ServiceUnavailableException({
          code: "FEDERATED_AUTH_UNAVAILABLE",
          message: "Authentication is temporarily unavailable.",
        });
      case "FEDERATED_INTERNAL_ERROR":
        throw new InternalServerErrorException({
          code: "FEDERATED_INTERNAL_ERROR",
          message: "Unexpected authentication error.",
        });
      case "FEDERATED_EXPIRED_OR_REVOKED":
      case "FEDERATED_INVALID":
      default:
        throw new UnauthorizedException({ code: "FEDERATED_INVALID", message: "Invalid or expired token." });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AppActorRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    const allowedSources =
      this.reflector.getAllAndOverride<AuthSource[]>(AUTH_SOURCES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? ([...DEFAULT_AUTH_SOURCES] as AuthSource[]);

    const request = context.switchToHttp().getRequest<
      ActorRequest & { headers: Record<string, string | string[] | undefined>; originalUrl?: string; url?: string }
    >();

    // B5: clear any stale trusted actor state before making a trust decision.
    this.resetActorContext(request);

    const rawAuthHeader = request.headers.authorization;
    const authHeader = (Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader)?.toString().trim();
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    const url = String(request.originalUrl ?? request.url ?? "");
    const isAuthContext = url.includes("/auth/context");

    if (!token) {
      // Preserved Supabase contract: class-level @Roles("authenticated") is "optional bearer" (guest
      // handled per-handler), except /auth/context which must not synthesize a guest profile.
      if (requiredRoles.length === 1 && requiredRoles[0] === "authenticated") {
        if (isAuthContext) throw new UnauthorizedException("Missing bearer token for auth context.");
        return true;
      }
      throw new ForbiddenException("Missing bearer token for protected endpoint.");
    }

    const classification = this.dualResolver.classify(token);

    if (classification.kind === "federated_routing_dependency_unavailable") {
      // A federated marker was visible but the routing config was unavailable/malformed → safe 503.
      this.federatedFailure("FEDERATED_DEPENDENCY_UNAVAILABLE");
    }

    if (classification.kind === "ambiguous_or_invalid_federated") {
      // Fail closed as federated-invalid BEFORE any source check — never Supabase, never leak the route policy.
      throw new UnauthorizedException({ code: "FEDERATED_INVALID", message: "Invalid or expired token." });
    }

    if (classification.kind === "federated_candidate") {
      // B3: authenticate FIRST.
      const outcome = await this.dualResolver.resolveFederatedActor(token);
      if (!outcome.ok) this.federatedFailure(outcome.reason);
      // THEN authorize the (now verified) source.
      if (!allowedSources.includes("DilMart_federated")) {
        throw new ForbiddenException({
          code: "AUTH_SOURCE_NOT_PERMITTED",
          message: "Authentication source not permitted for this endpoint.",
        });
      }
      request.actorRole = outcome.actor.actorRole;
      request.actorId = outcome.actor.actorId;
      request.actorEmail = outcome.actor.actorEmail ?? null;
      request.actorPhone = outcome.actor.actorPhone ?? null;
      request.authSource = "DilMart_federated";
      request.linkedProfileId = outcome.actor.linkedProfileId;
      request.DilMartUserId = outcome.actor.DilMartUserId;
      request.sessionFamilyId = outcome.actor.sessionFamilyId;
      request.sessionVersion = outcome.actor.sessionVersion;
      // actorToken intentionally stays undefined for federated actors (invariant).
    } else {
      // supabase_candidate — preserve the historical Supabase status codes; sanitize the public body.
      if (!allowedSources.includes("supabase")) {
        throw new ForbiddenException({
          code: "AUTH_SOURCE_NOT_PERMITTED",
          message: "Authentication source not permitted for this endpoint.",
        });
      }
      const result = await this.dualResolver.resolveSupabaseActor(token);
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
      // federated identifiers intentionally stay undefined for Supabase actors (invariant).
    }

    if (requiredRoles.includes("authenticated")) {
      return true;
    }
    if (!request.actorRole || !requiredRoles.includes(request.actorRole)) {
      // Plain-string body preserved from the pre-PR5 guard (some regression tests assert this contract).
      throw new ForbiddenException("Insufficient role for this endpoint.");
    }

    return true;
  }
}
