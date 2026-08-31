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
    <footer className="mt-14 md:mt-20 bg-navy text-white border-t-4 border-primary">
      {/* ── Value Propositions Bar ───────────────────────────────────────── */}
      <div className="border-b border-white/10 bg-navy-light/60 py-6">
        <div className="container" dir="rtl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-right">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-accent">
                <Truck size={22} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-tajawal text-sm font-extrabold text-white">توصيل موثوق</h4>
                <p className="text-[11px] text-blue-200/80 mt-0.5">شحن مباشر وسريع لباب المنزل</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-accent">
                <ShieldCheck size={22} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-tajawal text-sm font-extrabold text-white">منتجات مختارة</h4>
                <p className="text-[11px] text-blue-200/80 mt-0.5">من كبرى العلامات والمتاجر المعتمدة</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-accent">
                <RotateCcw size={22} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-tajawal text-sm font-extrabold text-white">دفع مرن</h4>
                <p className="text-[11px] text-blue-200/80 mt-0.5">فحص طلبك والدفع عند الاستلام</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-accent">
                <Headphones size={22} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className="font-tajawal text-sm font-extrabold text-white">دعم العملاء</h4>
                <p className="text-[11px] text-blue-200/80 mt-0.5">فريق متواصل لخدمتكم</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Footer Content ─────────────────────────────────────────── */}
      <div className="container py-10 md:py-14" dir="rtl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-8">
          {/* Brand & About */}
          <div className="space-y-3.5 md:col-span-1">
            <BrandMark variant="footer" theme="navy" />
            <p className="text-xs sm:text-sm text-blue-100/80 leading-relaxed max-w-sm">
              ديلمارت هي المنصة للتسوق الإلكتروني الشامل، تجمع أفضل المتاجر والمنتجات لتجربة تسوق موثوقة وسريعة.
            </p>
            <div className="flex items-center gap-2.5 pt-1">
              <a
                href={storeConfig.social.instagram}
                target="_blank"
                rel="noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-primary text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram size={16} />
              </a>
              <a
                href={storeConfig.social.facebook}
                target="_blank"
                rel="noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-primary text-white transition-colors"
                aria-label="Facebook"
              >
                <Facebook size={16} />
              </a>
              <a
                href={`https://wa.me/${storeConfig.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-emerald-600 text-white transition-colors"
                aria-label="WhatsApp"
              >
                <MessageCircle size={16} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-tajawal text-sm sm:text-base font-extrabold text-white mb-3 border-r-2 border-accent pr-2">
              التسوق في ديلمارت
            </h3>
            <div className="space-y-2 text-xs sm:text-sm text-blue-100/80">
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
            <h3 className="font-tajawal text-sm sm:text-base font-extrabold text-white mb-3 border-r-2 border-accent pr-2">
              خدمة العملاء
            </h3>
            <div className="space-y-2 text-xs sm:text-sm text-blue-100/80">
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
                    انضم كتاجر
                  </Link>
                  <Link to="/merchant/login" className="block hover:text-accent transition-colors">
                    تسجيل دخول التاجر
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-tajawal text-sm sm:text-base font-extrabold text-white mb-3 border-r-2 border-accent pr-2">
              تواصل معنا
            </h3>
            <div className="space-y-2.5 text-xs sm:text-sm text-blue-100/80">
              <div className="flex items-center gap-2.5">
                <Phone size={15} className="text-accent shrink-0" />
                <span dir="ltr" className="font-manrope font-bold text-white">
                  {storeConfig.phone}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <MessageCircle size={15} className="text-accent shrink-0" />
                <span className="text-white">واتساب الدعم المباشر</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin size={15} className="text-accent shrink-0" />
                <span>بغداد، العراق</span>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-10 border-t border-white/10 pt-5 text-center text-xs text-blue-200/60 font-medium">
          <p>© {new Date().getFullYear()} ديلمارت (DilMart). جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
