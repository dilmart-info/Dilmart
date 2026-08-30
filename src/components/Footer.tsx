import { Link } from "react-router-dom";
import { storeConfig } from "@/config/store";
import { BrandMark } from "@/components/BrandMark";
import { Facebook, Instagram, MapPin, MessageCircle, Phone } from "lucide-react";
import { isNative } from "@/lib/capacitor";

const Footer = () => {
  const native = isNative();

  return (
    <footer className="mt-20 border-t border-DilMart-store-gold/15 bg-[hsl(0_0%_3%)] text-foreground">
      <div className="container py-14 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-10">
          <div className="space-y-5">
            <BrandMark variant="footer" />
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              {storeConfig.taglineAr}. منتجات مختارة للعناية الذاتية الفاخرة والحلاقة الاحترافية — مع تجربة شراء راقية وتوصيل موثوق داخل العراق.
            </p>
            <div className="flex gap-5 pt-1">
              <a
                href={storeConfig.social.facebook}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-DilMart-store-gold transition-colors"
                aria-label="Facebook"
              >
                <Facebook size={20} strokeWidth={1.5} />
              </a>
              <a
                href={storeConfig.social.instagram}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-DilMart-store-gold transition-colors"
                aria-label="Instagram"
              >
                <Instagram size={20} strokeWidth={1.5} />
              </a>
              <a
                href={storeConfig.social.tiktok}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-DilMart-store-gold transition-colors flex items-center"
                aria-label="TikTok"
              >
                <span className="text-lg font-semibold">♪</span>
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold text-DilMart-store-gold-bright mb-5">استكشف</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <Link to="/" className="block hover:text-foreground transition-colors">
                الرئيسية
              </Link>
              <Link to="/products" className="block hover:text-foreground transition-colors">
                المنتجات
              </Link>
              <Link to="/stores" className="block hover:text-foreground transition-colors">
                المتاجر
              </Link>
              <Link to="/offers" className="block hover:text-foreground transition-colors">
                العروض المختارة
              </Link>
              <Link to="/privacy" className="block hover:text-foreground transition-colors">
                سياسة الخصوصية
              </Link>
              <Link to="/support" className="block hover:text-foreground transition-colors">
                الدعم والمساعدة
              </Link>
              {!native && (
                <>
                  <Link to="/merchant/register" className="block hover:text-foreground transition-colors">
                    انضم كتاجر
                  </Link>
                  <Link to="/merchant/login" className="block hover:text-foreground transition-colors">
                    تسجيل دخول التاجر
                  </Link>
                </>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold text-DilMart-store-gold-bright mb-5">تواصل</h3>
            <div className="space-y-4 text-sm text-muted-foreground">
              <Link to="/support" className="flex items-center gap-3 hover:text-foreground transition-colors">
                <MessageCircle size={16} className="text-DilMart-store-gold shrink-0" strokeWidth={1.5} />
                <span className="flex items-center gap-1">
                  <span>الدعم</span>
                  <span dir="ltr" className="inline-block">
                    {storeConfig.phone}
                  </span>
                </span>
              </Link>
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-DilMart-store-gold shrink-0" strokeWidth={1.5} />
                <span dir="ltr" className="inline-block">
                  {storeConfig.phone}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={16} className="mt-0.5 text-DilMart-store-gold shrink-0" strokeWidth={1.5} />
                <span className="text-right leading-relaxed" style={{ unicodeBidi: "plaintext" }}>
                  {storeConfig.address}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-DilMart-store-gold/10 mt-12 pt-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {storeConfig.nameAr} — {storeConfig.brand.en}. جميع الحقوق محفوظة.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
