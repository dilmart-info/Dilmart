import { useState } from "react";
import { Link } from "react-router-dom";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import { storeConfig } from "@/config/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Package,
  Truck,
  RotateCcw,
  User,
  CreditCard,
  Phone,
  MessageCircle,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ArrowLeft,
  MapPin,
} from "lucide-react";

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string | React.ReactNode;
}

const FAQS: FAQItem[] = [
  {
    id: "track-order",
    category: "orders",
    question: "كيف أتتبع مسار طلبي؟",
    answer: (
      <div className="space-y-2">
        <p>
          يمكنك تتبع حالة طلبك في أي وقت عبر صفحة{" "}
          <Link to="/track-order" className="text-[#1261D8] font-bold underline">
            تتبع الطلب
          </Link>{" "}
          باستخدام رقم الطلب ورقم الهاتف المسجل.
        </p>
        <p>
          إذا كنت مسجلاً دخولك، يمكنك أيضاً الدخول إلى{" "}
          <Link to="/my-account/orders" className="text-[#1261D8] font-bold underline">
            لوحة طلباتي
          </Link>{" "}
          لمشاهدة التفاصيل الكاملة ومسار الشحنة.
        </p>
      </div>
    ),
  },
  {
    id: "cancel-order",
    category: "orders",
    question: "كيف أقوم بإلغاء طلبي؟",
    answer: (
      <div className="space-y-2">
        <p>
          لإلغاء الطلب، انتقل إلى صفحة تفاصيل الطلب من خلال{" "}
          <Link to="/my-account/orders" className="text-[#1261D8] font-bold underline">
            طلباتي
          </Link>
          .
        </p>
        <p>
          يعالج النظام طلب الإلغاء وفق مرحلة الطلب الحالية:
        </p>
        <ul className="list-disc list-inside text-xs space-y-1 text-slate-600 pr-2">
          <li><strong>في المراحل الأولى:</strong> يتم الإلغاء مباشرة وإعادة المنتجات للمخزون.</li>
          <li><strong>أثناء التجهيز:</strong> يُرفع طلب الإلغاء لمراجعة الإدارة والتاجر قبل تأكيده.</li>
          <li><strong>بعد الشحن:</strong> لا يمكن الإلغاء المباشر، وتظهر إمكانية تقديم طلب إرجاع عند استلام الشحنة إن كانت مؤهلة.</li>
        </ul>
      </div>
    ),
  },
  {
    id: "return-request",
    category: "returns",
    question: "كيف أقدم طلب إرجاع لمنتج تم استلامه؟",
    answer: (
      <div className="space-y-2">
        <p>
          بالنسبة للطلبات المستلمة والمؤهلة للإرجاع، يمكنك فتح صفحة تفاصيل الطلب والضغط على زر{" "}
          <strong>&quot;طلب إرجاع&quot;</strong> مع ذكر سبب الإرجاع.
        </p>
        <p>
          يحدد النظام أهلية تقديم طلب الإرجاع وفق حالة الطلب والقواعد المطبقة وقت الطلب.
          يمكنك متابعة حالة طلب الإرجاع مباشرة من نفس صفحة تفاصيل الطلب.
        </p>
      </div>
    ),
  },
  {
    id: "shipping-fees",
    category: "delivery",
    question: "كيف تُحتسب رسوم ومدة التوصيل؟",
    answer: (
      <div className="space-y-2">
        <p>
          تُحتسب رسوم التوصيل بحسب المحافظة المختارة وعنوان المستلم، وتظهر القيمة الإجمالية للتوصيل
          بشكل واضح أثناء صفحة إتمام الطلب (Checkout) قبل التأكيد النهائي.
        </p>
        <p>
          تعتمد مدة التوصيل على موقع التسليم وتجهيز الشحنة لدى التاجر، ويمكنك متابعة تحديثات حالة
          الطلب والتوصيل المتاحة عبر تتبع الطلب.
        </p>
      </div>
    ),
  },
  {
    id: "address-management",
    category: "account",
    question: "كيف يمكنني إدارة أو تعديل عناوين التوصيل؟",
    answer: (
      <p>
        يمكن للمستخدمين المسجلين إضافة وتعديل وتعيين العناوين الافتراضية بسهولة عبر صفحة{" "}
        <Link to="/my-account/addresses" className="text-[#1261D8] font-bold underline">
          إدارة العناوين
        </Link>
        . يتم حفظ العنوان مع المحافظة والمنطقة وأقرب نقطة دالة لتسهيل وصول المندوب.
      </p>
    ),
  },
  {
    id: "payment-methods",
    category: "payment",
    question: "ما هي طرق الدفع المعتمدة؟",
    answer: (
      <p>
        طريقة الدفع الحالية: <strong>الدفع عند الاستلام</strong>.
      </p>
    ),
  },
  {
    id: "phone-verification",
    category: "account",
    question: "كيف أقوم بتوثيق أو تحديث رقم هاتفي؟",
    answer: (
      <p>
        يمكنك إدارة أمان الهاتف وتوثيقه عبر رمز التأكيد من خلال صفحة{" "}
        <Link to="/profile/security/phone" className="text-[#1261D8] font-bold underline">
          أمان وتوثيق الهاتف
        </Link>{" "}
        المتاحة داخل لوحة الحساب.
      </p>
    ),
  },
];

