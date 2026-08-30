/**
 * STORE-PR5 §Phase F — unified session barrel.
 *
 * The public facade stays the existing `authSessionManager` singleton (source-neutral). These modules are
 * its federated internals, exported for tests and for the STORE-PR6 deep-link integration point.
 */
export * from "./app-session.types";
export { FederatedSessionStorage, FEDERATED_NATIVE_STORAGE_KEY, DEVICE_ID_KEY } from "./federated-session-storage";
export { FederatedSessionApi } from "./federated-session-api";
export { FederatedSessionAdapter, FEDERATED_REFRESH_THRESHOLD_MS } from "./federated-session-adapter";
export { authSessionManager, establishFederatedSessionFromRedeem } from "../auth-session-manager";
