const FIXTURE_CODE = "482196";
const FIXTURE_PHONE = "07701234567";

const MODES = {
  pickup: { role: "جمع الطرود", task: "استلام 3 طرود", place: "متجر الأفق", area: "الكرادة، بغداد", distance: "2.4 كم", minutes: "8 دقائق", pay: "1,500" },
  delivery: { role: "توزيع", task: "تسليم شحنة واحدة", place: "حي الكرادة", area: "بغداد", distance: "3.1 كم", minutes: "12 دقيقة", pay: "2,000" },
  hybrid: { role: "جمع وتوزيع", task: "جمع ثم تسليم", place: "متجر الأفق ثم الكرادة", area: "بغداد", distance: "5.5 كم", minutes: "20 دقيقة", pay: "3,500" },
};

const state = {
  screen: "UI-07",
  theme: "light",
  mode: "pickup",
  offline: false,
  device: "new",
  location: "unknown",
  shift: "off",
  phone: "",
  code: "",
  otp: "",
  error: "",
  loading: false,
  dialog: null,
  unresolved: 3,
};

const app = document.querySelector("#app");

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function mode() { return MODES[state.mode]; }

function clock() {
  return `<p class="clock"><bdi>09:41</bdi> · DilMart Driver</p>`;
}

function banner(kind, mark, title, text) {
  return `<div class="banner ${kind}" role="status"><span class="mark">${esc(mark)}</span><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div></div>`;
}

