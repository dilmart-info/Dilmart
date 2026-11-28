import { CODE, PHONE, createState } from "./fixtures.js";

function go(state, screen, extra = {}) {
  if (screen === state.screen) return { ...state, ...extra, error: "" };
  return { ...state, ...extra, error: "", history: state.history.concat(state.screen), screen };
}

function home(state) {
  if (state.shift !== "active") return "UI-12";
  return state.theme === "dark" ? "UI-54" : "UI-01";
}

function dialog(state, title, text) {
  return { ...state, dialog: { title, text } };
}

function nextParcel(state, status) {
  const parcels = state.parcels.map((item) => ({ ...item }));
  const target = parcels.find((item) => item.status === "expected");
  if (target) target.status = status;
  return parcels;
}

export function reduce(state, action) {
  switch (action.type) {
    case "reset":
      return createState(action.scenario || state.scenario);
    case "scenario":
      return createState(action.scenario);
    case "home":
      return go({ ...state, nav: "home" }, home(state));
    case "close-dialog":
      return { ...state, dialog: null };
    case "back": {
      if (state.history.length === 0) return { ...state, dialog: null };
      const screen = state.history[state.history.length - 1];
      return { ...state, dialog: null, history: state.history.slice(0, -1), screen, error: "" };
    }
    case "sign-in": {
      const phone = String(action.phone || "").replace(/\s/g, "");
      if (phone !== PHONE || action.code !== CODE) {
        return { ...state, draftPhone: action.phone || "", error: "الهاتف أو الرمز غير مطابق للبيانات التجريبية." };
      }
      return go(state, "UI-08", { draftPhone: phone });
    }
    case "verify":
      if (action.code !== CODE) return { ...state, error: "رمز التحقق غير مطابق." };
      return go(state, "UI-09");
    case "device-request":
      if (state.device === "approved") return go(state, "UI-10");
      if (state.device === "denied") return state;
      return { ...state, device: "pending", awaiting: "device" };
    case "device-approve":
      return { ...state, device: "approved", awaiting: null };
    case "device-deny":
      return go({ ...state, device: "denied", awaiting: null }, "UI-09");
    case "device-continue":
      return state.device === "approved" ? go(state, "UI-10") : state;
    case "permissions-allow":
      return go({ ...state, location: "allowed", camera: "allowed" }, "UI-12");
    case "location-deny":
      return go({ ...state, location: "denied" }, "UI-11");
    case "location-allow":
      return go({ ...state, location: "allowed" }, state.screen === "UI-11" ? "UI-12" : state.screen);
    case "gps-stale":
      return go({ ...state, location: "stale" }, "UI-52");
    case "help":
      return dialog(state, "مساعدة المعاينة", "لا تُجرى مكالمة ولا يُفتح تطبيق خارجي.");
    case "fake-settings":
      return dialog(state, "إعدادات الموقع", "لم تُفتح إعدادات الجهاز. هذه معاينة محلية.");
    case "go-off-shift":
      return go(state, "UI-12");
    case "start-readiness":
      if (state.device !== "approved") return dialog(state, "الجهاز غير معتمد", "اعتماد الجهاز في هذه المعاينة شرط لبدء الوردية.");
      if (state.location === "denied") return go(state, "UI-11");
      if (state.location === "stale") return go(state, "UI-52");
      return go(state, "UI-13");
    case "confirm-shift":
      if (state.location !== "allowed" || state.device !== "approved") return state;
      return go({ ...state, shift: "active" }, state.theme === "dark" ? "UI-54" : "UI-01", {
        dialog: { title: "بدء الوردية داخل المعاينة", text: "تم تسجيل الحالة محلياً فقط. لا يوجد تتبع على خادم." },
      });
    case "open-offer":
      if (state.offline) return dialog(state, "العرض يحتاج اتصالاً", "قبول العرض غير متاح أثناء مؤشر انقطاع المعاينة.");
      return go(state, "UI-02");
    case "accept-offer":
      if (state.offline) return state;
      return go({ ...state, offer: "pending", awaiting: "offer" }, "UI-15");
    case "decline-offer":
      return go({ ...state, offer: "declined" }, home(state));
    case "expire-offer":
      return go({ ...state, offer: "expired", awaiting: null }, "UI-16");
    case "check-offer":
      return dialog(state, "ما زال التكليف معلقاً", "لا يوجد تأكيد، ولن تبدأ مهمة استلام أو تسليم.");
    case "arrive-merchant":
      return go(state, "UI-17");
    case "open-pickup":
      return go(state, "UI-03");
    case "open-scanner":
      return go(state, "UI-20");
    case "scan-ok":
      return { ...state, parcels: nextParcel(state, "scanned"), camera: "allowed" };
    case "scan-bad":
      return go(state, "UI-21");
    case "partial": {
      const parcels = state.parcels.map((item) => ({ ...item }));
      const missing = parcels.find((item) => item.status === "expected");
      if (missing) missing.status = "missing";
      return go({ ...state, parcels, pickup: "partial" }, "UI-22");
    }
    case "handover":
      return go({ ...state, awaiting: "pickup" }, "UI-18");
    case "hub-arrive":
      return go(state, "UI-23");
    case "hub-scan":
      return go(state, "UI-24");
    case "hub-review":
      return go({ ...state, awaiting: "hub-in" }, "UI-25");
    case "outbound":
      return go(state, "UI-26");
    case "outbound-review":
      return go({ ...state, awaiting: "hub-out" }, "UI-27");
    case "delivery-route":
      if (state.mode === "pickup") return dialog(state, "خارج دور الجمع", "مسار التوزيع وبيانات الزبون غير ظاهرة لمندوب الجمع.");
      return go(state, "UI-28");
    case "navigate":
      return go(state, "UI-51");
    case "customer-arrive":
      if (state.mode === "pickup" || !state.customer) return dialog(state, "لا توجد وجهة زبون", "دور الجمع لا يعرض عنوان الزبون أو هاتفه أو مبلغ التحصيل.");
      return go(state, "UI-29");
    case "delivery-detail":
      if (state.mode === "pickup" || !state.customer) return dialog(state, "لا توجد وجهة زبون", "دور الجمع لا يعرض عنوان الزبون أو هاتفه أو مبلغ التحصيل.");
      return go(state, "UI-04");
    case "open-otp":
      return go(state, "UI-30");
    case "otp-submit":
      if (action.code !== CODE) return { ...state, error: "رمز التسليم غير مطابق." };
      return go(state, "UI-31");
    case "cod-submit": {
      const amount = Number(String(action.amount || "").replace(/[^\d]/g, ""));
      if (!Number.isInteger(amount) || amount < 0) return { ...state, error: "أدخل مبلغاً صحيحاً بالدينار." };
      if (amount !== state.codExpected) return go({ ...state, codActual: amount }, "UI-32");
      return { ...state, codActual: amount, awaiting: "delivery", error: "" };
    }
    case "fail-delivery":
      return go({ ...state, delivery: "failed" }, "UI-38");
    case "return-task":
      return go({ ...state, stage: "return" }, "UI-39");
    case "return-handover":
      return go({ ...state, awaiting: "return" }, "UI-40");
    case "damaged":
      return go(state, "UI-47");
    case "safety":
      return go(state, "UI-48");
    case "cash":
      return go({ ...state, nav: "cash" }, "UI-06");
    case "remit":
      return go(state, "UI-34");
    case "remit-submit":
      if (state.held <= 0) return dialog(state, "لا توجد عهدة", "لا يوجد مبلغ محاكى لتسليمه.");
      return go({ ...state, pendingRemit: state.held, awaiting: "remit" }, "UI-35");
    case "earnings":
      return go(state, "UI-37");
    case "ledger":
      return go(state, "UI-50");
    case "sync":
      return go(state, "UI-05");
    case "sync-check":
      return go({ ...state, awaiting: "sync" }, "UI-41");
    case "recovery":
      return go(state, "UI-42");
    case "profile":
      return go({ ...state, nav: "profile" }, "UI-43");
    case "vehicle":
      return go(state, "UI-44");
    case "notifications":
      return go(state, "UI-45");
    case "support":
      return go(state, "UI-46");
    case "task-history":
      return go(state, "UI-49");
    case "settings":
      return go(state, "UI-53");
    case "end-shift":
      if (state.shift !== "active") return dialog(state, "لا توجد وردية", "ابدأ وردية المعاينة قبل مراجعة الإنهاء.");
      return go(state, "UI-14");
    case "review-open":
      return go(dialog(state, "الوردية ما زالت مفتوحة", "توجد مهام أو عهدة غير محسومة. لم يُغلق الدوام."), home(state));
    case "theme": {
      const theme = action.theme === "dark" ? "dark" : "light";
      const screen = state.screen === "UI-01" || state.screen === "UI-54" ? (theme === "dark" ? "UI-54" : "UI-01") : state.screen;
      return { ...state, theme, screen };
    }
    case "offline-toggle":
      return { ...state, offline: !state.offline };
    case "nav":
      return go({ ...state, nav: action.id }, navScreen(state, action.id));
    case "server-confirm":
      return confirmServer(state);
    case "dev":
      return go(state, "DEV");
    default:
      return state;
  }
}

