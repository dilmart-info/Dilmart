import { Injectable } from "@nestjs/common";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { UpdateMyProfileDto } from "./profiles.dto";

@Injectable()
export class ProfilesService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  async updateMyProfile(actor: ActorContext, payload: UpdateMyProfileDto) {
    const actorId = actor.actorId ?? "";
    this.scopeResolver.assertSelfAccess(actor, actorId);

    const { data, error } = await this.supabaseAdmin.client
      .from("profiles")
      .update({
        full_name: payload.full_name ?? null,
        phone: payload.phone ?? null,
        address: payload.address ?? null,
      })
      .eq("id", actorId)
      .select("id, role, full_name, email, phone, address, points")
      .single();

    if (error) throw error;
    return data;
  }
}
