/**
 * Capacitor utilities for native app detection and external link handling.
 * Used when running inside Capacitor WebView (iOS/Android).
 */

import { Capacitor } from "@capacitor/core";

export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * Opens a URL externally (system browser or app) when in native context.
 * Falls back to window.open in web.
 */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Schemes that must always open externally (tel, mailto, maps, etc.) */
const EXTERNAL_SCHEMES = ["tel:", "mailto:", "whatsapp:", "tg:", "geo:"];

/** Hosts that should open externally (social, payments, maps) */
const EXTERNAL_HOSTS = [
  "wa.me",
  "api.whatsapp.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "maps.google",
  "goo.gl",
  "t.me",
];

export function shouldOpenExternally(href: string): boolean {
  if (!href || href.startsWith("/") || href.startsWith("#")) return false;
  const lower = href.toLowerCase();
  if (EXTERNAL_SCHEMES.some((s) => lower.startsWith(s))) return true;
  try {
    const u = new URL(href, window.location.origin);
    if (EXTERNAL_HOSTS.some((h) => u.hostname.includes(h))) return true;
    if (u.protocol === "http:" || u.protocol === "https:") {
      const origin = window.location.origin;
      return u.origin !== origin && !u.hostname.endsWith("localhost");
    }
    return false;
  } catch {
    return false;
  }
}
