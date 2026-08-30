/**
 * Merchant-scoped PWA + Web Push helpers.
 * Service worker is registered only under /merchant/ and never caches APIs.
 */

const SW_PATH = "/sw.js";
const MERCHANT_SW_SCOPE = "/merchant/";
const SOUND_PREF_KEY = "DilMart_merchant_order_sound_enabled";
const DEVICE_ID_KEY = "DilMart_merchant_push_device_id";
const MANIFEST_HREF = "/merchant/manifest.webmanifest";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isMerchantPath(pathname = window.location.pathname): boolean {
  return pathname === "/merchant" || pathname.startsWith("/merchant/");
}

export function getOrCreateMerchantDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function isMerchantSoundEnabledLocally(): boolean {
  return localStorage.getItem(SOUND_PREF_KEY) === "true";
}

export function setMerchantSoundEnabledLocally(enabled: boolean) {
  localStorage.setItem(SOUND_PREF_KEY, enabled ? "true" : "false");
}

/** Attach merchant manifest/meta only on merchant routes. */
export function ensureMerchantManifestLinks() {
  if (typeof document === "undefined" || !isMerchantPath()) return;

  let manifest = document.querySelector('link[rel="manifest"][data-merchant-pwa="1"]') as HTMLLinkElement | null;
  if (!manifest) {
    manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.dataset.merchantPwa = "1";
    document.head.appendChild(manifest);
  }
  manifest.href = MANIFEST_HREF;

  let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"][data-merchant-pwa="1"]') as HTMLMetaElement | null;
  if (!appleTitle) {
    appleTitle = document.createElement("meta");
    appleTitle.name = "apple-mobile-web-app-title";
    appleTitle.dataset.merchantPwa = "1";
    document.head.appendChild(appleTitle);
  }
  appleTitle.content = "لوحة التاجر";
}

/** Remove merchant-only tags when leaving merchant routes. */
export function clearMerchantManifestLinks() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-merchant-pwa='1']").forEach((el) => el.remove());
}

/**
 * Unregister legacy root-scoped merchant SW, then register merchant-scoped SW.
 */
export async function registerMerchantServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (!isMerchantPath()) {
    return null;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistrations();
    for (const reg of existing) {
      const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || "";
      const isMerchantSw = scriptUrl.endsWith("/sw.js") || scriptUrl.includes("/sw.js");
      const isRootScoped = reg.scope === `${window.location.origin}/` || reg.scope.endsWith(`${window.location.host}/`);
      if (isMerchantSw && isRootScoped) {
        await reg.unregister();
      }
    }

    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: MERCHANT_SW_SCOPE,
    });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.warn("Service worker registration failed", err);
    return null;
  }
}

export async function initMerchantPwa() {
  if (!isMerchantPath()) {
    clearMerchantManifestLinks();
    return null;
  }
  ensureMerchantManifestLinks();
  return registerMerchantServiceWorker();
}

export async function subscribeMerchantPush(input: {
  vapidPublicKey: string;
  merchantId: string;
  register: (body: {
    merchant_id: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    device_label?: string;
    user_agent?: string;
  }) => Promise<unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  if (!("Notification" in window) || !("PushManager" in window)) {
    return { ok: false, error: "المتصفح لا يدعم إشعارات الويب" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "لم يتم منح إذن الإشعارات" };
  }

  const registration = await registerMerchantServiceWorker();
  if (!registration) {
    return { ok: false, error: "تعذر تسجيل Service Worker" };
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(input.vapidPublicKey),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, error: "بيانات الاشتراك غير مكتملة" };
  }

  await input.register({
    merchant_id: input.merchantId,
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    device_label: getOrCreateMerchantDeviceId(),
    user_agent: navigator.userAgent,
  });

  return { ok: true };
}

export function getPwaInstallInstructions(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  if (isIos) {
    return "على آيفون: افتح الصفحة في Safari ثم اضغط مشاركة ← إضافة إلى الشاشة الرئيسية.";
  }
  return "على أندرويد أو الكمبيوتر: من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».";
}