function nav(current) {
  const items = [["home", "الرئيسية"], ["route", "المسار"], ["scan", "المسح"], ["cash", "العهدة"], ["profile", "حسابي"]];
  return `<nav class="nav" aria-label="التنقل السفلي">${items.map(([id, label]) => `<button type="button" data-nav="${id}" ${current === id ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</nav>`;
}

function activeHome(dark) {
  const item = mode();
  if (dark) {
    return `${clock()}<h1><bdi>DilMart Driver</bdi></h1><p class="lede">وردية ${esc(item.role)} نشطة</p>
      <section class="metric"><p class="eyebrow">مهام اليوم</p><p class="figure"><bdi>8 / 12</bdi></p><p class="muted">4 مهام متبقية</p></section>
      <section class="card"><p class="lede">المهمة التالية</p><h2>${esc(item.task)}</h2><p>${esc(item.place)} • <bdi>${esc(item.distance)}</bdi></p><p class="muted">جاهزة للاستلام • موعد تقديري <bdi>${esc(item.minutes)}</bdi></p></section>
      <section class="card"><p class="eyebrow">العهدة المؤكدة</p><p class="figure"><bdi>0</bdi> د.ع</p><p class="lede">أرباح اليوم: <bdi>24,000</bdi> د.ع</p></section>
      <button class="primary" type="button" data-action="open-offer">عرض المهمة التالية</button>
      ${nav("home")}`;
  }
  return `${clock()}<h1>صباح الخير، مندوب DilMart</h1><p class="lede">متصل • وردية نشطة</p>
    <section class="metric"><p class="eyebrow">مهام اليوم</p><p class="figure"><bdi>12 / 18</bdi></p><p class="muted">6 مهام متبقية • آخر مزامنة الآن</p></section>
    <section class="card"><p class="lede">المهمة التالية</p><h2>${esc(item.task)}</h2><p>${esc(item.place)} • <bdi>${esc(item.distance)}</bdi></p><p class="muted">جاهزة للاستلام • موعد الوصول <bdi>${esc(item.minutes)}</bdi></p>
    <button class="primary" type="button" data-action="open-offer">عرض المهمة</button></section>
    <section class="card"><p class="eyebrow">العهدة النقدية المؤكدة</p><p class="figure"><bdi>125,000</bdi> د.ع</p><p class="lede">أرباح اليوم المؤكدة: <bdi>24,000</bdi> د.ع</p></section>
    ${nav("home")}`;
}

function offShift() {
  const item = mode();
  return `${clock()}<h1>أنت خارج الدوام</h1><p class="lede">التتبع متوقف</p>
    <section class="card"><h2>جاهز لوردية جديدة؟</h2><p>الدور المعتمد: ${esc(item.role)}</p><p class="muted">المركبة: دراجة نارية</p>
    <button class="primary" type="button" data-action="start-readiness">بدء الوردية</button></section>
    <section class="card"><p class="eyebrow">آخر وردية</p><p class="figure"><bdi>12</bdi> مهمة مكتملة</p><p>أرباح مؤكدة: <bdi>24,000</bdi> د.ع</p></section>
    ${nav("home")}`;
}

function signIn() {
  return `${clock()}<h1>أهلاً بك</h1><p class="lede">حساب المندوب المعتمد</p>
    <div class="brand"><div><strong><bdi>DilMart</bdi></strong><div><span>DRIVER</span></div></div></div>
    ${state.error ? banner("danger", "خطأ", "تعذر الدخول", state.error) : ""}
    <label>رقم الهاتف<input name="phone" inputmode="numeric" autocomplete="off" value="${esc(state.phone)}" placeholder="07XX XXX XXXX"></label>
    <label>رمز الدخول<input name="code" type="password" autocomplete="off" inputmode="numeric" placeholder="••••••"></label>
    <button class="primary" type="button" data-action="signin" ${state.loading ? "disabled" : ""}>${state.loading ? "جارٍ التحقق" : "تسجيل الدخول"}</button>
    <button class="secondary" type="button" data-action="help">تحتاج مساعدة؟ تواصل مع مسؤول التشغيل</button>`;
}

function verify() {
  return `${clock()}<h1>التحقق من الدخول</h1><p class="lede">رمز التحقق لحماية حسابك</p>
    <section class="card stack"><h2>أدخل رمز التحقق</h2><p>تم إرسال الرمز إلى رقمك المسجل</p>
    ${state.error ? banner("danger", "خطأ", "تعذر التحقق من الرمز", state.error) : ""}
    <label>رمز من 6 أرقام<input name="otp" inputmode="numeric" autocomplete="off" value="${esc(state.otp)}" placeholder="- - - - - -"></label>
    <p class="muted">إعادة الإرسال بعد <bdi>00:28</bdi></p>
    <button class="primary" type="button" data-action="verify" ${state.loading ? "disabled" : ""}>${state.loading ? "جارٍ التحقق" : "تحقق"}</button></section>`;
}

function device() {
  const status = state.device === "approved"
    ? banner("success", "معتمد", "جهاز معتمد داخل المعاينة", "يمكنك متابعة الصلاحيات. لم يُسجل جهاز حقيقي.")
    : state.device === "denied"
      ? banner("danger", "مرفوض", "تم رفض الجهاز في المعاينة", "لا تبدأ الوردية قبل اعتماد الجهاز.")
      : state.device === "pending"
        ? banner("warning", "بانتظار", "جهاز جديد", "يحتاج هذا الجهاز إلى موافقة مسؤول التشغيل.")
        : "";
  const label = state.device === "approved" ? "متابعة إلى الصلاحيات" : "إرسال طلب تسجيل الجهاز";
  return `${clock()}<h1>تسجيل الجهاز</h1><p class="lede">تأمين الوصول إلى حساب المندوب</p>
    ${status}
    <section class="card"><h2>الجهاز</h2><p><bdi>Android</bdi> • جهاز تجريبي</p></section>
    <section class="card"><h2>الحساب</h2><p>مندوب ${esc(mode().role)} • صلاحية محددة</p><p class="muted">المعرف <bdi>DM-DRV-021</bdi></p></section>
    <button class="primary" type="button" data-action="device-next" ${state.device === "denied" ? "disabled" : ""}>${label}</button>
    <p class="muted">لا تبدأ الوردية قبل اعتماد الجهاز. الطلب لا يغادر هذا المتصفح.</p>`;
}

function permissions() {
  return `${clock()}<h1>تهيئة صلاحيات العمل</h1><p class="lede">قبل بدء أول وردية</p>
    <section class="card"><h2>الموقع</h2><p class="muted">يستخدم أثناء الوردية فقط لتنسيق المسار</p></section>
    <section class="card"><h2>الكاميرا</h2><p class="muted">لمسح رموز الطرود</p></section>
    <section class="card"><h2>الإشعارات</h2><p class="muted">لعرض المهام وتحديثات التشغيل</p></section>
    <button class="primary" type="button" data-action="permissions-allow">متابعة إعداد الصلاحيات</button>
    <p class="muted">لن يُطلب إذن حقيقي من المتصفح.</p>`;
}

function locationDenied() {
  return `${clock()}<h1>الموقع غير متاح</h1><p class="lede">لا يمكن بدء الوردية</p>
    ${banner("danger", "مرفوض", "صلاحية الموقع مطلوبة", "لم يبدأ التتبع ولم تتغير حالة الدوام.")}
    <section class="card stack"><p>اسمح باستخدام الموقع من إعدادات الهاتف ثم أعد المحاولة.</p>
    <button class="primary" type="button" data-action="fake-settings">فتح إعدادات الموقع</button></section>
    <button class="secondary" type="button" data-action="go-off-shift">العودة دون بدء الوردية</button>`;
}

function readiness() {
  const blocked = state.location !== "allowed" || state.device !== "approved";
  return `${clock()}<h1>بدء الوردية</h1><p class="lede">التحقق من الجاهزية</p>
    <section class="card"><h2>الجهاز</h2><p>${state.device === "approved" ? "معتمد" : "غير معتمد"}</p></section>
    <section class="card"><h2>الموقع</h2><p>${state.location === "allowed" ? "متاح" : "غير متاح"}</p></section>
    <section class="card"><h2>المركبة</h2><p>دراجة نارية • معتمدة</p></section>
    <section class="card"><h2>الاتصال</h2><p>${state.offline ? "غير متصل" : "متصل بالخادم داخل المعاينة"}</p></section>
    <button class="primary" type="button" data-action="confirm-shift" ${blocked ? "disabled" : ""}>تأكيد بدء الوردية</button>
    <p class="muted">يبدأ التتبع بعد تأكيد الوردية. التأكيد هنا لا يغيّر نظام التشغيل.</p>`;
}

function offer() {
  const item = mode();
  return `${clock()}<h1>عرض مهمة جديدة</h1><p class="lede"><bdi>00:32</bdi> • ${esc(item.role)}</p>
    <section class="card"><h2>${esc(item.place)}</h2><p class="lede">${state.mode === "pickup" ? "3 طرود جاهزة للاستلام" : esc(item.task)}</p><p><bdi>${esc(item.distance)}</bdi> • <bdi>${esc(item.minutes)}</bdi> تقديرية</p><p>الأجر المتوقع: <bdi>${esc(item.pay)}</bdi> د.ع</p><p class="muted">لا يتم التعيين قبل تأكيد الخادم</p><p class="muted"><bdi>DM-TASK-2048</bdi></p></section>
    <button class="primary" type="button" data-action="accept-offer">قبول المهمة</button>
    <button class="secondary" type="button" data-action="decline-offer">رفض العرض</button>
    ${nav("home")}`;
}

function offerPending() {
  const item = mode();
  return `${clock()}<h1>جاري تأكيد التكليف</h1><p class="lede">تم إرسال طلب القبول</p>
    ${banner("warning", "بانتظار", "بانتظار تأكيد الخادم", "لا تبدأ المهمة حتى يظهر التعيين المؤكد.")}
    <section class="card"><h2>${esc(item.place)}</h2><p>${esc(item.task)}</p><p class="muted">عرض المهمة قد ينتهي أثناء الانتظار.</p></section>
    <button class="primary" type="button" data-action="check-offer">التحقق من حالة التكليف</button>`;
}

function offerExpired() {
  return `${clock()}<h1>انتهى عرض المهمة</h1><p class="lede">لم يتم تعيينك</p>
    ${banner("warning", "منتهٍ", "العرض غير متاح", "ربما انتهت المهلة أو تم تعيين مندوب آخر.")}
    <button class="primary" type="button" data-action="back-home">العودة إلى المهام</button>
    <p class="muted">لن يظهر التكليف ضمن مسارك إلا بعد تأكيد الخادم.</p>`;
}

function endShift() {
  return `${clock()}<h1>إنهاء الوردية</h1><p class="lede">مراجعة قبل الإنهاء</p>
    ${banner("warning", "معلّق", "عمليتان معلقتان", "الأدلة محفوظة في هذه المعاينة فقط، ولم يؤكدها خادم.")}
    <section class="card"><h2>الطرود بحوزتك</h2><p><bdi>3</bdi> طرود</p></section>
    <section class="card"><h2>العهدة النقدية</h2><p><bdi>0</bdi> د.ع</p></section>
    <section class="card"><h2>حالة المسار</h2><p>توجد مهمة مفتوحة</p></section>
    <button class="primary" type="button" data-action="review-open">مراجعة المهام المفتوحة</button>
    <p class="muted">إنهاء الوردية يخضع لقواعد الحيازة والتسوية المعتمدة. لم يُغلق شيء.</p>`;
}

function profile() {
  const item = mode();
  return `${clock()}<h1>حسابي</h1><p class="lede">بيانات المندوب المعتمد</p>
    <section class="card"><h2>مندوب <bdi>DilMart</bdi></h2><p>مثال • <bdi>DM-DRV-021</bdi></p><p class="lede">الدور المصرح: ${esc(item.role)}</p></section>
    <section class="card"><h2>المركبة والمستندات</h2><p>عرض حالة الاعتماد</p></section>
    <section class="card"><h2>الأجهزة والجلسات</h2><p>الجهاز الحالي • ${state.device === "approved" ? "معتمد في المعاينة" : "غير معتمد"}</p></section>
    <section class="card"><h2>الإعدادات والدعم</h2><p>اللغة والمظهر والمساعدة</p></section>
    <button class="primary" type="button" data-action="settings">عرض إعدادات الحساب</button>
    ${nav("profile")}`;
}

function outside(title) {
  return `${clock()}<h1>${esc(title)}</h1>
    <section class="card stack"><p>هذه الوجهة خارج دفعة DRIVER-UI-01.</p><p class="muted">لا يوجد مسح أو مسار أو عهدة حقيقية في هذه المعاينة.</p>
    <button class="primary" type="button" data-action="back-home">العودة إلى الرئيسية</button></section>`;
}

function homeTarget() {
  if (state.shift !== "active") return "UI-12";
  return state.theme === "dark" ? "UI-54" : "UI-01";
}

function render() {
  const views = {
    "UI-07": signIn,
    "UI-08": verify,
    "UI-09": device,
    "UI-10": permissions,
    "UI-11": locationDenied,
    "UI-12": offShift,
    "UI-13": readiness,
    "UI-01": () => activeHome(false),
    "UI-02": offer,
    "UI-15": offerPending,
    "UI-16": offerExpired,
    "UI-14": endShift,
    "UI-43": profile,
    "UI-54": () => activeHome(true),
    "UI-ROUTE": () => outside("المسار"),
    "UI-SCAN": () => outside("المسح"),
    "UI-CASH": () => outside("العهدة"),
  };
  const view = views[state.screen] || signIn;
  app.dataset.theme = state.theme;
  app.dataset.screen = state.screen;
  app.setAttribute("aria-busy", state.loading ? "true" : "false");
  const offline = state.offline ? banner("warning", "دون اتصال", "مؤشر المعاينة", "لا تُرسل بيانات.") : "";
  const dialog = state.dialog
    ? `<div class="dialog-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${esc(state.dialog.title)}</h2><p>${esc(state.dialog.text)}</p><button class="primary" type="button" data-action="close-dialog">حسناً، هذه معاينة</button></div></div>`
    : "";
  app.innerHTML = `<div class="stack">${offline}${view()}</div>${dialog}`;
}

function show(id) {
  state.screen = id;
  state.error = "";
  render();
}

function openDialog(title, text) {
  state.dialog = { title, text };
  render();
}

function after(fn) {
  state.loading = true;
  render();
  window.setTimeout(() => { state.loading = false; fn(); }, 300);
}

app.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.name === "phone") state.phone = target.value;
  if (target.name === "code") state.code = target.value;
  if (target.name === "otp") state.otp = target.value;
});

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const navId = target.closest("button")?.dataset.nav;
  if (navId) {
    if (navId === "home") show(homeTarget());
    if (navId === "route") show("UI-ROUTE");
    if (navId === "scan") show("UI-SCAN");
    if (navId === "cash") show("UI-CASH");
    if (navId === "profile") show("UI-43");
    return;
  }
  const action = target.closest("button")?.dataset.action;
  if (!action) return;
  if (action === "close-dialog") { state.dialog = null; render(); return; }
  if (action === "help") { openDialog("مساعدة المعاينة", "لا تُجرى مكالمة. التواصل مع مسؤول التشغيل خارج هذه المعاينة."); return; }
  if (action === "signin") {
    if (state.phone.replace(/\s/g, "") !== FIXTURE_PHONE || state.code !== FIXTURE_CODE) {
      state.error = "الهاتف أو الرمز غير مطابق للبيانات التجريبية.";
      render();
      return;
    }
    after(() => show("UI-08"));
    return;
  }
  if (action === "verify") {
    if (state.otp !== FIXTURE_CODE) { state.error = "رمز التحقق غير مطابق."; render(); return; }
    after(() => show("UI-09"));
    return;
  }
  if (action === "device-next") {
    if (state.device === "approved") { show("UI-10"); return; }
    if (state.device === "denied") return;
    state.device = "pending";
    render();
    return;
  }
  if (action === "permissions-allow") { state.location = "allowed"; show("UI-12"); return; }
  if (action === "fake-settings") { openDialog("إعدادات الموقع", "لم تُفتح إعدادات الجهاز."); return; }
  if (action === "go-off-shift") { show("UI-12"); return; }
  if (action === "start-readiness") {
    if (state.device !== "approved") { openDialog("الجهاز غير معتمد", "وافق على الجهاز من أدوات المعاينة قبل بدء الوردية."); return; }
    if (state.location === "denied") { show("UI-11"); return; }
    show("UI-13");
    return;
  }
  if (action === "confirm-shift") {
    if (state.location !== "allowed" || state.device !== "approved") return;
    state.shift = "active";
    state.screen = state.theme === "dark" ? "UI-54" : "UI-01";
    openDialog("بدء الوردية داخل المعاينة", "تم تسجيل الحالة محلياً فقط. لا يوجد تتبع أو وردية على خادم.");
    return;
  }
  if (action === "open-offer") { show("UI-02"); return; }
  if (action === "accept-offer") { show("UI-15"); return; }
  if (action === "decline-offer") { show(homeTarget()); return; }
  if (action === "check-offer") { openDialog("ما زال التكليف معلقاً", "لا يوجد تأكيد من خادم، ولن تبدأ مهمة استلام أو تسليم."); return; }
  if (action === "back-home") { show(homeTarget()); return; }
  if (action === "review-open") {
    state.screen = homeTarget();
    openDialog("الوردية ما زالت مفتوحة", "توجد مهام غير محسومة. لم يُغلق الدوام.");
    return;
  }
  if (action === "settings") { openDialog("إعدادات الحساب", "تغيير اللغة أو المظهر من أدوات المعاينة لا يغيّر حساباً حقيقياً."); }
});

document.querySelector(".demo-panel").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const demo = target.closest("button")?.dataset.demo;
  if (!demo) return;
  if (demo.startsWith("mode-")) state.mode = demo.slice(5);
  if (demo === "theme-light") { state.theme = "light"; if (state.screen === "UI-54") state.screen = "UI-01"; }
  if (demo === "theme-dark") { state.theme = "dark"; if (state.shift === "active") state.screen = "UI-54"; }
  if (demo === "offline") state.offline = !state.offline;
  if (demo === "device-approved") state.device = "approved";
  if (demo === "device-denied") { state.device = "denied"; state.screen = "UI-09"; }
  if (demo === "location-allowed") { state.location = "allowed"; if (state.screen === "UI-11") state.screen = "UI-12"; }
  if (demo === "location-denied") { state.location = "denied"; state.screen = "UI-11"; }
  if (demo === "offer-expired") state.screen = "UI-16";
  if (demo === "end-shift") {
    if (state.shift === "active") state.screen = "UI-14";
    else { openDialog("لا توجد وردية", "ابدأ وردية المعاينة قبل مراجعة الإنهاء."); return; }
  }
  render();
});

render();