const CATEGORIES = [
  { id: "all", label: "جميع المواضيع", icon: HelpCircle },
  { id: "orders", label: "الطلبات والمتابعة", icon: Package },
  { id: "delivery", label: "التوصيل والشحن", icon: Truck },
  { id: "returns", label: "الإلغاء والإرجاع", icon: RotateCcw },
  { id: "account", label: "الحساب والعناوين", icon: User },
  { id: "payment", label: "الدفع والأسعار", icon: CreditCard },
];

export default function Support() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [openFaqId, setOpenFaqId] = useState<string | null>("track-order");

  const filteredFaqs = FAQS.filter((faq) => {
    const matchesCategory = selectedCategory === "all" || faq.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === "" ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (typeof faq.answer === "string" && faq.answer.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <InfoPageLayout
      title="مركز المساعدة والدعم"
      documentTitle="مركز المساعدة"
      subtitle="إجابات على الأسئلة الشائعة، إرشادات الطلب والتتبع، وقنوات التواصل المباشر مع خدمة العملاء."
      badge="خدمة العملاء"
    >
      <div className="space-y-10">
        {/* Quick Action Cards (Top Utility Layer) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/track-order"
            className="p-5 rounded-2xl border border-blue-200/80 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300 transition-all flex items-start gap-3.5 group shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-[#1261D8] text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Package className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="font-bold text-sm sm:text-base text-[#071A3D] flex items-center gap-1">
                <span>تتبع حالة طلبك</span>
                <ArrowLeft className="w-3.5 h-3.5 text-[#1261D8] group-hover:-translate-x-1 transition-transform" />
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                أدخل رقم الطلب ورقم الهاتف للاستعلام الفوري عن مسار وتفاصيل شحنتك.
              </p>
            </div>
          </Link>

          <Link
            to="/my-account/orders"
            className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 hover:bg-slate-100/80 hover:border-slate-300 transition-all flex items-start gap-3.5 group shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-[#071A3D] text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <User className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="font-bold text-sm sm:text-base text-[#071A3D] flex items-center gap-1">
                <span>سجل طلبات الحساب</span>
                <ArrowLeft className="w-3.5 h-3.5 text-slate-500 group-hover:-translate-x-1 transition-transform" />
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                استعرض جميع الطلبات السابقة، قدم طلبات الإلغاء أو الإرجاع، أو أعد الطلب بنقرة واحدة.
              </p>
            </div>
          </Link>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في مواضيع المساعدة والأسئلة الشائعة..."
            className="pr-10 h-11 text-sm bg-slate-50 border-slate-200 focus:bg-white rounded-xl"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-colors ${
                  isSelected
                    ? "bg-[#1261D8] text-white shadow-sm"
                    : "bg-slate-100/80 text-slate-700 hover:bg-slate-200/80 border border-slate-200/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* FAQ Accordion List */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-[#071A3D]">الأسئلة الأكثر شيوعاً</h2>
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-xs text-slate-500 mb-2">لم نجد نتائج تطابق بحثك</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}
                className="text-xs text-[#1261D8]"
              >
                عرض جميع الأسئلة
              </Button>
            </div>
          ) : (
            filteredFaqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs transition-colors"
                >
                  <button
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    className="w-full p-4 text-right flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span className="font-bold text-sm text-[#071A3D]">{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-[#1261D8]" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-2 border-t border-slate-100 text-xs sm:text-sm text-slate-600 bg-slate-50/40 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Direct Contact Channels */}
        <section className="p-6 rounded-2xl bg-gradient-to-r from-blue-50/80 to-slate-50 border border-blue-100 space-y-4">
          <div className="space-y-1">
            <h2 className="font-bold text-base text-[#071A3D]">لم تجد إجابة لاستفسارك؟</h2>
            <p className="text-xs text-slate-600">
              فريق دعم ديلمارت جاهز للإجابة على استفساراتكم ومتابعة طلباتكم عبر القنوات التالية:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <a
              href={`https://wa.me/${storeConfig.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-xs transition-all flex items-center gap-3 text-right group"
              aria-label="تواصل عبر واتساب"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-xs sm:text-sm text-slate-900 block">واتساب خدمة العملاء</span>
                <span className="text-[11px] text-slate-500 font-manrope" dir="ltr">
                  +{storeConfig.whatsapp}
                </span>
              </div>
            </a>

            <a
              href={`tel:${storeConfig.phone.replace(/\s/g, "")}`}
              className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-xs transition-all flex items-center gap-3 text-right group"
              aria-label="اتصال هاتفي بخدمة العملاء"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#1261D8] flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-xs sm:text-sm text-slate-900 block">الاتصال الهاتفي</span>
                <span className="text-[11px] text-slate-500 font-manrope" dir="ltr">
                  {storeConfig.phone}
                </span>
              </div>
            </a>
          </div>

          <div className="pt-2 text-left">
            <Link
              to="/contact"
              className="text-xs font-bold text-[#1261D8] hover:underline inline-flex items-center gap-1"
            >
              <span>المزيد من معلومات التواصل</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </InfoPageLayout>
  );
}
