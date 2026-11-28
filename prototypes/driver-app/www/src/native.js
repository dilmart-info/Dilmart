const runtime = () => globalThis.Capacitor;

export function onDevice() {
  const bridge = runtime();
  return Boolean(bridge && typeof bridge.isNativePlatform === "function" && bridge.isNativePlatform());
}

function plugin(name) {
  const bridge = runtime();
  if (!bridge) return null;
  if (typeof bridge.registerPlugin === "function") return bridge.registerPlugin(name);
  if (typeof bridge.nativePromise !== "function") return null;
  return new Proxy({}, {
    get(_target, method) {
      if (method === "then") return undefined;
      if (method === "addListener") {
        return (eventName, listener) => Promise.resolve(bridge.addListener(name, eventName, listener));
      }
      return (options) => bridge.nativePromise(name, String(method), options || {});
    },
  });
}

export function snapshot(state) {
  return {
    storeVersion: 1,
    scenario: state.scenario,
    screen: state.screen,
    theme: state.theme,
    offline: state.offline,
    device: state.device,
    location: state.location,
    camera: state.camera,
    shift: state.shift,
    stage: state.stage,
    offer: state.offer,
    parcels: state.parcels,
    merchant: state.merchant,
    area: state.area,
    customer: state.customer,
    sealedCustomer: state.sealedCustomer,
    codExpected: state.codExpected,
    sealedCod: state.sealedCod,
    codActual: state.codActual,
    held: state.held,
    pendingRemit: state.pendingRemit,
    earnings: state.earnings,
    receipt: state.receipt,
    sync: state.sync,
    pickup: state.pickup,
    hub: state.hub,
    delivery: state.delivery,
    returnTask: state.returnTask,
    awaiting: state.awaiting,
    history: state.history,
    draftPhone: state.draftPhone,
    nav: state.nav,
    position: state.position || null,
    scanNote: state.scanNote || "",
  };
}

export async function readStore() {
  const store = plugin("DriverDev");
  if (!store) return null;
  const loaded = await store.loadState();
  if (!loaded || loaded.payload == null) return null;
  return JSON.parse(loaded.payload);
}

export async function writeStore(state) {
  const store = plugin("DriverDev");
  if (!store) return;
  await store.saveState({ payload: JSON.stringify(snapshot(state)) });
}

export async function clearStore() {
  const store = plugin("DriverDev");
  if (!store) return;
  await store.clearDev();
}

export async function rememberActor(actor) {
  const secure = plugin("SecureStorage");
  if (!secure) return null;
  const prefixedKey = "dilmart.driver.dev.actor";
  const existing = await secure.internalGetItem({ prefixedKey });
  if (existing && existing.data) return existing.data;
  await secure.internalSetItem({ prefixedKey, data: actor });
  const saved = await secure.internalGetItem({ prefixedKey });
  return saved && saved.data ? saved.data : null;
}

export function scanBarcode() {
  const scanner = plugin("BarcodeScanner");
  if (!scanner) return Promise.resolve({ code: "", reason: "unavailable" });
  return scanner.requestPermissions().then((permission) => {
    const camera = permission.camera || permission.CAMERA;
    if (camera && camera !== "granted" && camera !== "limited") return { code: "", reason: "denied" };
    return new Promise((resolve) => {
      let settled = false;
      const cancel = document.createElement("button");
      const finish = (result) => {
        if (settled) return;
        settled = true;
        cancel.remove();
        document.documentElement.classList.remove("barcode-scanner-active");
        document.body.classList.remove("barcode-scanner-active");
        scanner.stopScan().catch(() => {}).then(() => resolve(result));
      };
      scanner.addListener("barcodeScanned", (event) => {
        const row = event && event.barcode;
        const code = row ? String(row.rawValue || row.displayValue || "") : "";
        finish(code ? { code, reason: "ok" } : { code: "", reason: "canceled" });
      }).catch(() => finish({ code: "", reason: "unavailable" }));
      cancel.type = "button";
      cancel.className = "scan-cancel";
      cancel.textContent = "إلغاء المسح";
      cancel.addEventListener("click", () => finish({ code: "", reason: "canceled" }));
      document.documentElement.classList.add("barcode-scanner-active");
      document.body.classList.add("barcode-scanner-active");
      document.body.appendChild(cancel);
      scanner.startScan().catch((error) => {
        const message = String(error && error.message ? error.message : error || "");
        finish({ code: "", reason: /cancel/i.test(message) ? "canceled" : "unavailable" });
      });
    });
  }).catch(() => ({ code: "", reason: "unavailable" }));
}

export async function recordBarcode(code) {
  const store = plugin("DriverDev");
  if (!store) return { result: "recorded" };
  return store.recordScan({ barcode: code });
}

export async function enqueueLocal(item) {
  const store = plugin("DriverDev");
  if (!store) return;
  await store.enqueue(item);
}

export async function currentFix() {
  const location = plugin("Geolocation");
  if (!location) return { status: "unavailable" };
  try {
    const permission = await location.requestPermissions();
    const granted = permission.location === "granted" || permission.coarseLocation === "granted";
    if (!granted) return { status: "denied" };
    const reading = await location.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
    const coords = reading && reading.coords;
    if (!coords || typeof coords.latitude !== "number" || typeof coords.longitude !== "number") return { status: "unavailable" };
    return { status: "ok", position: { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy || null } };
  } catch (error) {
    const message = String(error && error.message ? error.message : "");
    if (/denied|permission/i.test(message)) return { status: "denied" };
    return { status: "unavailable" };
  }
}

export async function watchNetwork(onChange) {
  const network = plugin("Network");
  if (!network) return;
  const status = await network.getStatus();
  onChange(Boolean(status.connected));
  await network.addListener("networkStatusChange", (next) => onChange(Boolean(next.connected)));
}

export async function postTaskNotice() {
  const notes = plugin("LocalNotifications");
  if (!notes) return { posted: false };
  const permission = await notes.requestPermissions();
  if (!permission || permission.display !== "granted") return { posted: false, reason: "denied" };
  if (typeof notes.createChannel === "function") {
    await notes.createChannel({ id: "driver-dev", name: "مهام التطوير", importance: 4 });
  }
  await notes.schedule({
    notifications: [{
      id: 2048,
      title: "عرض مهمة تجريبي",
      body: "DM-TASK-2048",
      channelId: "driver-dev",
      schedule: { at: new Date(Date.now() + 800), allowWhileIdle: false },
      extra: { screen: "UI-02" },
    }],
  });
  return { posted: true };
}

export function listenForNotice(onOpen) {
  const notes = plugin("LocalNotifications");
  if (!notes || typeof notes.addListener !== "function") return;
  notes.addListener("localNotificationActionPerformed", () => onOpen());
}

export async function openDeviceSettings() {
  const store = plugin("DriverDev");
  if (!store) return false;
  await store.openSettings();
  return true;
}
