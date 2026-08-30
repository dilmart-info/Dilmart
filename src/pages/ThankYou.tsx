import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";

const ThankYou = () => {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get("order") || "";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-16 text-center">
        <div className="max-w-md mx-auto animate-fade-in">
          <CheckCircle className="mx-auto mb-6 text-green-500" size={80} />
          <h1 className="text-3xl font-bold mb-4">شكراً لك!</h1>
          <p className="text-muted-foreground mb-2">تم استلام طلبك بنجاح</p>
          {orderNumber && (
            <p className="text-lg font-bold mb-6">رقم الطلب: {orderNumber}</p>
          )}
          <p className="text-sm text-muted-foreground mb-6">
            سيتم التواصل معك قريباً لتأكيد الطلب والتوصيل
          </p>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-8 text-right space-y-3">
            <div className="flex items-center gap-2 text-primary font-bold">
              <span>🛡️</span>
              <span>استلم حسابك واحفظ طلباتك</span>
            </div>
            <p className="text-xs text-muted-foreground">
              قم بتوثيق رقم هاتفك وتعيين كلمة مرور لتتمكن من متابعة طلباتك واكتساب النقاط بسهولة في أي وقت.
            </p>
            <Link to={`/claim-account?orderNumber=${encodeURIComponent(orderNumber)}`}>
              <Button size="sm" className="w-full mt-2">
                استلام الحساب وتأكيد الهاتف
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            <Link to="/my-account/orders">
              <Button variant="secondary" className="w-full">إعادة الطلب من سجل الطلبات</Button>
            </Link>
            <Link to="/">
              <Button className="w-full">العودة للرئيسية</Button>
            </Link>
            <Link to="/support">
              <Button variant="outline" className="w-full mt-2">الدعم والمساعدة</Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
};


export default ThankYou;
