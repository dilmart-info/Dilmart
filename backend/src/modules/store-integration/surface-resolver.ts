import { StoreSurface, ViewerContext } from "./store-integration.types";

export function resolveMarketplaceSurface(
  surface: string | null | undefined,
): StoreSurface {
  switch (surface) {
    case "customer_app":
      return "customer_app";
    case "web_store":
    default:
      return "web_store";
  }
}

export function resolveViewerContext(surface?: string): ViewerContext {
  return {
    surface: resolveMarketplaceSurface(surface),
    isTrusted: false,
    requiresVerifiedSalonCheck: false,
  };
}

