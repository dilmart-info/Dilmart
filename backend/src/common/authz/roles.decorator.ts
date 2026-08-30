import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

export type AppActorRole =
  | "authenticated"
  | "super_admin"
  | "admin"
  | "merchant_applicant"
  | "merchant_owner"
  | "merchant_manager"
  | "merchant_staff"
  | "agent"
  | "customer";

export const Roles = (...roles: AppActorRole[]) => SetMetadata(ROLES_KEY, roles);
