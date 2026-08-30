import { Body, Controller, Patch } from "@nestjs/common";
import { ActorContext, CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { AuthSources } from "../../common/authz/auth-source";
import { UpdateMyProfileDto } from "./profiles.dto";
import { ProfilesService } from "./profiles.service";

@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Patch("me")
  @Roles("authenticated")
  @AuthSources("supabase", "DilMart_federated") // STORE-PR5 §14: DUAL_CUSTOMER (own profile).
  updateMe(@CurrentActor() actor: ActorContext, @Body() payload: UpdateMyProfileDto) {
    return this.profilesService.updateMyProfile(actor, payload);
  }
}
