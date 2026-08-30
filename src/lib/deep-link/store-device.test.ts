/**
 * STORE-PR6 §6 — device descriptor resolution: platform normalization, appVersion, and reuse of the ONE
 * PR5 device id (a read failure must not block the redeem).
 */
import { describe, expect, it, vi } from "vitest";
import { resolveRedeemDevice } from "./store-device";

describe("resolveRedeemDevice", () => {
  it("normalizes android/ios/web and passes appVersion + reused device id", async () => {
    const d = await resolveRedeemDevice({ getPlatform: () => "android", getAppVersion: async () => "2.0.1", getDeviceId: async () => "pr5-device-id" });
    expect(d).toEqual({ platform: "android", appVersion: "2.0.1", deviceId: "pr5-device-id" });
    expect((await resolveRedeemDevice({ getPlatform: () => "ios", getDeviceId: async () => "x" })).platform).toBe("ios");
    expect((await resolveRedeemDevice({ getPlatform: () => "web", getDeviceId: async () => "x" })).platform).toBe("web");
  });

  it("an unknown platform falls back to web", async () => {
    expect((await resolveRedeemDevice({ getPlatform: () => "electron", getDeviceId: async () => "x" })).platform).toBe("web");
  });

  it("a device-id read failure yields undefined deviceId (does NOT throw / block redeem)", async () => {
    const getDeviceId = vi.fn(async () => { throw new Error("secure storage locked"); });
    const d = await resolveRedeemDevice({ getPlatform: () => "web", getDeviceId });
    expect(d.deviceId).toBeUndefined();
    expect(d.platform).toBe("web");
  });
});
