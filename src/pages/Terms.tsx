import { Link } from "react-router-dom";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import { storeConfig } from "@/config/store";
import { POLICY_METADATA } from "@/content/customer-policies";
import { FileText, CheckSquare, AlertCircle, ShoppingCart, Truck, ShieldAlert } from "lucide-react";

export default function Terms() {
  return (
    <InfoPageLayout
      title="الشروط والأحكام"
      documentTitle="الشروط والأحكام"
      subtitle="شروط وضوابط استخدام منصة ديلمارت والتعامل مع الطلبات والخدمات المقدمة."
      badge="اتفاقية الاستخدام"
      lastUpdated={POLICY_METADATA.lastUpdated}
    >
      <div className="space-y-8">
        {/* General Terms */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <FileText className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">1. القبول ونطاق الاستخدام</h2>
          </div>
          <p className="leading-relaxed text-slate-700 text-xs sm:text-sm">
            باستخدامك لمنصة <strong>ديلمارت (DilMart)</strong> أو إتمام أي عملية شراء من خلالها، فإنك
            توافق على الالتزام بهذه الشروط والأحكام. تنظم هذه الوثيقة العلاقة بين المتسوق والمنصة
            والمتاجر المشاركة فيما يخص تصفح المنتجات والطلبات والتوصيل.
          </p>
        </section>

        {/* Account & Identity */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <CheckSquare className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">2. الحساب والبيانات المسجلة</h2>
          </div>
          <p className="text-slate-700 text-xs sm:text-sm">
            يلتزم المستخدم بتقديم معلومات صحيحة ودقيقة عند إنشاء الحساب أو إدخال عنوان التوصيل ورقم
            الهاتف. يتحمل صاحب الحساب مسؤولية الحفاظ على سرية وسائل الوصول لحسابه ومتابعة النشاط
            الصادر عنه.
          </p>
        </section>

        {/* Pricing, Availability & Authority */}
        <section className="space-y-3 p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold">3. الأسعار والتوفر وتأكيد الطلب</h2>
          </div>
          <div className="space-y-2 text-xs sm:text-sm text-amber-950/90 leading-relaxed">
            <p>
              تخضع المنتجات والأسعار والعروض المعروضة على المنصة للتحديث والتغيير وفق مخزون وسياسات
              المتاجر المشاركة.
            </p>
            <p>
              يُعتبر النظام الآلي للمنصة هو المرجع الحاكم في التحقق من توفر الكميات، صحة الأسعار،
              تطبيق الخصومات وقسائم الشراء، وأهلية التوصيل عند خطوة إتمام الطلب (Checkout). لا يُعد
              إضافة المنتج إلى السلة حجزاً نهائياً للمخزون حتى يتم تأكيد الطلب بنجاح.
            </p>
          </div>
        </section>

        {/* Order Placement & Checkout */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <ShoppingCart className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">4. تنفيذ وتأكيد الطلبات</h2>
          </div>
          <p className="leading-relaxed text-slate-700 text-xs sm:text-sm">
            عند تقديم طلبك، يتلقى النظام الطلب ويُرسل إشعاراً بتأكيد الاستلام. يحق للمنصة أو التاجر
            التحقق من بيانات الطلب والتواصل مع المستلم هاتفياً لتأكيد التفاصيل قبل بدء التجهيز والشحن.
          </p>
        </section>

        {/* Delivery & Payment */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <Truck className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">5. التوصيل والدفع</h2>
          </div>
          <ul className="space-y-2 list-disc list-inside text-slate-700 text-xs sm:text-sm pr-2">
            <li>
              تُحدد رسوم التوصيل وفق المحافظة والمنطقة المختارة وتظهر واضحة في ملخص الطلب قبل الدفع.
            </li>
            <li>
              في حال اختيار الدفع عند الاستلام (COD)، يلتزم المستلم بسداد القيمة الإجمالية المحددة في الفاتورة عند استلام الشحنة من مندوب التوصيل.
            </li>
            <li>
              تعتمد مواعيد التسليم التقديرية على سرعة تجهيز التاجر ومسار شركة التوصيل للمنطقة المحددة.
            </li>
          </ul>
        </section>

        {/* Cancellations & Returns */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[#1261D8]">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">6. الإلغاء والإرجاع</h2>
          </div>
          <p className="leading-relaxed text-slate-700 text-xs sm:text-sm">
            تخضع طلبات الإلغاء والإرجاع للضوابط المعتمدة في النظام وفق مرحلة الطلب وحالة المنتج.
            يمكن للمتسوق مراجعة الإرشادات التفصيلية عبر صفحة{" "}
            <Link to="/returns" className="text-[#1261D8] font-bold underline">
              سياسة الإلغاء والإرجاع
            </Link>
            .
          </p>
        </section>

        {/* Acceptable Use */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-[#071A3D]">7. الاستخدام المقبول</h2>
          <p className="leading-relaxed text-slate-700 text-xs sm:text-sm">
            يُحظر استخدام المنصة بأي شكل يهدف إلى الاحتيال أو تعطيل البنية التحتية أو إدخال بيانات وهمية
            أو طلبات غير جادة. تحتفظ المنصة بحق تعليق الحسابات أو رفض الطلبات المخالفة لهذه الضوابط.
          </p>
        </section>

        {/* Updates & Contact */}
        <section className="pt-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p>
            يجوز تحديث هذه الشروط عند الحاجة، ويسري التعديل من تاريخ نشره على هذه الصفحة.
          </p>
          <p>
            لأي استفسارات قانونية أو تشغيلية، يرجى التواصل عبر مركز المساعدة أو قنوات الدعم الرسمية.
          </p>
        </section>
      </div>
    </InfoPageLayout>
  );
}
