import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { storeConfig } from "@/config/store";
import { MessageCircle, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const Support = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-8">الدعم والمساعدة</h1>

        <div className="space-y-8 text-muted-foreground">
          <section>
            <h2 className="text-xl font-bold text-foreground mb-4">تواصل معنا</h2>
            <p className="mb-4">
              نحن هنا لمساعدتك. لا تتردد في التواصل معنا عبر أي من القنوات التالية:
            </p>
            <div className="space-y-4">
              <Link to="/track-order" className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                <MessageCircle className="h-6 w-6 text-[#25D366]" />
                <div>
                  <span className="font-medium text-foreground">دعم الطلبات</span>
                  <p className="text-sm">استخدم تتبع الطلب أو لوحة الطلب لتواصل تشغيلي بعد الشراء</p>
                </div>
              </Link>
              <a
                href={`tel:${storeConfig.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
              >
                <Phone className="h-6 w-6" />
                <div>
                  <span className="font-medium text-foreground">اتصال هاتفي</span>
                  <p dir="ltr" className="text-sm">{storeConfig.phone}</p>
                </div>
              </a>
              <div className="flex items-start gap-3 p-4 rounded-lg border bg-card">
                <MapPin className="h-6 w-6 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-foreground">العنوان</span>
                  <p className="text-sm" style={{ unicodeBidi: "plaintext" }}>
                    {storeConfig.address}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-4">الأسئلة الشائعة</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-foreground">كيف أتتبع طلبي؟</h3>
                <p className="text-sm mt-1">
                  استخدم صفحة &quot;تتبع الطلب&quot; وأدخل رقم الطلب ورقم هاتفك لعرض حالة التوصيل.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">ما هي مدة التوصيل؟</h3>
                <p className="text-sm mt-1">
                  نقوم بالتوصيل لجميع محافظات العراق. المدة تختلف حسب الموقع — تواصل معنا للتقدير الدقيق.
                </p>
              </div>
              <div>
                <h3 className="font-medium text-foreground">كيف يمكنني إرجاع منتج؟</h3>
                <p className="text-sm mt-1">
                  راجع سياسة الخصوصية للشروط. يمكنك إرجاع المنتج خلال 3 أيام بشرط حفظ حالته الأصلية.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Support;
