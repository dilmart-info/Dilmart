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
            تقتصر معالجة البيانات على الفئات الضرورية لتشغيل تجربة الشراء وتقديم الخدمة المطلوبة:
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
                رموز تأكيد تسجيل الدخول، مؤشرات حالة الجلسة، والبيانات التقنية اللازمة لاستقرار وحماية المنصة.
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

        {/* User Rights & Controls */}
        <section className="space-y-3 p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <h2 className="font-bold text-sm sm:text-base text-[#071A3D]">إدارة البيانات وحقوق المستخدم</h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            يمكن للمستخدم في أي وقت تعديل بياناته الشخصية وعناوينه المسجلة عبر صفحة الملف الشخصي ولوحة
            الحساب. لأي استفسارات أو طلبات متعلقة بخصوصية البيانات، يرجى التواصل عبر قنوات الدعم المعتمدة.
          </p>
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
