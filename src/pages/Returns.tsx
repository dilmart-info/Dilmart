import { Link } from "react-router-dom";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import { POLICY_METADATA } from "@/content/customer-policies";
import { Button } from "@/components/ui/button";
import {
  RotateCcw,
  Ban,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Package,
  ArrowLeft,
  Clock,
} from "lucide-react";

export default function Returns() {
  return (
    <InfoPageLayout
      title="الإلغاء والإرجاع"
      documentTitle="الإلغاء والإرجاع"
      subtitle="إرشادات واضحة حول كيفية إلغاء الطلبات وتقديم ومتابعة طلبات الإرجاع المؤهلة."
      badge="خدمة العملاء والطلبات"
      lastUpdated={POLICY_METADATA.lastUpdated}
    >
      <div className="space-y-10">
        {/* Order Cancellation Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 text-[#1261D8]">
            <Ban className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">إلغاء الطلب قبل الاستلام</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            يمكن للمتسوق طلب إلغاء الطلب مباشرة عبر صفحة تفاصيل الطلب داخل لوحة{" "}
            <Link to="/my-account/orders" className="text-[#1261D8] font-bold underline">
              طلباتي
            </Link>
            . يعتمد قبول وتنفيذ الإلغاء على المرحلة الحالية للشحنة:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#1261D8] font-bold text-xs">
                <Clock className="w-4 h-4" />
                <span>المراحل المبكرة</span>
              </div>
              <p className="text-xs text-slate-600">
                قد يتم الإلغاء مباشرة إذا كان الطلب لا يزال مؤهلاً للإلغاء الفوري.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>أثناء التجهيز والتعبئة</span>
              </div>
              <p className="text-xs text-slate-600">
                قد ينتقل طلب الإلغاء إلى المراجعة بحسب حالة الطلب.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs">
                <Package className="w-4 h-4" />
                <span>بعد الشحن والتسليم</span>
              </div>
              <p className="text-xs text-slate-600">
                لا يمكن الإلغاء المباشر للشحنات المنطلقة؛ وتظهر خيارات الإرجاع بعد الاستلام إن كانت مؤهلة.
              </p>
            </div>
          </div>
        </section>

        {/* Return Requests Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 text-[#1261D8]">
            <RotateCcw className="w-5 h-5 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-[#071A3D]">تقديم طلب إرجاع لمنتج مستلم</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            إذا استلمت شحنتك وكان الطلب مؤهلاً لطلب الإرجاع، يمكنك البدء بالخطوات التالية من حسابك:
          </p>

          <ol className="space-y-3 pr-2 list-decimal list-inside text-xs sm:text-sm text-slate-700">
            <li className="leading-relaxed">
              افتح لوحة <strong>طلباتي</strong> واختر الطلب المستلم لعرض صفحته التفصيلية.
            </li>
            <li className="leading-relaxed">
              اضغط على خيار <strong>&quot;طلب إرجاع&quot;</strong> واكتب سبب الإرجاع والملاحظات التوضيحية بدقة.
            </li>
            <li className="leading-relaxed">
              يتولى النظام وفريق خدمة العملاء مراجعة الطلب وإشعارك بالنتيجة ومسار تسليم المرتجع.
            </li>
          </ol>
        </section>

        {/* General Guidelines & Return Criteria */}
        <section className="space-y-3 p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <h3 className="font-bold text-sm sm:text-base text-[#071A3D] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#1261D8]" />
            <span>ضوابط وأهلية طلبات الإرجاع</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            تحدد أهلية طلب الإرجاع وفق حالة الطلب وتاريخ التسليم والقواعد التشغيلية المطبقة في النظام
            وقت تقديم الطلب. قد يطلب فريق المراجعة معلومات إضافية عند الحاجة، وتظهر نتيجة الطلب داخل
            تفاصيل الطلب.
          </p>
        </section>

        {/* Return Status Tracking */}
        <section className="space-y-3">
          <h3 className="font-bold text-sm sm:text-base text-[#071A3D]">متابعة حالة طلب الإرجاع</h3>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            بمجرد تقديم طلب الإرجاع، يمكنك متابعة حالته في أي وقت من نفس صفحة تفاصيل الطلب (قيد المراجعة،
            تمت الموافقة، بانتظار استلام المنتج، أو مكتمل).
          </p>
        </section>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-200 flex items-center gap-3 flex-wrap">
          <Button asChild className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white font-bold text-xs sm:text-sm">
            <Link to="/my-account/orders" className="flex items-center gap-1.5">
              <Package className="w-4 h-4" />
              <span>الانتقال إلى طلباتي</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </Button>

          <Button asChild variant="outline" className="border-slate-300 text-slate-700 font-bold text-xs sm:text-sm">
            <Link to="/support" className="flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" />
              <span>مركز المساعدة</span>
            </Link>
          </Button>
        </div>
      </div>
    </InfoPageLayout>
  );
}
