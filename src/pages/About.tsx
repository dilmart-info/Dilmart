import { Link } from "react-router-dom";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import { storeConfig } from "@/config/store";
import { Button } from "@/components/ui/button";
import {
  ShoppingBag,
  Store,
  Layers,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
  Truck,
} from "lucide-react";

export default function About() {
  return (
    <InfoPageLayout
      title="عن ديلمارت"
      documentTitle="عن ديلمارت"
      subtitle="سوق إلكتروني متكامل يربط المتسوقين بالمتاجر والمنتجات عبر تجربة تسوق واحدة وموثوقة."
      badge="منصة التسوق"
    >
      <div className="space-y-10">
        {/* Intro Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 text-[#1261D8]">
            <Layers className="w-5 h-5 shrink-0" />
            <h2 className="text-xl sm:text-2xl font-bold text-[#071A3D]">ما هو ديلمارت؟</h2>
          </div>
          <p className="leading-relaxed text-slate-700">
            <strong>ديلمارت (DilMart)</strong> هي منصة تسوق إلكتروني واسعة صُممت لتسهيل تجربة الشراء
            اليومية في العراق، حيث تجمع تشكيلة متنوعة من المنتجات والمتاجر في مكان واحد. نهدف إلى توفير
            بيئة تسوق واضحة ومباشرة تتيح للمتسوق استكشاف ما يحتاجه بسهولة ومتابعة طلباته بكل شفافية.
          </p>
          <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl text-xs sm:text-sm text-[#071A3D] font-bold flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#FF8A00] shrink-0" />
            <span>شعارنا الدائم: <strong>{storeConfig.taglineAr}</strong></span>
          </div>
        </section>

        {/* What We Provide */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 text-[#1261D8]">
            <ShoppingBag className="w-5 h-5 shrink-0" />
            <h2 className="text-xl sm:text-2xl font-bold text-[#071A3D]">ماذا نوفر للمتسوق؟</h2>
          </div>
          <p className="text-slate-700">
            نركز على تقديم الميزات الأساسية التي تضمن راحة المتسوق ووضوح المعاملة من البداية حتى الاستلام:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center gap-2 text-[#071A3D] font-bold text-sm">
                <Store className="w-4 h-4 text-[#1261D8]" />
                <span>دليل وتنوع المتاجر</span>
              </div>
              <p className="text-xs text-slate-600">
                إمكانية تصفح المتاجر المستقلة والتعرف على منتجاتها وتقييماتها داخل المنصة.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center gap-2 text-[#071A3D] font-bold text-sm">
                <Truck className="w-4 h-4 text-[#1261D8]" />
                <span>خيارات التوصيل المنظم</span>
              </div>
              <p className="text-xs text-slate-600">
                حساب تفاصيل ورسوم التوصيل بوضوح بحسب المحافظة وموقع العنوان المعتمد.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center gap-2 text-[#071A3D] font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-[#1261D8]" />
                <span>إدارة الحساب والعناوين</span>
              </div>
              <p className="text-xs text-slate-600">
                حفظ عناوين التوصيل المتعددة ومتابعة مسار الطلبات السابقة وسجل الشراء بسهولة.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center gap-2 text-[#071A3D] font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-[#1261D8]" />
                <span>تتبع شفاف ومباشر</span>
              </div>
              <p className="text-xs text-slate-600">
                تتبع حالة تجهيز وشحن الطلبات عبر رقم الطلب مع إمكانية إدارة طلبات الإلغاء والإرجاع المؤهلة.
              </p>
            </div>
          </div>
        </section>

        {/* Shopping Process */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 text-[#1261D8]">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <h2 className="text-xl sm:text-2xl font-bold text-[#071A3D]">كيف تعمل تجربة التسوق؟</h2>
          </div>
          <ol className="space-y-3 pr-2 list-decimal list-inside text-slate-700 text-sm sm:text-base">
            <li className="leading-relaxed">
              <strong>استعراض المنتجات والمتاجر:</strong> ابحث عن المنتجات عبر التصنيفات أو العلامات التجارية أو المتاجر المتاحة.
            </li>
            <li className="leading-relaxed">
              <strong>الإضافة إلى السلة:</strong> اختر الكمية والخيارات المناسبة وأضفها إلى سلة التسوق.
            </li>
            <li className="leading-relaxed">
              <strong>تحديد العنوان وإتمام الطلب:</strong> حدد المحافظة والمنطقة ورقم الهاتف لتظهر لك خيارات التوصيل والدفع المعتمدة.
            </li>
            <li className="leading-relaxed">
              <strong>المتابعة والاستلام:</strong> تابع مسار شحنتك حتى استلامها، مع إمكانية مراجعة التفاصيل عبر صفحة تتبع الطلب أو لوحة الحساب.
            </li>
          </ol>
        </section>

        {/* Trust & Principles */}
        <section className="space-y-4 p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <h3 className="font-bold text-base text-[#071A3D]">التزامنا بالوضوح والموثوقية</h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            نحرص في ديلمارت على أن تكون تفاصيل الأسعار، التوفر، ورسوم التوصيل واضحة للمتسوق قبل تأكيد
            الطلب. في حال وجود أي استفسار أو حاجة للمساعدة، يوفر مركز المساعدة وفريق خدمة العملاء
            الدعم اللازم لمتابعة احتياجاتكم.
          </p>
        </section>

        {/* Actions */}
        <div className="pt-4 border-t border-slate-200 flex items-center gap-3 flex-wrap">
          <Button asChild className="bg-[#1261D8] hover:bg-[#0D4EB0] text-white font-bold text-sm shadow-sm">
            <Link to="/products" className="flex items-center gap-2">
              <span>تصفح جميع المنتجات</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-slate-300 text-slate-700 font-bold text-sm">
            <Link to="/stores">دليل المتاجر</Link>
          </Button>
          <Button asChild variant="ghost" className="text-[#1261D8] font-bold text-sm">
            <Link to="/support">مركز المساعدة</Link>
          </Button>
        </div>
      </div>
    </InfoPageLayout>
  );
}
