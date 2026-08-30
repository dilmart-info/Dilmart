import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { storeConfig } from "@/config/store";


const Privacy = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-8">سياسة الخصوصية</h1>

        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">جمع المعلومات</h2>
            <p>نقوم بجمع المعلومات الشخصية التي تقدمها لنا عند إتمام عملية الشراء، بما في ذلك الاسم ورقم الهاتف وعنوان التوصيل. هذه المعلومات ضرورية لمعالجة طلبك وتوصيله إليك.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">استخدام المعلومات</h2>
            <p>نستخدم معلوماتك الشخصية لمعالجة الطلبات والتواصل معك بشأن طلبك وتحسين خدماتنا. لن نشارك معلوماتك مع أطراف ثالثة إلا لغرض توصيل الطلب.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">حماية المعلومات</h2>
            <p>نتخذ إجراءات أمنية مناسبة لحماية معلوماتك الشخصية من الوصول غير المصرح به أو التعديل أو الإفصاح أو الإتلاف.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">سياسة الإرجاع</h2>
            <p>يمكنك إرجاع المنتج خلال 3 أيام من استلامه بشرط أن يكون بحالته الأصلية وبدون استخدام. يتحمل المشتري تكلفة شحن الإرجاع.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">التواصل</h2>
            <p>لأي استفسارات حول سياسة الخصوصية، يمكنك التواصل معنا عبر واتساب على الرقم {storeConfig.phone}.</p>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
