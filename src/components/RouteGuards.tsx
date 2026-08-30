/**
 * Compatibility re-exports. Prefer importing from
 * `@/components/guards/RequireAuthenticatedUser` or
 * `@/components/guards/BackofficeRouteGuards` so mobile never pulls backoffice.
 */
export { RequireAuthenticatedUser } from "@/components/guards/RequireAuthenticatedUser";
export {
  RequirePlatformAdmin,
  RequireMerchantUser,
  RequireAgent,
} from "@/components/guards/BackofficeRouteGuards";
