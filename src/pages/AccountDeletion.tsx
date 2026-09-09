import InfoPageLayout from "@/components/info/InfoPageLayout";
import { storeConfig } from "@/config/store";
import { POLICY_METADATA } from "@/content/customer-policies";
import {
  Trash2,
  Smartphone,
  ShieldCheck,
  FileText,
  AlertTriangle,
  MessageCircle,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";

export default function AccountDeletion() {
  return (
    <InfoPageLayout
      title="حذف الحساب والبيانات"
      documentTitle="حذف الحساب والبيانات"
      subtitle="إرشادات وسياسة حذف الحساب والبيانات الشخصية لتطبيق ديلمارت (DilMart) وفق متطلبات متاجر التطبيقات."
      badge="حماية الخصوصية والأمان"
      lastUpdated={POLICY_METADATA.lastUpdated}
    >
      <div className="space-y-8" dir="rtl">
        {/* Intro */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-rose-600">
            <Trash2 className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">سياسة حذف الحساب والبيانات الشخصية</h2>
          </div>
          <p className="leading-relaxed text-slate-700 text-sm">
            تلتزم منصة <strong>ديلمارت (DilMart)</strong>، المشغلة لتطبيق المتسوق الرسمي لنظام أندرويد (معرف الحزمة:{" "}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs">
              com.dilmart.store
            </code>
            )، بتمكين جميع المتسوقين من ممارسة حقهم في حذف حساباتهم وبياناتهم الشخصية بكل سهولة وشفافية، وفق
            سياسات الأمان وحماية البيانات المعتمدة في متجر Google Play ومتجر Apple App Store.
          </p>
        </section>

        {/* Method 1: In-App Deletion */}
        <section className="space-y-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <Smartphone className="w-5 h-5 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-[#071A3D]">
              الطريقة الأولى: حذف الحساب مباشرة من داخل التطبيق
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            يمكنك تنفيذ حذف حسابك فورياً وبشكل ذاتي من خلال التطبيق باتباع الخطوات التالية:
          </p>
          <ol className="space-y-2.5 text-xs sm:text-sm text-slate-700 pr-4 list-decimal">
            <li>افتح تطبيق <strong>ديلمارت</strong> وسجل دخولك إلى الحساب المطلوب حذفه.</li>
            <li>انتقل إلى شاشة <strong>الملف الشخصي (الحساب)</strong> من الشريط السفلي.</li>
            <li>توجه إلى قسم <strong>أمان الحساب والجلسات</strong>.</li>
            <li>
              اضغط على خيار <span className="font-bold text-rose-600">"حذف الحساب"</span>.
            </li>
            <li>
              اقرأ الإقرار والتنبيهات الموضحة بعناية، ثم اضغط على زر{" "}
              <strong>"تأكيد حذف الحساب نهائياً"</strong>.
            </li>
          </ol>
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-2.5 text-xs text-blue-900">
            <CheckCircle2 className="w-4 h-4 text-[#1261D8] shrink-0 mt-0.5" />
            <span>
              يتم إنهاء الجلسات فورياً وإزالة الحساب من خوادم المصادقة المركزية وفك ارتباط سجلاتك خلال ثوانٍ معدودة.
            </span>
          </div>
        </section>

        {/* Method 2: Web & Direct Request Channel */}
        <section className="space-y-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600">
            <MessageCircle className="w-5 h-5 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-[#071A3D]">
              الطريقة الثانية: تقديم طلب حذف مباشر عبر الدعم المعتمد
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            إذا قمت بإلغاء تثبيت التطبيق مسبقاً أو تعذر عليك الدخول، يمكنك تقديم طلب حذف الحساب مباشرة إلى فريق الدعم
            الرسمي المعتمد لمنصة ديلمارت:
          </p>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">قناة التواصل والدعم المعتمدة:</p>
                <p className="text-sm font-bold text-slate-800" dir="ltr">
                  {storeConfig.phone}
                </p>
              </div>
              <a
                href={`https://wa.me/${storeConfig.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>مراسلة الدعم عبر واتساب</span>
              </a>
            </div>
            <p className="text-xs text-slate-600 border-t border-slate-200 pt-2">
              <strong>متطلبات التحقق:</strong> سيُطلب منك تزويد رقم الهاتف المسجل في ديلمارت، والتحقق من ملكيته عبر
              رمز تحقق مباشر لضمان عدم حذف أي حساب دون تفويض من صاحبه. يتم تنفيذ الطلب خلال 24 إلى 48 ساعة كحد أقصى.
            </p>
          </div>
        </section>

        {/* Data Types Grid: Deleted vs Retained */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Deleted Data */}
          <div className="p-5 rounded-2xl bg-white border border-rose-100 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm sm:text-base text-slate-900">البيانات التي تُحذف نهائياً</h3>
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-600 pr-2 list-disc list-inside leading-relaxed">
              <li>معرف الحساب وبيانات الاعتماد في خادم المصادقة.</li>
              <li>الاسم الكامل ورقم الهاتف الموثق.</li>
              <li>جميع العناوين المحفوظة ونقاط الاستلام المفضلة.</li>
              <li>بيانات سلة التسوق وقائمة المنتجات المفضلة.</li>
              <li>الإشعارات والتنبيهات المخصصة للمستخدم.</li>
              <li>مفاتيح الجلسات والتوكينات النشطة على كافة الأجهزة.</li>
            </ul>
          </div>

          {/* Retained / Anonymized Data */}
          <div className="p-5 rounded-2xl bg-white border border-amber-100 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <FileText className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm sm:text-base text-slate-900">البيانات المحتفظ بها للأغراض القانونية</h3>
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-600 pr-2 list-disc list-inside leading-relaxed">
              <li>
                <strong>سجلات المعاملات والطلبات التاريخية:</strong> نحتفظ بالبيانات المالية والمحاسبية (المبالغ،
                المنتجات، وتواريخ الفواتير) للامتثال للمتطلبات الضريبية والمالية.
              </li>
              <li>
                <strong>سجلات تسوية المستحقات:</strong> بيانات تسوية المبالغ بين المتاجر وشركات التوصيل.
              </li>
              <li>
                <strong>إخفاء الهوية الكامل (Anonymization):</strong> يتم فك ارتباط جميع هذه السجلات برقم هاتفك أو
                معرفك وحذف الاسم نهائياً، لتصبح بيانات إحصائية مجهولة المصدر لا يمكن ربطها بك.
              </li>
            </ul>
          </div>
        </div>

        {/* Preconditions & Safeguards */}
        <section className="space-y-3 p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="font-bold text-sm sm:text-base text-[#071A3D]">شروط وضوابط تنفيذ الحذف</h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            لضمان حقوق الأطراف وحماية المعاملات التجارية، يُشترط لتنفيذ حذف الحساب:
          </p>
          <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 pr-4 list-disc">
            <li>عدم وجود أي طلبات حالية قيد التجهيز أو الشحن أو التوصيل.</li>
            <li>عدم وجود طلبات استرجاع أو نزاعات استرداد مالي قيد المراجعة النشطة.</li>
            <li>عدم وجود طلبات إلغاء معلقة تتطلب مطابقة مصرفية أو معالجة مع المتجر.</li>
          </ul>
          <p className="text-xs text-slate-500 pt-1">
            في حال وجود طلب نشط، يرجى الانتظار حتى اكتمال تسليم الطلب أو إغلاقه قبل إجراء الحذف.
          </p>
        </section>

        {/* Support & Contact Footer */}
        <section className="pt-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p>
            رابط صفحة الحذف الرسمية:{" "}
            <span dir="ltr" className="font-mono text-slate-700 font-bold">
              https://dilmart.store/account-deletion
            </span>
          </p>
          <p>
            لأي مساعدة إضافية، يسعدنا تواصلك مع خدمة عملاء ديلمارت عبر واتساب أو الهاتف:{" "}
            <span dir="ltr" className="font-bold text-slate-700">
              {storeConfig.phone}
            </span>
            .
          </p>
        </section>
      </div>
    </InfoPageLayout>
  );
}
