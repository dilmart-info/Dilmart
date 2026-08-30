/**
 * STORE-PR6 — the ONE app-wired handoff controller, shared by the native coordinator and the web /open page
 * so their dedup/single-flight state is unified. Establishment is delegated to the PR5 session owner.
 */
import { establishFederatedSessionFromRedeem } from "@/lib/auth/auth-session-manager";
import { StoreHandoffController } from "./store-handoff-controller";
import { resolveRedeemDevice } from "./store-device";
import { validateTarget } from "./store-target";

let instance: StoreHandoffController | null = null;

export function getStoreHandoffController(): StoreHandoffController {
  if (!instance) {
    instance = new StoreHandoffController({
      establishSession: (result) => establishFederatedSessionFromRedeem(result),
      getDevice: () => resolveRedeemDevice(),
      validateTargetFn: validateTarget,
    });
  }
  return instance;
}

/** Test seam. */
export function __resetStoreHandoffControllerForTests(): void {
  instance = null;
}
