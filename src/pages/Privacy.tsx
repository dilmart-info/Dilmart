import InfoPageLayout from "@/components/info/InfoPageLayout";
import { storeConfig } from "@/config/store";
import { POLICY_METADATA } from "@/content/customer-policies";
import { ShieldCheck, Database, Lock, Users, RefreshCw, Mail } from "lucide-react";

export default function Privacy() {
  return (
    <InfoPageLayout
      title="سياسة الخصوصية"
      documentTitle="سياسة الخصوصية"
      subtitle="نوضح في هذه الوثيقة المبادئ العامة للتعامل مع البيانات وحمايتها أثناء استخدام منصة ديلمارت."
      badge="الخصوصية والأمان"
      lastUpdated={POLICY_METADATA.lastUpdated}
    >
      <div className="space-y-8">
        {/* Intro */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">المقدمة ونطاق السياسة</h2>
          </div>
          <p className="leading-relaxed text-slate-700">
            توضح سياسة الخصوصية هذه كيفية جمع واستخدام وحماية البيانات الأساسية المرتبطة باستخدام
            منصة <strong>ديلمارت (DilMart)</strong>. تسري هذه السياسة على المتسوقين والزوار أثناء تصفح
            المنتجات، إتمام الطلبات، أو إدارة الحسابات والعناوين.
          </p>
        </section>

        {/* Data Categories */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <Database className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">البيانات التي نقوم بمعالجتها</h2>
          </div>
          <p className="text-slate-700">
            قد تشمل البيانات التي نعالجها لتشغيل الخدمة الفئات التالية:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <h3 className="font-bold text-xs sm:text-sm text-[#071A3D]">بيانات الحساب والتواصل</h3>
              <p className="text-xs text-slate-600">
                الاسم، رقم الهاتف، والبريد الإلكتروني المعتمد عند التسجيل أو تحديث الملف الشخصي.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <h3 className="font-bold text-xs sm:text-sm text-[#071A3D]">بيانات التوصيل والعناوين</h3>
              <p className="text-xs text-slate-600">
                المحافظة، المنطقة، أقرب نقطة دالة، رقم هاتف المستلم، وملاحظات التوصيل اللازمة لتسليم الطلب.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <h3 className="font-bold text-xs sm:text-sm text-[#071A3D]">بيانات الطلبات والمعاملات</h3>
              <p className="text-xs text-slate-600">
                سجل المنتجات المشتراة، تفاصيل الأسعار، حالة الدفع والتوصيل، وطلبات الإلغاء والإرجاع.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <h3 className="font-bold text-xs sm:text-sm text-[#071A3D]">البيانات التقنية والأمان</h3>
              <p className="text-xs text-slate-600">
                بيانات التحقق والجلسة والمعلومات التقنية اللازمة لتأمين تسجيل الدخول وتشغيل الخدمة.
              </p>
            </div>
          </div>
        </section>

        {/* How Data Is Used */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <RefreshCw className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">أغراض استخدام البيانات</h2>
          </div>
          <ul className="space-y-2 list-disc list-inside text-slate-700 text-xs sm:text-sm pr-2">
            <li>معالجة طلبات الشراء وتنسيق شحنها وتوصيلها إلى العنوان المحدد.</li>
            <li>تحديث العميل بحالة تجهيز الشحنة ومسار التوصيل والتواصل عند الحاجة.</li>
            <li>تمكين العميل من إدارة ملفه الشخصي وعناوينه المحفوظة وسجل طلباته السابقة.</li>
            <li>حماية المنصة من محاولات الدخول غير المصرح بها وتعزيز أمان الحسابات.</li>
          </ul>
        </section>

        {/* Service Providers */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <Users className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">مزودو الخدمات والتشغيل</h2>
          </div>
          <p className="leading-relaxed text-slate-700 text-xs sm:text-sm">
            قد تتم معالجة بعض البيانات بواسطة مزودي الخدمات الضروريين لتشغيل الخدمة، مثل خدمات الاستضافة
            والبنية التحتية، وخدمات التوصيل والنقل، وقنوات الرسائل والاتصالات، وذلك وفق الحاجة التشغيلية
            المباشرة لتقديم الخدمة وإنجاز الطلبات.
          </p>
        </section>

        {/* Protection & Security */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <Lock className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">أمان وحماية المعلومات</h2>
          </div>
          <p className="leading-relaxed text-slate-700 text-xs sm:text-sm">
            نطبق تدابير وضوابط فنية وتنظيمية مناسبة للحفاظ على سرية وسلامة البيانات وحمايتها من الوصول
            غير المصرح به أو التعديل أو الفقدان غير المقصود.
          </p>
        </section>

        {/* Payments & Financial Info */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <Lock className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">المدفوعات والبيانات المالية</h2>
          </div>
          <p className="leading-relaxed text-slate-700 text-xs sm:text-sm">
            تعتمد منصة ديلمارت وسيلة <strong>الدفع نقداً عند الاستلام (Cash on Delivery)</strong> كوسيلة دفع حصرية لطلبات
            المتسوقين. لذلك، <strong>لا نقوم بجمع أو تخزين أرقام البطاقات الائتمانية</strong> أو الحسابات المصرفية الخاصة بالمتسوقين،
            ولا تتم معالجة أي بيانات بطاقات دفع داخل التطبيق أو مشاركتها مع بوابات دفع إلكترونية.
          </p>
        </section>

        {/* Advertising & Tracking Disclosures */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">الإعلانات ومعرفات التتبع</h2>
          </div>
          <p className="leading-relaxed text-slate-700 text-xs sm:text-sm">
            تطبيق ديلمارت <strong>خالٍ تماماً من الشبكات الإعلانية للطرف الثالث</strong>. لا نقوم بالوصول إلى معرف الإعلانات
            (Advertising ID / AAID / IDFA)، ولا نشارك أي بيانات لأغراض الإعلانات الموجهة أو التتبع السلوكي عبر التطبيقات
            والمواقع الأخرى. كافة التحليلات المستخدمة داخل المنصة هي تحليلات تشغيلية داخلية أولى (First-party) لتحسين تجربة
            التصفح وسرعة الأداء فقط.
          </p>
        </section>

        {/* User Rights & Controls */}
        <section className="space-y-3 p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <h2 className="font-bold text-sm sm:text-base text-[#071A3D]">إدارة البيانات وحقوق المستخدم</h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            يمكن للمستخدم إدارة البيانات التي تتيح المنصة تعديلها، مثل الاسم والعناوين المحفوظة، بينما
            تتطلب بيانات الهوية مثل رقم الهاتف خطوات تحقق مباشرة لضمان الأمان.
          </p>
        </section>

        {/* Account Deletion Section */}
        <section className="space-y-3 p-5 rounded-2xl bg-rose-50/60 border border-rose-200">
          <div className="flex items-center gap-2 text-rose-600">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <h2 className="font-bold text-sm sm:text-base text-slate-900">حذف الحساب والبيانات الشخصية</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            يحق لك في أي وقت طلب حذف حسابك وبياناتك الشخصية بشكل نهائي سواء من داخل التطبيق عبر صفحة الحساب، أو من خلال
            التواصل مع الدعم المعتمد. لمزيد من التفاصيل والاطلاع على سياسة الحذف والبيانات المحذوفة والمحتفظ بها:
          </p>
          <div className="pt-1">
            <a
              href="/account-deletion"
              className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-rose-800 underline underline-offset-4"
            >
              الانتقال إلى صفحة سياسة وإرشادات حذف الحساب الرسمية (account-deletion) &larr;
            </a>
          </div>
        </section>

        {/* Contact Info */}
        <section className="pt-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p>
            للتواصل بشأن سياسة الخصوصية: يمكنك التواصل مع فريق الدعم عبر الهاتف أو واتساب على الرقم{" "}
            <span dir="ltr" className="font-bold text-slate-700">{storeConfig.phone}</span>.
          </p>
        </section>
      </div>
    </InfoPageLayout>
  );
}