function navScreen(state, id) {
  if (id === "home") return home(state);
  if (id === "profile") return "UI-43";
  if (state.shift !== "active") return "UI-12";
  if (id === "route") {
    if (state.stage === "return" && state.returnTask) return "UI-39";
    if (state.mode === "delivery" || state.stage === "delivery") return "UI-28";
    return "UI-19";
  }
  if (id === "scan") return "UI-20";
  if (id === "cash") return "UI-06";
  return home(state);
}

function confirmServer(state) {
  if (state.screen === "UI-09" && state.device === "pending") return { ...state, device: "approved", awaiting: null };
  if (state.screen === "UI-15") {
    const delivery = state.mode === "delivery";
    return go({ ...state, offer: "confirmed", awaiting: null, stage: delivery ? "delivery" : "pickup" }, delivery ? "UI-28" : "UI-19");
  }
  if (state.screen === "UI-18") return go({ ...state, pickup: "confirmed-sim", awaiting: null, stage: "hub" }, "UI-23");
  if (state.screen === "UI-25") return go({ ...state, hub: "inbound-sim", awaiting: null }, "UI-26");
  if (state.screen === "UI-27") {
    if (state.mode === "pickup") return go({ ...state, hub: "outbound-sim", awaiting: null, stage: "done" }, "UI-01");
    return go({
      ...state,
      hub: "outbound-sim",
      awaiting: null,
      stage: "delivery",
      customer: state.customer || state.sealedCustomer,
      codExpected: state.codExpected ?? state.sealedCod,
    }, "UI-28");
  }
  if (state.screen === "UI-31" || state.screen === "UI-32") {
    const actual = state.codActual ?? state.codExpected ?? 0;
    return go({
      ...state,
      awaiting: null,
      delivery: "confirmed-sim",
      held: state.held + actual,
      codActual: actual,
    }, "UI-33");
  }
  if (state.screen === "UI-35") {
    return go({ ...state, awaiting: null, held: 0, pendingRemit: 0, receipt: "DM-RCP-1007" }, "UI-36");
  }
  if (state.screen === "UI-40") {
    return go({ ...state, awaiting: null, returnTask: state.returnTask ? { ...state.returnTask, status: "handed-sim" } : null }, "UI-01");
  }
  if (state.screen === "UI-41") {
    if (state.scenario === "offline") return go({ ...state, awaiting: null }, "UI-42");
    return go({ ...state, awaiting: null, sync: state.sync.map((item) => ({ ...item, status: "confirmed-sim" })) }, "UI-05");
  }
  return dialog(state, "لا توجد عملية معلقة", "رد الخادم التجريبي لا يغيّر هذه الشاشة.");
}

export function activeHome(state) {
  return home(state);
}
