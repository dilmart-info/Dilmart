import { Link } from "react-router-dom";
import { storeConfig } from "@/config/store";
import { BrandMark } from "@/components/BrandMark";
import {
  Facebook,
  Headphones,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { isNative } from "@/lib/capacitor";

const Footer = () => {
  const native = isNative();

  return (
    <footer className="mt-16 md:mt-24 bg-navy text-white border-t-4 border-primary">
      {/* ── Value Propositions Bar ───────────────────────────────────────── */}
      <div className="border-b border-white/10 bg-navy-light/60 py-8">
        <div className="container" dir="rtl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-right">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-accent">
                <Truck size={24} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-tajawal text-sm font-extrabold text-white">توصيل سريع</h4>
                <p className="text-[11px] text-blue-200/80 mt-0.5">تغطية شاملة لكافة محافظات العراق</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-accent">
                <ShieldCheck size={24} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-tajawal text-sm font-extrabold text-white">منتجات أصلية 100%</h4>
                <p className="text-[11px] text-blue-200/80 mt-0.5">من كبرى العلامات والمتاجر المعتمدة</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-accent">
                <RotateCcw size={24} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-tajawal text-sm font-extrabold text-white">دفع عند الاستلام</h4>
                <p className="text-[11px] text-blue-200/80 mt-0.5">تسوق براحة وأمان مع فحص الطلب</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-accent">
                <Headphones size={24} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-tajawal text-sm font-extrabold text-white">خدمة عملاء مباشرة</h4>
                <p className="text-[11px] text-blue-200/80 mt-0.5">دعم متواصل للإجابة على استفساراتكم</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Footer Content ─────────────────────────────────────────── */}
      <div className="container py-12 md:py-16" dir="rtl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
          {/* Brand & About */}
          <div className="space-y-4 md:col-span-1">
            <BrandMark variant="footer" theme="navy" />
            <p className="text-xs sm:text-sm text-blue-100/80 leading-relaxed max-w-sm">
              ديلمارت هي المنصة العراقية الرائدة للتسوق الإلكتروني الشامل، نجمع أفضل المتاجر والمنتجات لتجربة تسوق موثوقة وسريعة.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <a
                href={storeConfig.social.instagram}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-primary text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram size={18} />
              </a>
              <a
                href={storeConfig.social.facebook}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-primary text-white transition-colors"
                aria-label="Facebook"
              >
                <Facebook size={18} />
              </a>
              <a
                href={`https://wa.me/${storeConfig.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-emerald-600 text-white transition-colors"
                aria-label="WhatsApp"
              >
                <MessageCircle size={18} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-tajawal text-base font-extrabold text-white mb-4 border-r-2 border-accent pr-2.5">
              التسوق في ديلمارت
            </h3>
            <div className="space-y-2.5 text-xs sm:text-sm text-blue-100/80">
              <Link to="/products" className="block hover:text-accent transition-colors">
                جميع المنتجات
              </Link>
              <Link to="/offers" className="block hover:text-accent transition-colors">
                عروض وتخفيضات اليوم 🔥
              </Link>
              <Link to="/stores" className="block hover:text-accent transition-colors">
                دليل المتاجر المعتمدة
              </Link>
              <Link to="/brands" className="block hover:text-accent transition-colors">
                العلامات التجارية
              </Link>
              <Link to="/products?sort=newest" className="block hover:text-accent transition-colors">
                وصل حديثاً
              </Link>
            </div>
          </div>

          {/* Customer Service & Policies */}
          <div>
            <h3 className="font-tajawal text-base font-extrabold text-white mb-4 border-r-2 border-accent pr-2.5">
              خدمة العملاء
            </h3>
            <div className="space-y-2.5 text-xs sm:text-sm text-blue-100/80">
              <Link to="/track-order" className="block hover:text-accent transition-colors">
                تتبع حالة الطلب
              </Link>
              <Link to="/support" className="block hover:text-accent transition-colors">
                مركز المساعدة والدعم
              </Link>
              <Link to="/privacy" className="block hover:text-accent transition-colors">
                الشروط وسياسة الخصوصية
              </Link>
              {!native && (
                <>
                  <Link to="/merchant/register" className="block text-accent font-bold hover:underline">
                    انضم كتاجر وبع منتجاتك 🚀
                  </Link>
                  <Link to="/merchant/login" className="block hover:text-accent transition-colors">
                    بوابة دخول التجار
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-tajawal text-base font-extrabold text-white mb-4 border-r-2 border-accent pr-2.5">
              تواصل معنا
            </h3>
            <div className="space-y-3 text-xs sm:text-sm text-blue-100/80">
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-accent shrink-0" />
                <span dir="ltr" className="font-manrope font-bold text-white">
                  {storeConfig.phone}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <MessageCircle size={16} className="text-accent shrink-0" />
                <span className="text-white">واتساب الدعم المباشر</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-accent shrink-0" />
                <span>بغداد، العراق — توصيل لجميع المحافظات</span>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-blue-200/60 font-medium">
          <p>© {new Date().getFullYear()} ديلمارت (DilMart). جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
