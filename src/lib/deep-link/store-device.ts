/**
 * STORE-PR6 §6 — resolve the redeem `device` descriptor. Platform is the real Capacitor platform
 * (android / ios / web). appVersion comes from Capacitor App.getInfo() on native. The device id is the ONE
 * PR5-owned app-scoped installation id (authSessionManager.getOrCreateDeviceId) — never a second id system.
 */
import { authSessionManager } from "@/lib/auth/auth-session-manager";
import type { HandoffPlatform, RedeemDevice } from "./store-deep-link.types";

export type StoreDeviceDeps = {
  getPlatform?: () => string;
  getAppVersion?: () => Promise<string | undefined>;
  getDeviceId?: () => Promise<string>;
};

async function defaultPlatform(): Promise<string> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

async function defaultAppVersion(): Promise<string | undefined> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return undefined;
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return info?.version;
  } catch {
    return undefined;
  }
}

function normalizePlatform(p: string): HandoffPlatform {
  return p === "android" ? "android" : p === "ios" ? "ios" : "web";
}

export async function resolveRedeemDevice(deps: StoreDeviceDeps = {}): Promise<RedeemDevice> {
  const rawPlatform = deps.getPlatform ? deps.getPlatform() : await defaultPlatform();
  const platform = normalizePlatform(rawPlatform);
  const appVersion = deps.getAppVersion ? await deps.getAppVersion() : await defaultAppVersion();
  let deviceId: string | undefined;
  try {
    deviceId = deps.getDeviceId ? await deps.getDeviceId() : await authSessionManager.getOrCreateDeviceId();
  } catch {
    deviceId = undefined; // a device-id read failure must not block the redeem attempt
  }
  return { platform, appVersion, deviceId };
}
