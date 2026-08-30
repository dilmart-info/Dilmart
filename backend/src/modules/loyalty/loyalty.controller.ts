import { Body, Controller, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { LoyaltyService } from "./loyalty.service";
import { LoyaltyPreviewDto, LoyaltyRedeemDto } from "./loyalty.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { AuthSources } from "../../common/authz/auth-source";
import { ActorContext, CurrentActor } from "../../common/authz/actor-context.decorator";

/**
 * STORE-PR5 §Phase D — federated loyalty eligibility rule (Store-owned, explicit).
 *
 * Loyalty preview/redeem are DUAL_CUSTOMER. A caller is eligible ONLY through the identity the guard
 * verified — `actor.actorId`, the Store customer/profile UUID. Concretely:
 *   1. A VALID session is required (guard). A revoked/compromised/expired federated family never
 *      reaches this controller — the verifier fails it to 401 first. Supabase actors are verified
 *      the same way against their session.
 *   2. Points are read and written scoped to `actor.actorId` against the Store `profiles` row — the
 *      authoritative Store balance. There is no separate "assurance" trust in a client-supplied phone.
 *   3. Ownership is structural: the balance is keyed by the verified id, so Customer A can never
 *      preview or redeem Customer B's points, and a `userId` in the body is NEVER consulted.
 * We do NOT require a Store password or a Supabase phone-change flow for a federated customer.
 */
@Controller("loyalty")
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Post("preview")
  @HttpCode(200)
  @Roles("authenticated")
  @AuthSources("supabase", "DilMart_federated") // STORE-PR5 §14: DUAL_CUSTOMER (own loyalty).
  preview(@Body() payload: LoyaltyPreviewDto, @CurrentActor() actor: ActorContext) {
    if (!actor.actorId) {
      throw new UnauthorizedException("Authentication required for loyalty operations.");
    }
    return this.loyaltyService.preview(actor.actorId, payload.subtotal);
  }

  @Post("redeem")
  @Roles("authenticated")
  @AuthSources("supabase", "DilMart_federated") // STORE-PR5 §14: DUAL_CUSTOMER (own loyalty).
  redeem(@Body() payload: LoyaltyRedeemDto, @CurrentActor() actor: ActorContext) {
    if (!actor.actorId) {
      throw new UnauthorizedException("Authentication required for loyalty operations.");
    }
    return this.loyaltyService.redeem(actor.actorId, payload.points);
  }
}
