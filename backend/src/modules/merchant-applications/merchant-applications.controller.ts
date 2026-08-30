import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { MerchantApplicationsService } from "./merchant-applications.service";
import { RegisterMerchantApplicationDto, RejectMerchantApplicationDto } from "./merchant-applications.dto";

@Controller("merchant-applications")
export class MerchantApplicationsController {
  constructor(private readonly merchantApplicationsService: MerchantApplicationsService) {}

  @Post("register")
  register(@Body() payload: RegisterMerchantApplicationDto) {
    return this.merchantApplicationsService.registerApplication(payload);
  }

  @Get("me/status")
  @Roles("authenticated")
  getMyStatus(@CurrentActor() actor?: { actorId?: string }) {
    return this.merchantApplicationsService.getMyApplicationStatus(actor?.actorId);
  }
}

@Controller("admin/merchants")
export class AdminMerchantApplicationsController {
  constructor(private readonly merchantApplicationsService: MerchantApplicationsService) {}

  @Post(":id/approve")
  @Roles("super_admin", "admin")
  approve(@Param("id") id: string, @CurrentActor() actor?: { actorId?: string }) {
    return this.merchantApplicationsService.approveMerchant(id, actor?.actorId);
  }

  @Post(":id/reject")
  @Roles("super_admin", "admin")
  reject(@Param("id") id: string, @Body() payload: RejectMerchantApplicationDto, @CurrentActor() actor?: { actorId?: string }) {
    return this.merchantApplicationsService.rejectMerchant(id, payload.reason, actor?.actorId);
  }
}
