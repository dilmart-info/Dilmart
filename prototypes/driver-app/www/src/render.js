import { CATALOG } from "./catalog.js";
import { ACTOR, showsCustomer } from "./fixtures.js";

const IDENTITY = new Set(["UI-07", "UI-08", "UI-09", "UI-10", "UI-11", "DEV"]);
const STATUS = { expected: "متوقع", scanned: "ممسوح في المعاينة", missing: "غير جاهز", damaged: "تالف" };

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function iqd(value) {
  if (value == null) return "—";
  return `<bdi>${Number(value).toLocaleString("en-US")}</bdi> د.ع`;
}

function banner(kind, mark, title, text) {
  return `<div class="banner ${kind}" role="status"><span class="mark">${esc(mark)}</span><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div></div>`;
}

function button(label, action, kind = "primary") {
  return `<button class="${kind}" type="button" data-action="${action}">${esc(label)}</button>`;
}

function parcels(state) {
  return `<ul class="rows">${state.parcels.map((item) => `<li><bdi>${esc(item.id)}</bdi><span>${STATUS[item.status] || esc(item.status)}</span></li>`).join("")}</ul>`;
}

function nav(state) {
  if (IDENTITY.has(state.screen)) return "";
  const current = ["UI-43", "UI-44", "UI-45", "UI-46", "UI-49", "UI-53"].includes(state.screen) ? "profile"
    : ["UI-20", "UI-21"].includes(state.screen) ? "scan"
    : ["UI-06", "UI-34", "UI-35", "UI-36", "UI-37", "UI-50", "UI-31", "UI-32"].includes(state.screen) ? "cash"
    : ["UI-19", "UI-28", "UI-51", "UI-39"].includes(state.screen) ? "route" : "home";
  const items = [["home", "الرئيسية"], ["route", "المسار"], ["scan", "المسح"], ["cash", "العهدة"], ["profile", "حسابي"]];
  return `<nav class="nav" aria-label="التنقل السفلي">${items.map(([id, label]) => `<button type="button" data-nav="${id}" ${current === id ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</nav>`;
}

function devSlot(state) {
  const pending = ["UI-09", "UI-15", "UI-18", "UI-25", "UI-27", "UI-31", "UI-32", "UI-35", "UI-40", "UI-41"];
  if (!pending.includes(state.screen)) return "";
  return `<section class="dev-slot"><p>أدوات التطوير. رد الخادم هنا محلي ولا يعتمد عملية حقيقية.</p>${button("محاكاة رد الخادم", "server-confirm", "secondary")}</section>`;
}

function page(state, title, lede, body) {
  const offline = state.offline ? banner("warning", "دون اتصال", "مؤشر المعاينة", "لا تُرسل العمليات إلى خادم.") : "";
  const error = state.error ? banner("danger", "تنبيه", "تعذر الإجراء", state.error) : "";
  const dialog = state.dialog ? `<div class="dialog-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${esc(state.dialog.title)}</h2><p>${esc(state.dialog.text)}</p>${button("حسناً، هذه معاينة", "close-dialog")}</div></div>` : "";
  return `<div class="stack">${offline}<p class="clock"><bdi>${esc(state.clock)}</bdi> · DilMart Driver</p><p class="badge">نسخة تطوير تجريبية</p><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}${error}${body}${devSlot(state)}${nav(state)}</div>${dialog}`;
}

function modeLine(state) {
  if (state.mode === "delivery") return "توزيع";
  if (state.mode === "hybrid") return "جمع وتوزيع";
  return "جمع الطرود";
}

const views = {
  home(state) {
    const dark = state.screen === "UI-54";
    const figure = dark ? "8 / 12" : "12 / 18";
    const left = dark ? "4 مهام متبقية" : "6 مهام متبقية • آخر مزامنة الآن";
    const specimen = !dark && state.mode !== "pickup" && state.held === 0 && state.delivery !== "confirmed-sim" && !state.receipt;
    const held = dark ? 0 : state.mode === "pickup" ? 0 : specimen ? 125000 : state.held;
    return page(state, dark ? "<bdi>DilMart Driver</bdi>" : "صباح الخير، مندوب DilMart", dark ? `وردية ${modeLine(state)} نشطة` : "متصل • وردية نشطة", `
      <section class="metric"><p class="eyebrow">مهام اليوم</p><p class="figure"><bdi>${figure}</bdi></p><p class="muted">${left}</p></section>
      <section class="card"><p class="lede">المهمة التالية</p><h2>${state.mode === "delivery" ? "تسليم شحنة واحدة" : "استلام 3 طرود"}</h2><p>${esc(state.merchant)} • <bdi>2.4 كم</bdi></p><p class="muted">جاهزة للاستلام • موعد الوصول <bdi>8 دقائق</bdi></p>${button(dark ? "عرض المهمة التالية" : "عرض المهمة", "open-offer")}</section>
      <section class="card"><p class="eyebrow">العهدة النقدية المؤكدة داخل المعاينة</p><p class="figure">${iqd(held)}</p><p class="lede">أرباح اليوم المؤكدة: ${iqd(state.earnings)}</p>${button("مراجعة إنهاء الوردية", "end-shift", "secondary")}</section>`);
  },
  offer(state) {
    return page(state, "عرض مهمة جديدة", `<bdi>00:32</bdi> • ${modeLine(state)}`, `
      <section class="card"><h2>${esc(state.merchant)}</h2><p class="lede">${state.mode === "delivery" ? "شحنة جاهزة للتسليم" : "3 طرود جاهزة للاستلام"}</p><p><bdi>2.4 كم</bdi> • <bdi>8 دقائق</bdi> تقديرية</p><p>الأجر المتوقع: ${iqd(1500)}</p><p class="muted">لا يتم التعيين قبل تأكيد الخادم</p><p class="muted"><bdi>DM-TASK-2048</bdi></p></section>
      ${button("قبول المهمة", "accept-offer")}
      ${button("رفض العرض", "decline-offer", "secondary")}
      ${button("محاكاة انتهاء العرض", "expire-offer", "secondary")}`);
  },
  pending(state) {
    return page(state, "جاري تأكيد التكليف", "تم إرسال طلب القبول", `
      ${banner("warning", "بانتظار", "بانتظار تأكيد الخادم", "لا تبدأ المهمة حتى يظهر التعيين المؤكد.")}
      <section class="card"><h2>${esc(state.merchant)}</h2><p>${modeLine(state)}</p></section>
      ${button("التحقق من حالة التكليف", "check-offer")}`);
  },
  expired() {
    return page(arguments[0], "انتهى عرض المهمة", "لم يتم تعيينك", `
      ${banner("warning", "منتهٍ", "العرض غير متاح", "ربما انتهت المهلة أو تم تعيين مندوب آخر.")}
      ${button("العودة إلى المهام", "home")}`);
  },
  signin(state) {
    return page(state, "أهلاً بك", "حساب المندوب المعتمد", `
      <div class="brand"><strong><bdi>DilMart</bdi></strong><span>DRIVER DEV</span></div>
      <form id="sign-in" class="stack">
        <label>رقم الهاتف<input name="phone" inputmode="numeric" autocomplete="username" value="${esc(state.draftPhone)}" placeholder="07XX XXX XXXX"></label>
        <label>رمز الدخول<input name="code" type="password" autocomplete="current-password" inputmode="numeric" placeholder="••••••"></label>
        <button class="primary" type="submit">تسجيل الدخول</button>
      </form>
      ${button("تحتاج مساعدة؟ تواصل مع مسؤول التشغيل", "help", "secondary")}
      ${button("أدوات التطوير", "dev", "secondary")}`);
  },
  verify() {
    return page(arguments[0], "التحقق من الدخول", "رمز التحقق لحماية حسابك", `
      <form id="verify" class="stack card">
        <h2>أدخل رمز التحقق</h2>
        <p>تم إرسال الرمز إلى رقمك المسجل داخل المعاينة</p>
        <label>رمز من 6 أرقام<input name="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="- - - - - -"></label>
        <p class="muted">إعادة الإرسال بعد <bdi>00:28</bdi></p>
        <button class="primary" type="submit">تحقق</button>
      </form>`);
  },
  device(state) {
    const status = state.device === "approved" ? banner("success", "معتمد", "جهاز معتمد داخل المعاينة", "لم يُسجل جهاز حقيقي.")
      : state.device === "denied" ? banner("danger", "مرفوض", "تم رفض الجهاز في المعاينة", "لا تبدأ الوردية قبل اعتماد الجهاز.")
      : state.device === "pending" ? banner("warning", "بانتظار", "جهاز جديد", "يحتاج هذا الجهاز إلى موافقة مسؤول التشغيل.") : "";
    return page(state, "تسجيل الجهاز", "تأمين الوصول إلى حساب المندوب", `
      ${status}
      <section class="card"><h2>الجهاز</h2><p><bdi>Android</bdi> • جهاز تطوير</p></section>
      <section class="card"><h2>الحساب</h2><p>مندوب ${modeLine(state)}</p><p class="muted"><bdi>${ACTOR}</bdi></p></section>
      ${button(state.device === "approved" ? "متابعة إلى الصلاحيات" : "إرسال طلب تسجيل الجهاز", "device-request")}
      <p class="muted">لا تبدأ الوردية قبل اعتماد الجهاز.</p>`);
  },
  permissions() {
    return page(arguments[0], "تهيئة صلاحيات العمل", "قبل بدء أول وردية", `
      <section class="card"><h2>الموقع</h2><p class="muted">يستخدم أثناء الوردية فقط لتنسيق المسار</p></section>
      <section class="card"><h2>الكاميرا</h2><p class="muted">لمسح رموز الطرود</p></section>
      <section class="card"><h2>الإشعارات</h2><p class="muted">لعرض المهام وتحديثات التشغيل</p></section>
      ${button("متابعة إعداد الصلاحيات", "permissions-allow")}
      ${button("محاكاة رفض الموقع", "location-deny", "secondary")}
      <p class="muted">لن يُطلب إذن حقيقي من الجهاز.</p>`);
  },
  location() {
    return page(arguments[0], "الموقع غير متاح", "لا يمكن بدء الوردية", `
      ${banner("danger", "مرفوض", "صلاحية الموقع مطلوبة", "لم يبدأ التتبع ولم تتغير حالة الدوام.")}
      ${button("فتح إعدادات الموقع", "fake-settings")}
      ${button("العودة دون بدء الوردية", "go-off-shift", "secondary")}`);
  },
  off(state) {
    return page(state, "أنت خارج الدوام", "التتبع متوقف", `
      <section class="card"><h2>جاهز لوردية جديدة؟</h2><p>الدور المعتمد: ${modeLine(state)}</p><p class="muted">المركبة: دراجة نارية</p>${button("بدء الوردية", "start-readiness")}</section>
      <section class="card"><p class="eyebrow">آخر وردية</p><p class="figure"><bdi>12</bdi></p><p>مهمة مكتملة في البيانات التجريبية</p></section>`);
  },
  ready(state) {
    const blocked = state.location !== "allowed" || state.device !== "approved";
    return page(state, "بدء الوردية", "التحقق من الجاهزية", `
      <section class="card"><h2>الجهاز</h2><p>${state.device === "approved" ? "معتمد في المعاينة" : "غير معتمد"}</p></section>
      <section class="card"><h2>الموقع</h2><p>${state.location === "allowed" ? "متاح" : "غير متاح"}</p></section>
      <section class="card"><h2>المركبة</h2><p>دراجة نارية • معتمدة</p></section>
      <section class="card"><h2>الاتصال</h2><p>${state.offline ? "غير متصل" : "مؤشر متصل داخل المعاينة"}</p></section>
      <button class="primary" type="button" data-action="confirm-shift" ${blocked ? "disabled" : ""}>تأكيد بدء الوردية</button>`);
  },
  end(state) {
    return page(state, "إنهاء الوردية", "مراجعة قبل الإنهاء", `
      ${banner("warning", "معلّق", "عمليات معلقة", "الأدلة محفوظة في هذه المعاينة فقط.")}
      <section class="card"><h2>الطرود بحوزتك</h2>${parcels(state)}</section>
      <section class="card"><h2>العهدة النقدية</h2><p>${iqd(state.held)}</p></section>
      ${button("مراجعة المهام المفتوحة", "review-open")}`);
  },
  route(state) {
    return page(state, "مسار جمع الطرود", "المحطة التالية مصرح بها داخل المعاينة", `
      <section class="card"><h2>${esc(state.merchant)}</h2><p>${esc(state.area)}</p><p class="muted"><bdi>2.4 كم</bdi></p>${button("الملاحة إلى المحطة", "navigate")}${button("وصلت إلى التاجر", "arrive-merchant", "secondary")}</section>`);
  },
  arrival(state) {
    return page(state, "وصلت إلى التاجر", esc(state.merchant), `
      <section class="card"><p>${esc(state.area)}</p><p class="muted">دليل الوصول محلي وليس إحداثيات جهاز.</p>${button("عرض الطرود", "open-pickup")}${button("الإبلاغ عن طرد تالف", "damaged", "secondary")}</section>`);
  },
  manifest(state) {
    return page(state, "استلام الطرود", "قائمة التاجر داخل المعاينة", `
      <section class="card">${parcels(state)}${button("مسح رمز الطرد", "open-scanner")}${button("تسجيل استلام جزئي", "partial", "secondary")}${button("تأكيد التسليم بين الطرفين", "handover", "secondary")}</section>`);
  },
  scanner() {
    return page(arguments[0], "مسح رمز الطرد", "الكاميرا غير مفتوحة", `
      <section class="scanner" aria-label="منطقة الماسح التجريبية"><p>معاينة الماسح. لا توجد كاميرا ولا قراءة حقيقية.</p></section>
      ${button("اعتماد رمز تجريبي", "scan-ok")}
      ${button("رمز غير صالح", "scan-bad", "secondary")}`);
  },
  "scan-error"() {
    return page(arguments[0], "تعذر اعتماد الرمز", "لم تتغير الحيازة", `
      ${banner("danger", "مرفوض", "الرمز غير معتمد", "مكرر أو غير معروف أو منتهي داخل المعاينة.")}
      ${button("العودة إلى القائمة", "open-pickup")}`);
  },
  partial(state) {
    return page(state, "استلام جزئي", "الكمية الفعلية أقل من المتوقع", `
      ${banner("warning", "جزئي", "بقي طرد غير جاهز", "لم يُغلق الاستلام ولن يُخترع طرد.")}
      <section class="card">${parcels(state)}</section>
      ${button("متابعة التأكيد بالموجود", "handover")}`);
  },
  handover(state) {
    return page(state, "تأكيد استلام الطرود", "بانتظار إقرار الطرفين", `
      ${banner("warning", "بانتظار", "لم تنتقل الحيازة", "المسح وحده لا يغير العهدة.")}
      <section class="card">${parcels(state)}</section>`);
  },
  "hub-arrival"(state) {
    return page(state, "الوصول إلى المركز", "مركز توزيع تجريبي — بغداد", `
      <section class="card"><p>الطرود الواردة ما زالت بحوزة المعاينة حتى إقرار المركز.</p>${parcels(state)}${button("بدء تسليم المركز", "hub-scan")}</section>`);
  },
  "hub-scan"(state) {
    return page(state, "تسليم الطرود للمركز", "مطابقة الوارد", `
      <section class="card">${parcels(state)}${button("مراجعة التسليم", "hub-review")}</section>`);
  },
  "hub-confirm"(state) {
    return page(state, "تأكيد التسليم للمركز", "بانتظار إقرار المركز", `
      ${banner("warning", "بانتظار", "لم يُغلق الاستلام", "لا يبدأ التوزيع تلقائياً.")}
      <section class="card">${parcels(state)}</section>`);
  },
  outbound(state) {
    const hidden = state.mode === "pickup";
    return page(state, "استلام الشحنات للتوزيع", hidden ? "غير متاح لدور الجمع" : "بيان صادر تجريبي", hidden
      ? `<section class="card"><p>مندوب الجمع لا يستلم شحنات توزيع ولا يرى مبلغ التحصيل.</p></section>`
      : `<section class="card"><p>المبلغ المتوقع يظهر كبيان فقط: ${iqd(state.sealedCod ?? state.codExpected)}</p>${button("مراجعة الاستلام", "outbound-review")}</section>`);
  },
  "outbound-review"(state) {
    return page(state, "مراجعة استلام الشحنات", "إقرار مزدوج داخل المعاينة", `
      ${banner("warning", "بانتظار", "لم تُسلَّم الشحنة", "التأكيد الفعلي يأتي من رد الخادم التجريبي.")}
      <section class="card">${parcels(state)}</section>`);
  },
  "delivery-route"(state) {
    if (!showsCustomer(state)) {
      return page(state, "مسار التوزيع", "البيانات غير متاحة", `<section class="card"><p>عنوان الزبون وهاتفه ومبلغ التحصيل مخفية قبل إقرار استلام التوزيع، ومخفية نهائياً عن دور الجمع.</p></section>`);
    }
    return page(state, "مسار التوزيع", esc(state.customer.area), `
      <section class="card"><h2>${esc(state.customer.name)}</h2><p class="muted">الهاتف <bdi>${esc(state.customer.phone)}</bdi></p><p>المبلغ المتوقع: ${iqd(state.codExpected)}</p>${button("الملاحة إلى المحطة", "navigate")}${button("وصلت إلى الوجهة", "customer-arrive", "secondary")}</section>`);
  },
  customer(state) {
    return page(state, "الوصول إلى وجهة التسليم", esc(state.customer?.name || ""), `
      <section class="card"><p>${esc(state.customer?.area || "")}</p>${button("فتح مهمة التسليم", "delivery-detail")}${button("تعذر التسليم", "fail-delivery", "secondary")}</section>`);
  },
  delivery(state) {
    return page(state, "تسليم الشحنة", esc(state.customer?.name || "بدون زبون"), `
      <section class="card">${parcels(state)}<p>المبلغ المتوقع: ${iqd(state.codExpected)}</p>${button("التحقق من التسليم", "open-otp")}${button("تعذر التسليم", "fail-delivery", "secondary")}</section>`);
  },
  otp() {
    return page(arguments[0], "التحقق من التسليم", "رمز يملكه الخادم في المنتج", `
      <form id="otp" class="card stack"><p>أدخل الرمز التجريبي. لا يُحفظ الرمز بعد الإرسال.</p><label>رمز التسليم<input name="otp" inputmode="numeric" autocomplete="one-time-code"></label><button class="primary" type="submit">متابعة</button></form>`);
  },
  cod(state) {
    return page(state, "تسجيل المبلغ المستلم", "المبلغ الفعلي دليل، والمتوقع ثابت", `
      ${state.awaiting === "delivery" ? banner("warning", "بانتظار", "المبلغ مسجّل محلياً", "لن يُعد التحصيل مؤكداً قبل رد الخادم التجريبي.") : ""}
      <form id="cod" class="card stack"><p>المتوقع: ${iqd(state.codExpected)}</p><label>المبلغ المستلم<input name="amount" inputmode="numeric" value="${state.codActual ?? ""}"></label><button class="primary" type="submit">تسجيل المبلغ</button></form>`);
  },
  "cod-diff"(state) {
    return page(state, "فرق في مبلغ التحصيل", "يُحفظ المبلغ الفعلي كما أُدخل", `
      ${banner("warning", "فرق", "المبلغ لا يطابق المتوقع", "لا يُحصّل المبلغ مرة ثانية من هذه الشاشة.")}
      <section class="card"><p>المستلم ${iqd(state.codActual)} والمتوقع ${iqd(state.codExpected)}.</p></section>`);
  },
  delivered(state) {
    return page(state, "تم التسليم", "نتيجة تجريبية غير معتمدة محاسبياً", `
      ${banner("success", "محاكاة", "أُغلق التسليم داخل المعاينة", "هذا ليس إيصالاً من خادم إنتاج.")}
      <section class="card"><p>العهدة الظاهرة الآن: ${iqd(state.held)}</p>${button("عرض العهدة", "cash")}</section>`);
  },
  cash(state) {
    return page(state, "العهدة والأرباح", "العهدة منفصلة عن الأرباح", `
      <section class="metric"><p class="eyebrow">عهدة نقدية داخل المعاينة</p><p class="figure">${iqd(state.held)}</p></section>
      <section class="card"><p>أرباح مؤكدة تجريبياً: ${iqd(state.earnings)}</p><p class="muted">${state.mode === "pickup" ? "دور الجمع لا يعرض تحصيل زبون." : "مبلغ التحصيل المتوقع ليس رصيداً مؤكداً."}</p>${button("تسليم العهدة", "remit")}${button("سجل العهدة", "ledger", "secondary")}${button("أرباحي", "earnings", "secondary")}</section>`);
  },
  remit(state) {
    return page(state, "تسليم العهدة", "طلب تحويل إلى صندوق تجريبي", `
      <section class="card"><p>المبلغ المعد للتسليم: ${iqd(state.held)}</p><p class="muted">الصندوق: صندوق تطوير بغداد</p>${button("إرسال طلب التسليم", "remit-submit")}</section>`);
  },
  "remit-pending"(state) {
    return page(state, "بانتظار تأكيد الصندوق", "الرصيد لم يتغير بعد", `
      ${banner("warning", "بانتظار", "الطلب معلّق", "المبلغ ما زال ضمن العهدة حتى الإقرار.")}
      <section class="card"><p>العهدة الحالية: ${iqd(state.held)}</p><p>المعلّق: ${iqd(state.pendingRemit)}</p></section>`);
  },
  receipt(state) {
    return page(state, "إيصال تسليم العهدة", "إيصال تجريبي", `
      ${banner("success", "محاكاة", "صدر إيصال داخل المعاينة", "ليس مستنداً مالياً معتمداً.")}
      <section class="card"><p>المرجع <bdi>${esc(state.receipt || "—")}</bdi></p><p>العهدة المتبقية: ${iqd(state.held)}</p></section>`);
  },
  earnings(state) {
    return page(state, "أرباحي", "منفصلة عن العهدة النقدية", `
      <section class="card"><p class="figure">${iqd(state.earnings)}</p><p class="muted">لا يوجد تحويل مصرفي ولا سجل دفع إنتاجي.</p></section>`);
  },
  ledger(state) {
    return page(state, "سجل العهدة النقدية", "مؤكد داخل المعاينة مقابل معلّق", `
      <ul class="rows"><li>عهدة ظاهرة<span>${iqd(state.held)}</span></li><li>طلب تسليم معلّق<span>${iqd(state.pendingRemit)}</span></li><li>آخر إيصال<span><bdi>${esc(state.receipt || "—")}</bdi></span></li></ul>`);
  },
  failed() {
    return page(arguments[0], "تعذر التسليم", "الطرود تبقى بالحيازة", `
      ${banner("danger", "متعذر", "لم يُسلَّم الطرد", "السبب التجريبي: الزبون غير متواجد. لا يتغير المخزون.")}
      ${button("فتح مهمة الإرجاع", "return-task")}`);
  },
  return(state) {
    const task = state.returnTask || { id: "DM-R-17", merchant: state.merchant, parcel: state.parcels[0]?.id || "DM-P-1888" };
    return page(state, "مهمة إرجاع", "تكليف عكسي تجريبي", `
      <section class="card"><p>المرجع <bdi>${esc(task.id)}</bdi></p><p>${esc(task.merchant)}</p><p class="muted"><bdi>${esc(task.parcel)}</bdi></p>${button("الملاحة إلى المحطة", "navigate")}${button("تسليم المرتجع", "return-handover", "secondary")}</section>`);
  },
  "return-hand"(state) {
    return page(state, "تسليم المرتجع", "بانتظار إقرار التاجر", `
      ${banner("warning", "بانتظار", "المندوب لا يعيد التخزين", "انتقال الحيازة ينتظر رد الخادم التجريبي.")}
      <section class="card">${parcels(state)}</section>`);
  },
  sync(state) {
    const rows = state.sync.length ? state.sync : [{ id: "OP-204", label: "لا توجد عملية معلّقة", status: "empty" }];
    return page(state, "مركز المزامنة", state.offline ? "الاتصال متوقف في المعاينة" : "الاتصال ظاهر داخل المعاينة", `
      <ul class="rows">${rows.map((item) => `<li><bdi>${esc(item.id)}</bdi> ${esc(item.label)}<span>${esc(item.status)}</span></li>`).join("")}</ul>
      ${button("التحقق من عملية معلقة", "sync-check")}`);
  },
  uncertain() {
    return page(arguments[0], "التحقق من عملية معلقة", "ابحث عن النتيجة قبل إعادة الإرسال", `
      ${banner("warning", "غير محسوم", "نفس المفتاح لا يُعاد إرساله الآن", "المعاينة لا تتصل بخادم.")}
      ${button("عرض المعالجة المقيدة", "recovery", "secondary")}`);
  },
  blocked() {
    return page(arguments[0], "تحتاج العملية إلى معالجة", "لا يوجد مسح للبيانات", `
      ${banner("danger", "موقوف", "الاستعادة مقيدة", "لا تُحذف الأدلة المعلقة من هذه الشاشة.")}`);
  },
  profile(state) {
    return page(state, "حسابي", "بيانات المندوب المعتمد", `
      <section class="card"><h2>مندوب <bdi>DilMart</bdi></h2><p><bdi>${ACTOR}</bdi></p><p class="lede">الدور: ${modeLine(state)}</p></section>
      ${button("المركبة والمستندات", "vehicle", "secondary")}
      ${button("الإشعارات", "notifications", "secondary")}
      ${button("مركز المساعدة", "support", "secondary")}
      ${button("سجل المهام", "task-history", "secondary")}
      ${button("الإعدادات", "settings", "secondary")}`);
  },
  vehicle() {
    return page(arguments[0], "المركبة والمستندات", "العرض لا يمنح صلاحية", `<section class="card"><p>دراجة نارية • مستندات معتمدة داخل المعاينة</p><p class="muted">أي تغيير يحتاج موافقة خارج هذه النسخة.</p></section>`);
  },
  notes() {
    return page(arguments[0], "الإشعارات", "تنبيهات غير ملزمة", `<section class="card"><p>لا توجد إشعارات جهاز. افتح المهمة من الشاشة لتحديث البيانات التجريبية.</p></section>`);
  },
  support() {
    return page(arguments[0], "مركز المساعدة", "مرجع ارتباط آمن", `
      <section class="card"><p>مرجع المعاينة <bdi>SUP-2048</bdi></p>${button("الإبلاغ عن طارئ", "safety")}</section>`);
  },
  damage() {
    return page(arguments[0], "الإبلاغ عن طرد تالف", "الدليل لا يغيّر الحيازة", `<section class="card"><p>يُحفظ وصف تجريبي: غلاف مفتوح. الطرد يبقى بالحيازة.</p></section>${button("العودة إلى الطرود", "open-pickup", "secondary")}`);
  },
  safety() {
    return page(arguments[0], "الإبلاغ عن طارئ", "إيقاف آمن", `
      ${banner("danger", "طارئ", "أوقِف الحركة", "لا تُجرى مكالمة من هذه النسخة. اطلب المساعدة من خارج التطبيق إذا لزم.")}`);
  },
  history(state) {
    return page(state, "سجل المهام", "سجل تجريبي بلا بيانات شخصية زائدة", `<ul class="rows"><li><bdi>DM-TASK-2048</bdi><span>${esc(state.merchant)}</span></li><li>وردية سابقة<span><bdi>12</bdi> مهمة</span></li></ul>`);
  },
  nav(state) {
    const place = showsCustomer(state) ? state.customer.area : state.area;
    return page(state, "الملاحة إلى المحطة", "بدون خريطة خارجية", `
      <section class="card"><p>${esc(place)}</p><p class="muted">الوقت المتوقع غير محسوم.</p>${button("تعذر تحديث الموقع", "gps-stale", "secondary")}</section>`);
  },
  gps() {
    return page(arguments[0], "تعذر تحديث الموقع", "الموقع قديم أو غير معروف", `
      ${banner("warning", "قديم", "لا يُسند عمل جديد آلياً", "آخر قراءة: غير متاحة في المعاينة.")}
      ${button("العودة", "back", "secondary")}`);
  },
  settings(state) {
    return page(state, "الإعدادات", "اللغة والمظهر والصلاحيات", `
      <section class="card"><p>اللغة: العربية</p><p>المظهر: ${state.theme === "dark" ? "داكن" : "فاتح"}</p>${button("مظهر فاتح", "theme-light", "secondary")}${button("مظهر داكن", "theme-dark", "secondary")}${button("أدوات التطوير", "dev", "secondary")}</section>`);
  },
};

export function render(state) {
  if (state.screen === "DEV") return devScreen(state);
  const row = CATALOG.find((item) => item[0] === state.screen);
  const view = views[row?.[3]] || views.home;
  return view(state);
}

function devScreen(state) {
  const scenarios = ["pickup", "delivery", "hybrid", "offline", "permission-denied", "failed-delivery", "partial-pickup", "return", "cash", "blocked-shift"];
  return page(state, "أدوات التطوير", "هذه الأدوات خاصة بنسخة التطوير", `
    <section class="card stack">${scenarios.map((id) => `<button class="secondary" type="button" data-scenario="${id}">${esc(id)}</button>`).join("")}
    ${button("اعتماد الجهاز", "device-approve", "secondary")}
    ${button("رفض الجهاز", "device-deny", "secondary")}
    ${button("السماح بالموقع", "location-allow", "secondary")}
    ${button("تبديل مؤشر الاتصال", "offline-toggle", "secondary")}
    ${button("محاكاة رد الخادم", "server-confirm")}
    ${button("إعادة المعاينة", "reset", "secondary")}</section>`);
}

export function screenTitle(id) {
  return CATALOG.find((row) => row[0] === id)?.[4] || id;
}
