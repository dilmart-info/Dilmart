import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, ShieldCheck, Truck, ListOrdered, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export default function ThankYou() {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get("order") || "";
  const { profile, capabilities, authStatus } = useAuth();

  useEffect(() => {
    document.title = "تم استلام الطلب | DILMART";
  }, []);

  const requiresAccountClaim =
    profile?.claim_required === true ||
    profile?.account_type === "provisional_customer";
  const canClaim = capabilities?.accountClaim === true;
  const showClaim = authStatus === "authenticated" && requiresAccountClaim && canClaim;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-12 md:py-20 text-center">
        <div className="max-w-md mx-auto animate-fade-in">
          {orderNumber ? (
            <>
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 size={54} strokeWidth={2} />
              </div>
              <h1 className="text-3xl font-black text-foreground mb-2">تم تسجيل طلبك بنجاح</h1>
              <p className="text-sm text-muted-foreground mb-6">
                شكراً لتسوقك معنا، تم استلام الطلب وجاري إعداده.
              </p>

              <div className="bg-muted/40 border border-border rounded-2xl p-5 mb-6 text-center">
                <p className="text-xs font-medium text-muted-foreground mb-1">رقم الطلب</p>
                <p className="font-mono text-2xl font-black text-primary">#{orderNumber}</p>
              </div>

              <p className="text-xs text-muted-foreground mb-8 leading-relaxed">
                يمكنك متابعة حالة الطلب من صفحة طلباتي أو من صفحة تتبع الطلب.
              </p>

              {/* Account Claim Banner — only shown for provisional / claimable customer accounts */}
              {showClaim ? (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-8 text-right space-y-3 shadow-sm">
                  <div className="flex items-center gap-2 text-primary font-bold text-sm">
                    <ShieldCheck size={20} className="shrink-0" />
                    <span>تأكيد بيانات الحساب</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    تأكيد الحساب يساعدك على إدارة طلباتك وبيانات حسابك بسهولة.
                  </p>
                  <Button asChild size="sm" className="w-full mt-2 rounded-xl">
                    <Link to={`/claim-account?orderNumber=${encodeURIComponent(orderNumber)}`}>
                      استلام الحساب وتأكيد الهاتف
                    </Link>
                  </Button>
                </div>
              ) : null}

              <div className="space-y-3">
                <Button asChild className="w-full h-12 text-base font-bold rounded-xl gap-2">
                  <Link to={`/track-order?order=${encodeURIComponent(orderNumber)}`}>
                    <Truck size={18} />
                    <span>تتبع حالة الطلب</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full h-12 text-base font-semibold rounded-xl gap-2">
                  <Link to="/my-account/orders">
                    <ListOrdered size={18} />
                    <span>عرض طلباتي</span>
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="w-full text-sm text-muted-foreground rounded-xl">
                  <Link to="/products">
                    العودة للتسوق
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="py-12 space-y-4">
              <p className="text-lg font-bold text-foreground">لا يوجد رقم طلب مرتبط بهذه الصفحة</p>
              <p className="text-sm text-muted-foreground">
                يمكنك مراجعة طلباتك السابقة أو تتبع طلبك باستخدام رقم الهاتف.
              </p>
              <div className="pt-4 space-y-3">
                <Button asChild className="w-full h-12 font-bold rounded-xl">
                  <Link to="/my-account/orders">عرض طلباتي</Link>
                </Button>
                <Button asChild variant="outline" className="w-full h-12 font-semibold rounded-xl">
                  <Link to="/track-order">تتبع طلب</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full text-muted-foreground rounded-xl">
                  <Link to="/products">العودة للتسوق</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}
