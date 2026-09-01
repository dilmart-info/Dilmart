import { Link } from "react-router-dom";
import InfoPageLayout from "@/components/info/InfoPageLayout";
import { storeConfig } from "@/config/store";
import { Button } from "@/components/ui/button";
import {
  Phone,
  MessageCircle,
  MapPin,
  Instagram,
  Facebook,
  HelpCircle,
  Package,
  ArrowLeft,
  Share2,
} from "lucide-react";

export default function Contact() {
  return (
    <InfoPageLayout
      title="تواصل معنا"
      documentTitle="تواصل معنا"
      subtitle="قنوات التواصل الرسمية والمباشرة مع فريق خدمة عملاء ديلمارت."
      badge="خدمة العملاء"
    >
      <div className="space-y-10">
        {/* Main Contact Channels Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Phone Call Card */}
          <div className="p-6 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#1261D8] flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm sm:text-base text-[#071A3D]">الاتصال الهاتفي</h2>
                <p className="text-xs text-slate-500">للاستفسارات والاتصال المباشر</p>
              </div>
            </div>
            <div className="pt-2">
              <a
                href={`tel:${storeConfig.phone.replace(/\s/g, "")}`}
                className="text-base sm:text-lg font-extrabold text-[#1261D8] hover:underline font-manrope block"
                dir="ltr"
                aria-label={`اتصال هاتفي على الرقم ${storeConfig.phone}`}
              >
                {storeConfig.phone}
              </a>
            </div>
            <Button asChild size="sm" className="w-full bg-[#1261D8] hover:bg-[#0D4EB0] text-white text-xs font-bold">
              <a href={`tel:${storeConfig.phone.replace(/\s/g, "")}`}>
                <Phone className="w-3.5 h-3.5 ml-1.5" />
                اتصل الآن
              </a>
            </Button>
          </div>

          {/* WhatsApp Card */}
          <div className="p-6 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm sm:text-base text-[#071A3D]">واتساب خدمة العملاء</h2>
                <p className="text-xs text-slate-500">مراسلة فورية ومتابعة الطلبات</p>
              </div>
            </div>
            <div className="pt-2">
              <a
                href={`https://wa.me/${storeConfig.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="text-base sm:text-lg font-extrabold text-emerald-700 hover:underline font-manrope block"
                dir="ltr"
                aria-label={`مراسلة واتساب على الرقم ${storeConfig.whatsapp}`}
              >
                +{storeConfig.whatsapp}
              </a>
            </div>
            <Button
              asChild
              size="sm"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
            >
              <a href={`https://wa.me/${storeConfig.whatsapp}`} target="_blank" rel="noreferrer">
                <MessageCircle className="w-3.5 h-3.5 ml-1.5" />
                فتح محادثة واتساب
              </a>
            </Button>
          </div>
        </div>

        {/* Location Card */}
        <section className="p-5 rounded-2xl border border-slate-200/80 bg-white space-y-2">
          <div className="flex items-center gap-2.5 text-[#1261D8]">
            <MapPin className="w-5 h-5 shrink-0" />
            <h2 className="text-base font-bold text-[#071A3D]">الموقع</h2>
          </div>
          <p className="text-sm text-slate-700 font-medium pr-7">
            {storeConfig.address}
          </p>
        </section>

        {/* Social Links Section */}
        <section className="space-y-4 p-5 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2.5 text-[#1261D8]">
            <Share2 className="w-5 h-5 shrink-0" />
            <h2 className="text-base font-bold text-[#071A3D]">قنوات التواصل الاجتماعي الرسمية</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            تابع حسابات ديلمارت الرسمية للاطلاع على أحدث المنتجات والتحديثات:
          </p>
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <a
              href={storeConfig.social.instagram}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-pink-300 hover:text-pink-600 text-slate-700 text-xs font-bold flex items-center gap-2 transition-all shadow-xs"
              aria-label="حساب ديلمارت على إنستغرام"
            >
              <Instagram className="w-4 h-4 text-pink-500" />
              <span>Instagram</span>
            </a>

            <a
              href={storeConfig.social.facebook}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-700 text-xs font-bold flex items-center gap-2 transition-all shadow-xs"
              aria-label="صفحة ديلمارت على فيسبوك"
            >
              <Facebook className="w-4 h-4 text-blue-600" />
              <span>Facebook</span>
            </a>

            {storeConfig.social.tiktok && (
              <a
                href={storeConfig.social.tiktok}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-400 hover:text-slate-900 text-slate-700 text-xs font-bold flex items-center gap-2 transition-all shadow-xs"
                aria-label="حساب ديلمارت على تيك توك"
              >
                <span>TikTok</span>
              </a>
            )}
          </div>
        </section>

        {/* Self-service Shortcuts */}
        <section className="space-y-3 pt-2">
          <h2 className="text-sm font-bold text-slate-500">خدمات سريعة ومساعدة ذاتية</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              to="/track-order"
              className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-[#1261D8]" />
                <span className="text-xs sm:text-sm font-bold text-slate-800">تتبع حالة شحنتك مباشرة</span>
              </div>
              <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
            </Link>

            <Link
              to="/support"
              className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4 text-[#1261D8]" />
                <span className="text-xs sm:text-sm font-bold text-slate-800">مركز المساعدة والأسئلة الشائعة</span>
              </div>
              <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
            </Link>
          </div>
        </section>
      </div>
    </InfoPageLayout>
  );
}
