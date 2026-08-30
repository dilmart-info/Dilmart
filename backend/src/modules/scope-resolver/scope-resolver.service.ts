import { ForbiddenException, Injectable } from "@nestjs/common";
import { AppActorRole } from "../../common/authz/roles.decorator";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

export type ScopeKind = "self" | "merchant" | "platform";

type ResolvedActor = {
  actorId: string;
  actorRole: AppActorRole;
};

type MerchantMembership = {
  merchant_id: string;
  role: "owner" | "manager" | "staff";
};

const merchantMembershipRank: Record<MerchantMembership["role"], number> = {
  owner: 3,
  manager: 2,
  staff: 1,
};

@Injectable()
export class ScopeResolverService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private assertActor(actor?: ActorContext): ResolvedActor {
    if (!actor?.actorId || !actor?.actorRole) {
      throw new ForbiddenException("Actor context is required.");
    }
    return {
      actorId: actor.actorId,
      actorRole: actor.actorRole,
    };
  }

  private isPlatformRole(role: AppActorRole): boolean {
    return role === "super_admin" || role === "admin";
  }

  private isMerchantRole(role: AppActorRole): boolean {
    return role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff";
  }

  assertPlatformAccess(actor?: ActorContext): void {
    const resolved = this.assertActor(actor);
    if (!this.isPlatformRole(resolved.actorRole)) {
      throw new ForbiddenException("Platform scope is not allowed for this actor.");
    }
  }

  assertSelfAccess(actor: ActorContext | undefined, targetUserId: string): void {
    const resolved = this.assertActor(actor);
    if (resolved.actorId !== targetUserId) {
      throw new ForbiddenException("Self scope is not allowed for this actor.");
    }
  }

  async assertMerchantAccess(actor: ActorContext | undefined, targetMerchantId?: string): Promise<string> {
    const resolved = this.assertActor(actor);

    if (this.isPlatformRole(resolved.actorRole)) {
      if (!targetMerchantId) {
        throw new ForbiddenException("Merchant id is required for platform-scoped merchant access.");
      }
      return targetMerchantId;
    }

    if (!this.isMerchantRole(resolved.actorRole)) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }

    const query = this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id, role")
      .eq("user_id", resolved.actorId);

    const filtered = targetMerchantId ? query.eq("merchant_id", targetMerchantId) : query;
    const { data, error } = await filtered;

    if (error) throw error;

    const memberships = ((data ?? []) as MerchantMembership[]).filter((m) => !!m.merchant_id);
    if (memberships.length === 0) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }

    if (targetMerchantId) {
      return targetMerchantId;
    }

    const topMembership = memberships.sort((a, b) => merchantMembershipRank[b.role] - merchantMembershipRank[a.role])[0];
    return topMembership.merchant_id;
  }

  async resolveMerchantScope(
    requestedMerchantId: string | undefined,
    actorRole?: string,
    actorId?: string,
  ): Promise<string | undefined> {
    if (actorRole === "super_admin" || actorRole === "admin") {
      return requestedMerchantId;
    }
    if (actorRole !== "merchant_owner" && actorRole !== "merchant_manager" && actorRole !== "merchant_staff") {
      throw new ForbiddenException("Merchant scope resolution is not permitted for this role.");
    }
    if (!actorId) {
      throw new ForbiddenException("Missing actor identity for merchant scope.");
    }

    let req = this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id")
      .eq("user_id", actorId);

    if (requestedMerchantId) {
      req = req.eq("merchant_id", requestedMerchantId);
    }

    const { data, error } = await req.limit(1).maybeSingle();
    if (error) throw error;
    if (!data?.merchant_id) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }

    return data.merchant_id as string;
  }
}
