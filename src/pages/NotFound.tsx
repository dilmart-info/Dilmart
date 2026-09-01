import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { FileQuestion, Home, ShoppingBag } from "lucide-react";
import { useEffect } from "react";

export default function NotFound() {
  useEffect(() => {
    document.title = "الصفحة غير موجودة | DILMART";
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container flex items-center justify-center py-16 text-center">
        <div className="max-w-md mx-auto space-y-6 animate-fade-in">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <FileQuestion className="h-12 w-12" strokeWidth={1.75} />
          </div>

          <div className="space-y-2">
            <h1 className="font-display text-5xl font-black tracking-tight text-foreground">404</h1>
            <h2 className="text-xl font-bold text-foreground">الصفحة غير موجودة</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              قد يكون الرابط غير صحيح أو تم نقل الصفحة إلى مسار آخر.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Button asChild className="w-full sm:w-auto rounded-full px-8 h-11 gap-2 font-bold">
              <Link to="/">
                <Home size={16} />
                <span>العودة للرئيسية</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto rounded-full px-8 h-11 gap-2">
              <Link to="/products">
                <ShoppingBag size={16} />
                <span>تصفّح المنتجات</span>
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
